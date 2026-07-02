/**
 * app/(tabs)/train.tsx — Train tab
 *
 * Design system: exact match of app/(tabs)/index.tsx —
 *   same C colors, same shadow constants, ScreenBackground + Card, FONT.displayLight headers.
 *
 * Data: usePlanStore (Zustand) → plan, getNextWorkout, profile.
 * EXERCISE_CATALOG (constants/exercises.ts) → practice section.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

import { FONT, Sp, W } from '../../constants/theme';
import ScreenBackground from '../../components/ScreenBackground';
import { usePlanStore } from '../../store/planStore';
import { EXERCISE_CATALOG, Equipment } from '../../constants/exercises';
import type { Workout, PlannedExercise, Plan } from '../../types/plan';

// ─── Design tokens — exact match of home screen ───────────────────────────────

const C = {
  text:    '#0b1020',
  textSub: '#9aa0ad',
  textDim: '#b6bcc7',
  accent:  '#0a84ff',
  card:    '#ffffff',
  border:  'rgba(17,24,39,0.05)',
  iconBox: '#f4f5f8',
  good:    '#30D158',
  goodBg:  'rgba(52,199,89,0.12)',
  midBg:   'rgba(255,159,10,0.12)',
};

const SHADOW_HIGH = Platform.OS === 'ios' ? {
  boxShadow: '0px 1.5px 3px rgba(16,24,40,0.05), 0px 5px 12px rgba(16,24,40,0.05), 0px 20px 36px rgba(28,40,90,0.22), inset 0px 1px 0px rgba(255,255,255,0.95)',
} as any : {};

const SHADOW_MED = Platform.OS === 'ios' ? {
  boxShadow: '0px 1px 1.5px rgba(16,24,40,0.05), 0px 8px 18px rgba(28,40,90,0.15), inset 0px 1px 0px rgba(255,255,255,0.9)',
} as any : {};

const SHADOW_ROW = Platform.OS === 'ios' ? {
  boxShadow: '0px 1px 1.5px rgba(16,24,40,0.05), 0px 8px 18px rgba(28,40,90,0.12), inset 0px 1px 0px rgba(255,255,255,0.9)',
} as any : {};

// ─── Practice section ─────────────────────────────────────────────────────────

const FILTER_ALL        = 'All';
const FILTER_BODYWEIGHT = 'Bodyweight';
const FILTER_DUMBBELL   = 'Dumbbell';
const FILTERS = [FILTER_ALL, FILTER_BODYWEIGHT, FILTER_DUMBBELL] as const;
type Filter = typeof FILTERS[number];

// Border color per equipment category (shown ONLY as border — not background)
const EQUIP_BORDER: Record<string, string> = {
  bodyweight: '#30D158',   // green
  dumbbell:   '#0a84ff',   // blue
  machine:    '#FF9F0A',   // orange
};

// SFSymbols for exercise catalog items
const EXERCISE_SYMBOL: Record<string, string> = {
  squat:  'figure.strengthtraining.traditional',
  pushup: 'figure.core.training',
  curl:   'dumbbell.fill',
};

function equipCategory(equipment: Equipment[]): string {
  if (equipment.length === 0) return 'bodyweight';
  if (equipment.includes(Equipment.Dumbbell)) return 'dumbbell';
  return 'machine';
}

function matchesFilter(equipment: Equipment[], filter: Filter): boolean {
  if (filter === FILTER_ALL) return true;
  const cat = equipCategory(equipment);
  if (filter === FILTER_BODYWEIGHT) return cat === 'bodyweight';
  if (filter === FILTER_DUMBBELL)   return cat === 'dumbbell';
  return true;
}

function estimatedMinutes(exercises: PlannedExercise[]): number {
  return exercises.length * 7;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Section header row — matches home screen SectionHeader exactly */
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={sh.wrap}>
      <Text style={sh.title}>{title}</Text>
      {sub ? <Text style={sh.sub}>{sub}</Text> : null}
    </View>
  );
}
const sh = StyleSheet.create({
  wrap:  { gap: 3, paddingHorizontal: 8 },
  title: { fontSize: 17, fontWeight: W.bold, letterSpacing: -0.3, color: C.text },
  sub:   { fontSize: 12.5, fontWeight: W.medium, color: C.textSub },
});

