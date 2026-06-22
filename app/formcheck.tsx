import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import GlassButton from '../components/GlassButton';
import {
  ATHLTCameraView,
  startSession,
  stopSession,
  startTracking,
  stopTracking,
  flipCamera,
  setDiagnosticMode,
  addRepListener,
  addDebugStatsListener,
  addCameraStateListener,
  addErrorListener,
  isNativeModuleLinked,
} from '../modules/athlt-camera/src/index';
import type { DebugStatsEvent, RepEvent } from '../modules/athlt-camera/src/index';

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

// ─── Rep feedback ─────────────────────────────────────────────────────────────
const FB_GOOD_FILL = '#15803D';
const FB_GOOD_RING = '#4ADE80';
const FB_BAD_FILL  = '#B91C1C';
const FB_BAD_RING  = '#F87171';

// SVG canvas: 200×200, filled disc r=72, sweep ring r=88
const SVG_SZ    = 200;
const SVG_C     = 100;
const DISC_R    = 72;
const RING_R    = 88;
const RING_CIRC = 2 * Math.PI * RING_R;
const PC        = 24;   // particle count — more bubbles, bigger celebration

const AnimatedSvgCircle = Animated.createAnimatedComponent(Circle);

function getCue(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes('shallow') || r.includes('deeper')) return 'GO DEEPER';
  if (r.includes('hip'))                              return 'SIT BACK';
  if (r.includes('form'))                             return 'FIX FORM';
  const clean = reason.replace(/[^a-zA-Z\s]/g, '').toUpperCase().slice(0, 12).trim();
  return clean || 'FIX FORM';
}

