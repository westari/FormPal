/**
 * app/workout/index.tsx
 *
 * Pre-workout overview screen.
 * Shows the full workout (name, rationale, ordered exercise list)
 * and the big "Start" button that kicks off the run flow.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import ScreenBackground from '../../components/ScreenBackground';
import { usePlanStore } from '../../store/planStore';
import { useWorkoutSessionStore } from '../../store/workoutSessionStore';
import { FONT, W, Sp, R, Elev, Col } from '../../constants/theme';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(totalSec: number): string {
  const m = Math.ceil(totalSec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function estimateWorkoutTime(restSeconds: number[]): number {
  // ~45s per set (including motion), plus rest between exercises
  const sets    = restSeconds.length * 3;          // assume 3 sets per exercise
  const setTime = sets * 45;
  const rest    = restSeconds.reduce((a, b) => a + b, 0);
  return setTime + rest;
}

// ─── Exercise row ────────────────────────────────────────────────────────────

function ExRow({
  num,
  name,
  sets,
  reps,
  rest,
}: {
  num:  number;
  name: string;
  sets: number;
  reps: number;
  rest: number;
}) {
  return (
    <View style={s.exRow}>
      <View style={s.exNum}>
        <Text style={s.exNumTxt}>{num}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.exName}>{name}</Text>
        <Text style={s.exMeta}>
          {sets} × {reps} · {fmtTime(rest)} rest
        </Text>
      </View>
      <SymbolView
        name="chevron.right"
        size={13}
        tintColor={Col.textDim}
        type="monochrome"
        style={{ width: 13, height: 13 }}
      />
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WorkoutOverviewScreen() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const getNext   = usePlanStore(s => s.getNextWorkout);
  const startSess = useWorkoutSessionStore(s => s.startWorkout);
  const workout   = getNext();

  if (!workout) {
    // Should never happen via normal nav, but handle gracefully
    return (
      <ScreenBackground>
        <View style={[s.center, { paddingTop: insets.top }]}>
          <Text style={s.noWorkout}>No workout scheduled.</Text>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnTxt}>Go back</Text>
          </Pressable>
        </View>
      </ScreenBackground>
    );
  }

  const estimatedSec = estimateWorkoutTime(workout.exercises.map(e => e.restSeconds));
  const exCount      = workout.exercises.length;

  function handleStart() {
    startSess(workout!);
    router.push('/workout/run' as any);
  }

  return (
    <ScreenBackground>
      {/* Back button */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={s.backChev}>
          <SymbolView
            name="chevron.left"
            size={18}
            tintColor={Col.text}
            type="monochrome"
            style={{ width: 18, height: 18 }}
          />
        </Pressable>
        <Text style={s.topLabel}>Today's Workout</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero header */}
        <View style={s.hero}>
          <Text style={s.splitLabel}>{workout.splitLabel}</Text>
          <Text style={s.sessionNum}>Session {workout.sessionNumber}</Text>
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <StatChip icon="dumbbell.fill"  label={`${exCount} exercise${exCount === 1 ? '' : 's'}`} />
          <StatChip icon="clock.fill"     label={fmtTime(estimatedSec)} />
        </View>

        {/* Rationale */}
        {!!workout.rationale && (
          <View style={s.rationaleCard}>
            <Text style={s.rationaleText}>{workout.rationale}</Text>
          </View>
        )}

        {/* Exercise list */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>EXERCISES</Text>
          <View style={s.card}>
            {workout.exercises.map((ex, i) => (
              <React.Fragment key={ex.exerciseId}>
                <ExRow
                  num={i + 1}
                  name={ex.displayName}
                  sets={ex.targetSets}
                  reps={ex.targetReps}
                  rest={ex.restSeconds}
                />
                {i < workout.exercises.length - 1 && <View style={s.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Start button — fixed bottom */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
        <Pressable style={s.startBtn} onPress={handleStart}>
          <Text style={s.startBtnTxt}>Start Workout</Text>
          <SymbolView
            name="play.fill"
            size={16}
            tintColor="#fff"
            type="monochrome"
            style={{ width: 16, height: 16 }}
          />
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

// ─── StatChip ────────────────────────────────────────────────────────────────

function StatChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={s.statChip}>
      <SymbolView
        name={icon as any}
        size={14}
        tintColor={Col.textSub}
        type="monochrome"
        style={{ width: 14, height: 14 }}
      />
      <Text style={s.statChipTxt}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Sp.md },
  noWorkout: { fontSize: 16, color: Col.textSub },
  backBtn:   { paddingHorizontal: Sp.lg, paddingVertical: Sp.sm, borderRadius: R.pill, backgroundColor: Col.card },
  backBtnTxt:{ fontSize: 15, fontWeight: W.semi, color: Col.text },

  topBar: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Sp.md,
    paddingBottom:  Sp.sm,
  },
  topLabel: {
    fontSize:   14,
    fontWeight: W.semi,
    color:      Col.textSub,
    letterSpacing: 0.2,
  },
  backChev: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.pill,
    backgroundColor: Col.card,
    ...Elev.low,
    boxShadow: Elev.low.shadow,
  } as any,

  scroll: {
    paddingHorizontal: Sp.md,
    paddingTop:        Sp.md,
    gap:               Sp.md,
  },

  hero: { gap: 4, marginBottom: Sp.xs },
  splitLabel: {
    fontFamily:    FONT.displayBold,
    fontSize:      28,
    color:         Col.text,
    letterSpacing: -0.5,
  },
  sessionNum: {
    fontSize:   14,
    fontWeight: W.medium,
    color:      Col.textSub,
  },

  statsRow:  { flexDirection: 'row', gap: Sp.sm },
  statChip:  {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   Col.card,
    borderRadius:      R.pill,
    paddingHorizontal: Sp.md,
    paddingVertical:   7,
    boxShadow:         Elev.low.shadow,
  } as any,
  statChipTxt: { fontSize: 13, fontWeight: W.medium, color: Col.textSub },

  rationaleCard: {
    backgroundColor:   Col.card,
    borderRadius:      R.card,
    padding:           Sp.md,
    boxShadow:         Elev.low.shadow,
  } as any,
  rationaleText: {
    fontSize:   14,
    color:      Col.textSub,
    lineHeight: 21,
  },

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

  exRow:    { flexDirection: 'row', alignItems: 'center', padding: Sp.md, gap: Sp.md },
  exNum:    {
    width:           28,
    height:          28,
    borderRadius:    R.pill,
    backgroundColor: '#F0F0F4',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  exNumTxt: { fontSize: 13, fontWeight: W.bold, color: Col.textSub },
  exName:   { fontSize: 15, fontWeight: W.semi, color: Col.text },
  exMeta:   { fontSize: 12, color: Col.textSub, marginTop: 2 },
  divider:  { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F0F4', marginLeft: 56 },

  footer: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    paddingHorizontal: Sp.md,
    paddingTop:        Sp.md,
    backgroundColor:   'rgba(251,251,253,0.92)',
  },
  startBtn: {
    backgroundColor:   '#0b1020',
    borderRadius:      R.pill,
    height:            56,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               10,
    boxShadow:         Elev.high.shadow,
  } as any,
  startBtnTxt: {
    fontFamily: FONT.displayBold,
    fontSize:   17,
    color:      '#fff',
    letterSpacing: 0.1,
  },
});
