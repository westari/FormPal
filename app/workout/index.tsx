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
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Modal, Animated, Easing } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SymbolView } from 'expo-symbols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from '../../lib/haptics';
import ScreenBackground from '../../components/ScreenBackground';
import GlassBackButton from '../../components/GlassBackButton';
import { usePlanStore } from '../../store/planStore';
import { useWorkoutSessionStore } from '../../store/workoutSessionStore';
import { workoutMinutes } from '../../lib/trainData';
import { templateWorkout, SAVED_WORKOUTS_KEY, TEMPLATE_NOTE } from '../../lib/workoutTemplates';
import { FONT, W, Sp, R, Elev, Col } from '../../constants/theme';

const STARTER_TEMPLATE_ID = 'tpl-beginner-full'; // what Start workout opens when there is no plan workout at all

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

/** One sets or reps row in the edit sheet: a grey rounded row (like an exercise row on Home's Edit Workout sheet) with white round controls. */
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const step = (d: number) => { const n = Math.max(min, Math.min(max, value + d)); if (n !== value) { Haptics.selectionAsync(); onChange(n); } };
  return (
    <View style={s.stepRow}>
      <Text style={s.stepLabel}>{label}</Text>
      <View style={s.stepCtl}>
        <Pressable hitSlop={8} onPress={() => step(-1)} style={s.stepBtn} accessibilityRole="button" accessibilityLabel={`Fewer ${label.toLowerCase()}`}>
          <SymbolView name="minus" size={14} weight="bold" tintColor={INK} type="monochrome" style={{ width: 14, height: 14 }} />
        </Pressable>
        <Text style={s.stepVal}>{value}</Text>
        <Pressable hitSlop={8} onPress={() => step(1)} style={s.stepBtn} accessibilityRole="button" accessibilityLabel={`More ${label.toLowerCase()}`}>
          <SymbolView name="plus" size={14} weight="bold" tintColor={INK} type="monochrome" style={{ width: 14, height: 14 }} />
        </Pressable>
      </View>
    </View>
  );
}

