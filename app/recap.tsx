import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import RepFeedback from '../components/RepFeedback';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RepEventData {
  timeSec: number;
  good:    boolean;
  reason:  string;
}

// ─── Palette (onboarding design system) ──────────────────────────────────────
const C = {
  bg:      '#0A0B0C',
  surface: '#15161A',
  border:  'rgba(255,255,255,0.08)',
  text:    '#F0F0F2',
  muted:   '#9A9AA2',
  dim:     '#62626A',
  good:    '#4ADE80',
  goodBg:  'rgba(21,128,61,0.14)',
  goodRing:'rgba(74,222,128,0.28)',
};

// ─── AI summary (templated) ───────────────────────────────────────────────────
function generateSummary(reps: number, goodReps: number): string {
  const pct = reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
  if (reps === 0)   return 'No reps were detected this session. Try positioning the phone so your full body is visible from the side.';
  if (pct === 100)  return `Clean session — all ${reps} squats hit good depth. That kind of consistency is what builds real strength over time.`;
  if (pct >= 80)    return `Solid work. ${goodReps} of your ${reps} squats (${pct}%) reached full depth. On the shallower reps, focus on driving your hips lower before reversing.`;
  if (pct >= 50)    return `You hit good depth on ${goodReps} of ${reps} squats (${pct}%). Try slowing your descent and sitting back into your hips — aim for thighs parallel or below.`;
  return `${reps} reps completed with ${goodReps} reaching full depth (${pct}%). Work on sitting deeper — slow the descent, push your knees out, and drive your hips toward the floor.`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RecapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { reps: repsStr, goodReps: goodRepsStr, videoUri, events } =
    useLocalSearchParams<{ reps: string; goodReps: string; videoUri: string; events: string }>();

  const reps     = parseInt(repsStr     ?? '0', 10);
  const goodReps = parseInt(goodRepsStr ?? '0', 10);
  const pct      = reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
  const hasVideo = typeof videoUri === 'string' && videoUri.length > 0;

  const repEvents = useMemo<RepEventData[]>(() => {
    try { return JSON.parse(events ?? '[]'); }
    catch { return []; }
  }, [events]);

  const player = useVideoPlayer(hasVideo ? videoUri : null, p => { p.loop = false; });

  // ── Animation replay ──────────────────────────────────────────────────────
  const [liveAnim, setLiveAnim] = useState<{ key: number; good: boolean; reason: string } | null>(null);
  const animKeyRef    = useRef(0);
  const triggeredRef  = useRef(new Set<number>());
  const prevTimeRef   = useRef(0);

  useEffect(() => {
    if (!hasVideo || repEvents.length === 0) return;

    const id = setInterval(() => {
      const t = player.currentTime;

      // Scrub backward: un-trigger reps that are now in the future
      if (t < prevTimeRef.current - 0.8) {
        repEvents.forEach((_, i) => {
          if (repEvents[i].timeSec > t) triggeredRef.current.delete(i);
        });
      }
      prevTimeRef.current = t;

      repEvents.forEach((ev, i) => {
        if (!triggeredRef.current.has(i) && t >= ev.timeSec) {
          triggeredRef.current.add(i);
          setLiveAnim({ key: ++animKeyRef.current, good: ev.good, reason: ev.reason });
        }
      });
    }, 100);

    return () => clearInterval(id);
  }, [hasVideo, repEvents, player]);

  const handleDone = useCallback(() => {
    router.replace('/(tabs)/');
  }, [router]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Video hero with animation overlay */}
        {hasVideo ? (
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
        ) : (
          <View style={s.videoEmpty}>
            <Text style={s.videoEmptyText}>No video recorded</Text>
          </View>
        )}

        {/* Stats row */}
        <View style={s.statsRow}>
          <StatPill label="Total Reps" value={String(reps)} />
          <StatPill label="Good Depth" value={String(goodReps)} accent />
          {reps > 0 && <StatPill label="Depth %" value={`${pct}%`} />}
        </View>

        {/* Overview */}
        <View style={s.card}>
          <Text style={s.cardLabel}>OVERVIEW</Text>
          <Text style={s.cardText}>{generateSummary(reps, goodReps)}</Text>
        </View>

        {/* Done */}
        <Pressable
          style={({ pressed }) => [s.doneBtn, pressed && { opacity: 0.55 }]}
          onPress={handleDone}
        >
          <Text style={s.doneTxt}>Done</Text>
        </Pressable>
      </ScrollView>
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
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 0,
    gap:               16,
  },
  videoWrap: {
    width:       '100%',
    aspectRatio: 9 / 16,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  videoEmpty: {
    marginHorizontal: 20,
    height:           200,
    borderRadius:     16,
    backgroundColor:  C.surface,
    borderWidth:      1,
    borderColor:      C.border,
    alignItems:       'center',
    justifyContent:   'center',
  },
  videoEmptyText: { color: C.muted, fontSize: 14 },
  statsRow: {
    flexDirection:    'row',
    gap:              10,
    paddingHorizontal: 20,
  },
  card: {
    marginHorizontal: 20,
    backgroundColor:  C.surface,
    borderRadius:     16,
    padding:          20,
    borderWidth:      1,
    borderColor:      C.border,
    gap:              10,
  },
  cardLabel: {
    fontSize:      11,
    fontWeight:    '600',
    color:         C.muted,
    letterSpacing: 1.2,
  },
  cardText: {
    fontSize:      16,
    fontWeight:    '400',
    color:         C.text,
    lineHeight:    24,
    letterSpacing: -0.2,
  },
  doneBtn: {
    marginHorizontal: 20,
    backgroundColor:  C.text,
    borderRadius:     100,
    paddingVertical:  18,
    alignItems:       'center',
  },
  doneTxt: {
    fontSize:   16,
    fontWeight: '700',
    color:      C.bg,
    letterSpacing: 0.2,
  },
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
    fontSize:   28,
    fontWeight: '700',
    color:      C.text,
    lineHeight: 32,
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
