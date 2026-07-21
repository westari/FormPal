import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Pressable, ScrollView, Share,
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
  setExerciseDefinition,
  setExerciseStandard,
  addRepListener,
  addDebugStatsListener,
  addCameraStateListener,
  addErrorListener,
  addSetupStatusListener,
  addCalibrationStatusListener,
  addDebugLogListener,
  isNativeModuleLinked,
} from '../modules/athlt-camera/src/index';
import { EXERCISE_STANDARDS } from '../constants/exerciseStandards';
import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
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
  squat:             { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  curl:              { icon: 'camera.fill',          title: 'Face the camera',                  sub: 'Stand back — both arms and hands in view' },
  pushup:            { icon: 'iphone',               title: 'Phone on the floor, to your side', sub: 'Get in position — full body in frame' },
  lunge:             { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  shoulderPress:     { icon: 'camera.fill',          title: 'Face the camera',                  sub: 'Stand back — arms and shoulders in frame' },
  jumpingJack:       { icon: 'camera.fill',          title: 'Face the camera',                  sub: 'Full body in frame — arms and legs visible' },
  hammerCurl:        { icon: 'camera.fill',          title: 'Face the camera',                  sub: 'Stand back — both arms and hands in view' },
  concentrationCurl: { icon: 'camera.fill',          title: 'Face the camera',                  sub: 'Working arm and elbow clearly visible' },
  preacherCurl:      { icon: 'camera.fill',          title: 'Face the camera',                  sub: 'Both arms and elbows fully in frame' },
  reverseCurl:       { icon: 'camera.fill',          title: 'Face the camera',                  sub: 'Stand back — both arms and hands in view' },
  cableCurl:         { icon: 'camera.fill',          title: 'Face the cable machine',            sub: 'Stand back — both arms and hands in view' },
};

// ─── Debug log panel — set false to hide without removing code ────────────────
const DEBUG_LOG_ENABLED = true;

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase = 'idle' | 'starting' | 'setup' | 'setup-done' | 'tracking' | 'stopping' | 'review';

// ─── Rep summary parsed from [REP] log lines ─────────────────────────────────
// Format: [REP] #N top=X.X bottom=Y.Y swing=Z.Z ROM=ok/short cue=CUE
type RepSummary = { num: number; good: boolean; peak: string; cue: string };

function parseRepSummaries(lines: string[]): RepSummary[] {
  const result: RepSummary[] = [];
  for (const line of lines) {
    const m = line.match(/^\[REP\] #(\d+) .*?bottom=([-\d.]+) .*?cue=(.+)/);
    if (!m) continue;
    const cue = m[3].trim();
    result.push({ num: parseInt(m[1]), good: cue === 'GOOD', peak: m[2], cue });
  }
  return result;
}

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
  const exerciseType = ([
    'squat', 'curl', 'pushup', 'lunge', 'shoulderPress',
    'hammerCurl', 'concentrationCurl', 'preacherCurl', 'reverseCurl', 'cableCurl',
  ].includes(exercise) ? exercise : 'squat') as ExerciseType;

  const [phase,    setPhase]    = useState<Phase>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [stats,    setStats]    = useState<DebugStatsEvent | null>(null);
  const [reps,     setReps]     = useState(0);
  const [goodReps, setGoodReps] = useState(0);

  const [setupAllVisible,   setSetupAllVisible]   = useState(false);
  const [setupHoldProgress, setSetupHoldProgress] = useState(0);
  const [setupHint,         setSetupHint]         = useState('');

  const [calibStatus, setCalibStatus] = useState<{ repsCompleted: number; repsNeeded: number } | null>(null);

  const [feedback, setFeedback] = useState<{ key: number; good: boolean; reason: string } | null>(null);
  const feedbackKey    = useRef(0);
  const flashAnim      = useRef(new Animated.Value(0)).current;
  const notLinked      = !isNativeModuleLinked();

  const startTimestamp = useRef<number | null>(null);
  const repEvents      = useRef<{ timeSec: number; good: boolean; reason: string }[]>([]);
  const sessionStopped = useRef(false);
  const isTrackingRef  = useRef(false);
  const hintTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On-screen debug log panel (last ~25 lines)
  const [debugLogs,    setDebugLogs]    = useState<string[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const debugScrollRef = useRef<ScrollView | null>(null);

  // Full session log buffer — accumulates EVERY line for post-session review.
  // Not a state value; we never need it to trigger re-renders during the session.
  const sessionLogRef = useRef<string[]>([]);

  // Pending nav params stored right before switching to 'review' phase, so the
  // review's Done button can navigate with the correct final rep counts/videoUri.
  const pendingNavRef = useRef<{
    reps: number; goodReps: number; videoUri: string;
  } | null>(null);

  // Live push-up metric readout (elbow angle)
  const [liveMetric, setLiveMetric] = useState<{
    value: number; state: string; enter: number; exit: number; rom: number;
  } | null>(null);

  // ── Debug log listener ────────────────────────────────────────────────────

  useEffect(() => {
    if (!DEBUG_LOG_ENABLED || notLinked) return;
    const sub = addDebugLogListener(e => {
      console.log('[DEBUG]', e.message);
      // Rolling on-screen panel: last 25 lines
      setDebugLogs(prev => [...prev.slice(-24), e.message]);
      // Full session buffer: every line, no limit
      sessionLogRef.current.push(e.message);
      // Parse [METRIC] lines for live push-up readout
      if (e.message.startsWith('[METRIC]')) {
        const vMatch  = e.message.match(/value=([-\d.]+)/);
        const sMatch  = e.message.match(/state=(\w+)/);
        const enMatch = e.message.match(/enter=([-\d.]+)/);
        const exMatch = e.message.match(/exit=([-\d.]+)/);
        const romMatch = e.message.match(/rom=([-\d.]+)/);
        if (vMatch && sMatch) {
          setLiveMetric({
            value: parseFloat(vMatch[1]),
            state: sMatch[1],
            enter: enMatch  ? parseFloat(enMatch[1])  : 0,
            exit:  exMatch  ? parseFloat(exMatch[1])  : 0,
            rom:   romMatch ? parseFloat(romMatch[1]) : 0,
          });
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ── Session lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    if (notLinked) {
      setError('ATHLTCamera native module not linked.\nRun a dev build — Expo Go does not support this screen.');
      return;
    }

    let mounted = true;
    sessionStopped.current = false;
    isTrackingRef.current  = false;

    const errSub   = addErrorListener(e => { if (mounted) setError(e.message); });
    const camSub   = addCameraStateListener(e => {
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
          isTrackingRef.current = true;
          setPhase('setup-done');
          if (setupDoneTimer.current) clearTimeout(setupDoneTimer.current);
          setupDoneTimer.current = setTimeout(async () => {
            if (!mounted) return;
            setStats(null);
            setReps(0);
            setGoodReps(0);
            setLiveMetric(null);
            sessionLogRef.current = []; // clear buffer at start of each tracking session
            startTimestamp.current = Date.now();
            repEvents.current      = [];
            setPhase('tracking');
            await startTracking();
            setupDoneTimer.current = null;
          }, 1500);
        } else {
          setPhase('tracking');
        }
      } else {
        if (setupDoneTimer.current) {
          clearTimeout(setupDoneTimer.current);
          setupDoneTimer.current = null;
          isTrackingRef.current = false;
        }
        if (isTrackingRef.current) {
          setPhase('setup');
        }
      }
    });

    setPhase('starting');
    void setDiagnosticMode(true);
    startSession().then(async result => {
      if (!mounted) return;
      if (!result.success) {
        setError(result.error ?? 'Camera failed to start. Check camera permission in Settings.');
        setPhase('idle');
      } else {
        await setExercise(exerciseType);
        const defEntry = EXERCISE_DEFINITIONS[exerciseType] ?? null;
        const defMsg = `[DEF-LOOKUP] id=${exerciseType} found=${defEntry !== null ? 'yes' : 'no'}`;
        console.log(defMsg);
        if (DEBUG_LOG_ENABLED) setDebugLogs(prev => [...prev.slice(-24), defMsg]);
        if (DEBUG_LOG_ENABLED) sessionLogRef.current.push(defMsg);
        await setExerciseDefinition(defEntry);
        void setExerciseStandard(EXERCISE_STANDARDS[exerciseType] ?? null);
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

  // ── Tracking listeners ────────────────────────────────────────────────────

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
        ? (Date.now() - startTimestamp.current) / 1000 : 0;
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

  // Shared navigation logic — called either directly from handleStop (no log)
  // or from the review screen's Done button (after user reviewed the log).
  const doNavigate = useCallback((navParams: { reps: number; goodReps: number; videoUri: string }) => {
    if (returnTo) {
      router.replace({
        pathname: returnTo as any,
        params: {
          exerciseId: workoutExerciseId ?? exerciseType,
          reps:       String(navParams.reps),
          goodReps:   String(navParams.goodReps),
        },
      });
    } else {
      router.replace({
        pathname: '/recap',
        params: {
          reps:     String(navParams.reps),
          goodReps: String(navParams.goodReps),
          videoUri: navParams.videoUri,
          events:   JSON.stringify(repEvents.current),
        },
      });
    }
  }, [router, returnTo, workoutExerciseId, exerciseType]);

  const handleStop = useCallback(async () => {
    setPhase('stopping');
    isTrackingRef.current = false;
    const final = await stopTracking();
    sessionStopped.current = true;
    await stopSession();
    if (final.videoUri) void logSessionVideo(final.videoUri);

    const navParams = { reps: final.reps, goodReps: final.goodReps, videoUri: final.videoUri ?? '' };

    if (DEBUG_LOG_ENABLED && sessionLogRef.current.length > 0) {
      // Store nav params and show review; Done button will call doNavigate.
      pendingNavRef.current = navParams;
      setPhase('review');
    } else {
      doNavigate(navParams);
    }
  }, [doNavigate]);

  const handleReviewDone = useCallback(() => {
    if (pendingNavRef.current) doNavigate(pendingNavRef.current);
  }, [doNavigate]);

  const handleFlip = useCallback(() => void flipCamera(), []);

  const handleBack = useCallback(async () => {
    sessionStopped.current = true;
    const wasTracking = isTrackingRef.current;
    isTrackingRef.current  = false;
    if (setupDoneTimer.current) { clearTimeout(setupDoneTimer.current); setupDoneTimer.current = null; }
    if (wasTracking) await stopTracking().catch(() => {});
    await stopSession();
    router.back();
  }, [router]);

  const isTracking     = phase === 'tracking';
  const isStopping     = phase === 'stopping';
  const showRepCounter = isStopping || isTracking;
  const needsReady     = isTracking && stats != null && !stats.ready;
  const showPushupMetric = exerciseType === 'pushup' && isTracking && liveMetric != null;

  return (
    <View style={s.root}>
      <ATHLTCameraView style={StyleSheet.absoluteFill} />

      {/* Green flash on rep */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: C.good, opacity: Animated.multiply(flashAnim, 0.15) }]}
      />

      {/* Rep feedback badge */}
      {feedback && (
        <RepFeedback key={feedback.key} good={feedback.good} reason={feedback.reason} onComplete={() => setFeedback(null)} />
      )}

      {/* SETUP overlay */}
      {phase === 'setup' && (
        <View style={s.setupOverlay} pointerEvents="none">
          <View style={s.bracketGuide}>
            <View style={[s.bc, s.bcTL, setupAllVisible ? s.bcGreen : s.bcDim]} />
            <View style={[s.bc, s.bcTR, setupAllVisible ? s.bcGreen : s.bcDim]} />
            <View style={[s.bc, s.bcBL, setupAllVisible ? s.bcGreen : s.bcDim]} />
            <View style={[s.bc, s.bcBR, setupAllVisible ? s.bcGreen : s.bcDim]} />
          </View>
          <View style={s.setupPanel}>
            <View style={[s.statusPill, setupAllVisible && s.statusPillGood]}>
              <View style={[s.statusDot, setupAllVisible && s.statusDotGood]} />
              <Text style={[s.statusPillTxt, setupAllVisible && s.statusPillTxtGood]}>
                {setupAllVisible ? 'In frame — hold still' : (setupHint || 'Get your body in frame')}
              </Text>
            </View>
            <View style={s.setupCard}>
              <View style={s.setupRow}>
                <View style={s.setupIconWrap}>
                  <SymbolView name={SETUP_INFO[exerciseType].icon as any} size={16} tintColor={C.text} type="monochrome" style={{ width: 16, height: 16 }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.setupTitle}>{SETUP_INFO[exerciseType].title}</Text>
                  <Text style={s.setupSub}>{SETUP_INFO[exerciseType].sub}</Text>
                </View>
              </View>
              {setupAllVisible && (
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${Math.round(setupHoldProgress * 100)}%` as any }]} />
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Calibration overlay */}
      {isTracking && calibStatus !== null && (
        <View style={s.calibOverlay} pointerEvents="none">
          <View style={s.calibCard}>
            <Text style={s.calibTitle}>Calibrating to you</Text>
            <Text style={s.calibSub}>Do {calibStatus.repsNeeded} slow full reps</Text>
            <View style={s.calibDots}>
              {Array.from({ length: calibStatus.repsNeeded }).map((_, i) => (
                <View key={i} style={[s.calibDot, i < calibStatus.repsCompleted && s.calibDotDone]} />
              ))}
            </View>
          </View>
        </View>
      )}

      {/* "You're all set!" */}
      {phase === 'setup-done' && (
        <View style={s.setupDoneOverlay} pointerEvents="none">
          <View style={s.setupSuccessCard}>
            <SymbolView name="checkmark.circle.fill" size={32} tintColor={C.good} type="monochrome" style={{ width: 32, height: 32 }} />
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
          {exerciseType === 'curl'              ? 'Bicep Curl'
            : exerciseType === 'hammerCurl'        ? 'Hammer Curl'
            : exerciseType === 'concentrationCurl' ? 'Concentration Curl'
            : exerciseType === 'preacherCurl'      ? 'Preacher Curl'
            : exerciseType === 'reverseCurl'       ? 'Reverse Curl'
            : exerciseType === 'cableCurl'         ? 'Cable Curl'
            : exerciseType === 'pushup'            ? 'Push-up'
            : exerciseType === 'lunge'             ? 'Lunge'
            : exerciseType === 'shoulderPress'     ? 'Shoulder Press'
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

      {/* Ready gate hint */}
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

      {/* Live push-up elbow angle readout */}
      {showPushupMetric && (
        <View style={s.metricReadout} pointerEvents="none">
          <Text style={s.metricLabel}>ELBOW ANGLE</Text>
          <Text style={[s.metricValue, liveMetric!.state === 'down' && s.metricValueDown]}>
            {liveMetric!.value.toFixed(1)}°
          </Text>
          <Text style={[s.metricState, liveMetric!.state === 'down' && s.metricStateDown]}>
            {liveMetric!.state === 'down' ? '▼  IN REP' : liveMetric!.state === 'up' ? '▲  AT TOP' : '·  WAITING'}
          </Text>
          <Text style={s.metricThresh}>
            {'enter<'}{Math.round(liveMetric!.enter)}°{'  exit>'}{Math.round(liveMetric!.exit)}°
          </Text>
          <Text style={s.metricThresh}>good rom {'≤'} {Math.round(liveMetric!.rom)}°</Text>
        </View>
      )}

      {/* Live planarity hint */}
      {isTracking && !!stats?.outOfPlaneCue && (
        <View style={s.outOfPlaneHint} pointerEvents="none">
          <Text style={s.outOfPlaneText}>{stats.outOfPlaneCue}</Text>
        </View>
      )}

      {/* Debug stats */}
      {stats && isTracking && (
        <View style={s.debugPanel}>
          <Row label="person"  value={stats.personDetected ? 'yes' : 'no'} good={stats.personDetected} />
          <Row label="ready"   value={stats.ready ? 'yes' : 'no'} good={stats.ready} />
          <Row label={['curl','pushup','hammerCurl','concentrationCurl','preacherCurl','reverseCurl','cableCurl'].includes(exerciseType) ? 'elbow°' : 'knee°'} value={stats.kneeAngle.toFixed(1)} />
          <Row label="back°"   value={stats.backAngle.toFixed(1)} />
          <Row label="phase"   value={stats.phase} />
          <Row label="frames"  value={`${stats.totalFramesAnalyzed} / ${stats.totalFramesReceived}`} />
        </View>
      )}

      {/* Live debug log panel (last ~25 lines, shown during session) */}
      {DEBUG_LOG_ENABLED && phase !== 'review' && (
        <>
          {!showDebugLog && debugLogs.length > 0 && (
            <Pressable style={[s.dbgToggle, { top: insets.top + 58 }]} onPress={() => setShowDebugLog(true)}>
              <Text style={s.dbgToggleTxt}>DBG</Text>
            </Pressable>
          )}
          {showDebugLog && debugLogs.length > 0 && (
            <View style={[s.dbgPanel, { top: insets.top + 58 }]}>
              <View style={s.dbgHeader}>
                <Text style={s.dbgHeaderTxt}>LIVE LOG</Text>
                <Pressable onPress={() => Share.share({ message: debugLogs.join('\n') })}>
                  <Text style={s.dbgShare}>Share</Text>
                </Pressable>
                <Pressable onPress={() => setShowDebugLog(false)}>
                  <Text style={s.dbgClose}>✕</Text>
                </Pressable>
              </View>
              <ScrollView ref={debugScrollRef} style={s.dbgScroll}
                onContentSizeChange={() => debugScrollRef.current?.scrollToEnd({ animated: false })}>
                {debugLogs.map((msg, i) => (
                  <Text key={i} style={s.dbgMsg}>{msg}</Text>
                ))}
              </ScrollView>
            </View>
          )}
        </>
      )}

      {/* Bottom controls */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
        {phase === 'starting' && <Text style={s.hint}>Starting camera…</Text>}
        {isStopping          && <Text style={s.hint}>Saving session…</Text>}
        {isTracking && (
          <GlassButton style={{ height: 56, width: 240 }} onPress={handleStop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SymbolView name="stop.fill" size={18} tintColor={C.warn} type="monochrome" style={{ width: 18, height: 18 }} />
              <Text style={[s.trackLabel, s.trackLabelStop]}>Stop</Text>
            </View>
          </GlassButton>
        )}
      </View>

      {/* ── Post-session debug log review (phase === 'review') ──────────────── */}
      {/* Full-screen overlay, shown after Stop when DEBUG_LOG_ENABLED and log is non-empty. */}
      {/* The user can scroll through the entire session log, then tap Done to go to recap. */}
      {phase === 'review' && (
        <SessionLogReview
          log={sessionLogRef.current}
          reps={reps}
          goodReps={goodReps}
          exerciseType={exerciseType}
          insetTop={insets.top}
          insetBottom={insets.bottom}
          onDone={handleReviewDone}
        />
      )}
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

// ─── Session log review component ─────────────────────────────────────────────
//
// Shown after a set ends (phase === 'review'). Displays the full in-memory
// session log, grouped with [REP #N] lines highlighted so the user can scroll
// through at their own pace and see exactly what happened on each rep.
// The Share button exports the full log as text (readable on a computer).

function SessionLogReview({
  log, reps, goodReps, exerciseType, insetTop, insetBottom, onDone,
}: {
  log: string[];
  reps: number;
  goodReps: number;
  exerciseType: string;
  insetTop: number;
  insetBottom: number;
  onDone: () => void;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const repSummaries = parseRepSummaries(log);

  const shareLog = () => {
    const header = [
      '=== ATHLT Session Debug Log ===',
      `Exercise: ${exerciseType}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Reps: ${reps} total / ${goodReps} good`,
      '================================',
      '',
    ].join('\n');
    Share.share({ message: header + log.join('\n') });
  };

  return (
    <View style={[r.overlay, { paddingTop: insetTop, paddingBottom: insetBottom }]}>
      {/* Header */}
      <View style={r.header}>
        <View style={{ flex: 1 }}>
          <Text style={r.headerTitle}>SESSION LOG</Text>
          <Text style={r.headerSub}>{reps} reps · {goodReps} good · {log.length} lines</Text>
        </View>
        <Pressable style={r.shareBtn} onPress={shareLog}>
          <Text style={r.shareBtnTxt}>Share</Text>
        </Pressable>
        <Pressable style={r.doneBtn} onPress={onDone}>
          <Text style={r.doneBtnTxt}>Done</Text>
        </Pressable>
      </View>

      {/* Rep summary chips — one per [REP #N] found in the log */}
      {repSummaries.length > 0 && (
        <View style={r.repRow}>
          {repSummaries.map(rep => (
            <View key={rep.num} style={[r.repChip, rep.good ? r.repChipGood : r.repChipBad]}>
              <Text style={[r.repChipNum, rep.good ? r.repChipNumGood : r.repChipNumBad]}>
                #{rep.num} {rep.good ? '✓' : '✗'}
              </Text>
              <Text style={r.repChipPeak}>peak {rep.peak}</Text>
              {rep.cue ? <Text style={r.repChipCue} numberOfLines={1}>{rep.cue}</Text> : null}
            </View>
          ))}
        </View>
      )}

      {/* Divider */}
      <View style={r.divider} />

      {/* Full log — each line styled by type */}
      <ScrollView ref={scrollRef} style={r.scroll} contentContainerStyle={r.scrollContent}>
        {log.map((line, i) => {
          const type = logLineType(line);
          if (type === 'rep-good' || type === 'rep-bad') {
            return (
              <View key={i} style={r.repBlock}>
                <View style={r.repBlockDivider} />
                <Text style={type === 'rep-good' ? r.lineRepGood : r.lineRepBad}>{line}</Text>
              </View>
            );
          }
          return (
            <Text key={i} style={logLineStyle(type)}>{line}</Text>
          );
        })}
        {log.length === 0 && (
          <Text style={r.emptyTxt}>No log lines captured.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function logLineType(line: string): 'rep-good' | 'rep-bad' | 'metric' | 'gate' | 'univ' | 'dim' | 'normal' {
  // [REP] #N ... cue=GOOD  →  rep-good
  // [REP] #N ... cue=OTHER →  rep-bad
  // [REP] rejected ...      →  rep-bad
  if (line.startsWith('[REP]')) return line.includes('cue=GOOD') ? 'rep-good' : 'rep-bad';
  if (line.startsWith('[METRIC]')) return 'metric';
  if (line.startsWith('[GATE]'))   return 'gate';
  if (line.startsWith('[UNIV') || line.startsWith('[STD') || line.startsWith('[COMPARE') ||
      line.startsWith('[DEF') || line.startsWith('[CALIB')) return 'dim';
  return 'normal';
}

function logLineStyle(type: ReturnType<typeof logLineType>) {
  switch (type) {
    case 'metric':  return r.lineMetric;
    case 'gate':    return r.lineGate;
    case 'dim':     return r.lineDim;
    default:        return r.lineNormal;
  }
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
    fontSize: 14, fontWeight: '600', color: C.muted, backgroundColor: C.glass,
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, overflow: 'hidden',
  },
  outOfPlaneHint: { position: 'absolute', top: '43%', left: 0, right: 0, alignItems: 'center' },
  outOfPlaneText: {
    fontSize: 14, fontWeight: '600', color: C.warn, backgroundColor: 'rgba(10,11,12,0.80)',
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(251,146,60,0.35)', overflow: 'hidden',
  },
  repBlock:  { position: 'absolute', top: '18%', left: 0, right: 0, alignItems: 'center' },
  repNum:    { fontSize: 100, fontWeight: '700', lineHeight: 104, color: '#fff' },
  repSub:    { fontSize: 15, color: C.muted, marginTop: 4 },
  debugPanel: { position: 'absolute', bottom: 140, left: 16, backgroundColor: C.glass, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minWidth: 210, borderWidth: 1, borderColor: C.border },
  bottomBar:  { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 12, paddingHorizontal: 24, gap: 12 },
  hint:       { color: C.muted, fontSize: 13 },
  trackLabel:     { fontSize: 16, fontWeight: '600', color: C.text },
  trackLabelStop: { color: C.warn },

  // ── Live push-up metric readout ───────────────────────────────────────────
  metricReadout: {
    position: 'absolute', bottom: 160, left: 16,
    backgroundColor: 'rgba(0,0,0,0.86)', borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', minWidth: 148, gap: 3,
  },
  metricLabel:     { fontSize: 8, fontWeight: '700', color: C.dim, letterSpacing: 1.2, marginBottom: 2 },
  metricValue:     { fontFamily: 'Menlo', fontSize: 36, fontWeight: '700', color: C.text, lineHeight: 40 },
  metricValueDown: { color: C.good },
  metricState:     { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 4 },
  metricStateDown: { color: C.good },
  metricThresh:    { fontFamily: 'Menlo', fontSize: 8, color: C.dim, marginTop: 2 },

  // ── Setup overlay ─────────────────────────────────────────────────────────
  setupOverlay:     { ...StyleSheet.absoluteFillObject },
  setupDoneOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  bracketGuide:     { position: 'absolute', top: 88, left: 24, right: 24, bottom: 200 },
  bc:    { position: 'absolute', width: 48, height: 48 },
  bcTL:  { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 5 },
  bcTR:  { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 5 },
  bcBL:  { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 5 },
  bcBR:  { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 5 },
  bcDim:   { borderColor: 'rgba(255,255,255,0.55)' },
  bcGreen: { borderColor: C.good },
  setupPanel: { position: 'absolute', bottom: 100, left: 16, right: 16, gap: 10 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center',
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 100,
    backgroundColor: 'rgba(14,15,18,0.78)', borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  statusPillGood:    { backgroundColor: 'rgba(74,222,128,0.14)', borderColor: 'rgba(74,222,128,0.32)' },
  statusDot:         { width: 7, height: 7, borderRadius: 4, backgroundColor: C.muted },
  statusDotGood:     { backgroundColor: C.good },
  statusPillTxt:     { fontSize: 13.5, fontWeight: '500', color: C.muted },
  statusPillTxtGood: { color: C.good },
  setupCard: {
    backgroundColor: 'rgba(10,11,12,0.88)', borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)', padding: 20, gap: 14,
  },
  setupRow:     { flexDirection: 'row', alignItems: 'center', gap: 14 },
  setupIconWrap: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  setupTitle: { fontSize: 16, fontWeight: '600', color: C.text, lineHeight: 21 },
  setupSub:   { fontSize: 13, fontWeight: '400', color: C.muted, lineHeight: 18, marginTop: 2 },
  progressTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 4, backgroundColor: C.good, borderRadius: 2 },

  // ── Calibration overlay ───────────────────────────────────────────────────
  calibOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 160 },
  calibCard: {
    backgroundColor: 'rgba(10,11,12,0.92)', borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', padding: 24, gap: 10, alignItems: 'center', minWidth: 270,
  },
  calibTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  calibSub:   { fontSize: 13, color: C.muted },
  calibDots:  { flexDirection: 'row', gap: 10, marginTop: 4 },
  calibDot:     { width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  calibDotDone: { backgroundColor: C.good, borderColor: C.good },

  // ── Live debug log panel ──────────────────────────────────────────────────
  dbgPanel: {
    position: 'absolute', right: 8, width: 220, maxHeight: 260,
    backgroundColor: 'rgba(0,0,0,0.84)', borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.15)', overflow: 'hidden',
  },
  dbgHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  dbgHeaderTxt: { flex: 1, fontSize: 9, fontWeight: '700', color: '#9A9AA2', letterSpacing: 0.8 },
  dbgShare:     { fontSize: 10, color: '#67CEFF', paddingHorizontal: 3 },
  dbgClose:     { fontSize: 11, color: '#9A9AA2', paddingHorizontal: 3 },
  dbgScroll:    { maxHeight: 235, padding: 6 },
  dbgMsg:       { fontFamily: 'Menlo', fontSize: 8.5, color: '#C8C8CC', lineHeight: 13, marginBottom: 5 },
  dbgToggle: {
    position: 'absolute', right: 8, backgroundColor: 'rgba(0,0,0,0.60)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  dbgToggleTxt: { fontSize: 9, fontWeight: '700', color: '#9A9AA2', letterSpacing: 0.5 },

  // ── "You're all set!" card ────────────────────────────────────────────────
  setupSuccessCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 28, paddingVertical: 18, backgroundColor: 'rgba(10,11,12,0.90)',
    borderRadius: 100, borderWidth: 1, borderColor: 'rgba(74,222,128,0.28)',
  },
  setupSuccessText: { fontSize: 18, fontWeight: '700', color: C.good },
});

const d = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', gap: 20, paddingVertical: 3 },
  key:     { fontSize: 11, color: C.dim },
  val:     { fontSize: 11, color: C.text },
  valGood: { color: C.good },
  valDim:  { color: '#444' },
});

// ─── Session log review styles ─────────────────────────────────────────────────
const r = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080909',
    flexDirection: 'column',
  },

  // Header row: title + share + done
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  headerTitle: { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: 0.8 },
  headerSub:   { fontSize: 11, color: C.muted, marginTop: 1 },
  shareBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    backgroundColor: 'rgba(103,206,255,0.12)', borderWidth: 1,
    borderColor: 'rgba(103,206,255,0.28)',
  },
  shareBtnTxt: { fontSize: 13, fontWeight: '600', color: '#67CEFF' },
  doneBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.30)',
  },
  doneBtnTxt: { fontSize: 13, fontWeight: '600', color: C.good },

  // Rep summary chips
  repRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  repChip: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, minWidth: 72,
  },
  repChipGood:    { backgroundColor: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.25)' },
  repChipBad:     { backgroundColor: 'rgba(251,146,60,0.08)', borderColor: 'rgba(251,146,60,0.28)' },
  repChipNum:     { fontSize: 12, fontWeight: '700' },
  repChipNumGood: { color: C.good },
  repChipNumBad:  { color: C.warn },
  repChipPeak:    { fontFamily: 'Menlo', fontSize: 9, color: C.muted, marginTop: 2 },
  repChipCue:     { fontSize: 8.5, color: C.dim, marginTop: 1 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Full log scroll
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 1 },
  emptyTxt:      { fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 40 },

  // Per-line styles
  // [REP #N] lines get a visual separator + prominent text
  repBlock:        { marginTop: 10, marginBottom: 2 },
  repBlockDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginBottom: 5 },
  lineRepGood: {
    fontFamily: 'Menlo', fontSize: 10, fontWeight: '700',
    color: C.good, lineHeight: 15,
  },
  lineRepBad: {
    fontFamily: 'Menlo', fontSize: 10, fontWeight: '700',
    color: C.warn, lineHeight: 15,
  },
  // [METRIC] lines — the ones the user most wants to read
  lineMetric: {
    fontFamily: 'Menlo', fontSize: 9, color: '#C8C8CC', lineHeight: 14,
  },
  // [GATE] lines — useful but noisy; dim them
  lineGate: {
    fontFamily: 'Menlo', fontSize: 8, color: C.dim, lineHeight: 13,
  },
  // [UNIV] / [STD] / [DEF] / [CALIB] / [COMPARE] — secondary info
  lineDim: {
    fontFamily: 'Menlo', fontSize: 8.5, color: '#4A4A52', lineHeight: 13,
  },
  // Everything else
  lineNormal: {
    fontFamily: 'Menlo', fontSize: 9, color: C.muted, lineHeight: 14,
  },
});
