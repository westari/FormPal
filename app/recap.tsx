import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SymbolView } from 'expo-symbols';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
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

// ─── Palette (onboarding design system) ──────────────────────────────────────
const C = {
  bg:      '#0A0B0C',
  surface: '#15161A',
  card:    '#ffffff',
  border:  'rgba(255,255,255,0.08)',
  text:    '#F0F0F2',
  muted:   '#9A9AA2',
  dim:     '#62626A',
  good:    '#4ADE80',
  goodBg:  'rgba(21,128,61,0.14)',
  goodRing:'rgba(74,222,128,0.28)',
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
  const shotRef = useRef<ViewShotRef>(null);

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
      <View style={[s.root, s.centerFill, { paddingTop: insets.top }]}>
        <Text style={s.failedTxt}>No recap data found.</Text>
        <Pressable style={[s.doneBtnFooter, { marginTop: 20 }]} onPress={() => router.back()}>
          <Text style={s.doneTxtFooter}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!data) return <View style={[s.root, { paddingTop: insets.top }]} />;

  const exCount    = data.entries.length;
  const doneLabel  = data.isHistory ? 'Back' : 'Done';
  const breakdown  = data.workoutSummary?.results;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Muscle heatmap — the hero. Captured as-is for the share image. */}
        <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
          <View style={s.heroCard}>
            <MuscleHeatmap
              overallScores={overallScores}
              highlightGroups={highlightGroups}
              highlightLabel={highlightLabel}
              scale={0.85}
            />
            <View style={s.watermarkRow}>
              <SymbolView name="figure.strengthtraining.traditional" size={11} tintColor="#c8ccd6"
                type="monochrome" style={{ width: 11, height: 11 }} />
              <Text style={s.watermarkTxt}>FormPal</Text>
            </View>
          </View>
        </ViewShot>

        {/* Minimal, secondary stats */}
        <View style={s.statsRow}>
          <StatPill label="Exercises" value={String(exCount)} />
          <StatPill label="Total Reps" value={String(data.totalReps)} />
          {data.totalReps > 0 && <StatPill label="Good Form" value={`${data.pct}%`} accent />}
        </View>

        {/* Overview */}
        {data.totalReps > 0 && (
          <View style={s.card}>
            <Text style={s.cardLabel}>OVERVIEW</Text>
            <Text style={s.cardText}>{generateSummary(data.totalReps, data.totalGoodReps)}</Text>
          </View>
        )}

        {/* Secondary: per-exercise breakdown (workout mode only) */}
        {breakdown && breakdown.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>BREAKDOWN</Text>
            <View style={s.card}>
              {breakdown.map((r, i) => (
                <React.Fragment key={r.exerciseId + i}>
                  <View style={s.exRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.exName}>{r.displayName}</Text>
                      {r.completed && <Text style={s.exMeta}>{r.reps} reps</Text>}
                      {r.skipped   && <Text style={[s.exMeta, { color: C.dim }]}>Skipped</Text>}
                    </View>
                    {r.completed && r.reps > 0 && (
                      <Text style={s.exScore}>{r.formScore}%</Text>
                    )}
                  </View>
                  {i < breakdown.length - 1 && <View style={s.divider} />}
                </React.Fragment>
              ))}
            </View>
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
                  onComplete={() => setLiveAnim(null)}
                />
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer — Share is the primary action; Done/Back just navigates away */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
        <Pressable
          style={({ pressed }) => [s.shareBtn, pressed && { opacity: 0.85 }]}
          onPress={handleShare}
          disabled={sharing}
        >
          <SymbolView name="square.and.arrow.up" size={17} tintColor={C.bg} type="monochrome" style={{ width: 17, height: 17 }} />
          <Text style={s.shareTxt}>{sharing ? 'Preparing…' : 'Share Recap'}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.doneBtnFooter, pressed && { opacity: 0.6 }]}
          onPress={handleDone}
        >
          <Text style={s.doneTxtFooter}>{doneLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[sp.pill, accent && sp.pillAccent]}>
      <Text style={[sp.value, accent && sp.valueAccent]}>{value}</Text>
      <Text style={sp.label}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  centerFill:{ alignItems: 'center', justifyContent: 'center', gap: 8 },
  failedTxt: { color: C.muted, fontSize: 15 },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 20, gap: 16, paddingTop: 20 },

  heroCard: {
    backgroundColor: C.card,
    borderRadius:    28,
    padding:         20,
    gap:             18,
  },
  watermarkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    opacity: 0.55,
  },
  watermarkTxt: { fontSize: 11, fontWeight: '700', color: '#8b93a3', letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', gap: 10 },

  card: {
    backgroundColor: C.surface,
    borderRadius:    16,
    padding:         18,
    borderWidth:     1,
    borderColor:     C.border,
    gap:             8,
  },
  cardLabel: { fontSize: 11, fontWeight: '600', color: C.muted, letterSpacing: 1.2 },
  cardText:  { fontSize: 14.5, fontWeight: '400', color: C.text, lineHeight: 21, letterSpacing: -0.1 },

  section:      { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.dim, letterSpacing: 1, marginLeft: 2 },

  exRow:   { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  exName:  { fontSize: 14, fontWeight: '600', color: C.text },
  exMeta:  { fontSize: 12, color: C.muted, marginTop: 2 },
  exScore: { fontSize: 13, fontWeight: '700', color: C.good },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: 14 },

  videoWrap: {
    width: '100%', aspectRatio: 9 / 16,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#000',
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop:        14,
    gap:               10,
    backgroundColor:   C.bg,
    borderTopWidth:    StyleSheet.hairlineWidth,
    borderTopColor:    C.border,
  },
  shareBtn: {
    backgroundColor: C.text,
    borderRadius:    100,
    paddingVertical: 17,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
  },
  shareTxt: { fontSize: 16, fontWeight: '700', color: C.bg, letterSpacing: 0.2 },

  doneBtnFooter: { alignItems: 'center', paddingVertical: 8 },
  doneTxtFooter: { fontSize: 14, fontWeight: '600', color: C.muted },
});

const sp = StyleSheet.create({
  pill: {
    flex:              1,
    backgroundColor:   C.surface,
    borderRadius:      14,
    paddingVertical:   16,
    paddingHorizontal: 10,
    alignItems:        'center',
    borderWidth:       1,
    borderColor:       C.border,
    gap:               4,
  },
  pillAccent: {
    borderColor:     C.goodRing,
    backgroundColor: C.goodBg,
  },
  value: {
    fontSize:   26,
    fontWeight: '700',
    color:      C.text,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  valueAccent: { color: C.good },
  label: {
    fontSize:   11,
    fontWeight: '500',
    color:      C.muted,
    letterSpacing: 0.2,
  },
});
