import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SymbolView } from 'expo-symbols';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
  workoutSummary?: WorkoutSummary; // present in workout mode — feeds the breakdown section
}

// ─── Palette — iOS-26 "liquid glass," rebuilt ────────────────────────────────
// WHY THE LAST VERSION LOOKED "JUST WHITE" (diagnosed, not guessed):
// expo-blur uses genuine native UIVisualEffectView blur on iOS — confirmed by
// reading the library source; the JS getBackgroundColor() approximation only
// exists in BlurView.web.ts, it's never used on iOS. Two design choices, not
// a broken component, produced the washed-out look:
//   1. The background gradient (#EEF1FB→#F6F3FE→#FFFFFF) was nearly pure
//      white — blur has nothing colorful to visibly distort, so it just
//      blurred near-white into more near-white.
//   2. Each glass card ALSO set its own backgroundColor at 55% white opacity
//      directly on the BlurView, stacked on top of "light" tint (itself a
//      bright/white blur style) — two whitish layers compounding into a flat
//      wash regardless of whether the blur itself was rendering correctly.
// Fix: a genuinely saturated (not pastel-near-white) background gradient, and
// a much lower glass-fill opacity (~15%) so the blur's distortion of that
// color carries the visual weight instead of a solid tint painted over it.
const C = {
  bgTop:      '#A9C1F5', // periwinkle — clearly blue, not off-white
  bgMid:      '#C9B7EE', // soft violet
  bgBottom:   '#F0DCEC', // soft pink-lavender — still light, never flat white
  glassFill:  'rgba(255,255,255,0.15)',
  glassEdge:  'rgba(255,255,255,0.65)',
  card:       '#ffffff',
  text:       '#181B2E',
  muted:      '#5B6178',
  dim:        'rgba(255,255,255,0.75)',
  accent:     '#0A6CFF',
  good:       '#1FAE5C',
  goodFill:   'rgba(31,174,92,0.18)',
  goodEdge:   'rgba(78,214,140,0.55)',
  shadow:     'rgba(35,25,70,0.22)',
};

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
  const initialized = useRef(false);

  // Entrance animation — visual polish only, no bearing on data/logic.
  const heroOpac  = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.94)).current;

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

  // Entrance animation once real data has resolved (visual only).
  useEffect(() => {
    if (!data) return;
    Animated.parallel([
      Animated.timing(heroOpac,  { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(heroScale, { toValue: 1, tension: 120, friction: 9, useNativeDriver: true }),
    ]).start();
  }, [data, heroOpac, heroScale]);

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

  // ── Failure / loading states ────────────────────────────────────────────────

  if (loadFailed) {
    return (
      <View style={s.root}>
        <BgGradient />
        <View style={[s.centerFill, { paddingTop: insets.top }]}>
          <Text style={s.failedTxt}>No recap data found.</Text>
          <Pressable style={[s.doneBtnFooter, { marginTop: 20 }]} onPress={() => router.back()}>
            <Text style={s.doneTxtFooter}>Back</Text>
          </Pressable>
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

  return (
    <View style={s.root}>
      <BgGradient />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header — minimal, sets arrival before the hero */}
          <View style={s.header}>
            {!data.isHistory && (
              <View style={s.checkBadgeShadow}>
                <BlurView intensity={65} tint="light" style={s.checkBadge}>
                  <SymbolView name="checkmark" size={17} tintColor={C.good} type="monochrome" style={{ width: 17, height: 17 }} />
                </BlurView>
              </View>
            )}
            <Text style={s.headingTitle}>{headingTitle}</Text>
            <Text style={s.headingSub}>{formatFullDate(data.ts)}</Text>
          </View>

          {/* HERO — muscle heatmap. Captured as-is for the share image; kept a
              clean opaque card (not glass) on purpose: it's what gets shared
              out to other apps, and a controlled, predictable background
              there matters more than glass consistency for that one element.
              It reads fine sitting on the colorful gradient regardless. */}
          <Animated.View style={{ opacity: heroOpac, transform: [{ scale: heroScale }] }}>
            <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
              <View style={s.heroCard}>
                <MuscleHeatmap
                  overallScores={overallScores}
                  highlightGroups={highlightGroups}
                  highlightLabel={highlightLabel}
                  scale={0.85}
                />
                <View style={s.watermarkRow}>
                  <SymbolView name="figure.strengthtraining.traditional" size={11} tintColor="#aab0c4"
                    type="monochrome" style={{ width: 11, height: 11 }} />
                  <Text style={s.watermarkTxt}>FormPal</Text>
                </View>
              </View>
            </ViewShot>
          </Animated.View>

          {/* Stat pills — real frosted glass, low-opacity fill so the colorful
              background shows through the blur instead of a flat wash. */}
          <View style={s.statsRow}>
            <StatPill label="Exercises" value={String(exCount)} />
            <StatPill label="Total Reps" value={String(data.totalReps)} />
            {data.totalReps > 0 && <StatPill label="Good Form" value={`${data.pct}%`} accent />}
          </View>

          {/* Overview */}
          {data.totalReps > 0 && (
            <GlassCard>
              <Text style={s.cardLabel}>OVERVIEW</Text>
              <Text style={s.cardText}>{generateSummary(data.totalReps, data.totalGoodReps)}</Text>
            </GlassCard>
          )}

          {/* Secondary: per-exercise breakdown (workout mode only) */}
          {breakdown && breakdown.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>BREAKDOWN</Text>
              <GlassCard padded={false}>
                {breakdown.map((r, i) => (
                  <React.Fragment key={r.exerciseId + i}>
                    <View style={s.exRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.exName}>{r.displayName}</Text>
                        {r.completed && <Text style={s.exMeta}>{r.reps} reps</Text>}
                        {r.skipped   && <Text style={[s.exMeta, { color: C.muted }]}>Skipped</Text>}
                      </View>
                      {r.completed && r.reps > 0 && (
                        <Text style={s.exScore}>{r.formScore}%</Text>
                      )}
                    </View>
                    {i < breakdown.length - 1 && <View style={s.divider} />}
                  </React.Fragment>
                ))}
              </GlassCard>
            </View>
          )}

          {/* Secondary: video replay (solo quick-form-check only) */}
          {hasVideo && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>REPLAY</Text>
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
            </View>
          )}
        </ScrollView>

        {/* Footer — Share is the one prominent CTA; Done/Back is a quiet
            secondary link underneath. No hard divider line — a soft
            transparent-to-glass fade instead, so it reads as part of the
            same flowing screen rather than a separate bolted-on bar. */}
        <View style={s.footerFade} pointerEvents="box-none">
          <BlurView intensity={70} tint="light" style={s.footer}>
            <View style={[s.footerInner, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
              <Pressable
                style={({ pressed }) => [s.shareBtnShadow, pressed && { opacity: 0.88 }]}
                onPress={handleShare}
                disabled={sharing}
              >
                <LinearGradient
                  colors={[C.accent, '#7A5CFA']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.shareBtn}
                >
                  <SymbolView name="square.and.arrow.up" size={17} tintColor="#fff" type="monochrome" style={{ width: 17, height: 17 }} />
                  <Text style={s.shareTxt}>{sharing ? 'Preparing…' : 'Share Recap'}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.doneBtnFooter, pressed && { opacity: 0.6 }]}
                onPress={handleDone}
              >
                <Text style={s.doneTxtFooter}>{doneLabel}</Text>
              </Pressable>
            </View>
          </BlurView>
        </View>
      </View>
    </View>
  );
}

