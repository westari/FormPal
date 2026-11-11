/**
 * app/workout/index.tsx
 *
 * The workout preview: every "Start workout" (plus menu, Home, Train) opens this first, and its black Start button opens the
 * workout itself (/workout/run). Train's "Preview workout" on a future day opens it for THAT day (?id=<workout>&preview=1)
 * with no Start button, because that day is not today.
 *
 * Built in native code to match Ari's design screenshot: soft grey page with a pink glow top left, a white round back button,
 * the workout name over "52 min · 8 exercises", one white rounded card per exercise (picture square, name,
 * "4 sets · 8 reps", pencil) and the black "Start workout" pill floating at the bottom. Real data: the plan's workout.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SymbolView } from 'expo-symbols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from '../../lib/haptics';
import ScreenBackground from '../../components/ScreenBackground';
import { usePlanStore } from '../../store/planStore';
import { useWorkoutSessionStore } from '../../store/workoutSessionStore';
import { workoutMinutes } from '../../lib/trainData';
import { templateWorkout, SAVED_WORKOUTS_KEY, TEMPLATE_NOTE } from '../../lib/workoutTemplates';
import { FONT, W, Sp, R, Elev, Col } from '../../constants/theme';
import type { PlanProfile } from '../../types/plan';

// TEMP, pre-auth: there's no real account/onboarding-profile flow feeding createPlan() yet, so "no workout scheduled" can be
// the only state this screen reaches on a fresh install. This lets it be tested end-to-end; remove once real profile
// creation exists and PlanProfile is coming from an actual user, not a hardcoded stand-in.
const TEST_PROFILE: PlanProfile = {
  goal:        'general',
  experience:  'beginner',
  daysPerWeek: 4,
  location:    'home',
};

const INK = '#111114';
const SUB = '#5f5f69';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The design's page: grey-to-white wash with a pink glow at the top left corner. */
function PageBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#ebebef', '#f4f4f6', '#fafafb', '#ffffff']} locations={[0, 0.26, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="pink" cx="0" cy="0" fx="0" fy="0" rx="0.6" ry="0.2" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor="rgb(255,214,222)" stopOpacity="0.32" />
            <Stop offset="0.7" stopColor="rgb(255,214,222)" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#pink)" />
      </Svg>
    </View>
  );
}

function ExCard({ name, sets, reps }: { name: string; sets: number; reps: number }) {
  return (
    <View style={s.card}>
      <LinearGradient colors={['#ffffff', '#fbfbfd']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 26 }]} />
      <View style={s.pic} />
      <View style={s.cardText}>
        <Text style={s.exName} numberOfLines={1}>{name}</Text>
        <Text style={s.exMeta} numberOfLines={1}>{plural(sets, 'set')} · {plural(reps, 'rep')}</Text>
      </View>
      <SymbolView name="pencil" size={16} weight="semibold" tintColor={INK} type="monochrome" style={s.pencil} />
    </View>
  );
}