/** Empty state when no plan exists yet */
function NoPlanCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={[np.card, SHADOW_HIGH]}>
      {/* Illustration placeholder */}
      <View style={np.illustrationBox}>
        <SymbolView
          name="calendar.badge.plus"
          type="monochrome"
          style={{ width: 40, height: 40 }}
          tintColor="#c4c8d4"
        />
      </View>
      <Text style={np.heading}>No plan yet</Text>
      <Text style={np.body}>
        Generate a personalized workout plan based on your goals, experience level, and schedule.
      </Text>
      <Pressable style={np.btn} onPress={onPress}>
        <Text style={np.btnTxt}>Create your plan →</Text>
      </Pressable>
    </View>
  );
}
const np = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  illustrationBox: {
    width: 72, height: 72,
    borderRadius: 22,
    backgroundColor: C.iconBox,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heading: { fontSize: 20, fontWeight: W.bold, letterSpacing: -0.4, color: C.text },
  body:    {
    fontSize: 14, lineHeight: 21, color: C.textSub,
    textAlign: 'center', maxWidth: 260,
  },
  btn: {
    marginTop: 4,
    paddingVertical: 13, paddingHorizontal: 28,
    backgroundColor: C.accent,
    borderRadius: 100,
  },
  btnTxt: { fontSize: 14.5, fontWeight: W.semi, color: '#fff', letterSpacing: -0.2 },
});

/** All-done state when every workout is completed */
function AllDoneCard({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <View style={[nd.card, SHADOW_MED]}>
      <View style={nd.iconBox}>
        <SymbolView name="checkmark.seal.fill" type="multicolor" style={{ width: 36, height: 36 }} />
      </View>
      <Text style={nd.heading}>Plan complete</Text>
      <Text style={nd.body}>You've finished every workout in your plan. Time to level up.</Text>
      <Pressable style={nd.btn} onPress={onRegenerate}>
        <Text style={nd.btnTxt}>Generate new plan</Text>
      </Pressable>
    </View>
  );
}
const nd = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 24, borderWidth: 1,
    borderColor: C.border, padding: 24, alignItems: 'center', gap: 10,
  },
  iconBox: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: C.goodBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  heading: { fontSize: 18, fontWeight: W.bold, letterSpacing: -0.3, color: C.text },
  body:    { fontSize: 13.5, lineHeight: 20, color: C.textSub, textAlign: 'center' },
  btn:     {
    marginTop: 4, paddingVertical: 12, paddingHorizontal: 24,
    backgroundColor: C.accent, borderRadius: 100,
  },
  btnTxt:  { fontSize: 14, fontWeight: W.semi, color: '#fff' },
});

/** Exercise row inside the today card */
function ExerciseRow({ ex, index }: { ex: PlannedExercise; index: number }) {
  const sym = EXERCISE_SYMBOL[ex.exerciseId] ?? 'figure.walk';
  return (
    <View style={er.row}>
      <View style={er.iconWrap}>
        <SymbolView name={sym as any} type="monochrome"
          style={{ width: 16, height: 16 }} tintColor="#6b7180" />
      </View>
      <View style={er.mid}>
        <Text style={er.name}>{ex.displayName}</Text>
        <Text style={er.meta}>{ex.targetSets} × {ex.targetReps} reps</Text>
      </View>
      {/* Form-check indicator */}
      <View style={er.fcPill}>
        <SymbolView name="camera.viewfinder" type="monochrome"
          style={{ width: 12, height: 12 }} tintColor={C.accent} />
        <Text style={er.fcTxt}>AI</Text>
      </View>
    </View>
  );
}
const er = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.iconBox,
    alignItems: 'center', justifyContent: 'center',
  },
  mid:  { flex: 1 },
  name: { fontSize: 14.5, fontWeight: W.semi, color: C.text, letterSpacing: -0.2 },
  meta: { fontSize: 12, fontWeight: W.medium, color: C.textSub, marginTop: 1 },
  fcPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: 'rgba(10,132,255,0.08)',
    borderRadius: 8,
  },
  fcTxt: { fontSize: 11, fontWeight: W.bold, color: C.accent, letterSpacing: 0.2 },
});

