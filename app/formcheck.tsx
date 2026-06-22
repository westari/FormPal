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
// Good: dark green filled disc, lighter green ring sweep, white checkmark
const FB_GOOD_FILL = '#15803D';
const FB_GOOD_RING = '#4ADE80';
// Bad: dark red filled disc, lighter red ring sweep, white X
const FB_BAD_FILL  = '#B91C1C';
const FB_BAD_RING  = '#F87171';

// SVG layout: 200×200 canvas, filled disc r=72, sweep ring r=88
const SVG_SZ    = 200;
const SVG_C     = SVG_SZ / 2;   // 100
const DISC_R    = 72;
const RING_R    = 88;
const RING_CIRC = 2 * Math.PI * RING_R;
const PC        = 18;            // particle count

const AnimatedSvgCircle = Animated.createAnimatedComponent(Circle);

function getCue(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes('shallow') || r.includes('deeper')) return 'GO DEEPER';
  if (r.includes('hip'))                              return 'SIT BACK';
  if (r.includes('form'))                             return 'FIX FORM';
  const clean = reason.replace(/[^a-zA-Z\s]/g, '').toUpperCase().slice(0, 12).trim();
  return clean || 'FIX FORM';
}

// Remounted via key prop on each new rep — animation state always starts fresh
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

  // Random particle props frozen at mount time — bigger, more of them
  const particles = useRef(
    Array.from({ length: PC }, () => ({
      ty:     new Animated.Value(0),
      op:     new Animated.Value(0),
      startX: (Math.random() - 0.5) * 140,
      size:   5 + Math.random() * 14,        // 5–19 px
      delay:  Math.random() * 450,
      dur:    700 + Math.random() * 450,
      rise:   -(90 + Math.random() * 120),   // 90–210 px upward
    }))
  ).current;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    mounted.current = true;

    // Badge pop-in — spring with a slight overshoot
    Animated.spring(scaleAnim, {
      toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true,
    }).start();

    // Ring sweep (SVG property — JS driver only)
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
      {/* Particles rising up from the badge area */}
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

      {/* Badge (disc + ring + icon) scales in, text below for bad reps */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
        <Svg width={SVG_SZ} height={SVG_SZ} viewBox={`0 0 ${SVG_SZ} ${SVG_SZ}`}>
          {/* Filled solid disc — the main badge background */}
          <Circle cx={SVG_C} cy={SVG_C} r={DISC_R} fill={fillColor} />

          {/* Background track ring */}
          <Circle
            cx={SVG_C} cy={SVG_C} r={RING_R}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={4}
          />
          {/* Animated sweep ring */}
          <AnimatedSvgCircle
            cx={SVG_C} cy={SVG_C} r={RING_R}
            fill="none"
            stroke={ringColor}
            strokeWidth={4}
            strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            originX={SVG_C}
            originY={SVG_C}
          />

          {good ? (
            // Thick white checkmark — rounded ends and vertex
            <Path
              d={`M 67 100 L 88 122 L 134 72`}
              stroke="white"
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : (
            // Thick white X
            <>
              <Line
                x1={72} y1={72} x2={128} y2={128}
                stroke="white" strokeWidth={9} strokeLinecap="round"
              />
              <Line
                x1={128} y1={72} x2={72} y2={128}
                stroke="white" strokeWidth={9} strokeLinecap="round"
              />
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
  overlay: {
    alignItems:     'center',
    justifyContent: 'center',
  },
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
    fontSize:          26,
    fontWeight:        '800',
    color:             'white',
    letterSpacing:     2,
    textAlign:         'center',
    textShadowColor:   'rgba(0,0,0,0.70)',
    textShadowOffset:  { width: 0, height: 1 },
    textShadowRadius:  3,
  },
});

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase = 'idle' | 'starting' | 'ready' | 'tracking' | 'done';

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function FormCheckScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [phase,    setPhase]    = useState<Phase>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [stats,    setStats]    = useState<DebugStatsEvent | null>(null);
  const [reps,     setReps]     = useState(0);
  const [goodReps, setGoodReps] = useState(0);

  // Rep feedback overlay — key increment forces RepFeedback remount on each new rep
  const [feedback,  setFeedback]  = useState<{ key: number; good: boolean; reason: string } | null>(null);
  const feedbackKey = useRef(0);

  const flashAnim = useRef(new Animated.Value(0)).current;
  const notLinked = !isNativeModuleLinked();

  // ── Session lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    if (notLinked) {
      setError('ATHLTCamera native module not linked.\nRun a dev build — Expo Go does not support this screen.');
      return;
    }

    let mounted = true;

    const errSub = addErrorListener(e => {
      if (mounted) setError(e.message);
    });
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
      void stopSession();
    };
  }, []);

  // ── Tracking listeners ─────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'tracking') return;

    const repSub = addRepListener((rep: RepEvent) => {
      setReps(rep.reps);
      setGoodReps(rep.goodReps);
      // Quick green flash
      flashAnim.setValue(1);
      Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: true }).start();
      // New key remounts RepFeedback so animation always starts clean
      const k = ++feedbackKey.current;
      setFeedback({ key: k, good: rep.good, reason: rep.reason });
    });

    const dbgSub = addDebugStatsListener((e: DebugStatsEvent) => {
      setStats(e);
      setReps(e.reps);
      setGoodReps(e.goodReps);
    });

    return () => {
      repSub.remove();
      dbgSub.remove();
    };
  }, [phase]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStartStop = useCallback(async () => {
    if (phase === 'ready' || phase === 'done') {
      setStats(null);
      setReps(0);
      setGoodReps(0);
      setPhase('tracking');
      await startTracking();
    } else if (phase === 'tracking') {
      const final = await stopTracking();
      setReps(final.reps);
      setGoodReps(final.goodReps);
      setPhase('done');
    }
  }, [phase]);

  const handleFlip = useCallback(() => void flipCamera(), []);

  const handleBack = useCallback(async () => {
    await stopSession();
    router.back();
  }, [router]);

  const isTracking = phase === 'tracking';
  const canTrack   = phase === 'ready' || phase === 'done' || phase === 'tracking';

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
      {(phase === 'tracking' || phase === 'done') && (
        <View style={s.repBlock}>
          <Animated.Text
            style={[
              s.repNum,
              {
                color: flashAnim.interpolate({
                  inputRange:  [0, 1],
                  outputRange: ['#ffffff', C.good],
                }),
              },
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
        {phase === 'starting' && (
          <Text style={s.hint}>Starting camera…</Text>
        )}

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

        {phase === 'done' && (
          <Text style={s.hint}>Session ended · {reps} reps · {goodReps} good</Text>
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
      <Text style={[d.val, good === true && d.valGood, good === false && d.valDim]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingBottom:     8,
  },
  title: {
    fontSize:   16,
    fontWeight: '600',
    color:      C.text,
  },
  errorCard: {
    position:        'absolute',
    left:            24,
    right:           24,
    top:             '38%',
    backgroundColor: C.glass,
    borderRadius:    16,
    padding:         24,
    borderWidth:     1,
    borderColor:     C.border,
  },
  errorText: {
    color:      C.warn,
    fontSize:   14,
    lineHeight: 22,
    textAlign:  'center',
  },
  repBlock: {
    position:   'absolute',
    top:        '18%',
    left:       0,
    right:      0,
    alignItems: 'center',
  },
  repNum: {
    fontSize:   100,
    fontWeight: '700',
    lineHeight: 104,
    color:      '#fff',
  },
  repSub: {
    fontSize:  15,
    color:     C.muted,
    marginTop: 4,
  },
  debugPanel: {
    position:          'absolute',
    bottom:            140,
    left:              16,
    backgroundColor:   C.glass,
    borderRadius:      10,
    paddingVertical:   8,
    paddingHorizontal: 12,
    minWidth:          210,
    borderWidth:       1,
    borderColor:       C.border,
  },
  bottomBar: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    alignItems:        'center',
    paddingTop:        12,
    paddingHorizontal: 24,
    gap:               12,
  },
  hint: {
    color:    C.muted,
    fontSize: 13,
  },
  trackLabel: {
    fontSize:   16,
    fontWeight: '600',
    color:      C.text,
  },
  trackLabelStop: {
    color: C.warn,
  },
});

const d = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', gap: 20, paddingVertical: 3 },
  key:     { fontSize: 11, color: C.dim },
  val:     { fontSize: 11, color: C.text },
  valGood: { color: C.good },
  valDim:  { color: '#444' },
});
