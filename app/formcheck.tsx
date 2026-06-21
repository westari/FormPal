import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
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

type Phase = 'idle' | 'starting' | 'ready' | 'tracking' | 'done';

export default function FormCheckScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [phase,    setPhase]    = useState<Phase>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [stats,    setStats]    = useState<DebugStatsEvent | null>(null);
  const [reps,     setReps]     = useState(0);
  const [goodReps, setGoodReps] = useState(0);
  const flashAnim  = useRef(new Animated.Value(0)).current;
  const notLinked  = !isNativeModuleLinked();

  // ── session lifecycle ───────────────────────────────────────────────────────

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

  // ── tracking listeners (only while tracking) ────────────────────────────────

  useEffect(() => {
    if (phase !== 'tracking') return;

    const repSub = addRepListener((rep: RepEvent) => {
      setReps(rep.reps);
      setGoodReps(rep.goodReps);
      flashAnim.setValue(1);
      Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: true }).start();
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

  // ── handlers ────────────────────────────────────────────────────────────────

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

  // ── derived ─────────────────────────────────────────────────────────────────

  const isTracking = phase === 'tracking';
  const canTrack   = phase === 'ready' || phase === 'done' || phase === 'tracking';

  return (
    <View style={s.root}>
      {/* Camera feed — fills whole screen */}
      <ATHLTCameraView style={StyleSheet.absoluteFill} />

      {/* Rep flash green overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: C.good, opacity: Animated.multiply(flashAnim, 0.15) },
        ]}
      />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <GlassButton circular={40} onPress={handleBack}>
          <SymbolView name="chevron.left" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
        </GlassButton>

        <Text style={s.title}>Form Check</Text>

        <GlassButton circular={40} onPress={handleFlip}>
          <SymbolView name="arrow.triangle.2.circlepath.camera.fill" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
        </GlassButton>
      </View>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* ── Rep counter ─────────────────────────────────────────────────── */}
      {(phase === 'tracking' || phase === 'done') && (
        <View style={s.repBlock}>
          <Animated.Text
            style={[
              s.repNum,
              {
                color: flashAnim.interpolate({
                  inputRange: [0, 1],
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

      {/* ── Debug stats overlay ─────────────────────────────────────────── */}
      {stats && phase === 'tracking' && (
        <View style={s.debugPanel}>
          <Row label="person"  value={stats.personDetected ? 'yes' : 'no'} good={stats.personDetected} />
          <Row label="knee°"   value={stats.kneeAngle.toFixed(1)} />
          <Row label="phase"   value={stats.phase} />
          <Row label="frames"  value={`${stats.totalFramesAnalyzed} / ${stats.totalFramesReceived}`} />
        </View>
      )}

      {/* ── Bottom controls ─────────────────────────────────────────────── */}
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

// ── Debug row ──────────────────────────────────────────────────────────────────

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

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  errorCard: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '38%',
    backgroundColor: C.glass,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  errorText: {
    color: C.warn,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  repBlock: {
    position: 'absolute',
    top: '18%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  repNum: {
    fontSize: 100,
    fontWeight: '700',
    lineHeight: 104,
    color: '#fff',
  },
  repSub: {
    fontSize: 15,
    color: C.muted,
    marginTop: 4,
  },
  debugPanel: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    backgroundColor: C.glass,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 210,
    borderWidth: 1,
    borderColor: C.border,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 24,
    gap: 12,
  },
  hint: {
    color: C.muted,
    fontSize: 13,
  },
  trackLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  trackLabelStop: {
    color: C.warn,
  },
});

const d = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
    paddingVertical: 3,
  },
  key: {
    fontSize: 11,
    color: C.dim,
  },
  val: {
    fontSize: 11,
    color: C.text,
  },
  valGood: { color: C.good },
  valDim:  { color: '#444' },
});
