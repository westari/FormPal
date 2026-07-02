/**
 * app/workout/run.tsx
 *
 * The per-exercise run flow. Manages two phases:
 *
 *   'intro' — shows exercise card + Start button. Start navigates to formcheck (or
 *             marks complete instantly for non-CV exercises).
 *
 *   'rest'  — countdown timer between exercises. Auto-advances to next intro.
 *             Shows what was just completed + next exercise preview.
 *
 * On mount the screen checks URL params. If exerciseId/reps/goodReps are present
 * (arriving back from formcheck), it records the result and enters 'rest' phase.
 * If not, it opens in 'intro' phase for the current exercise.
 *
 * When all exercises are done, navigates to /workout/summary.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import ScreenBackground from '../../components/ScreenBackground';
import { useWorkoutSessionStore } from '../../store/workoutSessionStore';
import { FONT, W, Sp, R, Elev, Col } from '../../constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMCHECK_EXERCISES = new Set(['squat', 'curl', 'pushup']);

function isFormCheckable(exerciseId: string): boolean {
  return FORMCHECK_EXERCISES.has(exerciseId);
}

function fmtSec(s: number): string {
  if (s <= 0) return '0';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : String(sec);
}

function scoreColor(pct: number): string {
  if (pct >= 75) return Col.good;
  if (pct >= 45) return Col.mid;
  return Col.low;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Phase = 'intro' | 'rest';

export default function WorkoutRunScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{
    exerciseId?: string;
    reps?:       string;
    goodReps?:   string;
  }>();

  // Store actions
  const session           = useWorkoutSessionStore(s => s.session);
  const completeExercise  = useWorkoutSessionStore(s => s.completeExercise);
  const skipCurrent       = useWorkoutSessionStore(s => s.skipCurrentExercise);
  const abortWorkout      = useWorkoutSessionStore(s => s.abortWorkout);

  // Phase management (local — UI state, not in store)
  const [phase,    setPhase]    = useState<Phase | null>(null);
  const [restSec,  setRestSec]  = useState(60);
  const processed = useRef(false);

  // Progress bar animation
  const progAnim = useRef(new Animated.Value(0)).current;

  // ── On-mount: process incoming results from formcheck ─────────────────────

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const { exerciseId, reps: repsStr, goodReps: goodStr } = params;

    if (!session) {
      // No active session — navigate back
      router.replace('/(tabs)/train' as any);
      return;
    }

    if (exerciseId && repsStr != null && goodStr != null) {
      // Returning from formcheck with results
      const reps     = parseInt(repsStr, 10)  || 0;
      const goodReps = parseInt(goodStr, 10) || 0;

      completeExercise(exerciseId, reps, goodReps);

      // Read updated store state synchronously
      const updated = useWorkoutSessionStore.getState();
      if (!updated.hasMoreExercises()) {
        // All done — go to summary
        router.replace('/workout/summary' as any);
        return;
      }

      // More exercises — figure out rest duration from the just-completed exercise
      const prevIdx  = (updated.session?.currentIndex ?? 1) - 1;
      const prevEx   = updated.session?.workout.exercises[prevIdx];
      const duration = Math.max(prevEx?.restSeconds ?? 60, 15);
      setRestSec(duration);
      setPhase('rest');
    } else {
      // Fresh start or returning from skip — show intro for current exercise
      setPhase('intro');
    }
  }, []); // intentionally run once on mount only

  // ── Animate progress bar ──────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return;
    const fraction = session.workout.exercises.length > 0
      ? session.currentIndex / session.workout.exercises.length
      : 0;
    Animated.timing(progAnim, {
      toValue:         fraction,
      duration:        400,
      useNativeDriver: false,
    }).start();
  }, [session?.currentIndex, session?.workout.exercises.length]);

  // ── Rest timer ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'rest') return;

    // Interval just decrements the display counter — no side effects in updater
    const interval = setInterval(() => {
      setRestSec(s => Math.max(0, s - 1));
    }, 1000);

    // Timeout drives the actual advance (cleanup cancels it on skip)
    const timeout = setTimeout(() => {
      advanceToIntro();
    }, restSec * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────

  function advanceToIntro() {
    const st = useWorkoutSessionStore.getState();
    if (!st.hasMoreExercises()) {
      router.replace('/workout/summary' as any);
    } else {
      setPhase('intro');
    }
  }

  function handleStartExercise() {
    if (!session) return;
    const ex = session.workout.exercises[session.currentIndex];
    if (!ex) return;

    if (isFormCheckable(ex.exerciseId)) {
      // Navigate to formcheck — REPLACE the current run screen so going back
      // from formcheck exits the workout flow (back to overview/train).
      router.replace({
        pathname: '/formcheck' as any,
        params:   {
          exercise:          ex.exerciseId,
          returnTo:          '/workout/run',
          workoutExerciseId: ex.exerciseId,
        },
      });
    } else {
      // Non-CV exercise: record full target reps immediately as "completed"
      const reps = ex.targetSets * ex.targetReps;
      completeExercise(ex.exerciseId, reps, reps);

      const updated = useWorkoutSessionStore.getState();
      if (!updated.hasMoreExercises()) {
        router.replace('/workout/summary' as any);
        return;
      }
      const prevIdx  = (updated.session?.currentIndex ?? 1) - 1;
      const prevEx   = updated.session?.workout.exercises[prevIdx];
      const duration = Math.max(prevEx?.restSeconds ?? 60, 15);
      setRestSec(duration);
      setPhase('rest');
    }
  }

  function handleSkipExercise() {
    skipCurrent();
    const updated = useWorkoutSessionStore.getState();
    if (!updated.hasMoreExercises()) {
      router.replace('/workout/summary' as any);
      return;
    }
    setPhase('intro');
  }

  const handleEndWorkout = useCallback(() => {
    Alert.alert(
      'End workout?',
      'Progress so far will be saved.',
      [
        { text: 'Continue', style: 'cancel' },
        {
          text:    'End workout',
          style:   'destructive',
          onPress: () => router.replace('/workout/summary' as any),
        },
      ],
    );
  }, [router]);

  // ── Derived display data ───────────────────────────────────────────────────

  if (!session || phase === null) return null;

  const totalEx     = session.workout.exercises.length;
  const doneCount   = session.currentIndex;
  const currentEx   = session.workout.exercises[session.currentIndex] ?? null;
  const nextEx      = session.workout.exercises[session.currentIndex + 1] ?? null;

  // Last completed result (for rest phase display)
  const lastResult  = session.results[session.currentIndex > 0 ? session.currentIndex - 1 : 0];

  return (
    <ScreenBackground>
      {/* Safe-area top */}
      <View style={{ height: insets.top + 8 }} />

      {/* Progress bar + counter */}
      <View style={s.progContainer}>
        <View style={s.progTrack}>
          <Animated.View
            style={[
              s.progFill,
              {
                width: progAnim.interpolate({
                  inputRange:  [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <Text style={s.progLabel}>
          {doneCount} / {totalEx}
        </Text>
      </View>

      {/* ── INTRO PHASE ── */}
      {phase === 'intro' && currentEx && (
        <View style={s.phaseContainer}>
          {/* Header */}
          <View style={s.introHeader}>
            <View style={s.upNextPill}>
              <Text style={s.upNextTxt}>
                {doneCount === 0 ? 'First up' : 'Next up'}
              </Text>
            </View>
            <Text style={s.exTitle}>{currentEx.displayName}</Text>
            <Text style={s.exTarget}>
              {currentEx.targetSets} sets · {currentEx.targetReps} reps each
            </Text>
          </View>

          {/* Info card */}
          <View style={s.infoCard}>
            <InfoRow icon="clock.fill" label="Rest between sets">
              {fmtSec(currentEx.restSeconds)}
            </InfoRow>
            {isFormCheckable(currentEx.exerciseId) && (
              <InfoRow icon="camera.fill" label="Form tracking">
                Live
              </InfoRow>
            )}
          </View>

          {/* Start button */}
          <Pressable style={s.startBtn} onPress={handleStartExercise}>
            {isFormCheckable(currentEx.exerciseId) ? (
              <>
                <SymbolView
                  name="camera.fill"
                  size={16}
                  tintColor="#fff"
                  type="monochrome"
                  style={{ width: 16, height: 16 }}
                />
                <Text style={s.startBtnTxt}>Start with Form Check</Text>
              </>
            ) : (
              <>
                <SymbolView
                  name="checkmark.circle.fill"
                  size={16}
                  tintColor="#fff"
                  type="monochrome"
                  style={{ width: 16, height: 16 }}
                />
                <Text style={s.startBtnTxt}>Mark Complete</Text>
              </>
            )}
          </Pressable>

          {/* Skip */}
          <Pressable onPress={handleSkipExercise} hitSlop={12}>
            <Text style={s.skipTxt}>Skip exercise</Text>
          </Pressable>
        </View>
      )}

      {/* ── REST PHASE ── */}
      {phase === 'rest' && (
        <View style={s.phaseContainer}>
          {/* What you just did */}
          <View style={s.doneCard}>
            <SymbolView
              name="checkmark.circle.fill"
              size={24}
              tintColor={Col.good}
              type="monochrome"
              style={{ width: 24, height: 24 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.doneName}>{lastResult?.displayName ?? 'Exercise'}</Text>
              <Text style={s.doneMeta}>
                {lastResult?.reps ?? 0} reps
                {lastResult?.completed && lastResult.reps > 0
                  ? ` · ${lastResult.formScore}% form`
                  : lastResult?.skipped ? ' · skipped' : ''}
              </Text>
            </View>
            {lastResult?.completed && lastResult.reps > 0 && (
              <View
                style={[
                  s.scorePill,
                  { backgroundColor: scoreColor(lastResult.formScore) + '22' },
                ]}
              >
                <Text style={[s.scorePillTxt, { color: scoreColor(lastResult.formScore) }]}>
                  {lastResult.formScore}%
                </Text>
              </View>
            )}
          </View>

          {/* Rest timer */}
          <View style={s.timerBlock}>
            <Text style={s.restLabel}>REST</Text>
            <Text style={s.timerNum}>{fmtSec(restSec)}</Text>
          </View>

          {/* Next exercise preview */}
          {nextEx ? (
            <View style={s.nextCard}>
              <Text style={s.nextLabel}>NEXT</Text>
              <Text style={s.nextName}>{nextEx.displayName}</Text>
              <Text style={s.nextTarget}>
                {nextEx.targetSets} × {nextEx.targetReps}
              </Text>
            </View>
          ) : (
            <View style={s.nextCard}>
              <Text style={s.nextLabel}>ALMOST DONE</Text>
              <Text style={s.nextName}>Last exercise complete</Text>
            </View>
          )}

          {/* Skip rest */}
          <Pressable onPress={advanceToIntro} style={s.skipRestBtn} hitSlop={12}>
            <Text style={s.skipRestTxt}>Skip rest</Text>
            <SymbolView
              name="forward.fill"
              size={12}
              tintColor={Col.textSub}
              type="monochrome"
              style={{ width: 12, height: 12 }}
            />
          </Pressable>
        </View>
      )}

      {/* End workout — always visible */}
      <View style={[s.endBar, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
        <Pressable onPress={handleEndWorkout} hitSlop={12}>
          <Text style={s.endTxt}>End workout</Text>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

// ─── InfoRow ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  children,
}: {
  icon:     string;
  label:    string;
  children: React.ReactNode;
}) {
  return (
    <View style={ir.row}>
      <SymbolView
        name={icon as any}
        size={14}
        tintColor={Col.textSub}
        type="monochrome"
        style={{ width: 14, height: 14 }}
      />
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value}>{children}</Text>
    </View>
  );
}

const ir = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontSize: 14, color: Col.textSub, fontWeight: W.medium },
  value: { fontSize: 14, fontWeight: W.semi, color: Col.text },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  progContainer: {
    paddingHorizontal: Sp.md,
    paddingBottom:     Sp.md,
    gap:               6,
  },
  progTrack: {
    height:          5,
    backgroundColor: '#E8E8ED',
    borderRadius:    R.pill,
    overflow:        'hidden',
  },
  progFill: {
    height:          5,
    backgroundColor: '#0b1020',
    borderRadius:    R.pill,
  },
  progLabel: {
    fontSize:      11,
    fontWeight:    W.semi,
    color:         Col.textSub,
    letterSpacing: 0.3,
    textAlign:     'right',
  },

  phaseContainer: {
    flex:              1,
    paddingHorizontal: Sp.md,
    paddingTop:        Sp.xl,
    alignItems:        'stretch',
    gap:               Sp.md,
  },

  // ── Intro ──────────────────────────────────────────────────────────────────

  introHeader: { gap: 8, marginBottom: Sp.sm },
  upNextPill:  {
    alignSelf:         'flex-start',
    backgroundColor:   '#F0F0F4',
    borderRadius:      R.pill,
    paddingHorizontal: Sp.sm,
    paddingVertical:   4,
  },
  upNextTxt: { fontSize: 11, fontWeight: W.semi, color: Col.textSub, letterSpacing: 0.3 },

  exTitle: {
    fontFamily:    FONT.displayBold,
    fontSize:      36,
    color:         Col.text,
    letterSpacing: -0.8,
    lineHeight:    40,
  },
  exTarget: { fontSize: 16, color: Col.textSub, fontWeight: W.medium },

  infoCard: {
    backgroundColor: Col.card,
    borderRadius:    R.card,
    padding:         Sp.md,
    gap:             Sp.sm,
    boxShadow:       Elev.low.shadow,
  } as any,

  startBtn: {
    backgroundColor:   '#0b1020',
    borderRadius:      R.pill,
    height:            56,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               10,
    boxShadow:         Elev.high.shadow,
    marginTop:         Sp.xs,
  } as any,
  startBtnTxt: {
    fontFamily:    FONT.displayBold,
    fontSize:      17,
    color:         '#fff',
    letterSpacing: 0.1,
  },
  skipTxt: {
    fontSize:   14,
    color:      Col.textDim,
    fontWeight: W.medium,
    textAlign:  'center',
  },

  // ── Rest ──────────────────────────────────────────────────────────────────

  doneCard: {
    backgroundColor: Col.card,
    borderRadius:    R.card,
    padding:         Sp.md,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Sp.sm,
    boxShadow:       Elev.low.shadow,
  } as any,
  doneName:    { fontSize: 14, fontWeight: W.semi, color: Col.text },
  doneMeta:    { fontSize: 12, color: Col.textSub, marginTop: 2 },
  scorePill:   {
    borderRadius:      R.pill,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  scorePillTxt: { fontSize: 13, fontWeight: W.bold },

  timerBlock: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            4,
  },
  restLabel: {
    fontSize:      11,
    fontWeight:    W.bold,
    color:         Col.textDim,
    letterSpacing: 1.5,
  },
  timerNum: {
    fontFamily:    FONT.displayLight,
    fontSize:      96,
    color:         Col.text,
    letterSpacing: -3,
    lineHeight:    96,
  },

  nextCard: {
    backgroundColor: Col.card,
    borderRadius:    R.card,
    padding:         Sp.md,
    gap:             4,
    boxShadow:       Elev.low.shadow,
  } as any,
  nextLabel: {
    fontSize:      10,
    fontWeight:    W.bold,
    color:         Col.textDim,
    letterSpacing: 1.2,
  },
  nextName:   { fontSize: 17, fontWeight: W.semi, color: Col.text },
  nextTarget: { fontSize: 13, color: Col.textSub, fontWeight: W.medium },

  skipRestBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  skipRestTxt: { fontSize: 14, fontWeight: W.medium, color: Col.textSub },

  // ── End workout bar ──────────────────────────────────────────────────────

  endBar: {
    paddingHorizontal: Sp.md,
    paddingTop:        Sp.sm,
    alignItems:        'center',
  },
  endTxt: {
    fontSize:   13,
    fontWeight: W.medium,
    color:      Col.textDim,
  },
});
