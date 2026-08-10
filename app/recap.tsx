import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Animated, Dimensions, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SymbolView } from 'expo-symbols';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
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
  ts:             number;
  entries:        SessionEntry[];
  totalReps:      number;
  totalGoodReps:  number;
  pct:            number;
  videoUri?:      string;
  repEvents?:     RepEventData[];
  isHistory:      boolean;
  workoutSummary?: WorkoutSummary;
}

// ─── Palette ──────────────────────────────────────────────────────────────────
// REDESIGN, take 3 — root cause of "purple failed blur" (confirmed by
// re-reading the screenshot, not guessed): the background gradient
// (#0B0F2A→#181638→#241531) was dark navy through dark violet — three colors
// close in both hue AND value. Blur distorts whatever color/contrast is
// BEHIND it; a background with barely any internal contrast gives the blur
// almost nothing to visibly smear, so a glass panel over it just reads as
// "slightly different flat gray-purple," not "frosted." The glass surfaces
// were also relying on blur alone to read as glass, with only an 8%-opacity
// fill and a 16%-opacity border — both too subtle to sell "this is a
// distinct floating pane" on their own if the blur itself isn't visually
// obvious.
//
// Fix, three parts:
//  1. A genuinely high-contrast, saturated background (electric indigo →
//     violet → hot pink/coral) — real color variation for blur to distort,
//     so the frosted effect is visually obvious even at moderate intensity.
//  2. Every glass surface now layers THREE things, not one: BlurView at
//     near-max intensity, a low-opacity white fill UNDER it (glassFill,
//     bumped 0.08→0.14), and a soft white-to-transparent highlight gradient
//     OVER it at the top edge (glassHighlight) — the classic "light catching
//     the top of a glass/acrylic pane" cue real UI glass always has, which
//     sells the effect even independent of exactly how strong the live blur
//     turns out to be on-device.
//  3. Real drop shadows under the glass panels via a shadow-wrapper pattern
//     (shadowColor on an outer View, overflow:hidden clipping on an inner
//     one) — a floating glass pane needs to visibly float; nothing here had
//     a shadow before.
const C = {
  bgTop:          '#160B3D', // deep indigo
  bgMid:          '#4A1E6E', // vivid violet
  bgBottom:       '#D94F7A', // warm coral-pink — real color distance from bgTop
  glassFill:      'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.35)',
  glassEdge:      'rgba(255,255,255,0.30)',
  card:           '#1C1140', // opaque dark card — used by heroShareCard so the ViewShot capture isn't transparent
  text:           '#FFFFFF',
  muted:          'rgba(255,255,255,0.62)',
  accent:         '#8AA2FF',
  accent2:        '#E297FF',
  good:           '#3DE08C',
  ringTrack:      'rgba(255,255,255,0.16)',
  shadow:         'rgba(20,6,40,0.55)',
};

