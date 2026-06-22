import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';

// ─── AI summary (templated) ───────────────────────────────────────────────────
//
// TODO: Replace with a real Claude API call once the session video + rep data
//       are sent to the backend endpoint. Pass videoUri + {reps, goodReps} as
//       context. The response should be a short coaching paragraph (2-3 sentences).
//
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

  const { reps: repsStr, goodReps: goodRepsStr, videoUri } =
    useLocalSearchParams<{ reps: string; goodReps: string; videoUri: string }>();

  const reps     = parseInt(repsStr     ?? '0', 10);
  const goodReps = parseInt(goodRepsStr ?? '0', 10);
  const pct      = reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
  const hasVideo = typeof videoUri === 'string' && videoUri.length > 0;

  // expo-video: null source = no playback (handles missing video gracefully)
  const player = useVideoPlayer(hasVideo ? videoUri : null, p => { p.loop = false; });

  const handleDone = useCallback(() => {
    router.replace('/(tabs)/');
  }, [router]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={s.title}>Session Recap</Text>

        {/* Stats row */}
        <View style={s.statsRow}>
          <StatPill label="Total Reps"  value={String(reps)} />
          <StatPill label="Good Depth"  value={String(goodReps)} accent />
          {reps > 0 && <StatPill label="Depth %" value={`${pct}%`} />}
        </View>

        {/* Video playback */}
        {hasVideo ? (
          <View style={s.videoWrap}>
            <VideoView
              player={player}
              style={s.video}
              allowsFullscreen
              nativeControls
              contentFit="contain"
            />
          </View>
        ) : (
          <View style={s.videoEmpty}>
            <Text style={s.videoEmptyText}>No video recorded</Text>
          </View>
        )}

        {/* AI overview */}
        <View style={s.aiCard}>
          <Text style={s.aiLabel}>OVERVIEW</Text>
          <Text style={s.aiText}>{generateSummary(reps, goodReps)}</Text>
        </View>

        {/* Done */}
        <Pressable
          style={({ pressed }) => [s.doneBtn, pressed && s.doneBtnPressed]}
          onPress={handleDone}
        >
          <Text style={s.doneBtnText}>Done</Text>
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
const C = {
  bg:     '#0A0B0C',
  card:   'rgba(21,22,26,0.92)',
  text:   '#F0F0F2',
  muted:  '#9A9AA2',
  good:   '#4ADE80',
  border: 'rgba(255,255,255,0.08)',
};

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop:        8,
    gap:               16,
  },
  title: {
    fontSize:      28,
    fontWeight:    '700',
    color:         C.text,
    letterSpacing: -0.5,
    paddingBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap:           10,
  },
  videoWrap: {
    borderRadius:    16,
    overflow:        'hidden',
    backgroundColor: '#000',
    aspectRatio:     9 / 16,
  },
  video: { flex: 1 },
  videoEmpty: {
    height:          200,
    borderRadius:    16,
    backgroundColor: C.card,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  videoEmptyText: { color: C.muted, fontSize: 14 },
  aiCard: {
    backgroundColor: C.card,
    borderRadius:    16,
    padding:         20,
    borderWidth:     1,
    borderColor:     C.border,
    gap:             8,
  },
  aiLabel: {
    fontSize:      11,
    fontWeight:    '600',
    color:         C.muted,
    letterSpacing: 1.0,
  },
  aiText: {
    fontSize:   15,
    color:      C.text,
    lineHeight: 22,
  },
  doneBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius:    14,
    paddingVertical: 16,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     C.border,
  },
  doneBtnPressed: { opacity: 0.55 },
  doneBtnText: {
    fontSize:   16,
    fontWeight: '600',
    color:      C.text,
  },
});

const sp = StyleSheet.create({
  pill: {
    flex:              1,
    backgroundColor:   C.card,
    borderRadius:      14,
    paddingVertical:   16,
    paddingHorizontal: 10,
    alignItems:        'center',
    borderWidth:       1,
    borderColor:       C.border,
    gap:               4,
  },
  pillAccent: {
    borderColor:     'rgba(74,222,128,0.28)',
    backgroundColor: 'rgba(21,128,61,0.14)',
  },
  value: {
    fontSize:   28,
    fontWeight: '700',
    color:      C.text,
    lineHeight: 32,
  },
  valueAccent: { color: C.good },
  label: {
    fontSize:   11,
    fontWeight: '500',
    color:      C.muted,
  },
});