// Remounted via key prop on each new rep — animation state always starts fresh.
function RepFeedback({
  good,
  reason,
  onComplete,
}: {
  good: boolean;
  reason: string;
  onComplete: () => void;
}) {
  const fillColor = good ? FB_GOOD_FILL : FB_BAD_FILL;
  const ringColor = good ? FB_GOOD_RING : FB_BAD_RING;
  const mounted   = useRef(true);

  const masterOpacity = useRef(new Animated.Value(1)).current;
  const scaleAnim     = useRef(new Animated.Value(0)).current;
  const ringProgress  = useRef(new Animated.Value(0)).current;

  // Particle props frozen at mount; more of them, bigger, wider spread
  const particles = useRef(
    Array.from({ length: PC }, () => ({
      ty:     new Animated.Value(0),
      op:     new Animated.Value(0),
      startX: (Math.random() - 0.5) * 170,        // ±85 px spread
      size:   6 + Math.random() * 18,              // 6–24 px
      delay:  Math.random() * 450,
      dur:    700 + Math.random() * 450,
      rise:   -(100 + Math.random() * 140),        // 100–240 px upward
    }))
  ).current;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    mounted.current = true;

    // Badge pop-in
    Animated.spring(scaleAnim, {
      toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true,
    }).start();

    // Ring sweep (JS driver — SVG props not nativeDriver-compatible)
    Animated.timing(ringProgress, {
      toValue: 1, duration: 560, delay: 60, useNativeDriver: false,
    }).start();

    // Particles float up and fade
    particles.forEach(p => {
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.timing(p.ty, { toValue: p.rise, duration: p.dur, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(p.op, { toValue: 0.9,  duration: 120, useNativeDriver: true }),
            Animated.delay(Math.max(0, p.dur - 420)),
            Animated.timing(p.op, { toValue: 0,    duration: 300, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    });

    // Hold then fade entire overlay
    const hold = good ? 900 : 1100;
    Animated.sequence([
      Animated.delay(hold),
      Animated.timing(masterOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start(() => { if (mounted.current) onComplete(); });

    return () => { mounted.current = false; };
  }, []);

  const dashOffset = ringProgress.interpolate({
    inputRange: [0, 1], outputRange: [RING_CIRC, 0],
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, fb.overlay, { opacity: masterOpacity }]}
      pointerEvents="none"
    >
      {/* Particles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map((p, i) => (
          <View
            key={i}
            style={{
              position:   'absolute',
              left:       '50%',
              top:        '54%',
              marginLeft: p.startX - p.size / 2,
              marginTop:  -(p.size / 2),
            }}
          >
            <Animated.View
              style={{
                width:           p.size,
                height:          p.size,
                borderRadius:    p.size / 2,
                backgroundColor: ringColor,
                opacity:         p.op,
                transform:       [{ translateY: p.ty }],
              }}
            />
          </View>
        ))}
      </View>

      {/* Badge: disc + ring + icon */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
        <Svg width={SVG_SZ} height={SVG_SZ} viewBox={`0 0 ${SVG_SZ} ${SVG_SZ}`}>
          {/* Filled disc */}
          <Circle cx={SVG_C} cy={SVG_C} r={DISC_R} fill={fillColor} />

          {/* Track ring */}
          <Circle
            cx={SVG_C} cy={SVG_C} r={RING_R}
            fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={4}
          />
          {/* Animated sweep */}
          <AnimatedSvgCircle
            cx={SVG_C} cy={SVG_C} r={RING_R}
            fill="none"
            stroke={ringColor}
            strokeWidth={5}
            strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            originX={SVG_C}
            originY={SVG_C}
          />

          {good ? (
            // Thick, bold, rounded white checkmark — clearly visible from 6 ft
            <Path
              d="M 62 102 L 88 128 L 140 68"
              stroke="white"
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : (
            // Thick white X
            <>
              <Line x1={70} y1={70} x2={130} y2={130} stroke="white" strokeWidth={12} strokeLinecap="round" />
              <Line x1={130} y1={70} x2={70}  y2={130} stroke="white" strokeWidth={12} strokeLinecap="round" />
            </>
          )}
        </Svg>

        {!good && (
          <View style={fb.cuePill}>
            <Text style={fb.cueText}>{getCue(reason)}</Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const fb = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center' },
  cuePill: {
    marginTop:         16,
    paddingHorizontal: 26,
    paddingVertical:   11,
    borderRadius:      100,
    backgroundColor:   'rgba(0,0,0,0.55)',
    borderWidth:       StyleSheet.hairlineWidth,
    borderColor:       'rgba(255,255,255,0.22)',
  },
  cueText: {
    fontSize:         26,
    fontWeight:       '800',
    color:            'white',
    letterSpacing:    2,
    textAlign:        'center',
    textShadowColor:  'rgba(0,0,0,0.70)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase = 'idle' | 'starting' | 'ready' | 'tracking' | 'stopping';

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function FormCheckScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase,    setPhase]    = useState<Phase>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [stats,    setStats]    = useState<DebugStatsEvent | null>(null);
  const [reps,     setReps]     = useState(0);
  const [goodReps, setGoodReps] = useState(0);

  const [feedback, setFeedback] = useState<{ key: number; good: boolean; reason: string } | null>(null);
  const feedbackKey = useRef(0);
  const flashAnim   = useRef(new Animated.Value(0)).current;
  const notLinked   = !isNativeModuleLinked();

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
      setPhase('tracking');
      await startTracking();
    } else if (phase === 'tracking') {
      setPhase('stopping');
      const final = await stopTracking();
      // Stop the session before navigating so the cleanup doesn't double-stop
      sessionStopped.current = true;
      await stopSession();
      router.replace({
        pathname: '/recap',
        params: {
          reps:     String(final.reps),
          goodReps: String(final.goodReps),
          videoUri: final.videoUri ?? '',
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

  const isTracking = phase === 'tracking';
  const canTrack   = phase === 'ready' || phase === 'tracking';
  const isStopping = phase === 'stopping';

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
        <Text style={s.title}>Form Check</Text>
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

      {/* Rep counter */}
      {(phase === 'tracking' || phase === 'stopping') && (
        <View style={s.repBlock}>
          <Animated.Text
            style={[
              s.repNum,
              { color: flashAnim.interpolate({ inputRange: [0, 1], outputRange: ['#ffffff', C.good] }) },
            ]}
          >
            {reps}
          </Animated.Text>
          <Text style={s.repSub}>{goodReps} good</Text>
        </View>
      )}

      {/* Debug stats */}
      {stats && phase === 'tracking' && (
        <View style={s.debugPanel}>
          <Row label="person"  value={stats.personDetected ? 'yes' : 'no'} good={stats.personDetected} />
          <Row label="knee°"   value={stats.kneeAngle.toFixed(1)} />
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
  root:            { flex: 1, backgroundColor: '#000' },
  topBar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title:           { fontSize: 16, fontWeight: '600', color: C.text },
  errorCard:       { position: 'absolute', left: 24, right: 24, top: '38%', backgroundColor: C.glass, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border },
  errorText:       { color: C.warn, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  repBlock:        { position: 'absolute', top: '18%', left: 0, right: 0, alignItems: 'center' },
  repNum:          { fontSize: 100, fontWeight: '700', lineHeight: 104, color: '#fff' },
  repSub:          { fontSize: 15, color: C.muted, marginTop: 4 },
  debugPanel:      { position: 'absolute', bottom: 140, left: 16, backgroundColor: C.glass, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minWidth: 210, borderWidth: 1, borderColor: C.border },
  bottomBar:       { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 12, paddingHorizontal: 24, gap: 12 },
  hint:            { color: C.muted, fontSize: 13 },
  trackLabel:      { fontSize: 16, fontWeight: '600', color: C.text },
  trackLabelStop:  { color: C.warn },
});

const d = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', gap: 20, paddingVertical: 3 },
  key:     { fontSize: 11, color: C.dim },
  val:     { fontSize: 11, color: C.text },
  valGood: { color: C.good },
  valDim:  { color: '#444' },
});