const { width: SCREEN_W } = Dimensions.get('window');
const PAGE_GAP = 14;
const PAGE_W   = SCREEN_W - 40; // matches horizontal content padding of 20 on each side

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatShort(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isSameCalendarDay(ts: number): boolean {
  const a = new Date(ts);
  const b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function generateSummary(reps: number, goodReps: number): string {
  const pct = reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
  if (reps === 0)  return 'No reps were detected this session. Try positioning the phone so your full body is visible from the side.';
  if (pct === 100) return `Clean session — all ${reps} reps hit good form. That kind of consistency is what builds real strength over time.`;
  if (pct >= 80)   return `Solid work. ${goodReps} of your ${reps} reps (${pct}%) hit good form.`;
  if (pct >= 50)   return `You hit good form on ${goodReps} of ${reps} reps (${pct}%). Slow down the rep and focus on full range of motion.`;
  return `${reps} reps completed with ${goodReps} in good form (${pct}%). Focus on control over speed next session.`;
}

// ─── Glass surface — the one place blur/fill/highlight/border/shadow compose ──
// Every "glass" element in this screen (icon chip, page cards, done chip)
// renders through this so the treatment can never drift out of sync between
// them again. Shadow lives on the OUTER (unclipped) wrapper — shadow +
// overflow:hidden on the SAME view silently clips the shadow away on iOS,
// so the rounded-corner clip has to happen on an inner view instead.
function GlassSurface({
  style, radius, children, shadow = true,
}: {
  style?:  any;
  radius: number;
  children: React.ReactNode;
  shadow?: boolean;
}) {
  return (
    <View style={shadow ? [gs.shadowWrap, { borderRadius: radius, shadowColor: C.shadow }] : undefined}>
      <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
        <BlurView intensity={95} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: C.glassFill }]} pointerEvents="none" />
        <LinearGradient
          colors={[C.glassHighlight, 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.6 }}
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
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 1, shadowRadius: 22, elevation: 8,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RecapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shotRef = useRef<ViewShot>(null);

  const {
    reps: repsStr, goodReps: goodRepsStr, videoUri: videoUriParam, events,
    exercise, ts: tsParam, mode,
  } = useLocalSearchParams<{
    reps?: string; goodReps?: string; videoUri?: string; events?: string;
    exercise?: string; ts?: string; mode?: string;
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
  const heroScale = useRef(new Animated.Value(0.94)).current;
  const ringProgress = useRef(new Animated.Value(0)).current;

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
        setData({
          ts: soloTs, entries: reps > 0 ? [entry] : [],
          totalReps: reps, totalGoodReps: goodReps, pct,
          videoUri: typeof videoUriParam === 'string' && videoUriParam.length > 0 ? videoUriParam : undefined,
          repEvents: repEventsParam, isHistory: false,
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
  const highlightLabel = data && isSameCalendarDay(data.ts) ? 'Today' : data ? formatShort(data.ts) : 'Today';

  // Entrance animation once real data has resolved (visual only) — also
  // sweeps the score ring from 0 to its real value instead of popping in flat.
  useEffect(() => {
    if (!data) return;
    Animated.parallel([
      Animated.timing(heroOpac,  { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(heroScale, { toValue: 1, tension: 120, friction: 9, useNativeDriver: true }),
      Animated.timing(ringProgress, { toValue: data.pct, duration: 900, useNativeDriver: false, delay: 120 }),
    ]).start();
  }, [data, heroOpac, heroScale, ringProgress]);

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

  const handlePageScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / (PAGE_W + PAGE_GAP));
    setActivePage(page);
  }, []);

  // ── Failure / loading states ────────────────────────────────────────────────

  if (loadFailed) {
    return (
      <View style={s.root}>
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

  if (!data) return <View style={s.root}><BgGradient /></View>;

  const exCount    = data.entries.length;
  const doneLabel  = data.isHistory ? 'Back' : 'Done';
  const breakdown  = data.workoutSummary?.results;
  const headingTitle = data.isHistory
    ? 'Session Recap'
    : isWorkoutMode ? 'Workout Complete' : 'Session Complete';

  // Build the horizontal page deck — muscle map is always present, the rest
  // are conditional on mode, same data-availability rules as before.
  const pages: { key: string; label: string; render: () => React.ReactNode }[] = [];
  pages.push({
    key: 'map', label: 'Muscle Map',
    render: () => (
      <RecapSectionBoundary
        fallback={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <Text style={s.cardText}>Muscle map couldn't load this time — your reps are still saved.</Text>
          </View>
        }
      >
        <MuscleHeatmap
          overallScores={overallScores}
          highlightGroups={highlightGroups}
          highlightLabel={highlightLabel}
          scale={0.55}
        />
      </RecapSectionBoundary>
    ),
  });
  if (data.totalReps > 0) {
    pages.push({
      key: 'overview', label: 'Overview',
      render: () => (
        <View style={{ justifyContent: 'center', flex: 1 }}>
          <Text style={s.cardText}>{generateSummary(data.totalReps, data.totalGoodReps)}</Text>
        </View>
      ),
    });
  }
  if (breakdown && breakdown.length > 0) {
    pages.push({
      key: 'breakdown', label: 'Breakdown',
      render: () => (
        <ScrollView showsVerticalScrollIndicator={false}>
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
        </ScrollView>
      ),
    });
  }
  if (hasVideo) {
    pages.push({
      key: 'replay', label: 'Replay',
      render: () => (
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
      ),
    });
  }

  const ringSize = 168;
  const ringStroke = 14;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [ringCirc, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={s.root}>
      <BgGradient />

      {/* Floating top bar — a small glass pill, not a full header block.
          Close/back sits where a modal dismiss control naturally lives. */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <GlassSurface radius={17} style={s.iconChip}>
          <Pressable onPress={handleDone} style={({ pressed }) => [s.iconChipInner, pressed && { opacity: 0.7 }]}>
            <SymbolView
              name={data.isHistory ? 'chevron.left' : 'xmark'}
              size={14} tintColor={C.text} type="monochrome" style={{ width: 14, height: 14 }}
            />
          </Pressable>
        </GlassSurface>
        <View style={s.topBarTitleWrap}>
          <Text style={s.topBarTitle} numberOfLines={1}>{headingTitle}</Text>
          <Text style={s.topBarSub}>{formatFullDate(data.ts)}</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 76, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO — a dominant ring, not a boxed rectangle. This is what gets
            captured for the share image: ring + headline numbers + a
            watermark, deliberately separate from the swipeable deck below
            so the shared image stays clean and self-explanatory. Deliberately
            opaque (not glass) — a controlled, predictable background matters
            more than glass consistency for the one element that leaves the
            app as a shared image. */}
        <Animated.View style={{ opacity: heroOpac, transform: [{ scale: heroScale }], alignItems: 'center' }}>
        <RecapSectionBoundary
          fallback={
            <View style={[s.heroShareCard, { alignItems: 'center', justifyContent: 'center', minHeight: 160 }]}>
              <Text style={s.cardText}>
                {data.totalReps > 0 ? `${data.pct}% good form` : 'Session complete'}
              </Text>
            </View>
          }
        >
          <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
            <View style={s.heroShareCard}>
              <View style={{ width: ringSize, height: ringSize }}>
                <Svg width={ringSize} height={ringSize}>
                  <Circle
                    cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
                    stroke={C.ringTrack} strokeWidth={ringStroke} fill="none"
                  />
                  <AnimatedCircle
                    cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
                    stroke={C.good} strokeWidth={ringStroke} fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${ringCirc}, ${ringCirc}`}
                    strokeDashoffset={ringOffset}
                    rotation={-90}
                    origin={`${ringSize / 2}, ${ringSize / 2}`}
                  />
                </Svg>
                <View style={s.ringCenter}>
                  <Text style={s.ringPct}>{data.totalReps > 0 ? `${data.pct}%` : '—'}</Text>
                  <Text style={s.ringPctLbl}>good form</Text>
                </View>
              </View>
              <View style={s.heroStatsRow}>
                <View style={s.heroStat}>
                  <Text style={s.heroStatVal}>{data.totalReps}</Text>
                  <Text style={s.heroStatLbl}>reps</Text>
                </View>
                <View style={s.heroStatDivider} />
                <View style={s.heroStat}>
                  <Text style={s.heroStatVal}>{exCount}</Text>
                  <Text style={s.heroStatLbl}>{exCount === 1 ? 'exercise' : 'exercises'}</Text>
                </View>
              </View>
              <View style={s.watermarkRow}>
                <SymbolView name="figure.strengthtraining.traditional" size={10} tintColor="rgba(255,255,255,0.4)"
                  type="monochrome" style={{ width: 10, height: 10 }} />
                <Text style={s.watermarkTxt}>FormPal</Text>
              </View>
            </View>
          </ViewShot>
        </RecapSectionBoundary>
        </Animated.View>

        {/* Swipeable glass deck — Apple Fitness/Activity summary pattern:
            each page is its own floating glass pane, paged horizontally,
            with a dot indicator, instead of every section being stacked as
            an equal-weight vertical box. */}
        <View style={s.deckWrap}>
          <ScrollView
            horizontal
            pagingEnabled
            snapToInterval={PAGE_W + PAGE_GAP}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handlePageScroll}
            contentContainerStyle={{ paddingRight: PAGE_GAP }}
          >
            {pages.map(p => (
              <GlassSurface
                key={p.key}
                radius={26}
                style={[s.pageCard, { width: PAGE_W, marginRight: PAGE_GAP }]}
              >
                <Text style={s.pageLabel}>{p.label.toUpperCase()}</Text>
                <View style={{ flex: 1 }}>{p.render()}</View>
              </GlassSurface>
            ))}
          </ScrollView>
          {pages.length > 1 && (
            <View style={s.dotsRow}>
              {pages.map((p, i) => (
                <View key={p.key} style={[s.dot, i === activePage && s.dotActive]} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating actions — a circular gradient FAB for Share (the one
          prominent action), a quiet glass chip for Done/Back beside it.
          Both float over the content instead of a full-width bar pinned
          across the whole screen width. */}
      <View style={[s.fabRow, { paddingBottom: insets.bottom + 18 }]} pointerEvents="box-none">
        <GlassSurface radius={22} style={s.doneChip}>
          <Pressable onPress={handleDone} style={({ pressed }) => [s.doneChipInner, pressed && { opacity: 0.7 }]}>
            <Text style={s.doneChipTxt}>{doneLabel}</Text>
          </Pressable>
        </GlassSurface>
        <Pressable
          onPress={handleShare}
          disabled={sharing}
          style={({ pressed }) => [s.fabShadow, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <LinearGradient
            colors={[C.accent, C.accent2]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.fab}
          >
            <SymbolView name="square.and.arrow.up" size={20} tintColor="#fff" type="monochrome" style={{ width: 20, height: 20 }} />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Background gradient ──────────────────────────────────────────────────────
function BgGradient() {
  return (
    <LinearGradient
      colors={[C.bgTop, C.bgMid, C.bgBottom]}
      start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bgBottom },
  centerFill:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  failedTxt: { color: C.text, fontSize: 15 },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 20, gap: 22 },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 16,
  },
  iconChip:      { width: 34, height: 34 },
  iconChipInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBarTitleWrap: { flex: 1, alignItems: 'center' },
  topBarTitle: { fontSize: 15, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  topBarSub:   { fontSize: 11.5, fontWeight: '600', color: C.muted, marginTop: 1 },

  heroShareCard: {
    alignItems: 'center', gap: 14,
    paddingVertical: 26, paddingHorizontal: 30,
    backgroundColor: C.card, borderRadius: 28,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  ringPct:    { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: -0.8 },
  ringPctLbl: { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 2 },

  heroStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  heroStat:     { alignItems: 'center' },
  heroStatVal:  { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  heroStatLbl:  { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 1 },
  heroStatDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: C.glassEdge },

  watermarkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  watermarkTxt: { fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.3 },

  deckWrap: { gap: 12 },
  // Muscle Map page's content (legend + front/back diagrams at scale 0.55)
  // needs ~296px on top of this card's own padding/label overhead — 360
  // leaves real margin, verified by hand-computing the layout.
  pageCard: {
    height: 360, padding: 18, gap: 10,
  },
  pageLabel: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 1.4 },
  cardText:  { fontSize: 15, fontWeight: '500', color: C.text, lineHeight: 22, letterSpacing: -0.1 },

  exRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  exName:  { fontSize: 14.5, fontWeight: '700', color: C.text },
  exMeta:  { fontSize: 12, color: C.muted, marginTop: 2 },
  exScore: { fontSize: 13, fontWeight: '800', color: C.good },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.glassEdge },

  videoWrap: {
    flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000',
  },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.glassEdge },
  dotActive: { backgroundColor: C.accent, width: 16 },

  fabRow: {
    position: 'absolute', left: 20, right: 20, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  doneChip:      { height: 44, paddingHorizontal: 20 },
  doneChipInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doneChipTxt:   { fontSize: 14.5, fontWeight: '700', color: C.text },
  fabShadow: {
    borderRadius: 32,
    shadowColor: C.accent, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 18,
  },
  fab: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
  },
});
