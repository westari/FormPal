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
  addSetupStatusListener,
  addCalibrationStatusListener,
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

const SETUP_INFO: Record<ExerciseType, { icon: string; title: string; sub: string }> = {
  squat:  { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  curl:   { icon: 'camera.fill',          title: 'Face the camera',                  sub: 'Stand back — both arms and hands in view' },
  pushup: { icon: 'iphone',               title: 'Phone on the floor, to your side', sub: 'Get in position — full body in frame' },
  lunge:  { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
};

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase = 'idle' | 'starting' | 'setup' | 'setup-done' | 'tracking' | 'stopping';

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function FormCheckScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    exercise = 'squat',
    returnTo,
    workoutExerciseId,
  } = useLocalSearchParams<{
    exercise?:          string;
    returnTo?:          string;
    workoutExerciseId?: string;
  }>();
  const exerciseType = (['squat', 'curl', 'pushup', 'lunge'].includes(exercise)
    ? exercise : 'squat') as ExerciseType;

  const [phase,    setPhase]    = useState<Phase>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [stats,    setStats]    = useState<DebugStatsEvent | null>(null);
  const [reps,     setReps]     = useState(0);
  const [goodReps, setGoodReps] = useState(0);

  // ── Setup calibration state ───────────────────────────────────────────────
  const [setupAllVisible,   setSetupAllVisible]   = useState(false);
  const [setupHoldProgress, setSetupHoldProgress] = useState(0);
  const [setupHint,         setSetupHint]         = useState('');

  // ── Calibration state ─────────────────────────────────────────────────────
  const [calibStatus, setCalibStatus] = useState<{ repsCompleted: number; repsNeeded: number } | null>(null);

  const [feedback, setFeedback] = useState<{ key: number; good: boolean; reason: string } | null>(null);
  const feedbackKey    = useRef(0);
  const flashAnim      = useRef(new Animated.Value(0)).current;
  const notLinked      = !isNativeModuleLinked();

  // Rep timestamp tracking — reset on each new tracking session
  const startTimestamp = useRef<number | null>(null);
  const repEvents      = useRef<{ timeSec: number; good: boolean; reason: string }[]>([]);

  // Prevents the useEffect cleanup from calling stopSession if we already called it
  const sessionStopped = useRef(false);

  // Whether startTracking() has been called (stays true even during setup re-check)
  const isTrackingRef = useRef(false);

  // Timer refs
  const hintTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Session lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    if (notLinked) {
      setError('ATHLTCamera native module not linked.\nRun a dev build — Expo Go does not support this screen.');
      return;
    }

    let mounted = true;
    sessionStopped.current = false;
    isTrackingRef.current  = false;

    const errSub = addErrorListener(e => { if (mounted) setError(e.message); });

    const camSub = addCameraStateListener(e => {
      if (mounted && e.running) setPhase(p => (p === 'starting' ? 'setup' : p));
    });

    const calibSub = addCalibrationStatusListener(event => {
      if (!mounted) return;
      if (event.passed) {
        setCalibStatus(null);
      } else {
        setCalibStatus({ repsCompleted: event.repsCompleted, repsNeeded: event.repsNeeded });
      }
    });

    const setupSub = addSetupStatusListener(event => {
      if (!mounted) return;

      setSetupAllVisible(event.allJointsVisible);
      setSetupHoldProgress(event.holdProgress);

      // Debounce hint text so it doesn't flash when joints briefly disappear
      if (event.hint) {
        if (hintTimer.current) clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(() => {
          if (mounted) setSetupHint(event.hint);
        }, 400);
      } else {
        if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = null; }
        if (mounted) setSetupHint('');
      }

      if (event.passed) {
        if (!isTrackingRef.current) {
          // First calibration pass — auto-start tracking after brief "You're all set!"
          isTrackingRef.current = true;
          setPhase('setup-done');
          if (setupDoneTimer.current) clearTimeout(setupDoneTimer.current);
          setupDoneTimer.current = setTimeout(async () => {
            if (!mounted) return;
            setStats(null);
            setReps(0);
            setGoodReps(0);
            startTimestamp.current = Date.now();
            repEvents.current      = [];
            setPhase('tracking');
            await startTracking();
            setupDoneTimer.current = null;
          }, 1500);
        } else {
          // Re-passed after being lost during tracking — just resume display
          setPhase('tracking');
        }
      } else {
        // Not passed
        if (setupDoneTimer.current) {
          // Cancel any pending auto-start (user moved during setup-done phase)
          clearTimeout(setupDoneTimer.current);
          setupDoneTimer.current = null;
          isTrackingRef.current = false;
        }
        if (isTrackingRef.current) {
          // Setup lost during active workout (person left 3s) — show setup UI again
          setPhase('setup');
        }
      }
    });

    setPhase('starting');
    void setDiagnosticMode(true);
    startSession().then(result => {
      if (!mounted) return;
      if (!result.success) {
        setError(result.error ?? 'Camera failed to start. Check camera permission in Settings.');
        setPhase('idle');
      } else {
        // Set exercise early so SETUP phase uses the right requiredJoints.
        void setExercise(exerciseType);
      }
    });

    return () => {
      mounted = false;
      errSub.remove();
      camSub.remove();
      calibSub.remove();
      setupSub.remove();
      if (hintTimer.current)      { clearTimeout(hintTimer.current);      hintTimer.current = null; }
      if (setupDoneTimer.current) { clearTimeout(setupDoneTimer.current); setupDoneTimer.current = null; }
      if (!sessionStopped.current) void stopSession();
    };
  }, []);

  // ── Tracking listeners (only when actively tracking) ──────────────────────

  useEffect(() => {
    if (phase !== 'tracking') return;

    const repSub = addRepListener((rep: RepEvent) => {
      setReps(rep.reps);
      setGoodReps(rep.goodReps);
      flashAnim.setValue(1);
      Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: true }).start();
      const k = ++feedbackKey.current;
      setFeedback({ key: k, good: rep.good, reason: rep.reason });

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

  const handleStop = useCallback(async () => {
    setPhase('stopping');
    isTrackingRef.current = false;
    const final = await stopTracking();
    sessionStopped.current = true;
    await stopSession();
    if (final.videoUri) void logSessionVideo(final.videoUri);

    if (returnTo) {
      // Workout mode — return results to the run screen
      router.replace({
        pathname: returnTo as any,
        params:   {
          exerciseId: workoutExerciseId ?? exerciseType,
          reps:       String(final.reps),
          goodReps:   String(final.goodReps),
        },
      });
    } else {
      router.replace({
        pathname: '/recap',
        params:   {
          reps:     String(final.reps),
          goodReps: String(final.goodReps),
          videoUri: final.videoUri ?? '',
          events:   JSON.stringify(repEvents.current),
        },
      });
    }
  }, [router, returnTo, workoutExerciseId, exerciseType]);

  const handleFlip = useCallback(() => void flipCamera(), []);

  const handleBack = useCallback(async () => {
    sessionStopped.current = true;
    const wasTracking = isTrackingRef.current;
    isTrackingRef.current  = false;
    if (setupDoneTimer.current) { clearTimeout(setupDoneTimer.current); setupDoneTimer.current = null; }
    // Stop tracking first if active — ensures pendingStopPromise is resolved
    // before stopSession() tears everything down, preventing a dangling promise
    // that would leave the native module in a broken state for the next session.
    if (wasTracking) await stopTracking().catch(() => {});
    await stopSession();
    router.back();
  }, [router]);

  const isTracking = phase === 'tracking';
  const isStopping = phase === 'stopping';
  const showRepCounter = isStopping || isTracking;
  const needsReady = isTracking && stats != null && !stats.ready;

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

      {/* SETUP overlay — camera stays fully visible, guide + card at bottom */}
      {phase === 'setup' && (
        <View style={s.setupOverlay} pointerEvents="none">
          {/* Corner bracket framing guide */}
          <View style={s.bracketGuide}>
            <View style={[s.bc, s.bcTL, setupAllVisible ? s.bcGreen : s.bcDim]} />
            <View style={[s.bc, s.bcTR, setupAllVisible ? s.bcGreen : s.bcDim]} />
            <View style={[s.bc, s.bcBL, setupAllVisible ? s.bcGreen : s.bcDim]} />
            <View style={[s.bc, s.bcBR, setupAllVisible ? s.bcGreen : s.bcDim]} />
          </View>

          {/* Status + instruction panel at bottom */}
          <View style={s.setupPanel}>
            {/* Live status pill */}
            <View style={[s.statusPill, setupAllVisible && s.statusPillGood]}>
              <View style={[s.statusDot, setupAllVisible && s.statusDotGood]} />
              <Text style={[s.statusPillTxt, setupAllVisible && s.statusPillTxtGood]}>
                {setupAllVisible
                  ? 'In frame — hold still'
                  : (setupHint || 'Get your body in frame')}
              </Text>
            </View>

            {/* Instruction card */}
            <View style={s.setupCard}>
              <View style={s.setupRow}>
                <View style={s.setupIconWrap}>
                  <SymbolView
                    name={SETUP_INFO[exerciseType].icon as any}
                    size={16}
                    tintColor={C.text}
                    type="monochrome"
                    style={{ width: 16, height: 16 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.setupTitle}>{SETUP_INFO[exerciseType].title}</Text>
                  <Text style={s.setupSub}>{SETUP_INFO[exerciseType].sub}</Text>
                </View>
              </View>
              {setupAllVisible && (
                <View style={s.progressTrack}>
                  <View
                    style={[
                      s.progressFill,
                      { width: `${Math.round(setupHoldProgress * 100)}%` as any },
                    ]}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Calibration overlay — shown during tracking while engine runs CALIBRATION phase */}
      {isTracking && calibStatus !== null && (
        <View style={s.calibOverlay} pointerEvents="none">
          <View style={s.calibCard}>
            <Text style={s.calibTitle}>Calibrating to you</Text>
            <Text style={s.calibSub}>
              Do {calibStatus.repsNeeded} slow full reps
            </Text>
            <View style={s.calibDots}>
              {Array.from({ length: calibStatus.repsNeeded }).map((_, i) => (
                <View
                  key={i}
                  style={[s.calibDot, i < calibStatus.repsCompleted && s.calibDotDone]}
                />
              ))}
            </View>
          </View>
        </View>
      )}

      {/* "You're all set!" — brief success pill, no full scrim */}
      {phase === 'setup-done' && (
        <View style={s.setupDoneOverlay} pointerEvents="none">
          <View style={s.setupSuccessCard}>
            <SymbolView
              name="checkmark.circle.fill"
              size={32}
              tintColor={C.good}
              type="monochrome"
              style={{ width: 32, height: 32 }}
            />
            <Text style={s.setupSuccessText}>You're all set!</Text>
          </View>
        </View>
      )}

      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <GlassButton circular={40} onPress={handleBack}>
          <SymbolView name="chevron.left" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
        </GlassButton>
        <Text style={s.title}>
          {exerciseType === 'curl' ? 'Bicep Curl'
            : exerciseType === 'pushup' ? 'Push-up'
            : exerciseType === 'lunge'  ? 'Lunge'
            : 'Squat'} Form Check
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
      {showRepCounter && (
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

        {isTracking && (
          <GlassButton style={{ height: 56, width: 240 }} onPress={handleStop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SymbolView
                name="stop.fill"
                size={18}
                tintColor={C.warn}
                type="monochrome"
                style={{ width: 18, height: 18 }}
              />
              <Text style={[s.trackLabel, s.trackLabelStop]}>Stop</Text>
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

  // ── Setup overlay (SETUP phase) ───────────────────────────────────────────
  setupOverlay:     { ...StyleSheet.absoluteFillObject },
  setupDoneOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },

  // Corner bracket framing guide
  bracketGuide: {
    position: 'absolute',
    top: 88, left: 24, right: 24, bottom: 200,
  },
  bc: { position: 'absolute', width: 48, height: 48 },
  bcTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 5 },
  bcTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 5 },
  bcBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 5 },
  bcBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 5 },
  bcDim:   { borderColor: 'rgba(255,255,255,0.55)' },
  bcGreen: { borderColor: C.good },

  // Status pill + instruction panel (bottom of screen)
  setupPanel: {
    position:  'absolute',
    bottom:    100,
    left:      16,
    right:     16,
    gap:       10,
  },
  statusPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    alignSelf:         'center',
    paddingHorizontal: 16,
    paddingVertical:   9,
    borderRadius:      100,
    backgroundColor:   'rgba(14,15,18,0.78)',
    borderWidth:       StyleSheet.hairlineWidth,
    borderColor:       'rgba(255,255,255,0.14)',
  },
  statusPillGood: {
    backgroundColor: 'rgba(74,222,128,0.14)',
    borderColor:     'rgba(74,222,128,0.32)',
  },
  statusDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.muted,
  },
  statusDotGood: { backgroundColor: C.good },
  statusPillTxt: {
    fontSize: 13.5, fontWeight: '500', color: C.muted,
  },
  statusPillTxtGood: { color: C.good },
  setupCard: {
    backgroundColor:   'rgba(10,11,12,0.88)',
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.10)',
    padding:           20,
    gap:               14,
  },
  setupRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
  },
  setupIconWrap: {
    width:           34,
    height:          34,
    borderRadius:    10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  setupTitle: {
    fontSize:   16,
    fontWeight: '600',
    color:      C.text,
    lineHeight: 21,
  },
  setupSub: {
    fontSize:   13,
    fontWeight: '400',
    color:      C.muted,
    lineHeight: 18,
    marginTop:  2,
  },
  progressTrack: {
    height:          4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius:    2,
    overflow:        'hidden',
  },
  progressFill: {
    height:          4,
    backgroundColor: C.good,
    borderRadius:    2,
  },

  // ── Calibration overlay (shown during tracking while engine calibrates) ──
  calibOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems:     'center',
    paddingBottom:  160,
  },
  calibCard: {
    backgroundColor: 'rgba(10,11,12,0.92)',
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.12)',
    padding:         24,
    gap:             10,
    alignItems:      'center',
    minWidth:        270,
  },
  calibTitle: {
    fontSize:   17,
    fontWeight: '700',
    color:      C.text,
  },
  calibSub: {
    fontSize: 13,
    color:    C.muted,
  },
  calibDots: {
    flexDirection: 'row',
    gap:           10,
    marginTop:     4,
  },
  calibDot: {
    width:           14,
    height:          14,
    borderRadius:    7,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.25)',
  },
  calibDotDone: {
    backgroundColor: C.good,
    borderColor:     C.good,
  },

  // ── "You're all set!" card (no scrim) ────────────────────────────────────
  setupSuccessCard: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    paddingHorizontal: 28,
    paddingVertical:   18,
    backgroundColor:   'rgba(10,11,12,0.90)',
    borderRadius:      100,
    borderWidth:       1,
    borderColor:       'rgba(74,222,128,0.28)',
  },
  setupSuccessText: {
    fontSize:   18,
    fontWeight: '700',
    color:      C.good,
  },
});

const d = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', gap: 20, paddingVertical: 3 },
  key:     { fontSize: 11, color: C.dim },
  val:     { fontSize: 11, color: C.text },
  valGood: { color: C.good },
  valDim:  { color: '#444' },
});