function ExCard({ name, sets, reps, onEdit }: { name: string; sets: number; reps: number; onEdit: () => void }) {
  return (
    <View style={s.card}>
      <LinearGradient colors={['#ffffff', '#fbfbfd']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 26 }]} />
      <View style={s.pic} />
      <View style={s.cardText}>
        <Text style={s.exName} numberOfLines={1}>{name}</Text>
        <Text style={s.exMeta} numberOfLines={1}>{plural(sets, 'set')} · {plural(reps, 'rep')}</Text>
      </View>
      <Pressable hitSlop={14} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit sets and reps for ${name}`}>
        <SymbolView name="pencil" size={16} weight="semibold" tintColor={INK} type="monochrome" style={s.pencil} />
      </Pressable>
    </View>
  );
}

/** The header starts BELOW the notch / status bar with real breathing room (it sat right up against it before). */
export const SHEET_MS = 220;
export const headerTop = (insetTop: number) => Math.max(insetTop, 47) + 14;

export default function WorkoutPreviewScreen() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const plan       = usePlanStore(st => st.plan);
  const planLoaded = usePlanStore(st => st.isLoaded);
  // a specific workout (?id=...: My workouts, or a future day on Train), else the next workout in the plan
  const { id, preview, template } = useLocalSearchParams<{ id?: string; preview?: string; template?: string }>();
  // The plan store is only filled when something loads it. Nothing did at app start, so the first "Start workout" read an EMPTY store and
  // showed the old no-plan message even with a full plan saved. It is loaded here (and at app start) now.
  useEffect(() => { if (!usePlanStore.getState().isLoaded) void usePlanStore.getState().loadFromStorage(); }, []);
  const startSess  = useWorkoutSessionStore(st => st.startWorkout);
  // a FormPal template (from My workouts) is built from the real catalogue; it can be started or saved (bookmarked)
  // Start workout ALWAYS opens a real workout: the one asked for, else the plan's next workout, else a starter workout from Templates.
  const nextPlanned = plan ? (plan.workouts[plan.currentWorkoutIndex] ?? null) : null;
  const asked = (template ? templateWorkout(template) : null) ?? (id ? plan?.workouts.find(w => w.id === id) : null) ?? nextPlanned;
  const starter = !asked && planLoaded ? templateWorkout(STARTER_TEMPLATE_ID) : null;
  const baseWorkout = asked ?? starter;
  const tplId = template ?? (starter ? starter.id : undefined);
  // the pencil: sets and reps changed here. A plan workout is saved to the plan; a template has no plan copy, so its changes
  // live for this screen (and the workout started from it).
  const setTargets = usePlanStore(st => st.setExerciseTargets);
  const [edits, setEdits] = useState<Record<number, { sets: number; reps: number }>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ sets: number; reps: number }>({ sets: 3, reps: 10 });
  // The sheet and its background are animated here, not by the Modal: the Modal's own "slide" slid the dim layer up the screen as well, so its
  // hard top edge was visible moving up on open and down on close. Now the Modal has no animation, the whole background fades in and out
  // evenly (no moving edge), and only the sheet itself slides.
  const [sheetShown, setSheetShown] = useState(false);
  const dim = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const lastEditing = useRef<number | null>(null);
  if (editing != null) lastEditing.current = editing;
  useEffect(() => {
    if (editing != null) {
      setSheetShown(true);
      Animated.parallel([
        Animated.timing(dim, { toValue: 1, duration: SHEET_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(slide, { toValue: 1, duration: SHEET_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else if (sheetShown) {
      Animated.parallel([
        Animated.timing(dim, { toValue: 0, duration: SHEET_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: SHEET_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setSheetShown(false); });
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const workout = baseWorkout ? { ...baseWorkout, exercises: baseWorkout.exercises.map((e, i) => edits[i] ? { ...e, targetSets: edits[i].sets, targetReps: edits[i].reps } : e) } : baseWorkout;
  const openEdit = (i: number) => {
    if (!workout) return;
    Haptics.selectionAsync();
    setDraft({ sets: workout.exercises[i].targetSets, reps: workout.exercises[i].targetReps });
    setEditing(i);
  };
  const saveEdit = () => {
    if (editing == null || !workout) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEdits(prev => ({ ...prev, [editing]: draft }));
    if (!tplId && workout.id) void setTargets(workout.id, editing, draft.sets, draft.reps);
    setEditing(null);
  };
  const previewOnly = preview === '1'; // a day that is not today: look, no Start button
  const isTemplate = !!tplId && !!workout && workout.id === tplId;
  const [savedToMine, setSavedToMine] = useState(false);
  useEffect(() => {
    if (!isTemplate) return;
    AsyncStorage.getItem(SAVED_WORKOUTS_KEY).then(raw => { try { setSavedToMine((raw ? JSON.parse(raw) : []).includes(tplId)); } catch { /* none saved */ } }).catch(() => {});
  }, [isTemplate, tplId]);
  const toggleSaved = async () => {
    Haptics.selectionAsync();
    try {
      const raw = await AsyncStorage.getItem(SAVED_WORKOUTS_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const next = ids.includes(tplId as string) ? ids.filter(x => x !== tplId) : [...ids, tplId as string];
      await AsyncStorage.setItem(SAVED_WORKOUTS_KEY, JSON.stringify(next));
      setSavedToMine(next.includes(tplId as string));
    } catch { /* storage failed: the star stays as it was */ }
  };

  // (loading the saved plan: a blank page of the same colour, never a message)
  if (!workout) {
    return (
      <View style={s.root}>
        <PageBackground />
      </View>
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

      <View style={[s.header, { paddingTop: headerTop(insets.top) }]}>
        <GlassBackButton onPress={() => router.back()} />
        <View style={s.titleBlock}>
          <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{workout.splitLabel}</Text>
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
          <ExCard key={ex.exerciseId + ':' + i} name={ex.displayName} sets={ex.targetSets} reps={ex.targetReps} onEdit={() => openEdit(i)} />
        ))}
      </ScrollView>

      <Modal visible={sheetShown} transparent animationType="none" onRequestClose={() => setEditing(null)} statusBarTranslucent>
        <Animated.View style={[StyleSheet.absoluteFill, s.sheetBack, { opacity: dim }]} testID="edit-dim">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} accessibilityLabel="Close" />
        </Animated.View>
        {/* The same sheet as the Edit Workout sheet on Home: a floating white sheet (8px from the sides and the bottom, 40px corners), the grab
            bar, a 20px bold title with a round close button, grey rounded rows (#f6f6f8, 20px corners) with white round controls, and the
            black Done pill. */}
        <Animated.View style={[s.sheet, { bottom: 8 + Math.max(insets.bottom - 8, 0), transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] }]} testID="edit-sheet">
          <Pressable onPress={() => setEditing(null)} style={s.grabHit} accessibilityLabel="Close grab bar"><View style={s.grab} /></Pressable>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle} numberOfLines={1}>{lastEditing.current != null ? workout.exercises[lastEditing.current]?.displayName : ''}</Text>
            <Pressable onPress={() => setEditing(null)} style={s.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
              <SymbolView name="xmark" size={12} weight="bold" tintColor={INK} type="monochrome" style={{ width: 12, height: 12 }} />
            </Pressable>
          </View>
          <View style={s.sheetRows}>
            <Stepper label="Sets" value={draft.sets} min={1} max={10} onChange={n => setDraft(d => ({ ...d, sets: n }))} />
            <Stepper label="Reps" value={draft.reps} min={1} max={50} onChange={n => setDraft(d => ({ ...d, reps: n }))} />
          </View>
          <View style={s.sheetBtns}>
            <Pressable style={s.sheetSave} onPress={saveEdit} accessibilityRole="button" accessibilityLabel="Save">
              <Text style={s.sheetSaveTxt}>Done</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Modal>

      {!previewOnly && (
        <View style={[s.footer, { bottom: footer }]} pointerEvents="box-none">
          {isTemplate && (
            <Pressable style={s.saveBtn} onPress={toggleSaved} accessibilityRole="button" accessibilityLabel={savedToMine ? 'Template saved' : 'Save template'}>
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
  titleBlock: { flex: 1 },
  title: { fontFamily: FONT.displayBold, fontSize: 34, lineHeight: 40, letterSpacing: -1, color: INK },
  subtitle: { fontFamily: FONT.display, fontSize: 18, lineHeight: 24, color: SUB, marginTop: 2 },

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

  sheetBack: { backgroundColor: 'rgba(17,17,20,0.35)' },
  sheet: {
    position: 'absolute', left: 8, right: 8, borderRadius: 40, overflow: 'hidden', backgroundColor: '#ffffff',
    boxShadow: '0 -10px 40px -14px rgba(40,50,90,0.35), 0 2px 8px -2px rgba(40,50,90,0.1)',
  } as any,
  grabHit: { paddingTop: 10, paddingBottom: 4, alignItems: 'center' },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: '#dcdce1' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 10 },
  sheetTitle: { flex: 1, fontFamily: FONT.displayBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.5, color: INK },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f1f1f4', alignItems: 'center', justifyContent: 'center' },
  sheetRows: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  stepRow: { borderRadius: 20, paddingVertical: 13, paddingLeft: 16, paddingRight: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f6f6f8' },
  stepLabel: { fontFamily: FONT.displayBold, fontSize: 15.5, letterSpacing: -0.3, color: INK },
  stepCtl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px -3px rgba(40,50,90,0.3)' } as any,
  stepVal: { fontFamily: FONT.displayBold, fontSize: 18, color: INK, minWidth: 44, textAlign: 'center' },
  sheetBtns: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 8 },
  sheetSave: { height: 54, borderRadius: 27, backgroundColor: '#111114', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 30px -16px rgba(17,17,20,0.6)' } as any,
  sheetSaveTxt: { fontFamily: FONT.displayBold, fontSize: 16, color: '#ffffff' },
  footer: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 10, alignItems: 'center' },
  saveBtn: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 22px -10px rgba(40,50,90,0.35), 0 1px 3px rgba(40,50,90,0.1)' } as any,
  tplNote: { fontFamily: FONT.display, fontSize: 12.5, lineHeight: 16, color: SUB, marginTop: 4 },
  startBtn: {
    height: 58, borderRadius: 29, backgroundColor: INK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    boxShadow: '0 16px 30px -16px rgba(17,17,20,0.6)',
  } as any,
  startTxt: { fontFamily: FONT.displayBold, fontSize: 16.5, letterSpacing: -0.2, color: '#ffffff' },
});
