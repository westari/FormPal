import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Animated, Dimensions, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import RepFeedback from '../components/RepFeedback';
import { MuscleHeatmap } from '../components/MuscleHeatmap';
import {
  getAllSessions, appendSessions, groupIntoWorkouts, computeOverallMuscleScores,
  muscleGroupsWorked, type SessionEntry, type MuscleScores,
} from '../lib/sessionLog';
import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import { useWorkoutSessionStore } from '../store/workoutSessionStore';
import type { WorkoutSummary } from '../store/workoutSessionStore';
import { usePlanStore } from '../store/planStore';
import type { MuscleGroup } from '../constants/exercises';

// ─── Error boundary ───────────────────────────────────────────────────────────
// The recap screen must degrade gracefully instead of taking the whole app
// down — this guarantees that if a wrapped subtree throws, this screen shows
// a plain fallback instead of the whole app crashing.
class RecapSectionBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) {
    console.error('[RecapSectionBoundary] caught render error:', error);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface RepEventData {
  timeSec: number;
  good:    boolean;
  reason:  string;
}

interface RecapData {
  ts:              number;
  entries:         SessionEntry[];
  totalReps:       number;
  totalGoodReps:   number;
  pct:             number;
  videoUri?:       string;
  repEvents?:      RepEventData[];
  isHistory:       boolean;
  workoutSummary?: WorkoutSummary;
  // Real elapsed session time when we have it — workout mode (WorkoutSummary
  // tracks this natively) and solo mode (formcheck.tsx now passes it through
  // from its own session-start timestamp, see doNavigate). History mode has
  // no duration recorded per past session — stays undefined there, and the
  // Time stat tile is simply omitted rather than showing a fabricated number.
  durationSec?:    number;
}

// ─── Palette — liquid-glass light theme, matches the pasted mockup ───────────
// Deliberately a full palette swap from the previous dark-purple version:
// the mockup's whole visual language is a bright, airy gradient (soft blue →
// lavender → mint → peach) with white frosted-glass panels floating on top,
// not a saturated dark background. Every token below is read directly off
// the mockup's inline styles, not re-invented.
const C = {
  bgTop:      '#EDF1FB',
  bgMid1:     '#E4EAFA',
  bgMid2:     '#EAF3F4',
  bgBottom:   '#F6EFE9',

  // Decorative background blobs (radial glows) — approximated in RN via
  // react-native-svg's RadialGradient rather than CSS blur+radial-gradient,
  // which has no direct RN equivalent.
  blobIndigo: 'rgba(96,116,255,0.55)',
  blobTeal:   'rgba(64,206,190,0.48)',
  blobCoral:  'rgba(255,167,116,0.42)',

  glassFillHi:   'rgba(255,255,255,0.62)',
  glassFillLo:   'rgba(255,255,255,0.34)',
  glassHighlight:'rgba(255,255,255,0.95)',
  glassEdge:     'rgba(255,255,255,0.7)',
  shadow:        'rgba(28,44,110,0.30)',

  text:      '#131a2e',
  muted:     'rgba(30,40,70,0.55)',
  mutedDim:  'rgba(30,42,74,0.52)',
  good:      '#2E7D63',

  accentA:   '#5A6CFF',
  accentB:   '#7A5CF0',
  accentC:   '#38C3B8',

  ringTrack: 'rgba(90,110,160,0.18)',
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSameCalendarDay(ts: number): boolean {
  const a = new Date(ts);
  const b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatFullDateTime(ts: number): string {
  const datePart = new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const timePart = new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatMuscleGroupsLabel(groups: Set<MuscleGroup>): string {
  if (groups.size === 0) return 'Full Body';
  const names = Array.from(groups).map(g => g.charAt(0).toUpperCase() + g.slice(1));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function generateSummary(reps: number, goodReps: number): string {
  const pct = reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
  if (reps === 0)  return 'No reps were detected this session. Try positioning the phone so your full body is visible from the side.';
  if (pct === 100) return `Clean session — all ${reps} reps hit good form. That kind of consistency is what builds real strength over time.`;
  if (pct >= 80)   return `Solid work. ${goodReps} of your ${reps} reps (${pct}%) hit good form.`;
  if (pct >= 50)   return `You hit good form on ${goodReps} of ${reps} reps (${pct}%). Slow down the rep and focus on full range of motion.`;
  return `${reps} reps completed with ${goodReps} in good form (${pct}%). Focus on control over speed next session.`;
}

// ─── GlassSurface — light frosted-glass panel used everywhere on this screen ──
// Every glass element (icon chip, hero card, stat tile, done chip) renders
// through this so the treatment can't drift out of sync. Shadow lives on the
// OUTER (unclipped) wrapper — shadow + overflow:hidden on the same view
// silently clips the shadow away on iOS, so the rounded-corner clip happens
// on an inner view instead.
function GlassSurface({
  style, radius, children, shadow = true, fillOpacity = 'high',
}: {
  style?:  any;
  radius:  number;
  children: React.ReactNode;
  shadow?:  boolean;
  fillOpacity?: 'high' | 'low';
}) {
  return (
    <View style={shadow ? [gs.shadowWrap, { borderRadius: radius, shadowColor: C.shadow }] : undefined}>
      <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
        <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={[fillOpacity === 'high' ? C.glassFillHi : C.glassFillLo, C.glassFillLo]}
          start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[C.glassHighlight, 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: C.glassEdge }]}
          pointerEvents="none"
        />
        {children}
      </View>
    </View>
  );
}

const gs = StyleSheet.create({
  shadowWrap: {
    shadowOffset: { width: 0, height: 14 }, shadowOpacity: 1, shadowRadius: 26, elevation: 8,
  },
});

// ─── Background — gradient + soft radial blobs ────────────────────────────────
// The mockup uses CSS radial-gradient + blur for drifting color blobs; RN has
// no radial-gradient primitive, so this uses react-native-svg's RadialGradient
// (already a project dependency) over the same 4-stop linear base gradient.
function BgGradient() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[C.bgTop, C.bgMid1, C.bgMid2, C.bgBottom]}
        locations={[0, 0.38, 0.7, 1]}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="blobIndigo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={C.blobIndigo} stopOpacity={1} />
            <Stop offset="100%" stopColor={C.blobIndigo} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="blobTeal" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={C.blobTeal} stopOpacity={1} />
            <Stop offset="100%" stopColor={C.blobTeal} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="blobCoral" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={C.blobCoral} stopOpacity={1} />
            <Stop offset="100%" stopColor={C.blobCoral} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={SCREEN_W * 0.05} cy={SCREEN_H * 0.02} r={SCREEN_W * 0.62} fill="url(#blobIndigo)" />
        <Circle cx={SCREEN_W * 1.05} cy={SCREEN_H * 0.32} r={SCREEN_W * 0.56} fill="url(#blobTeal)" />
        <Circle cx={SCREEN_W * -0.05} cy={SCREEN_H * 0.92} r={SCREEN_W * 0.58} fill="url(#blobCoral)" />
      </Svg>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RecapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shotRef = useRef<ViewShot>(null);
  const pagerRef = useRef<ScrollView>(null);

  const {
    reps: repsStr, goodReps: goodRepsStr, videoUri: videoUriParam, events,
    exercise, ts: tsParam, mode, durationSec: durationSecParam,
  } = useLocalSearchParams<{
    reps?: string; goodReps?: string; videoUri?: string; events?: string;
    exercise?: string; ts?: string; mode?: string; durationSec?: string;
  }>();

  const isWorkoutMode = mode === 'workout';
  const isHistoryMode = !isWorkoutMode && tsParam != null;

  const finishWorkout       = useWorkoutSessionStore(s => s.finishWorkout);
  const abortWorkout        = useWorkoutSessionStore(s => s.abortWorkout);
  const markWorkoutComplete = usePlanStore(s => s.markWorkoutComplete);

  const [data, setData]                   = useState<RecapData | null>(null);
  const [loadFailed, setLoadFailed]       = useState(false);
  const [overallScores, setOverallScores] = useState<MuscleScores>({});
  const [sharing, setSharing]             = useState(false);
  const [activePage, setActivePage]       = useState(0);
  const initialized = useRef(false);

  // Entrance animation — visual polish only, no bearing on data/logic.
  const heroOpac  = useRef(new Animated.Value(0)).current;
  const heroY     = useRef(new Animated.Value(14)).current;

  const repEventsParam = useMemo<RepEventData[]>(() => {
    try { return JSON.parse(events ?? '[]'); }
    catch { return []; }
  }, [events]);

  // ── Load recap data (once) — three modes: workout / history / solo-live ────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      if (isWorkoutMode) {
        const existing = useWorkoutSessionStore.getState().getSummary();
        const summary = existing ?? finishWorkout();
        if (!summary) { setLoadFailed(true); return; }

        const entries: SessionEntry[] = summary.results
          .filter(r => r.completed)
          .map(r => ({
            ts: summary.finishedAt, exerciseId: r.exerciseId, displayName: r.displayName,
            reps: r.reps, goodReps: r.goodReps, pct: r.formScore,
          }));
        if (entries.length > 0) await appendSessions(entries);

        setData({
          ts: summary.finishedAt, entries,
          totalReps: summary.totalReps, totalGoodReps: summary.totalGoodReps,
          pct: summary.overallFormScore, isHistory: false, workoutSummary: summary,
          durationSec: summary.durationSeconds,
        });
      } else if (isHistoryMode) {
        const all    = await getAllSessions();
        const groups = groupIntoWorkouts(all);
        const group  = groups.find(g => g.ts === Number(tsParam));
        if (!group) { setLoadFailed(true); return; }
        setData({
          ts: group.ts, entries: group.entries,
          totalReps: group.totalReps, totalGoodReps: group.totalGoodReps,
          pct: group.pct, isHistory: true,
        });
      } else {
        const reps     = parseInt(repsStr ?? '0', 10);
        const goodReps = parseInt(goodRepsStr ?? '0', 10);
        const pct      = reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
        const soloTs   = Date.now();
        const exId     = exercise ?? 'unknown';
        const entry: SessionEntry = {
          ts: soloTs, exerciseId: exId,
          displayName: EXERCISE_DEFINITIONS[exId]?.displayName ?? exId,
          reps, goodReps, pct,
        };
        if (reps > 0) await appendSessions([entry]);
        const parsedDuration = durationSecParam != null ? parseInt(durationSecParam, 10) : undefined;
        setData({
          ts: soloTs, entries: reps > 0 ? [entry] : [],
          totalReps: reps, totalGoodReps: goodReps, pct,
          videoUri: typeof videoUriParam === 'string' && videoUriParam.length > 0 ? videoUriParam : undefined,
          repEvents: repEventsParam, isHistory: false,
          durationSec: parsedDuration != null && !isNaN(parsedDuration) ? parsedDuration : undefined,
        });
      }