/** The hero TODAY card */
function TodayCard({
  workout,
  onStart,
  onEdit,
}: {
  workout: Workout;
  onStart: () => void;
  onEdit:  () => void;
}) {
  const mins    = estimatedMinutes(workout.exercises);
  const exCount = workout.exercises.length;

  return (
    <View style={[tc.card, SHADOW_HIGH]}>
      {/* Header row */}
      <View style={tc.headerRow}>
        <View style={tc.labelChip}>
          <Text style={tc.labelChipTxt}>TODAY</Text>
        </View>
        <Pressable onPress={onEdit} style={tc.editBtn}>
          <SymbolView name="pencil" type="monochrome"
            style={{ width: 13, height: 13 }} tintColor={C.textSub} />
          <Text style={tc.editTxt}>Edit</Text>
        </Pressable>
      </View>

      {/* Workout name */}
      <Text style={tc.workoutName}>{workout.splitLabel}</Text>

      {/* Rationale */}
      <Text style={tc.rationale}>{workout.rationale}</Text>

      {/* Divider */}
      <View style={tc.divider} />

      {/* Exercise list */}
      <View style={tc.exerciseList}>
        {workout.exercises.map((ex, i) => (
          <View key={ex.exerciseId}>
            {i > 0 && <View style={tc.rowDivider} />}
            <ExerciseRow ex={ex} index={i} />
          </View>
        ))}
      </View>

      {/* Divider */}
      <View style={tc.divider} />

      {/* Metadata row */}
      <View style={tc.metaRow}>
        <View style={tc.metaItem}>
          <SymbolView name="list.bullet" type="monochrome"
            style={{ width: 13, height: 13 }} tintColor={C.textSub} />
          <Text style={tc.metaTxt}>{exCount} exercise{exCount !== 1 ? 's' : ''}</Text>
        </View>
        <View style={tc.metaDot} />
        <View style={tc.metaItem}>
          <SymbolView name="clock" type="monochrome"
            style={{ width: 13, height: 13 }} tintColor={C.textSub} />
          <Text style={tc.metaTxt}>~{mins} min</Text>
        </View>
      </View>

      {/* CTA */}
      <Pressable onPress={onStart} style={tc.startBtn}>
        <LinearGradient
          colors={['#1a8fff', '#0a70e8']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={tc.startGrad}
        >
          <SymbolView name="play.fill" type="monochrome"
            style={{ width: 15, height: 15 }} tintColor="#fff" />
          <Text style={tc.startTxt}>Start workout</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}
const tc = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
    padding: 22,
    gap: 16,
  },
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelChip:   {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: C.midBg,
    borderRadius: 8,
  },
  labelChipTxt: { fontSize: 11, fontWeight: W.bold, color: '#c47f12', letterSpacing: 0.6 },
  editBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  editTxt:     { fontSize: 13, fontWeight: W.medium, color: C.textSub },
  workoutName: {
    fontFamily: FONT.displayBold,
    fontSize: 28,
    letterSpacing: -0.8,
    color: C.text,
    lineHeight: 30,
  },
  rationale:   { fontSize: 13.5, lineHeight: 20, color: C.textSub, marginTop: -4 },
  divider:     { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.07)' },
  exerciseList: { gap: 0 },
  rowDivider:  { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.05)', marginLeft: 47 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTxt:     { fontSize: 12.5, fontWeight: W.medium, color: C.textSub },
  metaDot:     { width: 3, height: 3, borderRadius: 2, backgroundColor: C.textDim },
  startBtn:    { borderRadius: 18, overflow: 'hidden', ...SHADOW_MED },
  startGrad:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 9, paddingVertical: 16,
  },
  startTxt:    { fontSize: 16, fontWeight: W.bold, color: '#fff', letterSpacing: -0.3 },
});