export default function WorkoutPreviewScreen() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const getNext    = usePlanStore(st => st.getNextWorkout);
  // a specific workout (?id=...: My workouts, or a future day on Train), else the next workout in the plan
  const { id, preview, template } = useLocalSearchParams<{ id?: string; preview?: string; template?: string }>();
  const createPlan = usePlanStore(st => st.createPlan);
  const startSess  = useWorkoutSessionStore(st => st.startWorkout);
  // a FormPal template (from My workouts) is built from the real catalogue; it can be started or saved to Mine
  const workout    = (template ? templateWorkout(template) : null) ?? (id ? usePlanStore.getState().plan?.workouts.find(w => w.id === id) : null) ?? getNext();
  const [creatingTestPlan, setCreatingTestPlan] = useState(false);
  const previewOnly = preview === '1'; // a day that is not today: look, no Start button
  const isTemplate = !!template && !!workout && workout.id === template;
  const [savedToMine, setSavedToMine] = useState(false);
  useEffect(() => {
    if (!isTemplate) return;
    AsyncStorage.getItem(SAVED_WORKOUTS_KEY).then(raw => { try { setSavedToMine((raw ? JSON.parse(raw) : []).includes(template)); } catch { /* none saved */ } }).catch(() => {});
  }, [isTemplate, template]);
  const toggleSaved = async () => {
    Haptics.selectionAsync();
    try {
      const raw = await AsyncStorage.getItem(SAVED_WORKOUTS_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const next = ids.includes(template as string) ? ids.filter(x => x !== template) : [...ids, template as string];
      await AsyncStorage.setItem(SAVED_WORKOUTS_KEY, JSON.stringify(next));
      setSavedToMine(next.includes(template as string));
    } catch { /* storage failed: the star stays as it was */ }
  };

  // getNextWorkout is read once at mount (it subscribes to the function reference, not to `plan`), so after createPlan()
  // resolves, router.replace gives this screen a fresh mount that re-reads it.
  const handleGenerateTestPlan = async () => {
    setCreatingTestPlan(true);
    try {
      await createPlan(TEST_PROFILE);
      router.replace('/workout' as any);
    } finally {
      setCreatingTestPlan(false);
    }
  };

  if (!workout) {
    return (
      <ScreenBackground>
        <View style={[s.center, { paddingTop: insets.top }]}>
          <Text style={s.noWorkout}>No workout scheduled.</Text>
          <Text style={s.noWorkoutSub}>
            There's no account/profile system yet, so no real plan exists to pull from.
          </Text>
          <Pressable onPress={handleGenerateTestPlan} disabled={creatingTestPlan} style={s.testPlanBtn}>
            {creatingTestPlan ? <ActivityIndicator color="#fff" /> : <Text style={s.testPlanBtnTxt}>Generate a Test Plan</Text>}
          </Pressable>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnTxt}>Go back</Text>
          </Pressable>
        </View>
      </ScreenBackground>
    );
  }

  const exCount = workout.exercises.length;
  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); // a main action (the shim plays it as Light)
    startSess(workout);
    router.push('/workout/run' as any);
  };
  const footer = Math.max(insets.bottom - 4, 20);

  return (
    <View style={s.root}>
      <PageBackground />

      <View style={[s.header, { paddingTop: Math.max(insets.top - 6, 14) }]}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={s.backCircle} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={15} weight="bold" tintColor={INK} type="monochrome" style={{ width: 15, height: 15 }} />
        </Pressable>
        <View style={s.titleBlock}>
          <Text style={s.title} numberOfLines={1}>{workout.splitLabel}</Text>
          <Text style={s.subtitle} numberOfLines={1}>{workoutMinutes(workout)} min · {plural(exCount, 'exercise')}</Text>
          {isTemplate && <Text style={s.tplNote} numberOfLines={2}>FormPal template. {TEMPLATE_NOTE}</Text>}
        </View>
      </View>

      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.list, { paddingBottom: (previewOnly ? 0 : 58 + footer + 24) + insets.bottom + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        {workout.exercises.map((ex, i) => (
          <ExCard key={ex.exerciseId + ':' + i} name={ex.displayName} sets={ex.targetSets} reps={ex.targetReps} />
        ))}
      </ScrollView>

      {!previewOnly && (
        <View style={[s.footer, { bottom: footer }]} pointerEvents="box-none">
          {isTemplate && (
            <Pressable style={s.saveBtn} onPress={toggleSaved} accessibilityRole="button" accessibilityLabel={savedToMine ? 'Saved to Mine' : 'Save to Mine'}>
              <SymbolView name={savedToMine ? 'bookmark.fill' : 'bookmark'} size={20} tintColor={INK} type="monochrome" style={{ width: 20, height: 20 }} />
            </Pressable>
          )}
          <Pressable style={[s.startBtn, { flex: 1 }]} onPress={handleStart} accessibilityRole="button" accessibilityLabel="Start workout">
            <SymbolView name="play.fill" size={12} tintColor="#ffffff" type="monochrome" style={{ width: 12, height: 12 }} />
            <Text style={s.startTxt}>Start workout</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafb' },
  flex: { flex: 1 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Sp.md },
  noWorkout: { fontSize: 16, fontWeight: W.semi, color: Col.text },
  noWorkoutSub: {
    fontSize: 13.5, color: Col.textSub, textAlign: 'center', lineHeight: 19,
    marginTop: 6, marginBottom: Sp.md, paddingHorizontal: Sp.lg,
  },
  testPlanBtn: {
    backgroundColor: '#0b1020', borderRadius: R.pill, paddingHorizontal: Sp.xl, paddingVertical: 14,
    marginBottom: Sp.sm, minWidth: 200, alignItems: 'center',
    boxShadow: Elev.medium.shadow,
  } as any,
  testPlanBtnTxt: { fontSize: 15, fontWeight: W.bold, color: '#fff' },
  backBtn:   { paddingHorizontal: Sp.lg, paddingVertical: Sp.sm, borderRadius: R.pill, backgroundColor: Col.card },
  backBtnTxt:{ fontSize: 15, fontWeight: W.semi, color: Col.text },

  // header: round white back button, then the name over "52 min · 8 exercises"
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 0, gap: 15 },
  backCircle: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 6px 16px -6px rgba(40,50,90,0.28), 0 1px 3px rgba(40,50,90,0.08)',
  } as any,
  titleBlock: { flex: 1 },
  title: { fontFamily: FONT.displayBlack, fontSize: 25, lineHeight: 29, letterSpacing: -0.8, color: INK },
  subtitle: { fontFamily: FONT.display, fontSize: 13.5, lineHeight: 18, color: SUB, marginTop: 2 },

  // one card per exercise
  list: { paddingHorizontal: 14, paddingTop: 25, gap: 10 },
  card: {
    height: 80, borderRadius: 26, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 19,
    backgroundColor: '#ffffff',
    boxShadow: '0 14px 34px -14px rgba(40,50,90,0.24), 0 2px 6px -2px rgba(40,50,90,0.08)',
  } as any,
  pic: { width: 60, height: 60, borderRadius: 16, backgroundColor: '#f1f1f4' },
  cardText: { flex: 1, marginLeft: 14, gap: 3 },
  exName: { fontFamily: FONT.displayBold, fontSize: 16, lineHeight: 20, letterSpacing: -0.2, color: INK },
  exMeta: { fontFamily: FONT.display, fontSize: 13.5, lineHeight: 17, color: SUB },
  pencil: { width: 16, height: 16, marginLeft: 8 },

  footer: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 10, alignItems: 'center' },
  saveBtn: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 22px -10px rgba(40,50,90,0.35), 0 1px 3px rgba(40,50,90,0.1)' } as any,
  tplNote: { fontFamily: FONT.display, fontSize: 12.5, lineHeight: 16, color: SUB, marginTop: 4 },
  startBtn: {
    height: 58, borderRadius: 29, backgroundColor: INK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    boxShadow: '0 16px 30px -16px rgba(17,17,20,0.6)',
  } as any,
  startTxt: { fontFamily: FONT.displayBold, fontSize: 16.5, letterSpacing: -0.2, color: '#ffffff' },
});
