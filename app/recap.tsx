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
import { SkiaMuscleHeatmapSafe } from '../components/SkiaMuscleHeatmapSafe';
import {
  getAllSessions, appendSessions, groupIntoWorkouts, computeOverallMuscleScores,
  muscleGroupsWorked, type SessionEntry, type MuscleScores, type RepEventData,
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

interface RecapData {
  ts:              number;
  entries:         SessionEntry[];
  totalReps:       number;
  totalGoodReps:   number;
  pct:             number;
  videoUri?:       string;
  repEvents?:      RepEventData[];
  // Per-exercise version of repEvents, keyed by exerciseId — solo mode has
  // exactly one entry (mirrors repEvents above); workout mode has one per
  // completed exercise (see store/workoutSessionStore.ts's ExerciseResult).
  // Drives the "Rep breakdown" section below the stat grid. History mode
  // entries never have this (past sessions didn't capture it) — the section
  // is simply omitted for those, not fabricated.
  repEventsByExercise?: Record<string, RepEventData[]>;
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
  bad:       '#FF3B30', // matches constants/theme.ts's Col.low — the app-wide "bad" red

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
  // ROOT CAUSE of the stat row reading as cramped/left-aligned instead of
  // spread across the full width: `style` (which carries statTile's
  // `flex: 1`) was only ever applied to this INNER View. `flex` only
  // affects how a component sizes itself within ITS OWN parent's flex
  // layout — the OUTER wrapper below is the actual child participating in
  // statGrid's `flexDirection: 'row'`, and it had no flex/width styling at
  // all, so it shrank to fit its content instead of claiming an even 1/3–1/4
  // share of the row, leaving every tile bunched at the left with a big gap
  // on the right. Pulling just `style?.flex` onto the outer wrapper (not the
  // whole style — padding/alignItems still belong on the inner view, where
  // the actual children render) fixes this without changing anything for
  // every other GlassSurface caller, none of which currently pass `flex`.
  const outerFlex = style?.flex != null ? { flex: style.flex } : undefined;
  return (
    <View style={shadow ? [gs.shadowWrap, { borderRadius: radius, shadowColor: C.shadow }, outerFlex] : outerFlex}>
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

// ─── Rep timeline — scrubber strip with a colored marker per rep ──────────────
// Sits below the video, NOT a replacement for the native scrub bar
// (nativeControls stays — play/pause/fullscreen/native seek all keep
// working). This is a supplementary strip whose whole reason to exist is the
// at-a-glance green/red overview across the full session, which a native
// player control has no concept of. Tapping anywhere seeks the video;
// tapping a marker seeks to that rep exactly (markers sit on top of the
// tappable track, so a tap on a marker still resolves to its own position).
function RepTimeline({
  events, duration, currentTime, onSeek,
}: {
  events:      RepEventData[];
  duration:    number;
  currentTime: number;
  onSeek:      (t: number) => void;
}) {
  const [barWidth, setBarWidth] = useState(0);
  if (duration <= 0) return null;
  const playheadFrac = Math.min(1, Math.max(0, currentTime / duration));

  return (
    <Pressable
      style={s.timelineTrack}
      onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
      onPress={e => {
        if (barWidth <= 0) return;
        const frac = Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth));
        onSeek(frac * duration);
      }}
    >
      <View style={s.timelineBase} pointerEvents="none" />
      <View style={[s.timelinePlayhead, { left: `${playheadFrac * 100}%` }]} pointerEvents="none" />
      {events.map((ev, i) => {
        const frac = Math.min(1, Math.max(0, ev.timeSec / duration));
        return (
          <View
            key={i}
            style={[s.timelineMarker, ev.good ? s.timelineMarkerGood : s.timelineMarkerBad, { left: `${frac * 100}%` }]}
            pointerEvents="none"
          />
        );
      })}
    </Pressable>
  );
}

// ─── MyPal overview — collapsible, scrollable per-rep list ────────────────────
// Pulled straight from the same repEvents data that already drives the video
// badge/timeline above — one source of truth, three different views of it.
// Tapping a row seeks the video to that rep, same as tapping its timeline
// marker, so the list and the video stay usable together rather than as two
// disconnected pieces of UI.
function MyPalOverview({
  events, expanded, onToggle, onSeek,
}: {
  events:   RepEventData[];
  expanded: boolean;
  onToggle: () => void;
  onSeek:   (t: number) => void;
}) {
  return (
    <GlassSurface radius={30} style={s.detailCard}>
      <Pressable onPress={onToggle} style={s.overviewHeader} hitSlop={6}>
        <View style={{ flex: 1 }}>
          <Text style={s.detailCardLabel}>MYPAL OVERVIEW</Text>
          <Text style={s.overviewSub}>{events.length} {events.length === 1 ? 'rep' : 'reps'} reviewed</Text>
        </View>
        <SymbolView
          name={expanded ? 'chevron.up' : 'chevron.down'}
          size={14} tintColor={C.mutedDim} type="monochrome"
          style={{ width: 14, height: 14 }}
        />
      </Pressable>
      {expanded && (
        <View style={s.overviewList}>
          {events.map((ev, i) => (
            <Pressable
              key={i}
              onPress={() => onSeek(ev.timeSec)}
              style={({ pressed }) => [s.overviewRow, pressed && { opacity: 0.6 }]}
            >
              <View style={[s.overviewDot, ev.good ? s.overviewDotGood : s.overviewDotBad]}>
                <Text style={s.overviewDotTxt}>{ev.good ? '✓' : '✗'}</Text>
              </View>
              <Text style={s.overviewRowTxt} numberOfLines={1}>
                Rep {i + 1} — {ev.good ? 'Good form' : (ev.reason || 'Needs work')}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </GlassSurface>
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

        const repEventsByExercise: Record<string, RepEventData[]> = {};
        for (const r of summary.results) {
          if (r.completed && r.repEvents && r.repEvents.length > 0) {
            repEventsByExercise[r.exerciseId] = r.repEvents;
          }
        }

        setData({
          ts: summary.finishedAt, entries,
          totalReps: summary.totalReps, totalGoodReps: summary.totalGoodReps,
          pct: summary.overallFormScore, isHistory: false, workoutSummary: summary,
          durationSec: summary.durationSeconds, repEventsByExercise,
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
          repEventsByExercise: repEventsParam.length > 0 ? { [exId]: repEventsParam } : undefined,
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

  // ── Video replay overlay (solo mode only) ────────────────────────────────────
  // REPLACED the old fire-and-fade "liveAnim" (a RepFeedback flash that
  // played once when the timeline CROSSED a rep's timestamp forward, then
  // disappeared after ~1s regardless of what the user did next) with a
  // PERSISTENT badge derived fresh from player.currentTime on every poll
  // tick. "Which rep is this?" is recomputed from scratch each tick rather
  // than tracked as a one-shot crossing event, so it stays correct — and
  // stays ON SCREEN — whether the video is playing, paused, or scrubbed
  // backward: pausing anywhere no longer loses the badge, which was the
  // actual ask ("pause on any rep and see the check/X/cue"). This is a
  // persistent OVERLAY, not literally baked into the video's pixels — see
  // repBadge's render site for why.
  const hasVideo = !!data?.videoUri;
  const player = useVideoPlayer(data?.videoUri || null, p => { p.loop = false; });
  const [repBadge, setRepBadge] = useState<{ index: number; good: boolean; reason: string } | null>(null);
  // Duration/currentTime aren't reactive React state on expo-video's player
  // object — same reason the existing 100ms poll already exists for
  // repBadge — reused here rather than a second interval.
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [overviewExpanded, setOverviewExpanded] = useState(true);

  useEffect(() => {
    if (!hasVideo || !data?.repEvents || data.repEvents.length === 0) return;
    const evs = data.repEvents; // assumed ascending by timeSec — pushed in order as reps complete
    const id = setInterval(() => {
      const t = player.currentTime;
      setVideoTime(t);
      if (player.duration > 0) setVideoDuration(d => (d === player.duration ? d : player.duration));
      let idx = -1;
      for (let i = 0; i < evs.length; i++) {
        if (evs[i].timeSec <= t) idx = i; else break;
      }
      if (idx === -1) {
        setRepBadge(prev => (prev === null ? prev : null));
      } else {
        setRepBadge(prev => (prev?.index === idx ? prev : { index: idx, good: evs[idx].good, reason: evs[idx].reason }));
      }
    }, 100);
    return () => clearInterval(id);
  }, [hasVideo, data, player]);

  const seekTo = useCallback((timeSec: number) => {
    try { player.currentTime = timeSec; } catch { /* player not ready yet */ }
  }, [player]);

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

  // Separate from handleShare (which captures the recap card as a PNG via
  // ViewShot) — this is specifically for the video/replay page, where "share
  // the video" is the contextually obvious meaning. Falls back to the recap
  // card share if there's somehow no video (shouldn't happen — only rendered
  // when hasVideo is true — but staying consistent rather than doing nothing).
  const handleShareVideo = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (data?.videoUri) {
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(data.videoUri, { mimeType: 'video/mp4', dialogTitle: 'Share your FormPal replay' });
        }
      } else {
        await handleShare();
      }
    } catch {
      // best-effort — no native share sheet on some platforms/simulators
    } finally {
      setSharing(false);
    }
  }, [sharing, data, handleShare]);

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
                      <SkiaMuscleHeatmapSafe
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
                  {/* Persistent rep badge — see repBadge's doc comment above.
                      A small corner chip, not the big live-camera RepFeedback
                      card (that component's full-screen size was designed to
                      sit over a live camera view, not share space with video
                      controls). Genuinely embedding this into the video's own
                      pixels would mean re-encoding the file (ffmpeg-class
                      video processing, a real native dependency and a much
                      bigger separate undertaking) — this achieves the actual
                      ask, pausing on any rep to see its check/X/cue, as a
                      playhead-synced overlay instead, without that cost. */}
                  {repBadge && (
                    <View style={[s.videoBadge, repBadge.good ? s.videoBadgeGood : s.videoBadgeBad]} pointerEvents="none">
                      <Text style={s.videoBadgeNum}>
                        #{repBadge.index + 1} {repBadge.good ? '✓' : '✗'}
                      </Text>
                      {!repBadge.good && repBadge.reason ? (
                        <Text style={s.videoBadgeCue} numberOfLines={1}>{repBadge.reason}</Text>
                      ) : null}
                    </View>
                  )}
                </View>

                {/* Timeline — every rep at its timestamp, green=good/red=bad,
                    tap anywhere to scrub. See RepTimeline's own doc comment
                    for why this sits alongside nativeControls rather than
                    replacing them. */}
                {data.repEvents && data.repEvents.length > 0 && (
                  <RepTimeline
                    events={data.repEvents}
                    duration={videoDuration}
                    currentTime={videoTime}
                    onSeek={seekTo}
                  />
                )}
              </GlassSurface>
            )}

            {/* MyPal overview — collapsible per-rep list, same data as the
                video badge/timeline above. Tapping a row seeks the video. */}
            {data.repEvents && data.repEvents.length > 0 && (
              <MyPalOverview
                events={data.repEvents}
                expanded={overviewExpanded}
                onToggle={() => setOverviewExpanded(v => !v)}
                onSeek={seekTo}
              />
            )}

            {/* Actions — this page had neither before; Share here shares the
                video file itself (contextually the point of this page),
                Done exits the same way page 1's Done does. */}
            <View style={s.actions}>
              <Pressable
                onPress={hasVideo ? handleShareVideo : handleShare}
                disabled={sharing}
                style={({ pressed }) => [s.shareBtnShadow, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <LinearGradient
                  colors={[C.accentA, C.accentB, C.accentC]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.shareBtn}
                >
                  <SymbolView name="square.and.arrow.up" size={18} tintColor="#fff" type="monochrome" style={{ width: 18, height: 18 }} />
                  <Text style={s.shareBtnTxt}>{hasVideo ? 'Share Replay' : 'Share Recap'}</Text>
                </LinearGradient>
              </Pressable>

              <GlassSurface radius={22} style={s.doneChip} shadow={false}>
                <Pressable onPress={handleDone} style={({ pressed }) => [s.doneChipInner, pressed && { opacity: 0.7 }]}>
                  <Text style={s.doneChipTxt}>{doneLabel}</Text>
                </Pressable>
              </GlassSurface>
            </View>
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

  statGrid: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 22, width: '100%' },
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

  // ROOT CAUSE of "video content doesn't match container size" in the small
  // (pre-fullscreen) view: this was a FIXED height (300) with no explicit
  // width, giving a roughly 1.17:1 (wider-than-tall) box — but the camera
  // records portrait video (see ATHLTCameraModule.swift's own portrait-check
  // log), closer to 9:16 (0.5625:1, much taller than wide). contentFit=
  // "contain" preserves the video's real aspect ratio, so a portrait video
  // inside a landscape-ish box gets heavily pillarboxed (big black bars on
  // both sides) — reading as "the video is smaller than its container." Using
  // aspectRatio instead of a fixed height makes the CONTAINER'S shape match
  // the video's actual shape, so contain has nothing left to pad. Fullscreen
  // (via allowsFullscreen/nativeControls) is the OS's own native player UI,
  // not affected by this container's styling — no separate fix needed there.
  videoWrap: {
    width: '100%', aspectRatio: 9 / 16, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000',
  },
  videoBadge: {
    position: 'absolute', left: 12, top: 12, maxWidth: '70%',
    borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1,
  },
  videoBadgeGood: { backgroundColor: 'rgba(46,125,99,0.55)', borderColor: 'rgba(255,255,255,0.35)' },
  videoBadgeBad:  { backgroundColor: 'rgba(255,59,48,0.55)', borderColor: 'rgba(255,255,255,0.35)' },
  videoBadgeNum:  { fontSize: 13, fontWeight: '700', color: '#fff' },
  videoBadgeCue:  { fontSize: 11, fontWeight: '600', color: '#fff', marginTop: 2 },

  // ── Rep timeline ──────────────────────────────────────────────────────────
  timelineTrack: {
    height: 32, marginTop: 10, marginHorizontal: 6, justifyContent: 'center',
  },
  timelineBase: {
    height: 4, borderRadius: 2, backgroundColor: 'rgba(19,26,46,0.12)',
  },
  timelinePlayhead: {
    position: 'absolute', top: 6, width: 2, height: 20, marginLeft: -1,
    backgroundColor: C.text, borderRadius: 1,
  },
  timelineMarker: {
    position: 'absolute', top: 10, width: 12, height: 12, marginLeft: -6,
    borderRadius: 6, borderWidth: 2, borderColor: '#fff',
  },
  timelineMarkerGood: { backgroundColor: C.good },
  timelineMarkerBad:  { backgroundColor: C.bad },

  // ── MyPal overview ────────────────────────────────────────────────────────
  overviewHeader: { flexDirection: 'row', alignItems: 'center' },
  overviewSub:    { fontSize: 12, color: C.muted, marginTop: -6 },
  overviewList:   { marginTop: 12, gap: 2 },
  overviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9,
  },
  overviewDot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  overviewDotGood: { backgroundColor: 'rgba(46,125,99,0.15)' },
  overviewDotBad:  { backgroundColor: 'rgba(255,59,48,0.13)' },
  overviewDotTxt:  { fontSize: 11, fontWeight: '700', color: C.text },
  overviewRowTxt:  { flex: 1, fontSize: 13.5, fontWeight: '500', color: C.text },

  dotsRow: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  dot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(25,35,65,0.24)' },
  dotActive: { width: 22, backgroundColor: 'rgba(25,35,65,0.62)' },
});