/** Week schedule section — shows current week's sessions */
function WeekSchedule({
  workout: nextWorkout,
  plan,
}: {
  workout: Workout | null;
  plan:    Plan;
}) {
  const daysPerWeek   = plan.profile.daysPerWeek;
  const currentIdx    = plan.currentWorkoutIndex;
  const currentWeek   = Math.floor(currentIdx / daysPerWeek);
  const totalWeeks    = Math.ceil(plan.workouts.length / daysPerWeek);
  const weekStart     = currentWeek * daysPerWeek;
  const weekWorkouts  = plan.workouts.slice(weekStart, weekStart + daysPerWeek);

  return (
    <View style={ws.wrap}>
      {/* Week header */}
      <View style={ws.headerRow}>
        <Text style={ws.heading}>This week</Text>
        <View style={ws.weekBadge}>
          <Text style={ws.weekBadgeTxt}>Week {currentWeek + 1} of {totalWeeks}</Text>
        </View>
      </View>

      {/* Progress pips */}
      <View style={ws.pipsRow}>
        {Array.from({ length: totalWeeks }).map((_, i) => (
          <View key={i} style={[ws.pip, i < currentWeek && ws.pipDone, i === currentWeek && ws.pipActive]} />
        ))}
      </View>

      {/* Session rows */}
      <View style={ws.sessionList}>
        {weekWorkouts.map((w, i) => {
          const globalIdx = weekStart + i;
          const isDone    = globalIdx < currentIdx || w.completed;
          const isCurrent = globalIdx === currentIdx && !w.completed;
          const isUpcoming = !isDone && !isCurrent;

          return (
            <View key={w.id} style={[ws.sessionRow, SHADOW_ROW, isCurrent && ws.sessionRowActive]}>
              {/* Session number bubble */}
              <View style={[ws.numBubble, isDone && ws.numBubbleDone, isCurrent && ws.numBubbleActive]}>
                {isDone ? (
                  <SymbolView name="checkmark" type="monochrome"
                    style={{ width: 13, height: 13 }} tintColor="#fff" />
                ) : (
                  <Text style={[ws.numTxt, isCurrent && ws.numTxtActive]}>{i + 1}</Text>
                )}
              </View>

              <View style={ws.sessionMid}>
                <Text style={[ws.sessionName, isUpcoming && ws.sessionNameDim]}>
                  {w.splitLabel}
                </Text>
                <Text style={ws.sessionMeta}>
                  {isDone
                    ? `Completed · ${w.exercises.length} exercises`
                    : `${w.exercises.length} exercises · ~${estimatedMinutes(w.exercises)} min`}
                </Text>
              </View>

              {isCurrent && (
                <View style={ws.currentPill}>
                  <Text style={ws.currentPillTxt}>Next</Text>
                </View>
              )}
              {isDone && (
                <Text style={ws.doneTxt}>✓</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
const ws = StyleSheet.create({
  wrap:       { gap: 12 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  heading:    { fontSize: 17, fontWeight: W.bold, letterSpacing: -0.3, color: C.text },
  weekBadge:  {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: C.iconBox,
    borderRadius: 10,
  },
  weekBadgeTxt: { fontSize: 11.5, fontWeight: W.semi, color: C.textSub },
  pipsRow:    { flexDirection: 'row', gap: 5, paddingHorizontal: 8 },
  pip:        {
    flex: 1, height: 4, borderRadius: 3,
    backgroundColor: '#eceef3',
  },
  pipDone:    { backgroundColor: C.good },
  pipActive:  { backgroundColor: C.accent },
  sessionList: { gap: 8 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: C.card,
    borderRadius: 18, borderWidth: 1, borderColor: C.border,
    padding: 14, paddingHorizontal: 16,
  },
  sessionRowActive: {
    borderColor: 'rgba(10,132,255,0.18)',
    backgroundColor: 'rgba(10,132,255,0.02)',
  },
  numBubble: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.iconBox,
    alignItems: 'center', justifyContent: 'center',
  },
  numBubbleDone:   { backgroundColor: C.good },
  numBubbleActive: { backgroundColor: C.accent },
  numTxt:       { fontSize: 14, fontWeight: W.bold, color: C.textSub },
  numTxtActive: { color: '#fff' },
  sessionMid:    { flex: 1 },
  sessionName:   { fontSize: 14.5, fontWeight: W.semi, color: C.text, letterSpacing: -0.2 },
  sessionNameDim:{ color: C.textSub },
  sessionMeta:   { fontSize: 12, fontWeight: W.medium, color: C.textSub, marginTop: 1 },
  currentPill:   {
    paddingHorizontal: 9, paddingVertical: 4,
    backgroundColor: 'rgba(10,132,255,0.10)',
    borderRadius: 8,
  },
  currentPillTxt: { fontSize: 11.5, fontWeight: W.bold, color: C.accent },
  doneTxt:       { fontSize: 16, color: C.good },
});

/** Practice exercise card (2-col grid) */
function PracticeCard({ id, name, equipment, onPress }: {
  id:        string;
  name:      string;
  equipment: Equipment[];
  onPress:   () => void;
}) {
  const cat    = equipCategory(equipment);
  const border = EQUIP_BORDER[cat] ?? EQUIP_BORDER.bodyweight;
  const sym    = EXERCISE_SYMBOL[id] ?? 'figure.walk';

  return (
    <Pressable onPress={onPress} style={[pc.card, SHADOW_MED, { borderColor: border }]}>
      {/* Placeholder image area */}
      <View style={pc.imgBox}>
        <LinearGradient
          colors={['#f4f5f8', '#eceef3']}
          style={pc.imgGrad}
        >
          <SymbolView name={sym as any} type="monochrome"
            style={{ width: 32, height: 32 }} tintColor="#b0b5bf" />
        </LinearGradient>
      </View>
      <Text style={pc.name} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
}
const pc = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: C.card,
    borderRadius: 18, borderWidth: 1.5,
    overflow: 'hidden',
  },
  imgBox:  { width: '100%', aspectRatio: 1.5 },
  imgGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name:    {
    fontSize: 13.5, fontWeight: W.semi, color: C.text,
    letterSpacing: -0.2, padding: 12, paddingTop: 10,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TrainScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { plan, isLoaded, getNextWorkout, loadFromStorage, regenerate } = usePlanStore();

  const [filter, setFilter] = useState<Filter>(FILTER_ALL);

  // Ensure plan is loaded when this tab comes into focus
  useFocusEffect(useCallback(() => {
    if (!isLoaded) loadFromStorage();
  }, [isLoaded]));

  const nextWorkout = plan ? getNextWorkout() : null;

  // Week math
  const weekNum = useMemo(() => {
    if (!plan) return 1;
    return Math.floor(plan.currentWorkoutIndex / plan.profile.daysPerWeek) + 1;
  }, [plan]);

  const totalWeeks = useMemo(() => {
    if (!plan) return 4;
    return Math.ceil(plan.workouts.length / plan.profile.daysPerWeek);
  }, [plan]);

  // Plan context subtitle for header
  const planSubtitle = useMemo(() => {
    if (!plan || !nextWorkout) return null;
    return `${nextWorkout.splitLabel} · Week ${weekNum} of ${totalWeeks}`;
  }, [plan, nextWorkout, weekNum, totalWeeks]);

  // Practice grid — filtered from EXERCISE_CATALOG
  const practiceExercises = useMemo(() => {
    return EXERCISE_CATALOG.filter(e => matchesFilter(e.equipment, filter));
  }, [filter]);

  function startWorkout() {
    if (!nextWorkout || nextWorkout.exercises.length === 0) return;
    router.push('/workout' as any);
  }

  function openPractice(exerciseId: string) {
    router.push(`/formcheck?exercise=${exerciseId}` as any);
  }

  function editWorkout() {
    // TODO: open workout edit view
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <StatusBar style="dark" />
      <ScreenBackground>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.scroll,
            { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 90 },
          ]}
        >

          {/* ── 1. HEADER ──────────────────────────────────────────────────── */}
          <View style={s.header}>
            <Text style={s.title}>Train</Text>
            {planSubtitle ? (
              <Text style={s.subtitle}>{planSubtitle}</Text>
            ) : (
              <Text style={s.subtitle}>Your personal plan</Text>
            )}
          </View>

          {/* ── 2. TODAY'S WORKOUT (HERO) ──────────────────────────────────── */}
          {!isLoaded ? (
            // Loading skeleton — plain empty card to prevent layout shift
            <View style={[s.skeletonCard, SHADOW_MED]} />
          ) : !plan ? (
            // No plan → prompt to create one
            <NoPlanCard onPress={() => router.push('/onboarding' as any)} />
          ) : nextWorkout ? (
            <TodayCard
              workout={nextWorkout}
              onStart={startWorkout}
              onEdit={editWorkout}
            />
          ) : (
            // All workouts complete
            <AllDoneCard onRegenerate={regenerate} />
          )}

          {/* ── 3. THIS WEEK / SCHEDULE ────────────────────────────────────── */}
          {plan && (
            <WeekSchedule workout={nextWorkout} plan={plan} />
          )}

          {/* ── 4. PRACTICE ────────────────────────────────────────────────── */}
          <View style={s.practiceSection}>
            <SectionHeader
              title="Practice"
              sub="Learn and practice any exercise"
            />

            {/* Filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipsRow}
            >
              {FILTERS.map(f => (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[s.chip, filter === f && s.chipActive]}
                >
                  <Text style={[s.chipTxt, filter === f && s.chipTxtActive]}>{f}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* 2-column exercise grid */}
            <View style={s.practiceGrid}>
              {practiceExercises.map((ex, i) => (
                <View key={ex.id} style={s.practiceCell}>
                  <PracticeCard
                    id={ex.id}
                    name={ex.displayName}
                    equipment={ex.equipment}
                    onPress={() => openPractice(ex.id)}
                  />
                </View>
              ))}
              {/* Fill last row if odd count */}
              {practiceExercises.length % 2 !== 0 && (
                <View style={s.practiceCell} />
              )}
            </View>
          </View>

        </ScrollView>
      </ScreenBackground>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: { gap: Sp.lg, paddingHorizontal: 16 },

  // 1. Header
  header: { gap: 6, paddingHorizontal: 8 },
  title: {
    fontFamily:    FONT.displayLight,
    fontSize:      36,
    lineHeight:    38,
    letterSpacing: -1,
    color:         C.text,
  },
  subtitle: { fontSize: 13.5, fontWeight: W.medium, letterSpacing: 0.1, color: C.textSub },

  // Loading skeleton
  skeletonCard: {
    height: 300,
    backgroundColor: C.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
  },

  // 4. Practice
  practiceSection: { gap: 14 },
  chipsRow: { paddingHorizontal: 8, gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: C.iconBox,
    borderRadius: 100,
    borderWidth: 1, borderColor: 'transparent',
  },
  chipActive:    { backgroundColor: C.accent },
  chipTxt:       { fontSize: 13.5, fontWeight: W.semi, color: C.textSub },
  chipTxtActive: { color: '#fff' },
  practiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 0,
  },
  practiceCell: { width: '47.5%' },
});