// ─── Background gradient — genuinely colorful, never flat white/black ────────
// Deliberately saturated (not pastel-near-white) — see the palette comment
// above for why: blur needs real color/contrast behind it to read as glass.
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

// ─── Frosted glass card ───────────────────────────────────────────────────────
function GlassCard({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  return (
    <View style={s.glassShadow}>
      <BlurView intensity={60} tint="light" style={[s.glassCard, !padded && { padding: 0 }]}>
        <View style={s.glassEdge} pointerEvents="none" />
        {children}
      </BlurView>
    </View>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={sp.shadow}>
      <BlurView intensity={60} tint="light" style={[sp.pill, accent && sp.pillAccent]}>
        <Text style={[sp.value, accent && sp.valueAccent]}>{value}</Text>
        <Text style={sp.label}>{label}</Text>
      </BlurView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bgBottom },
  centerFill:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  failedTxt: { color: C.text, fontSize: 15 },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 20, gap: 20, paddingTop: 6 },

  header: { alignItems: 'center', gap: 6, paddingTop: 14, paddingBottom: 2 },
  checkBadgeShadow: {
    borderRadius: 21, marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10,
  },
  checkBadge: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1, borderColor: C.glassEdge,
  },
  headingTitle: {
    fontSize: 26, fontWeight: '800', color: C.text,
    letterSpacing: -0.4, textAlign: 'center',
  },
  headingSub: {
    fontSize: 13.5, fontWeight: '600', color: C.text,
    opacity: 0.6, letterSpacing: 0.1,
  },

  heroCard: {
    backgroundColor: C.card,
    borderRadius:    30,
    padding:         22,
    gap:             18,
    shadowColor:     C.shadow,
    shadowOffset:    { width: 0, height: 18 },
    shadowOpacity:   1,
    shadowRadius:    40,
    elevation:       12,
  },
  watermarkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    opacity: 0.6,
  },
  watermarkTxt: { fontSize: 11, fontWeight: '700', color: '#aab0c4', letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', gap: 12 },

  glassShadow: {
    borderRadius: 22,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 1, shadowRadius: 24,
  },
  glassCard: {
    borderRadius:    22,
    padding:         19,
    gap:             8,
    overflow:        'hidden',
    backgroundColor: C.glassFill,
  },
  glassEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth:  1,
    borderColor:  C.glassEdge,
  },
  cardLabel: { fontSize: 11, fontWeight: '800', color: C.text, opacity: 0.55, letterSpacing: 1.4 },
  cardText:  { fontSize: 15, fontWeight: '500', color: C.text, lineHeight: 22, letterSpacing: -0.1 },

  section:      { gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: C.text, opacity: 0.5, letterSpacing: 1.4, marginLeft: 4 },

  exRow:   { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  exName:  { fontSize: 14.5, fontWeight: '700', color: C.text },
  exMeta:  { fontSize: 12, color: C.text, opacity: 0.6, marginTop: 2 },
  exScore: { fontSize: 13, fontWeight: '800', color: C.good },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.glassEdge, marginHorizontal: 16 },

  videoWrap: {
    width: '100%', aspectRatio: 9 / 16,
    borderRadius: 22, overflow: 'hidden',
    backgroundColor: '#000',
  },

  footerFade: {
    // No hard border — a tall enough blur region that the content scrolling
    // underneath softly disappears into it rather than hitting a visible seam.
  },
  footer: {
    overflow: 'hidden',
  },
  footerInner: {
    paddingHorizontal: 22,
    paddingTop:        18,
    gap:               12,
  },
  shareBtnShadow: {
    borderRadius: 100,
    shadowColor: C.accent, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 20,
  },
  shareBtn: {
    borderRadius:    100,
    paddingVertical: 18,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             9,
  },
  shareTxt: { fontSize: 16.5, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },

  doneBtnFooter: { alignItems: 'center', paddingVertical: 6 },
  doneTxtFooter: { fontSize: 14.5, fontWeight: '700', color: C.text, opacity: 0.55 },
});

const sp = StyleSheet.create({
  shadow: {
    flex: 1, borderRadius: 18,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 18,
  },
  pill: {
    borderRadius:      18,
    paddingVertical:   18,
    paddingHorizontal: 10,
    alignItems:        'center',
    gap:               4,
    overflow:          'hidden',
    backgroundColor:   C.glassFill,
    borderWidth:       1,
    borderColor:       C.glassEdge,
  },
  pillAccent: {
    borderColor:     C.goodEdge,
    backgroundColor: C.goodFill,
  },
  value: {
    fontSize:   27,
    fontWeight: '800',
    color:      C.text,
    lineHeight: 31,
    letterSpacing: -0.5,
  },
  valueAccent: { color: C.good },
  label: {
    fontSize:   11,
    fontWeight: '700',
    color:      C.text,
    opacity:    0.6,
    letterSpacing: 0.2,
  },
});
