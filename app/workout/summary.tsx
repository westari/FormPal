/**
 * app/workout/summary.tsx
 *
 * Workout completion screen.
 * Calls finishWorkout() on mount to get the summary data, then:
 *   1. Fires haptic success feedback
 *   2. Runs a scale-in entrance animation
 *   3. Saves to formpal_session_log (same format as recap.tsx)
 *   4. "Done" button: marks workout complete in planStore + returns to Train
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import ScreenBackground from '../../components/ScreenBackground';
import Ring from '../../components/Ring';
import { useWorkoutSessionStore } from '../../store/workoutSessionStore';
import type { WorkoutSummary } from '../../store/workoutSessionStore';
import { usePlanStore } from '../../store/planStore';
import { FONT, W, Sp, R, Elev, Col } from '../../constants/theme';

const SESSION_LOG_KEY = 'formpal_session_log';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(pct: number): string {
  if (pct >= 75) return Col.good;
  if (pct >= 45) return Col.mid;
  return Col.low;
}

async function saveSessionLog(summary: WorkoutSummary) {
  try {
    const raw  = await AsyncStorage.getItem(SESSION_LOG_KEY);
    const log: { ts: number; reps: number; goodReps: number; pct: number }[]
      = raw ? JSON.parse(raw) : [];

    // One entry per exercise that was completed (matching recap.tsx format)
    summary.results
      .filter(r => r.completed)
      .forEach(r => {
        log.push({
          ts:       summary.finishedAt,
          reps:     r.reps,
          goodReps: r.goodReps,
          pct:      r.formScore,
        });
      });

    // Trim to last 200 entries
    if (log.length > 200) log.splice(0, log.length - 200);
    await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(log));
  } catch {}
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkoutSummaryScreen() {
  const router              = useRouter();
  const insets              = useSafeAreaInsets();
  const finishWorkout       = useWorkoutSessionStore(s => s.finishWorkout);
  const abortWorkout        = useWorkoutSessionStore(s => s.abortWorkout);
  const markWorkoutComplete = usePlanStore(s => s.markWorkoutComplete);

  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [done,    setDone]    = useState(false);
  const initialized           = useRef(false);
  const scaleAnim             = useRef(new Animated.Value(0.88)).current;
  const opacAnim              = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Try to get existing summary (if finishWorkout was already called)
    const existing = useWorkoutSessionStore.getState().getSummary();
    const s        = existing ?? finishWorkout();
    if (!s) return;

    setSummary(s);
    void saveSessionLog(s);

    // Entrance animation
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
      Animated.timing(opacAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Haptic success
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  async function handleDone() {
    if (done) return;
    setDone(true);

    if (summary?.workoutId) {
      try {
        await markWorkoutComplete(summary.workoutId);
      } catch {}
    }
    abortWorkout(); // clear the session
    router.navigate('/(tabs)/train' as any);
  }

  // ── Empty / loading state ─────────────────────────────────────────────────

  if (!summary) {
    return (
      <ScreenBackground>
        <View style={s.center}>
          <Text style={s.emptyTxt}>No workout data.</Text>
          <Pressable onPress={() => router.navigate('/(tabs)/train' as any)} style={s.doneBtn}>
            <Text style={s.doneBtnTxt}>Back to Train</Text>
          </Pressable>
        </View>
      </ScreenBackground>
    );
  }

  const formPct  = summary.overallFormScore;
  const exFrac   = summary.exercisesTotal > 0
    ? summary.exercisesCompleted / summary.exercisesTotal : 0;
  const fColor   = scoreColor(formPct);
  const fRingCol: [string, string] = formPct >= 75
    ? ['#30D158', '#00C7BE']
    : formPct >= 45
    ? ['#FF9F0A', '#FF6B00']
    : ['#FF3B30', '#FF6B30'];

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Safe-area top */}
        <View style={{ height: insets.top + Sp.xl }} />

        {/* Completion header */}
        <Animated.View style={[s.header, { opacity: opacAnim, transform: [{ scale: scaleAnim }] }]}>
          <View style={s.checkCircle}>
            <SymbolView
              name="checkmark"
              size={32}
              tintColor="#fff"
              type="monochrome"
              style={{ width: 32, height: 32 }}
            />
          </View>
          <Text style={s.doneHeading}>Workout complete</Text>
          <Text style={s.splitLabel}>{summary.splitLabel}</Text>
        </Animated.View>

        {/* Stats rings */}
        <View style={s.ringsRow}>
          <Ring
            progress={formPct / 100}
            colors={fRingCol}
            gradientId="gSummaryForm"
            value={String(formPct)}
            unit="%"
            label="Form"
            size={108}
            strokeWidth={11}
          />
          <View style={s.ringDivider} />
          <Ring
            progress={exFrac}
            colors={['#007AFF', '#5AC8FA']}
            gradientId="gSummaryEx"
            value={String(summary.exercisesCompleted)}
            unit={`/${summary.exercisesTotal}`}
            label="Exercises"
            size={108}
            strokeWidth={11}
          />
          <View style={s.ringDivider} />
          <Ring
            progress={1}
            colors={['#8B5CF6', '#A78BFA']}
            gradientId="gSummaryTime"
            value={String(Math.floor(summary.durationSeconds / 60))}
            unit="m"
            label="Duration"
            size={108}
            strokeWidth={11}
          />
        </View>

        {/* Reps summary */}
        <View style={s.repsRow}>
          <StatBlock value={String(summary.totalReps)} label="Total reps" />
          <View style={s.statDiv} />
          <StatBlock value={String(summary.totalGoodReps)} label="Good reps" color={Col.good} />
        </View>

        {/* Per-exercise breakdown */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>BREAKDOWN</Text>
          <View style={s.card}>
            {summary.results.map((r, i) => (
              <React.Fragment key={r.exerciseId + i}>
                <View style={s.exRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.exName}>{r.displayName}</Text>
                    {r.completed && (
                      <Text style={s.exMeta}>{r.reps} reps</Text>
                    )}
                    {r.skipped && (
                      <Text style={[s.exMeta, { color: Col.textDim }]}>Skipped</Text>
                    )}
                  </View>
                  {r.completed && r.reps > 0 && (
                    <View style={[s.exScore, { backgroundColor: scoreColor(r.formScore) + '22' }]}>
                      <Text style={[s.exScoreTxt, { color: scoreColor(r.formScore) }]}>
                        {r.formScore}%
                      </Text>
                    </View>
                  )}
                  {r.skipped && (
                    <SymbolView
                      name="forward.fill"
                      size={14}
                      tintColor={Col.textDim}
                      type="monochrome"
                      style={{ width: 14, height: 14 }}
                    />
                  )}
                </View>
                {i < summary.results.length - 1 && <View style={s.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Done button — fixed bottom */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
        <Pressable
          style={[s.doneBtn, done && s.doneBtnDisabled]}
          onPress={handleDone}
          disabled={done}
        >
          <Text style={s.doneBtnTxt}>Done</Text>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

// ─── StatBlock ───────────────────────────────────────────────────────────────

function StatBlock({
  value,
  label,
  color = Col.text,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <View style={sb.block}>
      <Text style={[sb.value, { color }]}>{value}</Text>
      <Text style={sb.label}>{label}</Text>
    </View>
  );
}

const sb = StyleSheet.create({
  block: { flex: 1, alignItems: 'center', gap: 2 },
  value: { fontFamily: FONT.displayBold, fontSize: 30, letterSpacing: -0.5, color: Col.text },
  label: { fontSize: 12, fontWeight: W.medium, color: Col.textSub },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Sp.md },
  emptyTxt:{ fontSize: 15, color: Col.textSub },
  scroll:  { paddingHorizontal: Sp.md, gap: Sp.md },

  header: {
    alignItems: 'center',
    gap:        Sp.sm,
    marginBottom: Sp.xs,
  },
  checkCircle: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: '#0b1020',
    alignItems:      'center',
    justifyContent:  'center',
    boxShadow:       Elev.high.shadow,
  } as any,
  doneHeading: {
    fontFamily:    FONT.displayBold,
    fontSize:      28,
    color:         Col.text,
    letterSpacing: -0.5,
  },
  splitLabel: { fontSize: 15, fontWeight: W.medium, color: Col.textSub },

  ringsRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Col.card,
    borderRadius:    R.card,
    paddingVertical: Sp.lg,
    paddingHorizontal: Sp.md,
    boxShadow:       Elev.medium.shadow,
  } as any,
  ringDivider: {
    width:  1,
    height: 60,
    backgroundColor: '#F0F0F4',
    marginHorizontal: Sp.sm,
  },

  repsRow: {
    flexDirection:   'row',
    backgroundColor: Col.card,
    borderRadius:    R.card,
    paddingVertical: Sp.lg,
    boxShadow:       Elev.low.shadow,
  } as any,
  statDiv: { width: 1, backgroundColor: '#F0F0F4' },

  section:      { gap: Sp.sm },
  sectionTitle: {
    fontSize:      11,
    fontWeight:    W.bold,
    color:         Col.textDim,
    letterSpacing: 0.8,
    marginLeft:    4,
  },
  card: {
    backgroundColor: Col.card,
    borderRadius:    R.card,
    overflow:        'hidden',
    boxShadow:       Elev.low.shadow,
  } as any,
  exRow: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       Sp.md,
    gap:           Sp.md,
  },
  exName:     { fontSize: 15, fontWeight: W.semi, color: Col.text },
  exMeta:     { fontSize: 12, color: Col.textSub, marginTop: 2 },
  exScore:    {
    borderRadius:      R.pill,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  exScoreTxt: { fontSize: 13, fontWeight: W.bold },
  divider:    { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F0F4', marginHorizontal: Sp.md },

  footer: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    paddingHorizontal: Sp.md,
    paddingTop:        Sp.md,
    backgroundColor:   'rgba(251,251,253,0.92)',
  },
  doneBtn: {
    backgroundColor:   '#0b1020',
    borderRadius:      R.pill,
    height:            56,
    alignItems:        'center',
    justifyContent:    'center',
    boxShadow:         Elev.high.shadow,
  } as any,
  doneBtnDisabled: { opacity: 0.5 },
  doneBtnTxt: {
    fontFamily:    FONT.displayBold,
    fontSize:      17,
    color:         '#fff',
    letterSpacing: 0.1,
  },
});