      const allAfter = await getAllSessions();
      setOverallScores(computeOverallMuscleScores(allAfter));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const highlightGroups = useMemo(
    () => (data ? muscleGroupsWorked(data.entries) : new Set<MuscleGroup>()),
    [data],
  );
  const highlightLabel = data && isSameCalendarDay(data.ts) ? 'Today' : data ? formatMuscleGroupsLabel(highlightGroups) : 'Today';

  // Entrance animation once real data has resolved (visual only).
  useEffect(() => {
    if (!data) return;
    Animated.parallel([
      Animated.timing(heroOpac, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(heroY,    { toValue: 0, tension: 120, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [data, heroOpac, heroY]);

  // ── Video replay animation (solo mode only) ─────────────────────────────────
  const hasVideo = !!data?.videoUri;
  const player = useVideoPlayer(data?.videoUri || null, p => { p.loop = false; });
  const [liveAnim, setLiveAnim] = useState<{ key: number; good: boolean; reason: string } | null>(null);
  const animKeyRef   = useRef(0);
  const triggeredRef = useRef(new Set<number>());
  const prevTimeRef  = useRef(0);

  useEffect(() => {
    if (!hasVideo || !data?.repEvents || data.repEvents.length === 0) return;
    const evs = data.repEvents;
    const id = setInterval(() => {
      const t = player.currentTime;
      if (t < prevTimeRef.current - 0.8) {
        evs.forEach((_, i) => { if (evs[i].timeSec > t) triggeredRef.current.delete(i); });
      }
      prevTimeRef.current = t;
      evs.forEach((ev, i) => {
        if (!triggeredRef.current.has(i) && t >= ev.timeSec) {
          triggeredRef.current.add(i);
          setLiveAnim({ key: ++animKeyRef.current, good: ev.good, reason: ev.reason });
        }
      });
    }, 100);
    return () => clearInterval(id);
  }, [hasVideo, data, player]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await shotRef.current?.capture?.();
      if (uri) {
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your FormPal recap' });
        }
      }
    } catch {
      // best-effort — no native share sheet on some platforms/simulators
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  const handleDone = useCallback(async () => {
    if (data?.isHistory) { router.back(); return; }
    if (isWorkoutMode) {
      if (data?.workoutSummary?.workoutId) {
        try { await markWorkoutComplete(data.workoutSummary.workoutId); } catch {}
      }
      abortWorkout();
      router.replace('/(tabs)/train' as any);
    } else {
      router.replace('/(tabs)/' as any);
    }
  }, [data, isWorkoutMode, router, markWorkoutComplete, abortWorkout]);

  const scrollToPage = useCallback((i: number) => {
    pagerRef.current?.scrollTo({ x: i * SCREEN_W, animated: true });
    setActivePage(i);
  }, []);

  const handlePagerScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActivePage(page);
  }, []);

  // ── Failure / loading states ────────────────────────────────────────────────

  if (loadFailed) {
    return (
      <View style={s.root}>
        <StatusBar style="dark" />
        <BgGradient />
        <View style={[s.centerFill, { paddingTop: insets.top }]}>
          <Text style={s.failedTxt}>No recap data found.</Text>
          <GlassSurface radius={22} style={[s.doneChip, { marginTop: 20 }]}>
            <Pressable onPress={() => router.back()} style={s.doneChipInner}>
              <Text style={s.doneChipTxt}>Back</Text>
            </Pressable>
          </GlassSurface>
        </View>
      </View>
    );
  }

  if (!data) return <View style={s.root}><StatusBar style="dark" /><BgGradient /></View>;

  const exCount    = data.entries.length;
  const doneLabel  = data.isHistory ? 'Back' : 'Done';
  const breakdown  = data.workoutSummary?.results;
  const headingTitle = data.isHistory
    ? 'Session Recap'
    : isWorkoutMode ? 'Workout Complete' : 'Session Complete';

  const hasDetails = (data.totalReps > 0) || (breakdown && breakdown.length > 0) || hasVideo;

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <BgGradient />

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handlePagerScroll}
        scrollEnabled={hasDetails}
      >
        {/* ═══ PAGE 1 — Recap (matches the mockup 1:1: header, hero muscle-
            heatmap panel, 4-stat grid, Share/Done actions) ═══ */}
        <ScrollView
          style={{ width: SCREEN_W }}
          contentContainerStyle={[s.page, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: heroOpac, transform: [{ translateY: heroY }] }}>
            <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
              <View style={{ backgroundColor: 'transparent' }}>
                {/* Header */}
                <View style={s.header}>
                  <GlassSurface radius={27} style={s.headerIcon} shadow>
                    <SymbolView name="checkmark" size={25} tintColor={C.good} type="monochrome" style={{ width: 25, height: 25 }} />
                  </GlassSurface>
                  <Text style={s.headerTitle}>{headingTitle}</Text>
                  <Text style={s.headerSub}>{formatFullDateTime(data.ts)}</Text>
                </View>

                {/* Hero — muscle heatmap panel. Sized to its own content
                    (no flex/minHeight) — this card used to be `flex:1` inside
                    a ScrollView, which has no reliable meaning there (a
                    ScrollView's content isn't a bounded flex parent the way a
                    plain View is), so on-device the card could end up shorter
                    than what MuscleHeatmap actually needs at this scale,
                    causing the front/back diagrams to run into each other and
                    the stat grid below to read as cramped. Letting the card
                    size to its content (padding + label + title + the
                    heatmap's own intrinsic size) removes the guesswork. */}
                <GlassSurface radius={34} style={s.heroCard}>
                  <Text style={s.heroLabel}>MUSCLE HEATMAP</Text>
                  <Text style={s.heroTitle}>{highlightLabel}</Text>
                  <View style={s.heroBody}>
                    <RecapSectionBoundary
                      fallback={
                        <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                          <Text style={s.cardText}>Muscle map couldn't load this time — your reps are still saved.</Text>
                        </View>
                      }
                    >
                      <MuscleHeatmap
                        overallScores={overallScores}
                        highlightGroups={highlightGroups}
                        highlightLabel={highlightLabel}
                        scale={0.6}
                      />
                    </RecapSectionBoundary>
                  </View>
                </GlassSurface>

                {/* Stat grid */}
                <View style={s.statGrid}>
                  <GlassSurface radius={20} style={s.statTile}>
                    <Text style={s.statVal}>{data.totalReps}</Text>
                    <Text style={s.statLbl}>Reps</Text>
                  </GlassSurface>
                  <GlassSurface radius={20} style={s.statTile}>
                    <Text style={s.statVal}>{exCount}</Text>
                    <Text style={s.statLbl}>Moves</Text>
                  </GlassSurface>
                  <GlassSurface radius={20} style={s.statTile}>
                    <Text style={[s.statVal, { color: C.good }]}>
                      {data.totalReps > 0 ? `${data.pct}%` : '—'}
                    </Text>
                    <Text style={s.statLbl}>Form</Text>
                  </GlassSurface>
                  {data.durationSec != null && (
                    <GlassSurface radius={20} style={s.statTile}>
                      <Text style={s.statVal}>{formatDuration(data.durationSec)}</Text>
                      <Text style={s.statLbl}>Time</Text>
                    </GlassSurface>
                  )}
                </View>
              </View>
            </ViewShot>

            {/* Actions — outside the ViewShot capture, matches the original
                convention of not including interactive buttons in the shared
                image. */}
            <View style={s.actions}>
              <Pressable
                onPress={handleShare}
                disabled={sharing}
                style={({ pressed }) => [s.shareBtnShadow, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <LinearGradient
                  colors={[C.accentA, C.accentB, C.accentC]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.shareBtn}
                >
                  <SymbolView name="square.and.arrow.up" size={18} tintColor="#fff" type="monochrome" style={{ width: 18, height: 18 }} />
                  <Text style={s.shareBtnTxt}>Share Recap</Text>
                </LinearGradient>
              </Pressable>

              <GlassSurface radius={22} style={s.doneChip} shadow={false}>
                <Pressable onPress={handleDone} style={({ pressed }) => [s.doneChipInner, pressed && { opacity: 0.7 }]}>
                  <Text style={s.doneChipTxt}>{doneLabel}</Text>
                </Pressable>
              </GlassSurface>
            </View>
          </Animated.View>
        </ScrollView>

        {/* ═══ PAGE 2 — Details (real breakdown / replay / summary text —
            nothing fabricated; only rendered when there's real data for it) ═══ */}
        {hasDetails && (
          <ScrollView
            style={{ width: SCREEN_W }}
            contentContainerStyle={[s.page, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.header2}>
              <Pressable onPress={() => scrollToPage(0)} style={s.backChipWrap} hitSlop={8}>
                <GlassSurface radius={18} style={s.backChip} shadow>
                  <SymbolView name="chevron.left" size={16} tintColor={C.text} type="monochrome" style={{ width: 16, height: 16 }} />
                </GlassSurface>
              </Pressable>
              <View style={{ gap: 2 }}>
                <Text style={s.header2Title}>Session Details</Text>
                <Text style={s.header2Sub}>
                  {exCount} {exCount === 1 ? 'exercise' : 'exercises'}
                  {data.durationSec != null ? ` · ${formatDuration(data.durationSec)}` : ''}
                </Text>
              </View>
            </View>

            {data.totalReps > 0 && (
              <GlassSurface radius={30} style={s.detailCard}>
                <Text style={s.detailCardLabel}>OVERVIEW</Text>
                <Text style={s.cardText}>{generateSummary(data.totalReps, data.totalGoodReps)}</Text>
              </GlassSurface>
            )}

            {breakdown && breakdown.length > 0 && (
              <GlassSurface radius={30} style={s.detailCard}>
                <Text style={s.detailCardLabel}>BREAKDOWN</Text>
                {breakdown.map((r, i) => (
                  <React.Fragment key={r.exerciseId + i}>
                    <View style={s.exRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.exName}>{r.displayName}</Text>
                        {r.completed && <Text style={s.exMeta}>{r.reps} reps</Text>}
                        {r.skipped   && <Text style={[s.exMeta, { color: C.muted }]}>Skipped</Text>}
                      </View>
                      {r.completed && r.reps > 0 && <Text style={s.exScore}>{r.formScore}%</Text>}
                    </View>
                    {i < breakdown.length - 1 && <View style={s.divider} />}
                  </React.Fragment>
                ))}
              </GlassSurface>
            )}

            {hasVideo && (
              <GlassSurface radius={30} style={[s.detailCard, { padding: 10 }]}>
                <Text style={[s.detailCardLabel, { paddingHorizontal: 8, paddingTop: 4 }]}>REPLAY</Text>
                <View style={s.videoWrap}>
                  <VideoView
                    player={player}
                    style={StyleSheet.absoluteFill}
                    allowsFullscreen
                    nativeControls
                    contentFit="contain"
                  />
                  {liveAnim && (
                    <RepFeedback
                      key={liveAnim.key}
                      good={liveAnim.good}
                      reason={liveAnim.reason}
                      seq={liveAnim.key}
                      onComplete={() => setLiveAnim(null)}
                    />
                  )}
                </View>
              </GlassSurface>
            )}
          </ScrollView>
        )}
      </ScrollView>

      {/* Fixed page dots — always visible, jump between Recap/Details. */}
      {hasDetails && (
        <View style={[s.dotsRow, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
          <Pressable onPress={() => scrollToPage(0)} hitSlop={10}>
            <View style={[s.dot, activePage === 0 && s.dotActive]} />
          </Pressable>
          <Pressable onPress={() => scrollToPage(1)} hitSlop={10}>
            <View style={[s.dot, activePage === 1 && s.dotActive]} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bgBottom },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  failedTxt:  { color: C.text, fontSize: 15 },
  page:       { paddingHorizontal: 20, flexGrow: 1 },

  header: {
    alignItems: 'center', gap: 10,
    paddingTop: 6, paddingBottom: 16,
  },
  headerIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 26, fontWeight: '600', letterSpacing: -0.5, color: C.text },
  headerSub:   { fontSize: 13, fontWeight: '500', letterSpacing: 0.2, color: C.muted },

  heroCard: {
    // Intrinsic sizing — no flex/minHeight. See the comment at this card's
    // JSX for why the previous flex:1-in-a-ScrollView approach was the root
    // cause of the front/back diagrams crowding each other.
    padding: 20, alignItems: 'center',
  },
  heroLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: C.mutedDim, alignSelf: 'flex-start' },
  heroTitle: { fontSize: 19, fontWeight: '600', letterSpacing: -0.3, color: C.text, marginTop: 2, marginBottom: 18, alignSelf: 'flex-start' },
  heroBody:  { alignItems: 'center', width: '100%' },

  statGrid: { flexDirection: 'row', gap: 8, marginTop: 22 },
  statTile: {
    flex: 1, alignItems: 'center', gap: 3,
    paddingVertical: 14, paddingHorizontal: 4,
  },
  statVal: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3, color: C.text },
  statLbl: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: C.mutedDim },

  actions: { gap: 10, marginTop: 22 },
  shareBtnShadow: {
    borderRadius: 24,
    shadowColor: C.accentA, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 20,
  },
  shareBtn: {
    height: 56, borderRadius: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  shareBtnTxt: { fontSize: 16.5, fontWeight: '600', letterSpacing: -0.2, color: '#fff' },
  doneChip:      { height: 48 },
  doneChipInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doneChipTxt:   { fontSize: 15.5, fontWeight: '500', color: C.mutedDim },

  cardText: { fontSize: 15, fontWeight: '500', color: C.text, lineHeight: 22, letterSpacing: -0.1 },

  header2: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 18 },
  backChipWrap: {},
  backChip:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  header2Title: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3, color: C.text },
  header2Sub:   { fontSize: 12.5, fontWeight: '500', color: C.muted },

  detailCard: { padding: 18, marginBottom: 14 },
  detailCardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: C.mutedDim, marginBottom: 10 },

  exRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  exName:  { fontSize: 14.5, fontWeight: '600', color: C.text },
  exMeta:  { fontSize: 12, color: C.muted, marginTop: 2 },
  exScore: { fontSize: 13, fontWeight: '700', color: C.good },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(90,110,160,0.25)' },

  videoWrap: {
    height: 300, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000',
  },

  dotsRow: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  dot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(25,35,65,0.24)' },
  dotActive: { width: 22, backgroundColor: 'rgba(25,35,65,0.62)' },
});
