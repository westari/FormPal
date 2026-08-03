/**
 * app/calibrate.tsx — CALIBRATION & VALIDATION developer tool.
 *
 * Learns exercise thresholds by watching real demonstrated reps instead of
 * hand-guessing them. Flow: pick an exercise → (if already calibrated) pick
 * new-calibration vs validate-drift → one "good reps" step, then one step per
 * form check pulled straight from that exercise's own definition → live
 * per-rep values with discard/retry → suggested threshold with accept/nudge →
 * summary → save (AsyncStorage override, applied live by formcheck.tsx) and/or
 * export as paste-able text for constants/exerciseDefinitions.ts.
 *
 * No native changes: setExerciseDefinition() already accepts a full JSON
 * definition the engine reads at runtime, so calibration mode just sends a
 * temporarily-loosened variant (all form checks enabled, enter/exit widened
 * near topAngle) and reads the engine's own existing [REP] debug log line.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Share, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import GlassButton from '../components/GlassButton';
import {
  ATHLTCameraView,
  startSession,
  stopSession,
  startTracking,
  stopTracking,
  setExercise,
  setExerciseDefinition,
  setDiagnosticMode,
  flipCamera,
  addDebugLogListener,
  addSetupStatusListener,
  addErrorListener,
  addCameraStateListener,
  isNativeModuleLinked,
} from '../modules/athlt-camera/src/index';
import type { ExerciseType } from '../modules/athlt-camera/src/index';
import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import type { ExerciseDefinitionDef, FormCheckDef } from '../constants/exerciseDefinitions';
import { parseRepLogLine, parseModuleRepMarker, type ParsedCalibRep } from '../lib/calibration/parseRepLog';
import {
  rejectOutliers, plausibleRangeForMetric, suggestRangeThresholds, suggestBoundary,
  type OutlierRejectionResult,
} from '../lib/calibration/stats';
import {
  getCalibration, getAllCalibrations, saveCalibration,
  type CalibrationRecord, type CalibratedOverride,
} from '../lib/calibration/store';

// ─── Palette (matches formcheck.tsx) ───────────────────────────────────────────
const C = {
  bg:     '#0A0B0C',
  glass:  'rgba(21,22,26,0.82)',
  text:   '#F0F0F2',
  muted:  '#9A9AA2',
  dim:    '#62626A',
  good:   '#4ADE80',
  warn:   '#FB923C',
  bad:    '#F87171',
  border: 'rgba(255,255,255,0.08)',
};

const DEFAULT_SAMPLE_SIZE = 5;
const MIN_SAMPLE_SIZE     = 3;
const MAX_SAMPLE_SIZE     = 8;

// ─── Step model ─────────────────────────────────────────────────────────────────

interface CalibStep {
  kind: 'good' | 'fault';
  check?: FormCheckDef;
  label: string;
  instruction: string;
}

function buildSteps(def: ExerciseDefinitionDef): CalibStep[] {
  const steps: CalibStep[] = [{
    kind: 'good',
    label: 'Good reps',
    instruction: 'Do clean, full reps with your best form and depth.',
  }];
  for (const check of def.formChecks) {
    steps.push({
      kind: 'fault',
      check,
      label: check.id.replace(/_/g, ' '),
      instruction:
        `Deliberately demonstrate the fault this check catches. ` +
        `In a real workout you'd see the cue "${check.cue}" when this happens — exaggerate it clearly.`,
    });
  }
  return steps;
}

// Temporarily loosens the definition so ANY real movement — good or a
// deliberately-demonstrated fault — completes a rep the engine will log with
// full data, regardless of the exercise's real (possibly still-wrong)
// thresholds. See file header + the plan discussion for why this needs no
// native change.
function buildCalibrationDefinition(base: ExerciseDefinitionDef): Record<string, unknown> {
  const { calibration, ...rest } = base;
  return {
    ...rest,
    repEnterThreshold: base.topAngle - 10,
    repExitThreshold:  base.topAngle - 5,
    formChecks: base.formChecks.map(c => ({ ...c, enabled: true })),
  };
}

interface GoodRepSample {
  repNum: number;
  top: number;
  bottom: number;
  checks: Record<string, number>;
}
interface FaultRepSample {
  repNum: number;
  value: number;
}

type Phase = 'pickExercise' | 'pickMode' | 'session' | 'summary' | 'driftReport';
type SessionSub = 'setup' | 'recording' | 'reviewing';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalibrateScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ exercise?: string }>();
  const notLinked = !isNativeModuleLinked();

  const [phase, setPhase] = useState<Phase>('pickExercise');
  const [exerciseId, setExerciseId] = useState<string | null>(
    params.exercise && params.exercise in EXERCISE_DEFINITIONS ? params.exercise : null,
  );
  const [existingRecord, setExistingRecord] = useState<CalibrationRecord | null>(null);
  const [validateMode, setValidateMode] = useState(false);
  const [sampleSize, setSampleSize] = useState(DEFAULT_SAMPLE_SIZE);

  const [calibList, setCalibList] = useState<Record<string, CalibrationRecord>>({});

  const def = exerciseId ? EXERCISE_DEFINITIONS[exerciseId] : null;
  const steps = useMemo(() => (def ? buildSteps(def) : []), [def]);

  const [stepIndex, setStepIndex] = useState(0);
  const [sessionSub, setSessionSub] = useState<SessionSub>('setup');
  const [notice, setNotice] = useState<string | null>(null);

  const [goodSamples, setGoodSamples] = useState<GoodRepSample[]>([]);
  const [faultSamples, setFaultSamples] = useState<Record<string, FaultRepSample[]>>({});

  // Accumulated across accepted steps — written to the store on final Save.
  const overridesRef = useRef<CalibratedOverride>({});
  const distributionsRef = useRef<CalibrationRecord['distributions']>({});

  const stepIndexRef = useRef(0);
  useEffect(() => { stepIndexRef.current = stepIndex; }, [stepIndex]);
  const lastUsableRepRef = useRef(0);

  const [error, setError] = useState<string | null>(null);
  const [setupHint, setSetupHint] = useState('');
  const [setupProgress, setSetupProgress] = useState(0);
  const [liveMetricValue, setLiveMetricValue] = useState<number | null>(null);
  const [liveMetricState, setLiveMetricState] = useState('');
  const isTrackingRef = useRef(false);
  const sessionStartedRef = useRef(false);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  // ── Load calibration status list for the picker ──────────────────────────
  useEffect(() => {
    if (phase !== 'pickExercise') return;
    getAllCalibrations().then(setCalibList).catch(() => {});
  }, [phase]);

  // ── Exercise chosen (from route param) — check existing calibration ──────
  useEffect(() => {
    if (!exerciseId) return;
    getCalibration(exerciseId).then(rec => {
      setExistingRecord(rec);
      setPhase(rec ? 'pickMode' : 'session');
    });
  }, [exerciseId]);

  // ── Camera session lifecycle (one continuous session for all steps) ──────
  // Mirrors formcheck.tsx's session lifecycle exactly: same startSession() (which
  // triggers the native camera-permission prompt), same setExercise/setExerciseDefinition
  // call order, same setDiagnosticMode(true), same listener set.
  useEffect(() => {
    if (phase !== 'session' || notLinked || !def || sessionStartedRef.current) return;
    sessionStartedRef.current = true;

    let mounted = true;
    isTrackingRef.current = false;
    // Clear any stale state from a previous session attempt (e.g. an earlier
    // camera error, or a leftover setup hint) — recalibrate/validate re-enter
    // this effect without unmounting the screen.
    setError(null);
    setSetupHint('');
    setSetupProgress(0);
    setLiveMetricValue(null);
    setLiveMetricState('');

    const errSub = addErrorListener(e => { if (mounted) setError(e.message); });
    const camSub = addCameraStateListener(() => {});
    const setupSub = addSetupStatusListener(event => {
      if (!mounted) return;
      setSetupProgress(event.holdProgress);
      setSetupHint(event.hint);
      if (event.passed && !isTrackingRef.current) {
        isTrackingRef.current = true;
        setTimeout(async () => {
          if (!mounted) return;
          await startTracking();
          setSessionSub('recording');
        }, 400);
      }
    });
    const logSub = addDebugLogListener(e => {
      const line = e.message;
      // Live primary-metric readout — same [METRIC] line formcheck.tsx parses
      // for its push-up elbow-angle readout, generalized to any exercise.
      if (line.startsWith('[METRIC]')) {
        const vMatch = line.match(/value=([-\d.]+)/);
        const sMatch = line.match(/state=(\w+)/);
        if (vMatch) setLiveMetricValue(parseFloat(vMatch[1]));
        if (sMatch) setLiveMetricState(sMatch[1]);
        return;
      }
      const parsed = parseRepLogLine(line);
      if (parsed) {
        lastUsableRepRef.current = parsed.repNum;
        handleUsableRep(parsed);
        return;
      }
      const moduleRepNum = parseModuleRepMarker(line);
      if (moduleRepNum !== null && moduleRepNum !== lastUsableRepRef.current) {
        showNotice(`Rep #${moduleRepNum} discarded automatically — low confidence, redo it`);
      }
    });

    setSessionSub('setup');
    void setDiagnosticMode(true);
    startSession().then(async result => {
      if (!mounted) return;
      if (!result.success) {
        setError(result.error ?? 'Camera failed to start. Check camera permission in Settings.');
        return;
      }
      await setExercise(exerciseId as ExerciseType);
      await setExerciseDefinition(buildCalibrationDefinition(def));
    });

    return () => {
      mounted = false;
      errSub.remove();
      camSub.remove();
      setupSub.remove();
      logSub.remove();
      void stopTracking().catch(() => {});
      void stopSession();
      sessionStartedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, exerciseId]);

  const handleFlip = useCallback(() => void flipCamera(), []);

  const handleUsableRep = useCallback((parsed: ParsedCalibRep) => {
    const step = stepsForClosureRef.current[stepIndexRef.current];
    if (!step) return;
    if (step.kind === 'good') {
      const checks: Record<string, number> = {};
      for (const [id, c] of Object.entries(parsed.checks)) checks[id] = c.value;
      setGoodSamples(prev => [...prev, { repNum: parsed.repNum, top: parsed.top, bottom: parsed.bottom, checks }]);
    } else if (step.check) {
      const c = parsed.checks[step.check.id];
      if (!c) {
        showNotice('Rep recorded but this check wasn’t measurable — low joint confidence, redo it');
        return;
      }
      setFaultSamples(prev => ({
        ...prev,
        [step.check!.id]: [...(prev[step.check!.id] ?? []), { repNum: parsed.repNum, value: c.value }],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNotice]);

  // steps is recomputed via useMemo above but handleUsableRep is defined before
  // `steps` would be stable across renders anyway (same `def` object identity) —
  // kept as a ref purely so the debug-log listener (subscribed once) always
  // reads the latest steps array without needing to resubscribe.
  const stepsForClosureRef = useRef<CalibStep[]>([]);
  useEffect(() => { stepsForClosureRef.current = steps; }, [steps]);

  // ── Discard a single recorded rep (user-initiated) ────────────────────────
  const discardGoodSample = (repNum: number) => setGoodSamples(prev => prev.filter(s => s.repNum !== repNum));
  const discardFaultSample = (checkId: string, repNum: number) =>
    setFaultSamples(prev => ({ ...prev, [checkId]: (prev[checkId] ?? []).filter(s => s.repNum !== repNum) }));

  const currentStep = steps[stepIndex] as CalibStep | undefined;
  const currentSampleCount = currentStep
    ? (currentStep.kind === 'good' ? goodSamples.length : (faultSamples[currentStep.check!.id]?.length ?? 0))
    : 0;

  // ── Advance / accept / redo ───────────────────────────────────────────────

  const goToNextStep = useCallback(() => {
    setSessionSub('recording');
    if (stepIndex + 1 >= steps.length) {
      finishSession('summary');
    } else {
      setStepIndex(i => i + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, steps.length]);

  const finishSession = useCallback((next: Phase) => {
    isTrackingRef.current = false;
    void stopTracking().catch(() => {});
    void stopSession();
    sessionStartedRef.current = false;
    setPhase(next);
  }, []);

  const acceptGoodStep = (range: ReturnType<typeof suggestRangeThresholds>) => {
    overridesRef.current.topAngle          = range.topAngle;
    overridesRef.current.repEnterThreshold = range.repEnterThreshold;
    overridesRef.current.repExitThreshold  = range.repExitThreshold;
    overridesRef.current.goodROMThreshold  = range.goodROMThreshold;
    distributionsRef.current.goodTop    = rejectOutliers(goodSamples.map(s => s.top), plausibleRangeForMetric(def!.repMetric)).kept;
    distributionsRef.current.goodBottom = rejectOutliers(goodSamples.map(s => s.bottom), plausibleRangeForMetric(def!.repMetric)).kept;
    if (validateMode) {
      finishSession('driftReport');
    } else {
      goToNextStep();
    }
  };

  const acceptFaultStep = (checkId: string, value: number, enabled: boolean) => {
    overridesRef.current.formCheckLimits = { ...(overridesRef.current.formCheckLimits ?? {}), [checkId]: value };
    const base = def!.formChecks.find(c => c.id === checkId)!;
    if (enabled !== base.enabled) {
      overridesRef.current.formCheckEnabled = { ...(overridesRef.current.formCheckEnabled ?? {}), [checkId]: enabled };
    }
    const range = plausibleRangeForMetric(base.metric);
    const goodVals = goodSamples.map(s => s.checks[checkId]).filter((v): v is number => v !== undefined);
    const faultVals = (faultSamples[checkId] ?? []).map(s => s.value);
    distributionsRef.current.formChecks = {
      ...(distributionsRef.current.formChecks ?? {}),
      [checkId]: {
        good:  rejectOutliers(goodVals, range).kept,
        fault: rejectOutliers(faultVals, range).kept,
      },
    };
    goToNextStep();
  };

  const skipFaultStep = () => goToNextStep();

  const redoStep = () => {
    if (!currentStep) return;
    if (currentStep.kind === 'good') setGoodSamples([]);
    else setFaultSamples(prev => ({ ...prev, [currentStep.check!.id]: [] }));
    setSessionSub('recording');
  };

  // ── Save / export ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!exerciseId) return;
    const record: CalibrationRecord = {
      exerciseId,
      calibratedAt: Date.now(),
      sampleSize,
      overrides: overridesRef.current,
      distributions: distributionsRef.current,
    };
    await saveCalibration(record);
    showNotice('Calibration saved — takes effect next time you start this exercise.');
  };

  const handleExport = () => {
    if (!def || !exerciseId) return;
    const o = overridesRef.current;
    const lines: string[] = [];
    lines.push(`// ${exerciseId} — calibrated ${new Date().toLocaleDateString()}, ${sampleSize} reps/step`);
    if (o.topAngle          !== undefined) lines.push(`topAngle:           ${o.topAngle},   // was ${def.topAngle}`);
    if (o.repEnterThreshold !== undefined) lines.push(`repEnterThreshold:  ${o.repEnterThreshold},   // was ${def.repEnterThreshold}`);
    if (o.repExitThreshold  !== undefined) lines.push(`repExitThreshold:   ${o.repExitThreshold},   // was ${def.repExitThreshold}`);
    if (o.goodROMThreshold  !== undefined) lines.push(`goodROMThreshold:   ${o.goodROMThreshold},   // was ${def.goodROMThreshold}`);
    if (o.formCheckLimits) {
      lines.push('// form check limits (update condition.value on the matching check):');
      for (const [id, val] of Object.entries(o.formCheckLimits)) {
        const base = def.formChecks.find(c => c.id === id);
        lines.push(`  ${id}: condition.value = ${val},   // was ${base?.condition.value ?? 'n/a'}`);
      }
    }
    if (o.formCheckEnabled) {
      for (const [id, en] of Object.entries(o.formCheckEnabled)) {
        lines.push(`  ${id}: enabled = ${en}`);
      }
    }
    Share.share({ message: lines.join('\n') });
  };

  const handleBack = async () => {
    if (phase === 'session') { isTrackingRef.current = false; await stopTracking().catch(() => {}); await stopSession(); }
    router.back();
  };

  // ── Render: not linked ────────────────────────────────────────────────────
  if (notLinked) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 40 }]}>
        <Text style={s.errorText}>ATHLTCamera native module not linked.{'\n'}Run a dev build — Expo Go does not support this screen.</Text>
        <GlassButton style={{ marginTop: 24, paddingHorizontal: 24, paddingVertical: 12 }} onPress={() => router.back()}>
          <Text style={s.buttonTxt}>Back</Text>
        </GlassButton>
      </View>
    );
  }

  // ── Render: exercise picker ───────────────────────────────────────────────
  if (phase === 'pickExercise') {
    return (
      <View style={[s.root, { paddingTop: insets.top + 16 }]}>
        <Text style={s.h1}>Calibrate an Exercise</Text>
        <Text style={s.subtitle}>Pick an exercise — you'll demonstrate a few reps and the tool learns the thresholds.</Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {Object.keys(EXERCISE_DEFINITIONS).map(id => {
            const rec = calibList[id];
            return (
              <Pressable
                key={id}
                style={s.pickRow}
                onPress={() => { setExerciseId(id); setStepIndex(0); setGoodSamples([]); setFaultSamples({}); overridesRef.current = {}; distributionsRef.current = {}; setValidateMode(false); }}
              >
                <Text style={s.pickRowLabel}>{EXERCISE_DEFINITIONS[id].displayName}</Text>
                <Text style={rec ? s.pickRowBadgeGood : s.pickRowBadgeDim}>
                  {rec ? `Calibrated ${new Date(rec.calibratedAt).toLocaleDateString()}` : 'Not calibrated'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <GlassButton style={{ marginHorizontal: 16, marginBottom: insets.bottom + 12, paddingVertical: 14 }} onPress={() => router.back()}>
          <Text style={s.buttonTxt}>Close</Text>
        </GlassButton>
      </View>
    );
  }

  // ── Render: new-vs-validate picker ─────────────────────────────────────────
  if (phase === 'pickMode' && def && existingRecord) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 40, justifyContent: 'center', paddingHorizontal: 24 }]}>
        <Text style={s.h1}>{def.displayName}</Text>
        <Text style={s.subtitle}>Already calibrated {new Date(existingRecord.calibratedAt).toLocaleDateString()} ({existingRecord.sampleSize} reps/step).</Text>
        <GlassButton style={s.wideBtn} onPress={() => { setValidateMode(true); setStepIndex(0); setGoodSamples([]); setFaultSamples({}); setSessionSub('setup'); setPhase('session'); }}>
          <Text style={s.buttonTxt}>Validate — check for drift</Text>
        </GlassButton>
        <GlassButton style={s.wideBtn} onPress={() => { setValidateMode(false); setStepIndex(0); setGoodSamples([]); setFaultSamples({}); overridesRef.current = {}; distributionsRef.current = {}; setSessionSub('setup'); setPhase('session'); }}>
          <Text style={s.buttonTxt}>Recalibrate from scratch</Text>
        </GlassButton>
        <GlassButton style={s.wideBtn} onPress={() => router.back()}>
          <Text style={s.buttonTxt}>Cancel</Text>
        </GlassButton>
      </View>
    );
  }

  // ── Render: drift report (validate mode result) ───────────────────────────
  if (phase === 'driftReport' && def && existingRecord) {
    const bottoms = rejectOutliers(goodSamples.map(s => s.bottom), plausibleRangeForMetric(def.repMetric));
    const tops    = rejectOutliers(goodSamples.map(s => s.top),    plausibleRangeForMetric(def.repMetric));
    const storedROM   = existingRecord.overrides.goodROMThreshold  ?? def.goodROMThreshold;
    const storedEnter  = existingRecord.overrides.repEnterThreshold ?? def.repEnterThreshold;
    const newROM = Math.round(bottoms.median);
    const romDrift = newROM - storedROM;
    const driftFlag = Math.abs(romDrift) >= 5;
    return (
      <View style={[s.root, { paddingTop: insets.top + 24, paddingHorizontal: 20 }]}>
        <Text style={s.h1}>Drift check — {def.displayName}</Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={s.reportCard}>
            <Text style={s.reportLabel}>goodROMThreshold</Text>
            <Text style={s.reportBig}>{storedROM}° stored → {newROM}° now</Text>
            <Text style={[s.reportNote, driftFlag ? s.reportNoteWarn : s.reportNoteGood]}>
              {driftFlag
                ? `${Math.abs(romDrift)}° ${romDrift > 0 ? 'stricter' : 'looser'} than what's set — your good reps now bottom out at ~${newROM}°. Consider recalibrating.`
                : 'No meaningful drift — current setting still matches your reps.'}
            </Text>
          </View>
          <View style={s.reportCard}>
            <Text style={s.reportLabel}>Rest / top position (median)</Text>
            <Text style={s.reportBig}>{tops.median.toFixed(1)}°</Text>
          </View>
          <Text style={s.subtitle}>Kept {bottoms.kept.length}/{goodSamples.length} reps ({bottoms.rejected.length} outlier(s) rejected).</Text>
        </ScrollView>
        <GlassButton style={s.wideBtn} onPress={() => { setValidateMode(false); setStepIndex(0); setGoodSamples([]); setFaultSamples({}); overridesRef.current = {}; distributionsRef.current = {}; setSessionSub('setup'); setPhase('session'); }}>
          <Text style={s.buttonTxt}>Recalibrate everything</Text>
        </GlassButton>
        <GlassButton style={s.wideBtn} onPress={() => router.back()}>
          <Text style={s.buttonTxt}>Done</Text>
        </GlassButton>
      </View>
    );
  }

  // ── Render: summary (full calibration accepted) ───────────────────────────
  if (phase === 'summary' && def && exerciseId) {
    const o = overridesRef.current;
    return (
      <View style={[s.root, { paddingTop: insets.top + 24, paddingHorizontal: 20 }]}>
        <Text style={s.h1}>Review — {def.displayName}</Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={s.reportCard}>
            <Text style={s.reportLabel}>Rep range</Text>
            <Text style={s.reportBig}>top {o.topAngle}° · enter {o.repEnterThreshold}° · exit {o.repExitThreshold}° · goodROM {o.goodROMThreshold}°</Text>
          </View>
          {o.formCheckLimits && Object.entries(o.formCheckLimits).map(([id, val]) => (
            <View style={s.reportCard} key={id}>
              <Text style={s.reportLabel}>{id.replace(/_/g, ' ')}</Text>
              <Text style={s.reportBig}>limit → {val}</Text>
            </View>
          ))}
        </ScrollView>
        <GlassButton style={s.wideBtn} onPress={handleSave}>
          <Text style={s.buttonTxt}>Save Calibration</Text>
        </GlassButton>
        <GlassButton style={s.wideBtn} onPress={handleExport}>
          <Text style={s.buttonTxt}>Export as Text</Text>
        </GlassButton>
        <GlassButton style={s.wideBtn} onPress={() => router.back()}>
          <Text style={s.buttonTxt}>Done</Text>
        </GlassButton>
        {notice && <Text style={s.noticeTxt}>{notice}</Text>}
      </View>
    );
  }

  // ── Render: session (camera running) ──────────────────────────────────────
  if (phase === 'session' && def && currentStep) {
    return (
      <View style={s.root}>
        <ATHLTCameraView style={StyleSheet.absoluteFill} />
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <GlassButton circular={40} onPress={handleBack}>
            <SymbolView name="chevron.left" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
          </GlassButton>
          <Text style={s.stepCounter}>{validateMode ? 'Validate' : `Step ${stepIndex + 1}/${steps.length}`}</Text>
          <GlassButton circular={40} onPress={handleFlip}>
            <SymbolView name="arrow.triangle.2.circlepath.camera.fill" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
          </GlassButton>
        </View>

        {error && <View style={s.errorCard}><Text style={s.errorText}>{error}</Text></View>}

        {sessionSub === 'setup' && (
          <View style={s.setupOverlay}>
            <Text style={s.setupTitle}>Get in frame</Text>
            <Text style={s.setupHint}>{setupHint || 'Hold still while the camera finds you'}</Text>
            <View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.round(setupProgress * 100)}%` as any }]} /></View>
          </View>
        )}

        {sessionSub === 'recording' && (
          <RecordingView
            step={currentStep}
            sampleSize={sampleSize}
            setSampleSize={setSampleSize}
            goodSamples={goodSamples}
            faultSamples={currentStep.kind === 'fault' ? (faultSamples[currentStep.check!.id] ?? []) : []}
            liveMetricValue={liveMetricValue}
            liveMetricState={liveMetricState}
            onDiscardGood={discardGoodSample}
            onDiscardFault={(repNum) => discardFaultSample(currentStep.check!.id, repNum)}
            onCompute={() => setSessionSub('reviewing')}
            onSkip={currentStep.kind === 'fault' ? skipFaultStep : undefined}
            insetBottom={insets.bottom}
          />
        )}

        {sessionSub === 'reviewing' && def && (
          <ReviewView
            key={stepIndex}
            def={def}
            step={currentStep}
            goodSamples={goodSamples}
            faultSamples={currentStep.kind === 'fault' ? (faultSamples[currentStep.check!.id] ?? []) : []}
            onAcceptGood={acceptGoodStep}
            onAcceptFault={acceptFaultStep}
            onRedo={redoStep}
            insetBottom={insets.bottom}
          />
        )}

        {notice && <Text style={[s.noticeTxt, { top: insets.top + 60 }]}>{notice}</Text>}
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 40, alignItems: 'center' }]}>
      <ActivityIndicator color={C.text} />
    </View>
  );
}

// ─── Recording sub-view ─────────────────────────────────────────────────────────

function RecordingView({
  step, sampleSize, setSampleSize, goodSamples, faultSamples, liveMetricValue, liveMetricState,
  onDiscardGood, onDiscardFault, onCompute, onSkip, insetBottom,
}: {
  step: CalibStep;
  sampleSize: number;
  setSampleSize: (n: number) => void;
  goodSamples: GoodRepSample[];
  faultSamples: FaultRepSample[];
  liveMetricValue: number | null;
  liveMetricState: string;
  onDiscardGood: (repNum: number) => void;
  onDiscardFault: (repNum: number) => void;
  onCompute: () => void;
  onSkip?: () => void;
  insetBottom: number;
}) {
  const count = step.kind === 'good' ? goodSamples.length : faultSamples.length;
  const canCompute = count >= MIN_SAMPLE_SIZE;

  return (
    <View style={[s.recordingWrap, { paddingBottom: insetBottom + 20 }]}>
      {liveMetricValue !== null && (
        <View style={s.liveMetricBox} pointerEvents="none">
          <Text style={s.liveMetricLabel}>LIVE</Text>
          <Text style={s.liveMetricValue}>{liveMetricValue.toFixed(1)}°</Text>
          <Text style={s.liveMetricState}>{liveMetricState || '·'}</Text>
        </View>
      )}

      <View style={s.instructionCard}>
        <Text style={s.instructionLabel}>{step.kind === 'good' ? 'GOOD REPS' : `FAULT: ${step.label.toUpperCase()}`}</Text>
        <Text style={s.instructionTxt}>{step.instruction}</Text>
        <View style={s.sampleSizeRow}>
          <Text style={s.sampleSizeLabel}>Target reps:</Text>
          <Pressable onPress={() => setSampleSize(Math.max(MIN_SAMPLE_SIZE, sampleSize - 1))}><Text style={s.stepperBtn}>−</Text></Pressable>
          <Text style={s.sampleSizeValue}>{sampleSize}</Text>
          <Pressable onPress={() => setSampleSize(Math.min(MAX_SAMPLE_SIZE, sampleSize + 1))}><Text style={s.stepperBtn}>+</Text></Pressable>
        </View>
      </View>

      <Text style={s.countTxt}>{count} / {sampleSize} recorded</Text>

      <ScrollView horizontal style={s.repCardRow} contentContainerStyle={{ gap: 10, paddingHorizontal: 4 }}>
        {step.kind === 'good' ? goodSamples.map(sample => (
          <View style={s.repCard} key={sample.repNum}>
            <Text style={s.repCardNum}>#{sample.repNum}</Text>
            <Text style={s.repCardVal}>{sample.bottom.toFixed(0)}°</Text>
            <Text style={s.repCardSub}>top {sample.top.toFixed(0)}°</Text>
            <Pressable onPress={() => onDiscardGood(sample.repNum)}><Text style={s.repCardDiscard}>✕ discard</Text></Pressable>
          </View>
        )) : faultSamples.map(sample => (
          <View style={s.repCard} key={sample.repNum}>
            <Text style={s.repCardNum}>#{sample.repNum}</Text>
            <Text style={s.repCardVal}>{sample.value.toFixed(0)}°</Text>
            <Pressable onPress={() => onDiscardFault(sample.repNum)}><Text style={s.repCardDiscard}>✕ discard</Text></Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={s.recordingBtnRow}>
        {onSkip && (
          <GlassButton style={s.halfBtn} onPress={onSkip}>
            <Text style={s.buttonTxtSmall}>Skip this check</Text>
          </GlassButton>
        )}
        <GlassButton style={canCompute ? s.halfBtn : { ...s.halfBtn, ...s.btnDisabled }} onPress={canCompute ? onCompute : undefined}>
          <Text style={s.buttonTxtSmall}>{canCompute ? 'Compute suggestion' : `Need ${MIN_SAMPLE_SIZE - count} more`}</Text>
        </GlassButton>
      </View>
    </View>
  );
}

// ─── Review sub-view ─────────────────────────────────────────────────────────────

function ReviewView({
  def, step, goodSamples, faultSamples, onAcceptGood, onAcceptFault, onRedo, insetBottom,
}: {
  def: ExerciseDefinitionDef;
  step: CalibStep;
  goodSamples: GoodRepSample[];
  faultSamples: FaultRepSample[];
  onAcceptGood: (range: ReturnType<typeof suggestRangeThresholds>) => void;
  onAcceptFault: (checkId: string, value: number, enabled: boolean) => void;
  onRedo: () => void;
  insetBottom: number;
}) {
  if (step.kind === 'good') {
    const metricRange = plausibleRangeForMetric(def.repMetric);
    const topResult    = rejectOutliers(goodSamples.map(s => s.top), metricRange);
    const bottomResult = rejectOutliers(goodSamples.map(s => s.bottom), metricRange);
    const [suggestion, setSuggestion] = useNudgeableRange(suggestRangeThresholds(topResult.median, bottomResult.median));
    return (
      <View style={[s.reviewWrap, { paddingBottom: insetBottom + 20 }]}>
        <Text style={s.reviewTitle}>Suggested rep range</Text>
        <DistributionRow label="Top / rest" result={topResult} />
        <DistributionRow label="Bottom / peak" result={bottomResult} />
        <View style={s.suggestBox}>
          <NudgeRow label="topAngle" value={suggestion.topAngle} onChange={v => setSuggestion({ ...suggestion, topAngle: v })} />
          <NudgeRow label="repEnterThreshold" value={suggestion.repEnterThreshold} onChange={v => setSuggestion({ ...suggestion, repEnterThreshold: v })} />
          <NudgeRow label="repExitThreshold" value={suggestion.repExitThreshold} onChange={v => setSuggestion({ ...suggestion, repExitThreshold: v })} />
          <NudgeRow label="goodROMThreshold" value={suggestion.goodROMThreshold} onChange={v => setSuggestion({ ...suggestion, goodROMThreshold: v })} />
        </View>
        <View style={s.recordingBtnRow}>
          <GlassButton style={s.halfBtn} onPress={onRedo}><Text style={s.buttonTxtSmall}>Redo</Text></GlassButton>
          <GlassButton style={s.halfBtn} onPress={() => onAcceptGood(suggestion)}><Text style={s.buttonTxtSmall}>Accept</Text></GlassButton>
        </View>
      </View>
    );
  }

  const check = step.check!;
  const metricRange = plausibleRangeForMetric(check.metric);
  const goodVals  = goodSamples.map(s => s.checks[check.id]).filter((v): v is number => v !== undefined);
  const goodResult  = rejectOutliers(goodVals, metricRange);
  const faultResult = rejectOutliers(faultSamples.map(s => s.value), metricRange);
  const boundary = suggestBoundary(goodResult.median, faultResult.median, check.condition.type);
  const [nudgedValue, setNudgedValue] = useState(boundary.value);
  const [enabledOverride, setEnabledOverride] = useState(check.enabled);
  const nudgeStep = nudgeStepFor(metricRange);

  return (
    <View style={[s.reviewWrap, { paddingBottom: insetBottom + 20 }]}>
      <Text style={s.reviewTitle}>Suggested limit — {step.label}</Text>
      {!boundary.directionMatches && (
        <Text style={s.warnTxt}>
          Your fault demo didn't clearly separate from good reps on this metric — try exaggerating more, or redo with a clearer motion.
        </Text>
      )}
      {goodVals.length === 0 && (
        <Text style={s.warnTxt}>No usable good-rep data for this metric — the good-reps step may not have moved it enough. Suggestion may be unreliable.</Text>
      )}
      <DistributionRow label="Good reps" result={goodResult} />
      <DistributionRow label="Fault reps" result={faultResult} />
      <View style={s.suggestBox}>
        <NudgeRow label="condition.value" value={nudgedValue} onChange={setNudgedValue} step={nudgeStep} />
        <Pressable style={s.enableRow} onPress={() => setEnabledOverride(!enabledOverride)}>
          <Text style={s.enableRowLabel}>Enabled in real workouts</Text>
          <Text style={enabledOverride ? s.enableRowOn : s.enableRowOff}>{enabledOverride ? 'ON' : 'OFF'}</Text>
        </Pressable>
      </View>
      <View style={s.recordingBtnRow}>
        <GlassButton style={s.halfBtn} onPress={onRedo}><Text style={s.buttonTxtSmall}>Redo</Text></GlassButton>
        <GlassButton style={s.halfBtn} onPress={() => onAcceptFault(check.id, nudgedValue, enabledOverride)}><Text style={s.buttonTxtSmall}>Accept</Text></GlassButton>
      </View>
    </View>
  );
}

function useNudgeableRange(initial: ReturnType<typeof suggestRangeThresholds>) {
  return useState(initial);
}

function DistributionRow({ label, result }: { label: string; result: OutlierRejectionResult }) {
  return (
    <View style={s.distRow}>
      <Text style={s.distLabel}>{label}</Text>
      <Text style={s.distMedian}>{result.median.toFixed(1)}° median</Text>
      <Text style={s.distDetail}>
        kept: {result.kept.map(v => v.toFixed(0)).join(', ')}
        {result.rejected.length > 0 ? `  ·  rejected: ${result.rejected.map(r => r.value.toFixed(0)).join(', ')}` : ''}
      </Text>
    </View>
  );
}

// Adaptive step size — a fixed step of 1 works for angle metrics (0-180°) but
// would blow past the whole scale for a small-range metric like a distance
// ratio (typically 0.0-1.0-ish). Scale the step to the metric's plausible range.
function nudgeStepFor(range: [number, number]): number {
  const width = range[1] - range[0];
  if (width <= 4)  return 0.05;
  if (width <= 20) return 0.5;
  return 1;
}

function formatNudgeValue(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function NudgeRow({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  const round = (n: number) => Math.round(n / step) * step;
  return (
    <View style={s.nudgeRow}>
      <Text style={s.nudgeLabel}>{label}</Text>
      <Pressable onPress={() => onChange(round(value - step))}><Text style={s.stepperBtn}>−</Text></Pressable>
      <Text style={s.nudgeValue}>{formatNudgeValue(value)}</Text>
      <Pressable onPress={() => onChange(round(value + step))}><Text style={s.stepperBtn}>+</Text></Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  h1: { fontSize: 26, fontWeight: '800', color: C.text, paddingHorizontal: 20, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.muted, paddingHorizontal: 20, marginBottom: 16, lineHeight: 20 },
  errorText: { color: C.warn, fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  buttonTxt: { fontSize: 16, fontWeight: '700', color: C.text },
  buttonTxtSmall: { fontSize: 14, fontWeight: '700', color: C.text },

  pickRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  pickRowLabel: { fontSize: 16, fontWeight: '600', color: C.text },
  pickRowBadgeGood: { fontSize: 12, fontWeight: '600', color: C.good },
  pickRowBadgeDim:  { fontSize: 12, fontWeight: '600', color: C.dim },

  wideBtn: { marginHorizontal: 16, marginTop: 12, paddingVertical: 16 },

  reportCard: {
    backgroundColor: C.glass, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: 16, marginBottom: 12,
  },
  reportLabel: { fontSize: 12, fontWeight: '700', color: C.muted, letterSpacing: 0.6, marginBottom: 6 },
  reportBig: { fontSize: 18, fontWeight: '700', color: C.text },
  reportNote: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  reportNoteWarn: { color: C.warn },
  reportNoteGood: { color: C.good },

  noticeTxt: {
    position: 'absolute', left: 16, right: 16, top: 90, textAlign: 'center',
    fontSize: 13, fontWeight: '600', color: C.text, backgroundColor: C.glass,
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  stepCounter: { fontSize: 14, fontWeight: '700', color: C.muted },

  errorCard: { position: 'absolute', left: 24, right: 24, top: '38%', backgroundColor: C.glass, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border },

  setupOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  setupTitle: { fontSize: 22, fontWeight: '700', color: C.text },
  setupHint: { fontSize: 15, color: C.muted, textAlign: 'center' },
  progressTrack: { width: 220, height: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: 6, backgroundColor: C.good, borderRadius: 3 },

  recordingWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, gap: 14 },
  liveMetricBox: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.86)', borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', minWidth: 100, gap: 2,
  },
  liveMetricLabel: { fontSize: 9, fontWeight: '700', color: C.dim, letterSpacing: 1.2 },
  liveMetricValue: { fontSize: 28, fontWeight: '800', color: C.text },
  liveMetricState: { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 2 },
  instructionCard: {
    backgroundColor: C.glass, borderRadius: 18, borderWidth: 1, borderColor: C.border,
    padding: 18, gap: 10,
  },
  instructionLabel: { fontSize: 12, fontWeight: '800', color: C.good, letterSpacing: 1 },
  instructionTxt: { fontSize: 16, fontWeight: '600', color: C.text, lineHeight: 22 },
  sampleSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  sampleSizeLabel: { fontSize: 13, color: C.muted, flex: 1 },
  sampleSizeValue: { fontSize: 18, fontWeight: '700', color: C.text, minWidth: 24, textAlign: 'center' },
  stepperBtn: { fontSize: 22, fontWeight: '700', color: C.text, paddingHorizontal: 12 },

  countTxt: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' },

  repCardRow: { maxHeight: 100 },
  repCard: {
    backgroundColor: C.glass, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', minWidth: 84, gap: 2,
  },
  repCardNum: { fontSize: 11, color: C.dim, fontWeight: '700' },
  repCardVal: { fontSize: 22, fontWeight: '800', color: C.text },
  repCardSub: { fontSize: 10, color: C.muted },
  repCardDiscard: { fontSize: 10, color: C.bad, marginTop: 4, fontWeight: '600' },

  recordingBtnRow: { flexDirection: 'row', gap: 10 },
  halfBtn: { flex: 1, paddingVertical: 16 },
  btnDisabled: { opacity: 0.4 },

  reviewWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, gap: 12 },
  reviewTitle: { fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 4 },
  warnTxt: { fontSize: 13, color: C.warn, textAlign: 'center', lineHeight: 18 },

  distRow: { backgroundColor: C.glass, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, gap: 4 },
  distLabel: { fontSize: 12, fontWeight: '700', color: C.muted },
  distMedian: { fontSize: 20, fontWeight: '800', color: C.good },
  distDetail: { fontSize: 11, color: C.dim, lineHeight: 15 },

  suggestBox: { backgroundColor: C.glass, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, gap: 10 },
  nudgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nudgeLabel: { flex: 1, fontSize: 13, color: C.muted, fontWeight: '600' },
  nudgeValue: { fontSize: 18, fontWeight: '700', color: C.text, minWidth: 44, textAlign: 'center' },

  enableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  enableRowLabel: { fontSize: 13, color: C.muted, fontWeight: '600' },
  enableRowOn: { fontSize: 13, fontWeight: '800', color: C.good },
  enableRowOff: { fontSize: 13, fontWeight: '800', color: C.dim },
});
