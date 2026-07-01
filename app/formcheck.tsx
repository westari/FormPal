import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GlassButton from '../components/GlassButton';
import RepFeedback from '../components/RepFeedback';
import {
  ATHLTCameraView,
  startSession,
  stopSession,
  startTracking,
  stopTracking,
  flipCamera,
  setDiagnosticMode,
  setExercise,
  addRepListener,
  addDebugStatsListener,
  addCameraStateListener,
  addErrorListener,
  isNativeModuleLinked,
} from '../modules/athlt-camera/src/index';
import type { DebugStatsEvent, RepEvent, ExerciseType } from '../modules/athlt-camera/src/index';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:     '#0A0B0C',
  glass:  'rgba(21,22,26,0.82)',
  text:   '#F0F0F2',
  muted:  '#9A9AA2',
  dim:    '#62626A',
  good:   '#4ADE80',
  warn:   '#FB923C',
  border: 'rgba(255,255,255,0.08)',
};

const VIDEO_LOG_KEY = 'formpal_video_log';

async function logSessionVideo(uri: string) {
  try {
    const raw = await AsyncStorage.getItem(VIDEO_LOG_KEY);
    const log: { uri: string; ts: number }[] = raw ? JSON.parse(raw) : [];
    log.push({ uri, ts: Date.now() });
    await AsyncStorage.setItem(VIDEO_LOG_KEY, JSON.stringify(log));
  } catch {}
}

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase = 'idle' | 'starting' | 'ready' | 'tracking' | 'stopping';

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function FormCheckScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { exercise = 'squat' } = useLocalSearchParams<{ exercise?: string }>();
  const exerciseType = (['squat', 'curl', 'pushup'].includes(exercise)
    ? exercise : 'squat') as ExerciseType;

  const [phase,    setPhase]    = useState<Phase>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [stats,    setStats]    = useState<DebugStatsEvent | null>(null);
  const [reps,     setReps]     = useState(0);
  const [goodReps, setGoodReps] = useState(0);

  const [feedback, setFeedback] = useState<{ key: number; good: boolean; reason: string } | null>(null);
  const feedbackKey    = useRef(0);
  const flashAnim      = useRef(new Animated.Value(0)).current;
  const notLinked      = !isNativeModuleLinked();

  // Rep timestamp tracking — reset on each new tracking session
  const startTimestamp = useRef<number | null>(null);
  const repEvents      = useRef<{ timeSec: number; good: boolean; reason: string }[]>([]);

  // Prevents the useEffect cleanup from calling stopSession if we already called it
  const sessionStopped = useRef(false);

  // ── Session lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    if (notLinked) {
      setError('ATHLTCamera native module not linked.\nRun a dev build — Expo Go does not support this screen.');
      return;
    }

    let mounted = true;
    sessionStopped.current = false;

    const errSub = addErrorListener(e => { if (mounted) setError(e.message); });
    const camSub = addCameraStateListener(e => {
      if (mounted && e.running) setPhase(p => (p === 'starting' ? 'ready' : p));
    });

    setPhase('starting');
    void setDiagnosticMode(true);
    startSession().then(result => {
      if (!mounted) return;
      if (!result.success) {
        setError(result.error ?? 'Camera failed to start. Check camera permission in Settings.');
        setPhase('idle');
      }
    });

    return () => {
      mounted = false;
      errSub.remove();
      camSub.remove();
      if (!sessionStopped.current) void stopSession();
    };
  }, []);

  // ── Tracking listeners ─────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'tracking') return;

    const repSub = addRepListener((rep: RepEvent) => {
      setReps(rep.reps);
      setGoodReps(rep.goodReps);
      flashAnim.setValue(1);
      Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: true }).start();
      const k = ++feedbackKey.current;
      setFeedback({ key: k, good: rep.good, reason: rep.reason });

      // Record timestamp relative to tracking start
      const timeSec = startTimestamp.current != null
        ? (Date.now() - startTimestamp.current) / 1000
        : 0;
      repEvents.current.push({ timeSec, good: rep.good, reason: rep.reason });
    });

    const dbgSub = addDebugStatsListener((e: DebugStatsEvent) => {
      setStats(e);
      setReps(e.reps);
      setGoodReps(e.goodReps);
    });

    return () => { repSub.remove(); dbgSub.remove(); };
  }, [phase]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStartStop = useCallback(async () => {
    if (phase === 'ready') {
      setStats(null);
      setReps(0);
      setGoodReps(0);
      startTimestamp.current = Date.now();
      repEvents.current      = [];
      setPhase('tracking');
      await setExercise(exerciseType);
      await startTracking();
    } else if (phase === 'tracking') {
      setPhase('stopping');
      const final = await stopTracking();
      sessionStopped.current = true;
      await stopSession();
      if (final.videoUri) void logSessionVideo(final.videoUri);
      router.replace({
        pathname: '/recap',
        params: {
          reps:     String(final.reps),
          goodReps: String(final.goodReps),
          videoUri: final.videoUri ?? '',
          events:   JSON.stringify(repEvents.current),
        },
      });
    }
  }, [phase, router]);

  const handleFlip = useCallback(() => void flipCamera(), []);

  const handleBack = useCallback(async () => {
    sessionStopped.current = true;
    await stopSession();
    router.back();
  }, [router]);

  const isTracking  = phase === 'tracking';
  const canTrack    = phase === 'ready' || phase === 'tracking';
  const isStopping  = phase === 'stopping';
  // Ready gate: analyzer is tracking but hasn't seen stable standing yet
  const needsReady  = isTracking && stats != null && !stats.ready;

  return (
    <View style={s.root}>
      <ATHLTCameraView style={StyleSheet.absoluteFill} />

      {/* Green flash on rep */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: C.good, opacity: Animated.multiply(flashAnim, 0.15) },
        ]}
      />

      {/* Rep feedback badge */}
      {feedback && (
        <RepFeedback
          key={feedback.key}
          good={feedback.good}
          reason={feedback.reason}
          onComplete={() => setFeedback(null)}
        />
      )}

      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <GlassButton circular={40} onPress={handleBack}>
          <SymbolView name="chevron.left" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
        </GlassButton>
        <Text style={s.title}>
          {exerciseType === 'curl' ? 'Bicep Curl' : exerciseType === 'pushup' ? 'Push-up' : 'Squat'} Form Check
        </Text>
        <GlassButton circular={40} onPress={handleFlip}>
          <SymbolView name="arrow.triangle.2.circlepath.camera.fill" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
        </GlassButton>
      </View>

      {/* Error */}
      {error && (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Ready gate hint — shown while tracking but analyzer not yet ready */}
      {needsReady && (
        <View style={s.readyHint}>
          <Text style={s.readyHintText}>Stand still to activate…</Text>
        </View>
      )}

      {/* Rep counter */}
      {(isTracking || isStopping) && (
        <View style={s.repBlock}>
          <Text style={s.repNum}>{reps}</Text>
          <Text style={s.repSub}>{goodReps} good</Text>
        </View>
      )}

      {/* Debug stats */}
      {stats && isTracking && (
        <View style={s.debugPanel}>
          <Row label="person"  value={stats.personDetected ? 'yes' : 'no'} good={stats.personDetected} />
          <Row label="ready"   value={stats.ready ? 'yes' : 'no'} good={stats.ready} />
          <Row label={exerciseType === 'curl' || exerciseType === 'pushup' ? 'elbow°' : 'knee°'} value={stats.kneeAngle.toFixed(1)} />
          <Row label="back°"   value={stats.backAngle.toFixed(1)} />
          <Row label="phase"   value={stats.phase} />
          <Row label="frames"  value={`${stats.totalFramesAnalyzed} / ${stats.totalFramesReceived}`} />
        </View>
      )}

      {/* Bottom controls */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
        {phase === 'starting' && <Text style={s.hint}>Starting camera…</Text>}
        {isStopping          && <Text style={s.hint}>Saving session…</Text>}

        {canTrack && (
          <GlassButton style={{ height: 56, width: 240 }} onPress={handleStartStop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SymbolView
                name={isTracking ? 'stop.fill' : 'play.fill'}
                size={18}
                tintColor={isTracking ? C.warn : C.text}
                type="monochrome"
                style={{ width: 18, height: 18 }}
              />
              <Text style={[s.trackLabel, isTracking && s.trackLabelStop]}>
                {isTracking ? 'Stop' : 'Start Tracking'}
              </Text>
            </View>
          </GlassButton>
        )}
      </View>
    </View>
  );
}

// ─── Debug row ────────────────────────────────────────────────────────────────
function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <View style={d.row}>
      <Text style={d.key}>{label}</Text>
      <Text style={[d.val, good === true && d.valGood, good === false && d.valDim]}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#000' },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title:      { fontSize: 16, fontWeight: '600', color: C.text },
  errorCard:  { position: 'absolute', left: 24, right: 24, top: '38%', backgroundColor: C.glass, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border },
  errorText:  { color: C.warn, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  readyHint:  { position: 'absolute', top: '30%', left: 0, right: 0, alignItems: 'center' },
  readyHintText: {
    fontSize:          14,
    fontWeight:        '600',
    color:             C.muted,
    backgroundColor:   C.glass,
    paddingHorizontal: 18,
    paddingVertical:   8,
    borderRadius:      100,
    borderWidth:       StyleSheet.hairlineWidth,
    borderColor:       C.border,
    overflow:          'hidden',
  },
  repBlock:  { position: 'absolute', top: '18%', left: 0, right: 0, alignItems: 'center' },
  repNum:    { fontSize: 100, fontWeight: '700', lineHeight: 104, color: '#fff' },
  repSub:    { fontSize: 15, color: C.muted, marginTop: 4 },
  debugPanel: { position: 'absolute', bottom: 140, left: 16, backgroundColor: C.glass, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minWidth: 210, borderWidth: 1, borderColor: C.border },
  bottomBar:  { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 12, paddingHorizontal: 24, gap: 12 },
  hint:       { color: C.muted, fontSize: 13 },
  trackLabel:     { fontSize: 16, fontWeight: '600', color: C.text },
  trackLabelStop: { color: C.warn },
});

const d = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', gap: 20, paddingVertical: 3 },
  key:     { fontSize: 11, color: C.dim },
  val:     { fontSize: 11, color: C.text },
  valGood: { color: C.good },
  valDim:  { color: '#444' },
});
