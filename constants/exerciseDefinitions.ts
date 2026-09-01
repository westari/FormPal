/**
 * constants/exerciseDefinitions.ts
 *
 * Full exercise definitions passed from JS to the native engine at setExercise
 * time via setExerciseDefinition(). After the one-time native rebuild that adds
 * the bridge, ANY change to ANY exercise (threshold, cue, form check, new exercise)
 * is a JS reload only — npx expo start --dev-client --clear. No EAS build needed.
 *
 * To add a new exercise: add a key to EXERCISE_DEFINITIONS and a matching entry
 * in EXERCISE_STANDARDS (constants/exerciseStandards.ts) if it needs a Layer 2
 * standard. Keys must match ExerciseType in modules/athlt-camera/src/index.ts.
 *
 * SCHEMA MIRRORS THE SWIFT TYPES — every field name matches the Swift struct/enum.
 * Metric uses tagged objects: { type: "jointAngle", a: "leftShoulder", ... }
 * Joint names are camelCase strings matching the Joint enum extension in Swift.
 *
 * "Keys must match ExerciseType" above is now a compile-time fact, not just a
 * comment — EXERCISE_DEFINITIONS is typed Record<ExerciseId, ...>, so leaving
 * out any catalog exercise is a build error, not a runtime squat fallback.
 */

import type { ExerciseId } from './exercises';

// ─── Metric tagged-union type ─────────────────────────────────────────────────

export type MetricDef =
  | { type: 'jointAngle';             a: string; pivot: string; c: string }
  | { type: 'lineVsVertical';         from: string; to: string }
  | { type: 'lineVsHorizontal';       from: string; to: string }
  | { type: 'verticalGap';            upper: string; lower: string }
  | { type: 'normalizedVerticalGap';  upper: string; lower: string }
  | { type: 'normalizedHorizontalGap'; a: string; b: string }
  | { type: 'bodyRelativeGap';        a: string; b: string; axisFrom: string; axisTo: string }
  | { type: 'bodyRelativeDeviation';  point: string; axisFrom: string; axisTo: string }
  | { type: 'deviationFromLine';      point: string; lineFrom: string; lineTo: string }
  | { type: 'signedDeviationFromLine'; point: string; lineFrom: string; lineTo: string }
  | { type: 'distanceRatio';          a: string; b: string }
  | { type: 'segmentLengthRatio';     jointA: string; jointB: string }
  | { type: 'average';   left: MetricDef; right: MetricDef }
  | { type: 'minimum';   left: MetricDef; right: MetricDef }
  | { type: 'maximum';   left: MetricDef; right: MetricDef }
  | { type: 'bestSide';  left: MetricDef; right: MetricDef; leftJoints: string[]; rightJoints: string[] };

// ─── Sub-types ────────────────────────────────────────────────────────────────

export interface FormCheckDef {
  id:         string;
  cue:        string;
  metric:     MetricDef;
  evaluateAt: 'atBottom' | 'throughoutMax' | 'throughoutMin';
  condition:  { type: 'greaterThan' | 'lessThan'; value: number };
  priority:   number;
  enabled:    boolean;
  // When true and this check fails, the rep is rejected entirely (not
  // counted, no cue) instead of counting-but-flagged — see
  // ExerciseEngine.swift's gatesCounting doc comment. Only for checks that
  // mean "this wasn't the target movement," never ordinary form faults.
  gatesCounting?: boolean;
  // Per-check override of FORM_CHECK_MIN_CONF (ExerciseEngine.swift's
  // isMetricReliable/isReliable) — the confidence floor a frame's joints must
  // clear before this check's value is trusted into its throughoutMax/Min
  // accumulator. Default 0.6 (omit for every normal check) protects against
  // one noisy low-confidence frame permanently corrupting a rep-long max/min.
  // Only lower this for a check whose real fault moment is ALSO the moment
  // confidence naturally degrades (e.g. tricep elbow_drift — the forearm
  // crosses in front of the torso, partially occluding the elbow, right when
  // the arm is most extended and elbow position most likely to have drifted)
  // — see TRICEP_ELBOW_DRIFT_L/R below for the reasoning and honesty caveat.
  formCheckMinConf?: number;
}

export interface ReadyGateDef {
  readyAngleMin:  number;
  readyAngleMax:  number;
  requiredJoints: string[];
  minConfidence:  number;
  stableDuration: number;
}

export interface CameraSetupDef {
  setupInstruction:  string;
  requiredJoints:    string[];
  requiredJointsAlt?: string[];
  // Which way the athlete faces. Drives the SETUP "Turn to face the camera" /
  // "Turn side-on" coaching cue AND the standing-body size/edge heuristics
  // (see ExerciseEngine.positionGuidance). Omit for floor exercises
  // (push-up / sit-up) — they have no facing preference and a small vertical
  // span, so the standing heuristics must not run. NATIVE — needs an EAS build.
  facing?: 'camera' | 'side';
}

export interface CalibrationDef {
  repsNeeded:    number;
  enterFraction: number;
  exitFraction:  number;
}

export interface PlanarityCheckDef {
  id:                     string;
  jointA:                 string;
  jointB:                 string;
  minRatio:               number;
  cue:                    string;
  fallbackReferenceRatio: number;
  enabled?:               boolean;
}

export interface ExerciseDefinitionDef {
  id:                 string;
  displayName:        string;
  // Two-tier tracking:
  //   'formCheck'  (default, omit) — the camera can see this movement well
  //     enough to both count reps AND judge form. Shows ✓/✗ cues, and its
  //     good-rep ratio feeds muscle ranks / form scores.
  //   'repCounter' — the camera can reliably COUNT reps but NOT judge form
  //     (machine-occluded, hard-to-track path, etc.). formcheck.tsx shows a
  //     clean rep count with no ✓/✗, and downstream (sessionLog, ranks,
  //     recap, stats) treats these reps as VOLUME ONLY — they never
  //     contribute a form-quality score. Lets a plan include any movement
  //     without faking coaching or corrupting ranks.
  mode?:             'formCheck' | 'repCounter';
  repMetric:          MetricDef;
  topAngle:           number;
  repEnterThreshold:  number;
  repExitThreshold:   number;
  goodROMThreshold:   number;
  insufficientROMCue: string;
  formChecks:         FormCheckDef[];
  readyGate:          ReadyGateDef;
  cameraSetup?:       CameraSetupDef;
  calibration?:       CalibrationDef;
  minRepInterval:     number;
  planarityChecks?:   PlanarityCheckDef[];
  // Opt out of torso-scale approach/walk-away detection (see ExerciseEngine.swift
  // updateActivityState). Default false (omit for every normal exercise) — only
  // set true for exercises whose primary movement is a large torso-angle change
  // (currently: the hip-hinge family), where a growing shoulder-hip 2D distance
  // is caused by the movement itself, not by the user walking toward the camera.
  suppressApproachDetection?: boolean;
  // Fraction of |repTopValue - goodROMThreshold| a rep's recorded movement must
  // clear to avoid being rejected as noise by the phantom-rep guard (see
  // ExerciseEngine.swift runStateMachine). Default 0.30 (omit for every normal
  // exercise) — only raise this for an exercise with a documented "small
  // movement counts as a real rep" problem.
  phantomGuardFraction?: number;
  // Consecutive frames the metric must hold above repExitThreshold before a
  // rep is trusted as complete (CORE double-count fix — see
  // ExerciseEngine.swift's exitConfirmCount doc comment). Default 3 (omit for
  // every normal exercise) — do NOT lower this globally for one exercise's
  // sake again; override it on that one exercise instead (see
  // kettlebellSwing below for the one legitimate case: an explicitly
  // ballistic movement whose brief moment at full extension may not sustain
  // for multiple frames).
  exitConfirmFrames?: number;
  // Consecutive frames Vision must report NO person at all, while mid-rep,
  // before the in-progress rep is abandoned (see ExerciseEngine.swift's
  // consecutiveMissingFrames doc comment). Default 5 (~0.5s, was 3 — FIX 2c,
  // brief blips no longer abandon a rep; omit for every normal exercise) — a
  // log-confirmed exception exists for tricep: done
  // close to the camera with the forearm crossing the torso every rep,
  // Vision's whole-body detector can lose the person for longer than that
  // from self-occlusion alone, killing every rep before it could complete.
  missingPersonGraceFrames?: number;
  // Requires the native settle gate's anchor value (the metric reading it
  // locks in as "rest," see ExerciseEngine.swift's settleCandidateAcceptable
  // doc comment) to sit at least this fraction of the way from
  // goodROMThreshold up to topAngle before EITHER settle path is allowed to
  // commit. Default nil (omit for every normal exercise) — preserves exact
  // existing settle behavior. Only set this where a genuinely different
  // movement performed in this exercise's slot could otherwise settle on
  // its own low starting value and get miscounted as this one (currently:
  // lat pulldown vs. a press sharing the same wrist/elbow-vs-shoulder
  // metric shape in opposite temporal order — see latPulldownVariant()).
  settleAnchorMinFraction?: number;
  // Max fraction of a completed rep's in-rep frames that may be
  // primary-metric-unreliable (a joint below the 0.6 reliability floor)
  // before the WHOLE rep is discarded as "[REP] rejected — tracking
  // unreliable" (see ExerciseEngine.swift's tracking-reliability gate).
  // Default 0.5 (omit for every normal exercise) — the value the pushup /
  // lat-pulldown walk-away fix was tuned against; do NOT loosen it globally.
  // crunch overrides it up: a device log confirmed a real crunch lying flat
  // runs ~67% of frames below the floor (Apple Vision shoulder confidence
  // tops out ~0.67 lying down) and was having every such rep deleted.
  repReliabilityMaxUnreliableFraction?: number;
  // Seconds since the last COUNTED rep (person present, not mid-rep) before
  // rep counting is suppressed until the user returns to the start position
  // (see ExerciseEngine.swift's updateActivityState). Default 8.0 (omit for
  // every normal exercise). crunch overrides it long: lying flat, reps
  // resolve slowly and some are dropped by the reliability gate, so the real
  // gap between counted reps exceeds 8s and suppression was locking out the
  // rest of a set.
  inactivityRepGapSec?: number;
  // When false (default true), skips the native frame-edge guard that resets
  // framesSincePoseGap whenever a repMetric joint sits within 5% of a frame
  // edge during tracking (see ExerciseEngine.swift's ingest() edge call site
  // and edgeGuardEnabled in ExerciseDefinition.swift). That guard is built for
  // STANDING exercises (edge-adjacent joint = walking out of frame). A FLOOR
  // exercise lies across the whole frame with a knee/shoulder near an edge on
  // every rep — a device log showed the guard resetting the clean-frame
  // counter every few frames, so the deep frames of every rep after the first
  // were never recorded and the reps failed the phantom guard, then inactivity
  // suppression locked out the set. Set false for floor exercises only.
  // NATIVE — needs an EAS build.
  edgeGuardEnabled?: boolean;
  // Orientation of the on-screen positioning-guide box shown during SETUP in
  // app/formcheck.tsx (a dimmed surround with a clear target rectangle the
  // user lines up inside). 'standing' = tall upright box for a standing
  // person; 'floor' = wide low box for a person on the ground (plank /
  // lying). Purely presentational — the actual "am I in position" gate is
  // still the native SETUP joint-visibility check; this just tells the user
  // WHERE. Omit → formcheck.tsx falls back to a per-exercise default
  // (FLOOR_GUIDE set), which is 'standing' for anything not listed.
  guideBox?: 'standing' | 'floor';
}

// ─── Shared passthrough ready gate ───────────────────────────────────────────
//
// Applied to every exercise. The ready gate is no longer used for exercise-
// specific positioning — that job is covered by three more robust mechanisms:
//   1. SETUP phase: required joints visible + 2-second hold before ACTIVE.
//   2. Settle gate (native): metric must hold above exitThreshold for 8 frames
//      before the first rep registers — prevents position-entry motion from
//      counting as a rep. Settle gate and passthrough gate now accumulate
//      in parallel so the first real rep is never blocked (see Fix 5 note).
//   3. Phantom-rep guard (native): requires 30% of [topAngle → goodROM] range
//      of genuine movement — noise dips and setup jitter can't fake this.
//
// Why the exercise-specific gates were removed:
//   Side-on exercises (row, tricep, lunge): far-arm or far-leg joints are
//   occluded → required joints never reach minConfidence → gate stays closed
//   for 30-60s requiring the user to face the camera or reposition.
//   Angle-range constraints (shoulder press, squat): gate fires or breaks
//   unexpectedly on Vision angle drift during the set.
//   All three layers above are more robust and exercise-agnostic.
const PASSTHROUGH_GATE: ReadyGateDef = {
  readyAngleMin:  0,
  readyAngleMax:  360,
  requiredJoints: [],
  minConfidence:  0,
  stableDuration: 0.1,
};

// ─── Shared curl building-blocks ──────────────────────────────────────────────
//
// All bicep-curl variants share the same joints, rep signal, thresholds,
// form checks, readyGate, and calibration config. Only id, displayName,
// and cameraSetup.setupInstruction differ.
//
// Extract the shared parts once so variants are one-liners that can't drift
// out of sync with the verified curl values.

const CURL_REP_METRIC: MetricDef = {
  type:  'minimum',
  left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
  right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
};

const CURL_FORM_CHECKS: FormCheckDef[] = [
  // Priority 1: didn't fully extend arm at the bottom.
  // 120° (not 140°): calibrated exit often lands ~135-142°, which would
  // false-fire a 140° check on every rep.
  {
    id:         'full_extension',
    cue:        'FULL EXTENSION',
    metric: {
      type:  'minimum',
      left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
      right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
    },
    evaluateAt: 'throughoutMax',
    condition:  { type: 'lessThan', value: 120 },
    priority:   1,
    enabled:    true,
  },
  // Priority 4: shoulder→elbow drifted forward from vertical.
  // Tightened 30→20: reported not strict enough. Cleanly measurable — this is a
  // direct 2-point angle (shoulder→elbow) with no contaminating third joint, the
  // same joint pair already reused for shoulder press/tricep, so tightening the
  // number is a reasonable adjustment, not a rebuild.
  {
    id:         'elbow_drift',
    cue:        'KEEP ELBOW STILL',
    metric: {
      type:  'average',
      left:  { type: 'lineVsVertical', from: 'leftShoulder',  to: 'leftElbow' },
      right: { type: 'lineVsVertical', from: 'rightShoulder', to: 'rightElbow' },
    },
    evaluateAt: 'throughoutMax',
    condition:  { type: 'greaterThan', value: 20 },
    priority:   4,
    enabled:    true,
  },
  // Priority 5: torso (hip→shoulder) leaned back for momentum (>20°).
  {
    id:         'lean_back',
    cue:        'STOP SWINGING',
    metric: {
      type:  'average',
      left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder' },
      right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
    },
    evaluateAt: 'throughoutMax',
    condition:  { type: 'greaterThan', value: 20 },
    priority:   5,
    enabled:    true,
  },
];

// NEAR / FAR split — repMetric is minimum(jointAngle L/R) which tracks off one
// arm, so setup shouldn't demand both. Lets a curl calibrate from a side-on
// video (far arm occluded) the same way row/hinge already do. (Advisory only
// after the FIX 1 native build — the gate then reads the rep metric directly.)
const CURL_CAMERA_JOINTS_A = ['leftShoulder',  'leftElbow',  'leftWrist'];
const CURL_CAMERA_JOINTS_B = ['rightShoulder', 'rightElbow', 'rightWrist'];

const CURL_CALIBRATION: CalibrationDef = {
  repsNeeded:    2,
  enterFraction: 0.50,
  exitFraction:  0.25,
};

// Helper that builds a complete curl-family ExerciseDefinitionDef.
function curlVariant(
  id: string,
  displayName: string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,

    repMetric:          CURL_REP_METRIC,
    topAngle:           160,
    repEnterThreshold:  145,
    // FIXED — repExitThreshold was 145, THE SAME VALUE as repEnterThreshold: zero
    // hysteresis. Any dip below 145 followed by a rise back above 145 (even by a
    // fraction of a degree) completed a rep instantly, with no gap requiring a
    // meaningful return-to-rest first — root cause contributor to "tiny movement,
    // return to start, counts as GOOD". Widened to a 5° gap, matching squat's own
    // 150/155 convention.
    repExitThreshold:   150,
    goodROMThreshold:    60,
    insufficientROMCue: 'CURL HIGHER',

    formChecks: CURL_FORM_CHECKS,
    readyGate:  PASSTHROUGH_GATE,

    cameraSetup: {
      setupInstruction,
      requiredJoints:    CURL_CAMERA_JOINTS_A,
      requiredJointsAlt: CURL_CAMERA_JOINTS_B,
    },

    calibration:    CURL_CALIBRATION,
    minRepInterval: 0.5,
    planarityChecks: [],
    // Tightened from the 0.30 default (see ExerciseDefinition.swift) to 0.40 —
    // reported a small partial movement (hold at start, move a little, return)
    // was passing as a genuine rep. Requires a rep to travel a larger fraction of
    // the top→goodROM range before it's trusted as real rather than noise/wiggle.
    phantomGuardFraction: 0.40,
  };
}

// ─── Shared squat building-blocks ────────────────────────────────────────────
//
// Values mirror the verified squat definition VERBATIM — do not change these
// independently of the squat template or the two will drift.
// Squat-family variants share all joints, repMetric, thresholds, form checks,
// readyGate, calibration, and camera setup. Only id, displayName, and
// setupInstruction differ.

const SQUAT_REP_METRIC: MetricDef = {
  type:  'average',
  left:  { type: 'jointAngle', a: 'leftHip',  pivot: 'leftKnee',  c: 'leftAnkle'  },
  right: { type: 'jointAngle', a: 'rightHip', pivot: 'rightKnee', c: 'rightAnkle' },
};

const SQUAT_FORM_CHECKS: FormCheckDef[] = [
  {
    id: 'back_lean', cue: 'CHEST UP',
    metric: {
      type:  'average',
      left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
      right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
    },
    // Loosened 30→35: reported too strict, firing on a normal upright squat.
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 35 },
    priority: 1, enabled: true,
  },
  {
    id: 'heel_rise', cue: 'KEEP HEELS DOWN',
    metric: {
      type:  'average',
      left:  { type: 'lineVsVertical', from: 'leftAnkle',  to: 'leftKnee'  },
      right: { type: 'lineVsVertical', from: 'rightAnkle', to: 'rightKnee' },
    },
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 20 },
    priority: 2, enabled: false,
  },
  {
    id: 'knee_cave', cue: 'KNEES OUT',
    metric: {
      type:  'average',
      left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftKnee'  },
      right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightKnee' },
    },
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 20 },
    priority: 3, enabled: false,
  },
];

// NEAR / FAR split — repMetric is average(jointAngle(hip,knee,ankle) L/R),
// which tracks off one leg. A squat is filmed SIDE-ON, so the far leg is
// partly occluded; demanding both sides made side-on squat videos never pass
// setup. (Advisory only after the FIX 1 native build.)
const SQUAT_CAMERA_JOINTS_A = ['leftShoulder',  'leftHip',  'leftKnee',  'leftAnkle'];
const SQUAT_CAMERA_JOINTS_B = ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle'];

const SQUAT_PLANARITY: PlanarityCheckDef[] = [
  { id: 'thigh_l', jointA: 'leftHip',  jointB: 'leftKnee',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.80, enabled: false },
  { id: 'shin_l',  jointA: 'leftKnee', jointB: 'leftAnkle',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.72, enabled: false },
];

function squatVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          SQUAT_REP_METRIC,
    topAngle:           160,
    repEnterThreshold:  150,
    repExitThreshold:   155,
    goodROMThreshold:   90,   // tightened 100→90: genuine parallel squat ≤90°; quarter squat ~130° fails
    insufficientROMCue: 'GO DEEPER',
    formChecks:      SQUAT_FORM_CHECKS,
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup:     { setupInstruction, requiredJoints: SQUAT_CAMERA_JOINTS_A, requiredJointsAlt: SQUAT_CAMERA_JOINTS_B },
    calibration:     { repsNeeded: 2, enterFraction: 0.50, exitFraction: 0.25 },
    minRepInterval:  0.5,
    planarityChecks: SQUAT_PLANARITY,
  };
}

// ─── Shared push-up building-blocks ──────────────────────────────────────────
//
// Values mirror the verified pushup definition VERBATIM.
// Hip form checks come in two flavours:
//   PUSHUP_HIP_CHECKS      — shoulder→ankle plank line (feet on floor).
//   PUSHUP_HIP_CHECKS_KNEE — shoulder→knee plank line (knee push-up: ankles raised).

const PUSHUP_REP_METRIC: MetricDef = {
  type: 'bestSide',
  left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
  right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
  leftJoints:  ['leftShoulder',  'leftElbow',  'leftWrist'],
  rightJoints: ['rightShoulder', 'rightElbow', 'rightWrist'],
};

const PUSHUP_HIP_CHECKS: FormCheckDef[] = [
  {
    id: 'hip_pike_l', cue: 'HIPS DOWN',
    metric: { type: 'signedDeviationFromLine', point: 'leftHip',
              lineFrom: 'leftShoulder', lineTo: 'leftAnkle' },
    // Tightened 0.05→0.035: reported it only fired on VERY exaggerated piking.
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 0.035 },
    priority: 4, enabled: true,
  },
  {
    id: 'hip_sag_l', cue: 'HIPS UP',
    metric: { type: 'signedDeviationFromLine', point: 'leftHip',
              lineFrom: 'leftShoulder', lineTo: 'leftAnkle' },
    evaluateAt: 'throughoutMin', condition: { type: 'lessThan', value: -0.08 },
    priority: 4, enabled: true,
  },
  {
    id: 'hip_pike_r', cue: 'HIPS DOWN',
    metric: { type: 'signedDeviationFromLine', point: 'rightHip',
              lineFrom: 'rightShoulder', lineTo: 'rightAnkle' },
    // Tightened 0.05→0.035: reported it only fired on VERY exaggerated piking.
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 0.035 },
    priority: 4, enabled: true,
  },
  {
    id: 'hip_sag_r', cue: 'HIPS UP',
    metric: { type: 'signedDeviationFromLine', point: 'rightHip',
              lineFrom: 'rightShoulder', lineTo: 'rightAnkle' },
    evaluateAt: 'throughoutMin', condition: { type: 'lessThan', value: -0.08 },
    priority: 4, enabled: true,
  },
];

// Knee push-up: ankles are raised off the floor — use shoulder→knee as plank line.
const PUSHUP_HIP_CHECKS_KNEE: FormCheckDef[] = [
  {
    id: 'hip_pike_l', cue: 'HIPS DOWN',
    metric: { type: 'signedDeviationFromLine', point: 'leftHip',
              lineFrom: 'leftShoulder', lineTo: 'leftKnee' },
    // Tightened 0.05→0.035: reported it only fired on VERY exaggerated piking.
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 0.035 },
    priority: 4, enabled: true,
  },
  {
    id: 'hip_sag_l', cue: 'HIPS UP',
    metric: { type: 'signedDeviationFromLine', point: 'leftHip',
              lineFrom: 'leftShoulder', lineTo: 'leftKnee' },
    evaluateAt: 'throughoutMin', condition: { type: 'lessThan', value: -0.08 },
    priority: 4, enabled: true,
  },
  {
    id: 'hip_pike_r', cue: 'HIPS DOWN',
    metric: { type: 'signedDeviationFromLine', point: 'rightHip',
              lineFrom: 'rightShoulder', lineTo: 'rightKnee' },
    // Tightened 0.05→0.035: reported it only fired on VERY exaggerated piking.
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 0.035 },
    priority: 4, enabled: true,
  },
  {
    id: 'hip_sag_r', cue: 'HIPS UP',
    metric: { type: 'signedDeviationFromLine', point: 'rightHip',
              lineFrom: 'rightShoulder', lineTo: 'rightKnee' },
    evaluateAt: 'throughoutMin', condition: { type: 'lessThan', value: -0.08 },
    priority: 4, enabled: true,
  },
];

const PUSHUP_PLANARITY: PlanarityCheckDef[] = [
  { id: 'uarm_l', jointA: 'leftShoulder', jointB: 'leftElbow',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.64, enabled: false },
];

function pushupVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          PUSHUP_REP_METRIC,
    topAngle:           160,
    repEnterThreshold:  140,
    repExitThreshold:   150,
    goodROMThreshold:    75,   // tightened 90→75: proper push-up ≤75°; half push-up (~85-90°) fails
    insufficientROMCue: 'GO DEEPER',
    formChecks:      PUSHUP_HIP_CHECKS,
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    ['leftShoulder',  'leftElbow',  'leftWrist'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow', 'rightWrist'],
    },
    minRepInterval:  0.8,
    planarityChecks: PUSHUP_PLANARITY,
  };
}

// Knee push-up: identical to pushupVariant except hip checks use shoulder→knee line.
function kneePushupVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          PUSHUP_REP_METRIC,
    topAngle:           160,
    repEnterThreshold:  140,
    repExitThreshold:   150,
    goodROMThreshold:    75,   // tightened 90→75: proper push-up ≤75°; half push-up (~85-90°) fails
    insufficientROMCue: 'GO DEEPER',
    formChecks:      PUSHUP_HIP_CHECKS_KNEE,
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    ['leftShoulder',  'leftElbow',  'leftWrist'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow', 'rightWrist'],
    },
    minRepInterval:  0.8,
    planarityChecks: PUSHUP_PLANARITY,
  };
}

// ─── Shared shoulder-press building-blocks ────────────────────────────────────
//
// Values mirror the verified shoulderPress definition VERBATIM.
// All variants are front-facing with the same arm/elbow repMetric.

const SHOULDER_PRESS_REP_METRIC: MetricDef = {
  type: 'bestSide',
  left:  { type: 'lineVsVertical', from: 'leftShoulder',  to: 'leftElbow'  },
  right: { type: 'lineVsVertical', from: 'rightShoulder', to: 'rightElbow' },
  leftJoints:  ['leftShoulder',  'leftElbow'],
  rightJoints: ['rightShoulder', 'rightElbow'],
};

const SHOULDER_PRESS_FORM_CHECKS: FormCheckDef[] = [
  {
    id: 'lean_back', cue: 'STAY UPRIGHT',
    metric: {
      type:  'average',
      left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
      right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
    },
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 20 },
    priority: 4, enabled: true,
  },
  {
    id: 'lower_more', cue: 'LOWER MORE',
    metric: {
      type: 'bestSide',
      left:  { type: 'lineVsVertical', from: 'leftShoulder',  to: 'leftElbow'  },
      right: { type: 'lineVsVertical', from: 'rightShoulder', to: 'rightElbow' },
      leftJoints:  ['leftShoulder',  'leftElbow'],
      rightJoints: ['rightShoulder', 'rightElbow'],
    },
    evaluateAt: 'throughoutMax', condition: { type: 'lessThan', value: 80 },
    priority: 2, enabled: false,
  },
  // wrist_track_l/r: LOOSENED 0.25→1.2. A device log of real, correctly-executed
  // presses showed values of 0.28, 0.36, 0.51, 0.63, and 1.05 ALL failing against
  // the 0.25 limit — the 0.25 number was never actually device-verified for this
  // exercise (it was inherited as an assumed reference by the lateral-raise
  // direction check's comment, which turned out to be wrong). 1.2 sits above the
  // full observed good-rep range as a wide placeholder — this is deliberately
  // permissive, not a tuned number: I don't have a sample of what a genuinely bad
  // "arms flailing outward" press reads, so I can't confirm 1.2 still catches a
  // real fault. If you want this check to mean something, send a log with a
  // few deliberately-bad reps (arms drifting out to the sides) alongside normal
  // ones so I can find real separation, if any exists.
  {
    id: 'wrist_track_l', cue: 'ARMS STRAIGHT UP',
    metric: {
      type:     'bodyRelativeDeviation',
      point:    'leftWrist',
      axisFrom: 'leftShoulder',
      axisTo:   'leftHip',
    },
    evaluateAt: 'atBottom', condition: { type: 'greaterThan', value: 1.2 },
    priority: 3, enabled: true,
  },
  {
    id: 'wrist_track_r', cue: 'ARMS STRAIGHT UP',
    metric: {
      type:     'bodyRelativeDeviation',
      point:    'rightWrist',
      axisFrom: 'rightShoulder',
      axisTo:   'rightHip',
    },
    evaluateAt: 'atBottom', condition: { type: 'greaterThan', value: 1.2 },
    priority: 3, enabled: true,
  },
];

const SHOULDER_PRESS_PLANARITY: PlanarityCheckDef[] = [
  { id: 'uarm_l', jointA: 'leftShoulder',  jointB: 'leftElbow',
    minRatio: 0.75, cue: 'FACE THE CAMERA', fallbackReferenceRatio: 0.64, enabled: false },
  { id: 'uarm_r', jointA: 'rightShoulder', jointB: 'rightElbow',
    minRatio: 0.75, cue: 'FACE THE CAMERA', fallbackReferenceRatio: 0.64, enabled: false },
];

function shoulderPressVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          SHOULDER_PRESS_REP_METRIC,
    topAngle:           84,
    repEnterThreshold:  68,
    repExitThreshold:   72,
    // TIGHTENED again, 60→55, from a real-press device log: bottom angles
    // across 7 reps were 41, 46, 65, 63, 4.9, 63, 41 — genuine full presses
    // cluster at ≤46° (one rep hit 4.9), and clearly short presses sit at
    // 63-65°. 60 sat inside that gap, right on the ambiguous boundary — a
    // real full press to 63-65 (still short of the 41-46 cluster, but not by
    // a huge margin) could fail while looking "the same" to the user as one
    // that passed. 55 sits with clear margin above the confirmed full-press
    // cluster (≤46) and below the confirmed short-press cluster (63+), so a
    // real press clearly passes and only genuinely short reps fail. This is
    // a real number from real data, not a guess. Does NOT by itself fix
    // "arm-waving passes as good" — that's a control/tempo problem, not a
    // depth problem (a fast, uncontrolled fling can reach a given angle at
    // least as easily as a real press, sometimes more so). See the note on
    // this exercise for what log I need to find a real control signal.
    goodROMThreshold:   55,
    insufficientROMCue: 'PRESS HIGHER',
    formChecks:      SHOULDER_PRESS_FORM_CHECKS,
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      // NEAR / FAR — repMetric is bestSide(lineVsVertical(shoulder→elbow)).
      requiredJoints:    ['leftShoulder',  'leftElbow'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow'],
    },
    calibration:     { repsNeeded: 2, enterFraction: 0.50, exitFraction: 0.25 },
    minRepInterval:  0.5,
    planarityChecks: SHOULDER_PRESS_PLANARITY,
    // ADDED — video-file re-analysis investigation (analyzeVideoFile Phase 1
    // test): a fresh engine analyzing a pre-recorded clip starts its own
    // independent SETUP+settle sequence from frame 0 of the file, which can
    // land at a different point in the person's actual rep cadence than the
    // ORIGINAL live session's setup did. Real device log: a 4-rep shoulder
    // press video had every rep phantom-rejected because the settle/resync
    // path (ExerciseEngine.swift's "resync on first real rep attempt") had
    // locked repTopValue to 59.23 — BELOW repEnterThreshold(68) itself, a
    // self-evidently invalid "rest" reading (you can't be at rest already
    // past the enter threshold). This is the exact failure mode
    // latPulldownVariant()'s own settleAnchorMinFraction was built for (see
    // that field's comment in ExerciseDefinition.swift and its 0.3 value
    // below) — REUSED here verbatim, not a new guess: latPulldown's own
    // registration explicitly reuses shoulderPress's rep-detection mirrored,
    // so the same anchor-quality gate applies symmetrically. Requires the
    // settle anchor to sit >= goodROMThreshold + (topAngle-goodROMThreshold)
    // * 0.3 = 55 + 8.7 = 63.7 before it's accepted as a genuine "arms
    // overhead" rest reading — 59.23 would now correctly be REJECTED
    // (engine keeps waiting for a real overhead frame) instead of locking in
    // a broken anchor that dooms every subsequent rep in the clip.
    settleAnchorMinFraction: 0.3,
  };
}

// ─── Chest press family (dumbbell/bench press, side camera) ──────────────────
//
// INVESTIGATE-FIRST: closest existing family is curl — same joint triad
// (shoulder-elbow-wrist), same jointAngle metric TYPE, same "arm extends and
// bends at the elbow" movement shape. Reused CURL_REP_METRIC's metric type
// directly (jointAngle, not lineVsVertical/Horizontal — a chest press's key
// signal is elbow FLEXION depth, the same thing curl measures, unlike
// shoulder press/lat pulldown's upper-arm-ORIENTATION signal). topAngle(160)
// and the enter/exit gap (145/150) are curl's own verified "rest reads ~160,
// not a literal 180, due to natural elbow give + tracking noise" numbers,
// reused VERBATIM — same joint triad, same reasoning for why rest isn't a
// perfect straight line. goodROMThreshold(90) is NOT copied from curl (curl
// goes much deeper, 60) — it comes directly from the explicit ask ("lower to
// ~90° elbow"), the one number that's genuinely new to this exercise.
//
// BILATERAL COMBINATOR: bestSide, NOT curl's own 'minimum' — reused from
// RAISE_REP_METRIC_SIDE's reasoning instead (side camera → genuine far-arm
// occlusion, not curl's front-facing "both arms should move together"
// concern). A side view only reliably tracks the near arm.
//
// DIRECTION: already correct for the engine's decreasing-into-rep state
// machine with no complement/inversion needed — bending the elbow from
// extended(high angle) toward 90°(lower angle) IS a decrease, unlike lat
// pulldown's overhead-start problem. Simplest of the three families built
// this way so far.
const CHEST_PRESS_REP_METRIC: MetricDef = {
  type:  'bestSide',
  left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
  right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
  leftJoints:  ['leftShoulder',  'leftElbow',  'leftWrist'],
  rightJoints: ['rightShoulder', 'rightElbow', 'rightWrist'],
};

// FORM CHECK — not locking out at top. Same evaluateAt='throughoutMax' shape
// as curl's own full_extension check, and the SAME known structural limit:
// this rep-tracking window spans settle-in-to-completion, so it can't
// cleanly isolate "returned to lockout at the END" from "was already
// extended at the START" — curl has this same property and is already
// shipped/enabled, so it's an accepted tradeoff in this framework, not a
// new risk unique to this exercise. PLACEHOLDER threshold — brand new
// application (chest press, not curl), 150 is topAngle(160) minus a 10°
// margin, wide enough to allow real tracking noise near lockout. Send a
// [REP] log doing a few reps that deliberately don't lock out vs. a few
// clean ones so real separation can be found.
const CHEST_PRESS_LOCKOUT_CHECK: FormCheckDef = {
  id: 'lockout', cue: 'PRESS ALL THE WAY UP',
  metric: CHEST_PRESS_REP_METRIC,
  evaluateAt: 'throughoutMax', condition: { type: 'lessThan', value: 150 },
  priority: 2, enabled: true,
};

// PLANARITY — elbow flare. FEASIBILITY: flaring the elbows out and away
// from the body, viewed from the SIDE, is mostly a DEPTH change (motion
// roughly perpendicular to the camera's 2D image plane) — exactly the class
// of motion the existing segmentLengthRatio/planarity primitive is built to
// catch (already proven for squat's thigh/shin and shoulder press's upper-
// arm foreshortening). Shipped disabled, matching every other planarity
// check in this file — none of them ship enabled without a real calibration
// pass first, and this is a brand new application with zero on-device data.
const CHEST_PRESS_PLANARITY: PlanarityCheckDef[] = [
  { id: 'uarm', jointA: 'leftShoulder', jointB: 'leftElbow',
    minRatio: 0.75, cue: 'KEEP ELBOWS IN, DON\'T FLARE OUT', fallbackReferenceRatio: 0.64, enabled: false },
];

// Side camera — either side (bestSide/planarity above only need the near
// arm) — same requiredJoints/requiredJointsAlt pattern as the raise family's
// RAISE_CAMERA_JOINTS_SIDE_A/B, wrist added since this metric (unlike
// raise's) needs it.
const CHEST_PRESS_CAMERA_JOINTS_A = ['leftShoulder',  'leftElbow',  'leftWrist'];
const CHEST_PRESS_CAMERA_JOINTS_B = ['rightShoulder', 'rightElbow', 'rightWrist'];

function chestPressVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          CHEST_PRESS_REP_METRIC,
    // topAngle/enter/exit reused VERBATIM from curl (CURL_REP_METRIC is the
    // same joint triad + metric type) — see this section's top comment.
    topAngle:           160,
    repEnterThreshold:  145,
    repExitThreshold:   150,
    // goodROMThreshold NOT from curl — from the explicit ask ("lower to
    // ~90° elbow"). PLACEHOLDER per CLAUDE.md: reasoned from the stated
    // movement, not device-verified. Send a [REP]/[METRIC] log.
    goodROMThreshold:   90,
    insufficientROMCue: 'LOWER FURTHER',
    formChecks:      [CHEST_PRESS_LOCKOUT_CHECK],
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    CHEST_PRESS_CAMERA_JOINTS_A,
      requiredJointsAlt: CHEST_PRESS_CAMERA_JOINTS_B,
    },
    // calibration/minRepInterval/phantomGuardFraction reused verbatim from
    // curlVariant() — same joint triad, same metric type, no reason to
    // expect different tempo or noise-rejection behavior.
    calibration:     { repsNeeded: 2, enterFraction: 0.50, exitFraction: 0.25 },
    minRepInterval:  0.5,
    planarityChecks: CHEST_PRESS_PLANARITY,
    phantomGuardFraction: 0.40,
  };
}

// ─── Shared lunge building-blocks ────────────────────────────────────────────
//
// Values mirror the verified lunge definition VERBATIM.
// Lunge-family variants share all joints, repMetric, thresholds, form checks,
// readyGate, calibration, and camera setup. Only id, displayName, and
// setupInstruction differ.
// Note: stepUp works correctly — the minimum(knee) metric tracks the stepping
// leg as it bends to place the foot on the box and counts the rep when the user
// stands fully on the box (knee extends past exitThreshold). Calibration derives
// the per-user box-height thresholds automatically.

const LUNGE_REP_METRIC: MetricDef = {
  type:  'minimum',
  left:  { type: 'jointAngle', a: 'leftHip',  pivot: 'leftKnee',  c: 'leftAnkle'  },
  right: { type: 'jointAngle', a: 'rightHip', pivot: 'rightKnee', c: 'rightAnkle' },
};

const LUNGE_FORM_CHECKS: FormCheckDef[] = [
  {
    id: 'torso_lean', cue: 'CHEST UP',
    metric: {
      type:  'average',
      left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
      right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
    },
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 35 },
    priority: 2, enabled: true,
  },
  {
    id: 'knee_drive', cue: 'DRIVE KNEE DOWN',
    metric: {
      type:  'minimum',
      left:  { type: 'jointAngle', a: 'leftHip',  pivot: 'leftKnee',  c: 'leftAnkle'  },
      right: { type: 'jointAngle', a: 'rightHip', pivot: 'rightKnee', c: 'rightAnkle' },
    },
    evaluateAt: 'atBottom', condition: { type: 'greaterThan', value: 115 },
    priority: 1, enabled: false,
  },
];

// NEAR / FAR split — see SQUAT_CAMERA_JOINTS_A/B (same minimum(jointAngle L/R)
// family, same side-on framing).
const LUNGE_CAMERA_JOINTS_A = ['leftShoulder',  'leftHip',  'leftKnee',  'leftAnkle'];
const LUNGE_CAMERA_JOINTS_B = ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle'];

const LUNGE_PLANARITY: PlanarityCheckDef[] = [
  { id: 'thigh_l', jointA: 'leftHip',  jointB: 'leftKnee',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.80, enabled: false },
  { id: 'shin_l',  jointA: 'leftKnee', jointB: 'leftAnkle',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.72, enabled: false },
];

function lungeVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          LUNGE_REP_METRIC,
    topAngle:           165,
    repEnterThreshold:  145,
    repExitThreshold:   150,
    goodROMThreshold:    95,  // tightened 105→95: reported not strict enough on depth
    insufficientROMCue: 'LUNGE DEEPER',
    formChecks:      LUNGE_FORM_CHECKS,
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup:     { setupInstruction, requiredJoints: LUNGE_CAMERA_JOINTS_A, requiredJointsAlt: LUNGE_CAMERA_JOINTS_B },
    calibration:     { repsNeeded: 2, enterFraction: 0.50, exitFraction: 0.25 },
    minRepInterval:  0.5,
    planarityChecks: LUNGE_PLANARITY,
  };
}

// ─── Shared tricep building-blocks ───────────────────────────────────────────
//
// Rep metric: lineVsVertical(from: wrist, to: elbow) — the forearm segment's
// angle from vertical. DECREASES as the elbow EXTENDS (forearm swings from
// horizontal → vertical), matching the engine's hardwired decreasing-metric
// state machine.
//
//   REST   (elbow bent, forearm ~horizontal): metric ≈ 80-85°
//   BOTTOM (elbow extended, forearm ~vertical): metric ≈ 0-15°
//
// Why not jointAngle(shoulder, elbow, wrist)?
//   That angle INCREASES during extension. The engine's state machine only
//   handles a DECREASING metric (enters rep on drop below enterThreshold, exits
//   on rise above exitThreshold, tracks the minimum). Using lineVsVertical(wrist→elbow)
//   gives a geometrically equivalent signal that decreases in the right direction.
//
// STOP — tricepKickback is EXCLUDED from this family:
//   For a kickback (bent-over, side view), the forearm goes from roughly vertical
//   (forearm hanging down, metric ≈ 0-10°) to horizontal at full extension (≈ 80-90°).
//   lineVsVertical INCREASES during extension regardless of which joint is 'from'.
//   No existing primitive can express a decreasing signal for kickback without
//   knowing the per-user bent-over torso angle. Fix requires either a repDirection
//   flag in the engine or a lineVsBodyAxis primitive — both are native changes.
//
// closegripPushup is added under the PUSH-UP family below (pushupVariant) —
//   its repMetric is the elbow jointAngle(shoulder,elbow,wrist), identical to
//   the push-up template. It does NOT belong in this family.
//
// reviewed: false for all — verify forearm angles on-device per variant.
// The workaround metric reads the correct direction for pushdown, overhead
// extension, and skullcrusher but exact thresholds need on-device confirmation.

const TRICEP_REP_METRIC: MetricDef = {
  type: 'bestSide',
  left:  { type: 'lineVsVertical', from: 'leftWrist',  to: 'leftElbow'  },
  right: { type: 'lineVsVertical', from: 'rightWrist', to: 'rightElbow' },
  leftJoints:  ['leftWrist',  'leftElbow'],
  rightJoints: ['rightWrist', 'rightElbow'],
};

// Elbow drift check: upper arm (shoulder→elbow) should stay near-vertical.
//   lineVsVertical(shoulder→elbow) ≈ 0° when upper arm is vertical (correct).
//   Increases when upper arm tilts forward/sideways (elbow drifting).
//   Separate L/R checks so the in-view side fires even when the other is occluded.
// LOOSENED 30→45: device log showed 43 and 31 firing against the 30 limit on
// reps done with correct elbow position. 45 sits above both observed values.
//
// PRIORITY 4→3: priority>=4 (FORM_OVERRIDE_ROM_PRIORITY, in ExerciseEngine.swift)
// means "this check's cue overrides insufficientROMCue even on a shallow rep."
// That's only mathematically justified when the flagged joint sits INSIDE the
// rep metric itself — curl's own elbow_drift is priority 4 for exactly that
// reason: CURL_REP_METRIC is a jointAngle with the elbow AS its pivot, so a
// drifted elbow literally reshapes the measured curl angle (a curled arm can
// read as shallower than it really is). TRICEP_REP_METRIC is different —
// lineVsVertical(wrist, elbow), the forearm's own angle — and elbow_drift
// measures a separate segment (lineVsVertical(shoulder, elbow), the upper
// arm). Tilting the upper arm doesn't reshape the forearm-vs-vertical
// reading the way an elbow-as-pivot angle gets reshaped, so priority 4 here
// was carried over from curl's pattern without the geometry that justifies
// it — on a partial rep it was winning the priority>=4 override every time,
// showing "KEEP ELBOWS IN" instead of "EXTEND FULLY" regardless of whether
// elbow position was the real problem. Priority 3 (below the override
// threshold) fixes that: on a shallow rep, EXTEND FULLY always wins now;
// elbow_drift still fires normally as the top-priority cue on any rep that
// DID reach full extension with bad elbow position (goodROM=true path is
// unaffected by this priority change).
// formCheckMinConf ADDED (Fix 5.1 investigation — "sometimes correctly says
// KEEP ELBOWS IN, sometimes wrongly says GOOD" on the same real flare):
// evaluateAt: 'throughoutMax' means one bad frame can't be corrected by a
// later good one — accumMax only ever goes up. ExerciseEngine's shared
// isReliable() gate (FORM_CHECK_MIN_CONF=0.6) excludes any frame where
// EITHER shoulder or elbow reads below that confidence from ever reaching
// accumMax at all. Tricep's forearm crosses in front of the torso at the
// bottom of the rep — the exact same self-occlusion already confirmed (see
// missingPersonGraceFrames above) to make Vision lose tracking here — and
// that's also the moment a real flare is most likely to be at its worst. If
// confidence dips on exactly that frame, the true peak silently never gets
// recorded and the rep can read GOOD despite a real fault. NOT CONFIRMED
// from a device log which of the two candidate causes (this, vs. the value
// genuinely oscillating right at the 45° line) is dominant — 0.45 is a
// reasoned interim floor (between kMinConf=0.25 "some data exists" and the
// default 0.6 "fully trust it"), NOT a verified number. The new confDrops
// diagnostic (ExerciseEngine.swift accumulate()) logs how many frames get
// excluded per rep — send a log from an inconsistent session and I'll know
// which cause it actually is instead of guessing a second time.
const TRICEP_ELBOW_DRIFT_L: FormCheckDef = {
  id: 'elbow_drift_l', cue: 'KEEP ELBOWS IN',
  metric: { type: 'lineVsVertical', from: 'leftShoulder', to: 'leftElbow' },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 45 },
  priority: 3, enabled: true, formCheckMinConf: 0.45,
};
const TRICEP_ELBOW_DRIFT_R: FormCheckDef = {
  id: 'elbow_drift_r', cue: 'KEEP ELBOWS IN',
  metric: { type: 'lineVsVertical', from: 'rightShoulder', to: 'rightElbow' },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 45 },
  priority: 3, enabled: true, formCheckMinConf: 0.45,
};
const TRICEP_TORSO_LEAN: FormCheckDef = {
  id: 'torso_lean', cue: 'STAY UPRIGHT',
  metric: {
    type:  'average',
    left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
    right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
  },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 20 },
  priority: 2, enabled: true,
};

// Standing exercises: all three checks enabled.
const TRICEP_FORM_CHECKS_STANDING: FormCheckDef[] = [
  TRICEP_ELBOW_DRIFT_L,
  TRICEP_ELBOW_DRIFT_R,
  TRICEP_TORSO_LEAN,
];

// Skullcrusher: person lies flat — torso lean is meaningless, disable it.
const TRICEP_FORM_CHECKS_LYING: FormCheckDef[] = [
  TRICEP_ELBOW_DRIFT_L,
  TRICEP_ELBOW_DRIFT_R,
  { ...TRICEP_TORSO_LEAN, enabled: false },
];

// Ready gate: all tricep variants use PASSTHROUGH_GATE.
// The far-side elbow is occluded in side-on view → confidence-based joint gates
// reliably fail even when the near arm is fully visible.

const TRICEP_PLANARITY: PlanarityCheckDef[] = [
  { id: 'forearm_l', jointA: 'leftWrist',  jointB: 'leftElbow',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.70, enabled: false },
  { id: 'forearm_r', jointA: 'rightWrist', jointB: 'rightElbow',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.70, enabled: false },
];

// Standing tricep variants (pushdown, overhead extension).
//
// ROOT CAUSE OF "ZERO REPS FOR MANY BUILDS," FINALLY FOUND (this is a
// THRESHOLD RANGE mismatch, not a suppression/occlusion issue — those were
// real bugs too and are fixed, but they were never THE reason for zero reps):
// the old thresholds (topAngle 85, enter 65, exit 84) assumed rest reads
// ~80-85° — that number was NEVER device-verified (flagged reviewed:false
// from the start). Two real settle logs now show the actual observed "top"
// reading is nowhere near that: top≈8.0 in one session, top≈35.2 in another
// — both far below 65, let alone 84. Once understood, this explains the
// zero-rep symptom completely and mechanically, not just approximately: the
// settle-resync path (ExerciseEngine.swift) correctly captures whatever the
// real observed top is and, since that's already below repEnterThreshold(65),
// immediately transitions into .inRep on the very first frame. But
// repExitThreshold(84) assumed the person could climb back up near 85 to
// complete the rep — if their whole real range only goes up to ~35, the
// metric can NEVER climb back above 84. The state machine enters a rep once,
// gets permanently stuck in .inRep for the rest of the session, and can never
// complete — zero reps, every single time, regardless of how many pushdowns
// were actually done. This is the exact "lateral raise had thresholds
// calibrated for the wrong range" bug class, now confirmed for tricep too.
//
// NEW THRESHOLDS (topAngle 45, enter 25, exit 35, ROM 10): reasoned from the
// two real observed anchors, not a full calibrated log — I do NOT have a
// clean [METRIC] trace of one full rep (rest → extension → rest), only two
// scattered "top" readings that themselves disagree by a lot (8 vs 35),
// which is itself a flag that something about this measurement may be
// unstable session-to-session (possibly bestSide picking a different arm,
// possibly camera framing/distance varying) — not just "needs one fixed
// number." Anchored to the more recent reading (35.2, from the session that
// reported this exact bug) with headroom: topAngle above it (45), entry
// requiring a real ~10° descent below it (25), exit reachable by returning
// close to the observed rest (35) rather than near the old, wrong 84.
// goodROMThreshold scaled proportionally from the old ratio (old ROM 25 was
// 70% of the way from topAngle 85 to 0; 70% of the new 35 range ≈ 10).
// EXIT_CONFIRM_FRAMES (now a real, working per-exercise default of 3) is the
// mechanism now protecting against double-counting from this narrower
// hysteresis gap — it wasn't active by the same name when this exercise's
// gap was last widened defensively, so a modest raw gap is safe to use again
// instead of over-widening the range itself.
// NOT FULLY CALIBRATED — send a [METRIC] log (already exists, value=/enter=/
// exit=/rom=, ~3/sec) spanning one full rep (hold at rest → push down fully →
// return) and I will set the final, real numbers from that instead of this
// reasoned interim fix.
function tricepVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          TRICEP_REP_METRIC,
    topAngle:           45,
    repEnterThreshold:  25,
    repExitThreshold:   35,
    // LOOSENED 10→15 (this round) — "EXTEND FULLY" reported firing "way too
    // often." Two contributing factors, not one: (1) goodROMThreshold=10 was
    // already flagged NOT FULLY CALIBRATED above — reasoned from two
    // scattered readings, not a real full-rep trace, so it may simply have
    // been tighter than genuine full extension actually reads on-device;
    // (2) last round's phantomGuardFraction fix (elsewhere in this file) made
    // partial reps that used to be silently rejected start COUNTING — some
    // of the increase in how often this cue is seen is that fix working as
    // asked, not a new bug (a rep that never registered before couldn't show
    // any cue at all). This still only ever evaluates repMinAngle (the
    // deepest point reached — the bottom of the pushdown), never the top; if
    // it's still firing on genuinely full reps after this, send a [REP] log
    // and I'll set a real number instead of loosening blind a second time.
    goodROMThreshold:   15,
    insufficientROMCue: 'EXTEND FULLY',
    formChecks:      TRICEP_FORM_CHECKS_STANDING,
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    ['leftShoulder',  'leftElbow',  'leftWrist'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow', 'rightWrist'],
    },
    // Widened 1.0→1.3 as an additional debounce layer alongside the hysteresis fix.
    minRepInterval:  1.3,
    planarityChecks: TRICEP_PLANARITY,
    // ROOT CAUSE (zero reps, confirmed from device log): approach-suppression
    // fired immediately and never released — "[ACTIVITY] state=suppressed
    // reason=approach torsoRef=0.414 baseline=0.191" — and stayed suppressed
    // for the whole session. Same failure mode already fixed for the hinge
    // family: torsoReference (2D shoulder-hip distance) is only a reliable
    // camera-distance proxy if the torso's own scale/angle stays roughly
    // constant during the rep. Tricep pushdown is typically done standing
    // close to a cable stack or with the torso leaning into the movement —
    // exactly the kind of torso-scale change (not real walking) that fools
    // this heuristic, same root cause as hinge's torso rotation. Genuinely
    // unreliable for this exercise, not a tunable threshold — opting out via
    // the same flag rather than re-tuning a signal that's structurally wrong
    // for this movement pattern.
    suppressApproachDetection: true,
    // FOLLOW-UP, log-confirmed (still zero reps after the approach-suppression
    // fix): the default 3-frame missing-person grace period wasn't the fix
    // either — a log showed "[ACTIVITY] rep abandoned — person left frame (3
    // consecutive missing frames)" on every single rep despite the user never
    // leaving. Tricep pushdown's forearm crosses in front of the torso at the
    // bottom of every rep, and Vision's whole-body detector can lose the
    // person entirely for longer than 3 frames from that self-occlusion
    // alone — a real, exercise-normal occlusion, not someone leaving. Raised
    // to 15 (~1.5s), comfortably above a typical brief occlusion and roughly
    // matched to this exercise's own minRepInterval (1.3s) — a genuine
    // walk-away is still caught once they're gone longer than that, and
    // completion itself stays separately protected (framesSincePoseGap still
    // requires clean tracking after any gap before trusting a completion).
    // Not device-verified as the exact right number — send a log if it's
    // still too short (or if it now lets a real walk-away complete a rep).
    missingPersonGraceFrames: 15,
    // ROOT CAUSE of "partial reps don't count at all" — same phantom-rep-guard
    // mechanism documented in detail on hingeVariant()'s phantomGuardFraction
    // above. For tricep's numbers (topAngle=45, goodROMThreshold=10): a bare
    // entry only guarantees ~20° of movement, but the guard (default fraction
    // 0.30 against the top→goodROM gap) requires ~10.5° AS LONG AS
    // repTopValue reads close to the 45° anchor — and tricep's own two real
    // device readings of "top" so far were 8.0 and 35.2, BOTH far below that
    // anchor, meaning this guard has likely been rejecting a large share of
    // real attempts every session, not just edge cases. Same fix as hinge,
    // same reasoning: lowered to 0.05 so a genuine entry isn't also required
    // to approach good depth to be counted at all — insufficientROMCue
    // ("EXTEND FULLY") is what should handle a shallow-but-real rep now.
    phantomGuardFraction: 0.05,
  };
}

// Skullcrusher: same thresholds as tricepVariant, lying-down form checks.
function skullcrusherVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          TRICEP_REP_METRIC,
    topAngle:           85,
    repEnterThreshold:  72,
    repExitThreshold:   82,
    goodROMThreshold:   25,
    insufficientROMCue: 'EXTEND FULLY',
    formChecks:      TRICEP_FORM_CHECKS_LYING,
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    ['leftShoulder',  'leftElbow',  'leftWrist'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow', 'rightWrist'],
    },
    minRepInterval:  1.0,
    planarityChecks: TRICEP_PLANARITY,
  };
}

// ─── Row family ────────────────────────────────────────────────────────────────
//
// HORIZONTAL PULL — new movement pattern, no prior coverage.
// Rep metric: bestSide jointAngle(shoulder, elbow, wrist).
//   Arm hangs straight (~165°) → elbow flexes to ~70-90° at peak pull.
//   Angle DECREASES during pull → matches engine's decreasing state machine
//   (same direction as bicep curl, but different starting range).
//
// Form checks expressible with existing primitives:
//   1. Incomplete pull → goodROMThreshold: 95° + insufficientROMCue: 'PULL HIGHER'. ✅
//   2. Torso swing (bent-over only) → average(lineVsVertical(hip→shoulder))
//      throughoutMin < 25° → 'STOP SWINGING'. Fires if torso jerked upright
//      (momentum cheat) at any point during the rep. ✅
//
// Form checks NOT expressible with existing primitives:
//   3. Back rounding → SKIPPED. Vision Body Pose has no mid-spine landmark.
//      Nearest proxy (signedDeviationFromLine: hip from shoulder→knee) measures
//      hip position deviation, not spinal curvature — too imprecise to use.
//
// Seated sub-family (seatedCableRow, machineRow) uses seatedRowVariant():
// completely different metric (distanceRatio wrist→hip) and form checks (torso lean)
// vs the bent-over sub-family. See seatedRowVariant() for full spec.
//
// Inverted row: included in bentOverRowVariant (same rep metric). The torso swing
// check (throughoutMin < 10°) does NOT fire for inverted rows — body is horizontal
// (~90°), never near 10°. The primary inverted-row fault (hips dropping) would need
// signedDeviationFromLine on shoulder→ankle axis, similar to push-up hip_sag —
// not added here; skipped and reported.

// bestSide picks whichever arm has higher average joint confidence.
// In side-on camera the far arm is occluded (shoulder + elbow + wrist all hidden behind
// torso) → consistently LOW confidence. Near arm is fully visible → HIGH confidence.
// bestSide reliably selects the near arm. On-device evidence for why NOT minimum:
//   [REP] #8 peak=0.6° (anatomically impossible — far arm junk reading)
//   [REP] #6 L=23.2° R=142.7° diff=84% — minimum was picking the 23.2° garbage
// minimum is deterministic but deterministically selects the bad side in side-on view.
const ROW_REP_METRIC: MetricDef = {
  type:  'bestSide',
  left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
  right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
  leftJoints:  ['leftShoulder', 'leftElbow', 'leftWrist'],
  rightJoints: ['rightShoulder', 'rightElbow', 'rightWrist'],
};

// Torso stability: normalizedVerticalGap(shoulder, hip).
//
// Previous metric lineVsVertical(hip→knee) REMOVED — structurally blind to torso rocking:
//   The legs are fixed; hip does not move relative to knee when the whole body swings.
//   On-device: full-body swing produced good checkmarks. A metric that can't detect
//   the fault cannot stay.
//
// WHY normalizedVerticalGap(shoulder, hip):
//   Measures how far the shoulder is ABOVE the hip (value = vertical gap / torso length).
//   In proper hinged position (back ~horizontal): shoulder ≈ hip height → value near 0.
//   Heaving toward upright: shoulder rises above hip → value increases and check fires. ✓
//   Scapular retraction moves shoulder HORIZONTALLY (backward in 3D) — minimal vertical
//   component → this metric is largely uncontaminated by correct form. ✓
//
// Threshold: throughoutMax > 0.70 (tightened from 0.80 — "slightly stricter
// overall" request; on-device calibration: stable bent-over torso consistently
// logs 0.56–0.58, so 0.70 still leaves a 0.12-unit margin above the measured
// stable range — smaller than the original 0.22 but not shaving into observed
// good-rep noise. Genuine heave (torso toward upright ≈ 1.0) still fires well
// clear of threshold. ✓
const ROW_TORSO_SWING: FormCheckDef = {
  id:         'torso_swing',
  cue:        'STOP SWINGING',
  metric: {
    type:  'average',
    left:  { type: 'normalizedVerticalGap', upper: 'leftShoulder',  lower: 'leftHip'  },
    right: { type: 'normalizedVerticalGap', upper: 'rightShoulder', lower: 'rightHip' },
  },
  evaluateAt: 'throughoutMax',
  condition:  { type: 'greaterThan', value: 0.70 },
  priority:   1,
  enabled:    true,
};

// Ready gate: all row variants use PASSTHROUGH_GATE (see top of file).
// Far-arm occlusion in side-on view makes confidence-based gates unusable here.
// Junk-rep protection is provided by the phantom-rep guard (26.4° min movement
// required), minRepInterval: 0.8, and repEnterThreshold: 85° (83° below start).

const ROW_PLANARITY: PlanarityCheckDef[] = [
  {
    id: 'uarm_l', jointA: 'leftShoulder', jointB: 'leftElbow',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.64, enabled: false,
  },
];

// Side view makes torso hinge and elbow travel both visible.
// Knee included to improve Vision's hip confidence for a bent-over person.
const ROW_CAMERA_JOINTS_A = ['leftShoulder',  'leftElbow',  'leftWrist',  'leftHip',  'leftKnee'];
const ROW_CAMERA_JOINTS_B = ['rightShoulder', 'rightElbow', 'rightWrist', 'rightHip', 'rightKnee'];

// Bent-over variants: hinged torso, torso swing check active.
//
// Threshold design (on-device logs: start=168-176°, good peaks=40-60°, shallow-bad=82-94°):
//
//   topAngle:          168  — matches logged start position
//
// FIXED — repEnterThreshold was 85, chosen specifically so casual arm-swinging
// (not a real pull attempt) wouldn't register a rep at all. That decision
// directly caused the reported bug: repEnterThreshold(85) sits IN THE MIDDLE
// of the logged shallow-bad cluster (82-94°) — a shallow pull peaking anywhere
// from 86-94° never even crosses 85 to register as an attempt, so it silently
// doesn't count, contradicting the app's own philosophy ("a partial rep should
// COUNT but be marked BAD with the ROM cue, not silently ignored" — and arm-
// swinging that doesn't reach depth is exactly the "PULL HIGHER" case, not
// something to hide). Widened to 100 — comfortably above the entire logged
// 82-94° shallow-bad range, so any of those attempts now register and
// correctly fail goodROM(80) with 'PULL HIGHER' instead of being invisible.
// Swinging is still separately caught by ROW_TORSO_SWING when it involves real
// torso movement — this change only affects whether a shallow/swung pull
// COUNTS (as bad), not whether it's flagged as swinging.
//
//   repExitThreshold:  110  — 10° hysteresis above the new entry, same gap as before.
//
//   goodROMThreshold:   80  — UNCHANGED. Logged good reps 40-60° → 20° margin ✓
//                            Logged shallow reps 82-94° now correctly enter and fail.
//
//   Phantom guard: required = max(abs(168−80)×0.30, 0.01) = 26.4°.
//   New minimum entry movement = 68° (168° to 100°). 68 > 26.4 ✓ (was 83 > 26.4)
function bentOverRowVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          ROW_REP_METRIC,
    topAngle:           168,
    repEnterThreshold:  100,
    repExitThreshold:   110,
    // TIGHTENED 80→65: "pull-depth not strict enough, tighten so shallow pulls
    // are caught." Logged good reps were 40-60°, logged shallow-bad 82-94° —
    // 65 leaves only a 5° margin above the observed good-rep ceiling (60),
    // meaningfully stricter while not cutting into confirmed-good data.
    goodROMThreshold:    65,
    insufficientROMCue: 'PULL HIGHER',
    formChecks:         [ROW_TORSO_SWING],
    readyGate:          PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    ROW_CAMERA_JOINTS_A,
      requiredJointsAlt: ROW_CAMERA_JOINTS_B,
    },
    minRepInterval:  0.8,
    planarityChecks: ROW_PLANARITY,
  };
}

// ─── Seated sub-family: complete rebuild ─────────────────────────────────────
//
// The seated cable row is a HORIZONTAL pull. Elbow angle (used by bentOverRowVariant)
// is wrong — the governing motion is the HAND TRAVELING FROM EXTENDED-FORWARD TO
// touching the abdomen, not elbow flexion depth. The correct metric is the 2D distance
// between the wrist and the hip, body-normalized (= distanceRatio).
//
// distanceRatio(a, b) = |a - b| / torsoReference (shoulder→hip on best-visible side).
// Scale (measured on-device):
//   Arm extended (start): ~2.0 torso lengths from hip
//   Handle at stomach (end): ~0.1 torso lengths from hip
//
// Metric DECREASES during the pull → matches engine's hardwired DECREASING direction. ✓
//
// maximum picks the larger wrist-to-hip ratio — always the near arm. Far arm always reads
// near-zero (occluded in side-on view, collapsed 2D position). See SEATED_ROW_REP_METRIC.
//
// THRESHOLDS calibrated from on-device [REP] log.
// Native batch item: add "[REP] wristToHip=X.XX enter=Y exit=Z" per rep (still needed for future tuning).

const SEATED_ROW_REP_METRIC: MetricDef = {
  type:  'maximum',
  left:  { type: 'distanceRatio', a: 'leftWrist',  b: 'leftHip'  },
  right: { type: 'distanceRatio', a: 'rightWrist', b: 'rightHip' },
  // maximum over bestSide: the far wrist is always occluded in side-on view and collapses to
  // near-zero 2D distance from the hip (hidden behind/near the torso → ~0 projected gap).
  // maximum always returns the LARGER of left and right — always the near arm (real wrist-to-hip
  // gap) at every point in the ROM. bestSide could wrongly pick the far side if the near wrist
  // happened to be at the frame edge during full extension (low confidence on that joint).
};

// Torso lean check: seated row torso should stay roughly vertical.
// lineVsVertical(hip→shoulder): 0° = spine vertical. Increases when leaning back.
// WHY lineVsVertical(hip→shoulder) is usable here (unlike bent-over row):
//   Bent-over row: baseline angle was ~45° (tilted), so scapular retraction
//   (shoulder moving backward) caused ~30-40° swing in the 2D projected angle.
//   Seated row: baseline is near 0° (vertical). Scapular retraction adds ~3-8°.
//   On-device: 29-34° measured on normal seated reps — 30° fired on clean reps.
//   45° lets full-range reps pass; backward body rock (>50°) still triggers.
//   Note: standing up also fires this cue until native inactivity detection ships.
// Calibrate once [REP] torsoLean=X.X limit=45 logging is added (native batch item).
const SEATED_ROW_TORSO_CHECK: FormCheckDef = {
  id:         'torso_lean',
  cue:        'SIT UP TALL',
  metric: {
    type:  'average',
    left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
    right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
  },
  evaluateAt: 'throughoutMax',
  condition:  { type: 'greaterThan', value: 45 },
  priority:   1,
  enabled:    true,
};

// Elbow-bend check at peak pull — detects hands-leading fault.
// jointAngle(shoulder→elbow←wrist): when elbows drive back, both shoulder and wrist are
// on the SAME side of the elbow (both "in front" of the elbow position behind the body),
// producing an acute angle (~50-65°). When hands lead without elbow drive, the elbow barely
// moves: shoulder is above and the wrist is pulled inward, diverging from opposite sides of
// the elbow → obtuse angle (~80-90°).
// Camera-orientation agnostic: the angle does not depend on which way the user faces.
// bestSide: uses the near (higher-confidence) elbow — far side is occluded in side-on view.
// Threshold 75° is a calibration estimate — verify from on-device [REP] elbow_drive=X log.
// throughoutMin: captures minimum angle across the whole rep rather than the single frame
// where repMetric is minimum. Robust against single-frame occlusion at peak pull (elbow
// close to body → Vision confidence drops → atBottom sample returns nil → check skipped).
const SEATED_ROW_ELBOW_CHECK: FormCheckDef = {
  id:         'elbow_drive',
  cue:        'DRIVE ELBOWS BACK',
  metric: {
    type:  'bestSide',
    left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
    right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
    leftJoints:  ['leftShoulder',  'leftElbow',  'leftWrist' ],
    rightJoints: ['rightShoulder', 'rightElbow', 'rightWrist'],
  },
  evaluateAt: 'throughoutMin',
  condition:  { type: 'greaterThan', value: 75 },
  priority:   2,
  enabled:    true,
};

// Camera joints for seated row: wrist + elbow (for visibility) + shoulder + hip.
// No knee — seated exercise, knee not needed for any metric or check.
const SEATED_ROW_CAMERA_JOINTS_A = ['leftShoulder',  'leftElbow',  'leftWrist',  'leftHip'];
const SEATED_ROW_CAMERA_JOINTS_B = ['rightShoulder', 'rightElbow', 'rightWrist', 'rightHip'];

// Seated variants: upright torso, horizontal pull, wrist-to-hip metric.
// Passthrough gate — same far-arm occlusion problem as bent-over row (see PASSTHROUGH_GATE).
// Phantom guard: required = max(abs(1.9 - 0.85) * 0.30, 0.01) = 0.315.
// Min entry movement = 1.9 - 1.2 = 0.7 torso lengths. 0.7 > 0.315 ✓
function seatedRowVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          SEATED_ROW_REP_METRIC,
    // Threshold design (measured on-device: start ~2.0, finish ~0.1):
    //   topAngle:          1.9  — just below the ~2.0 measured start (arm extended toward cable).
    //   repEnterThreshold: 1.2  — hand must travel 0.8 torso lengths inward before rep registers.
    //   repExitThreshold:  1.4  — rep fires early on return. Hysteresis: 1.4 − 1.2 = 0.2 ✓
    //   goodROMThreshold:  0.85 — on-device peak logged at 0.8 on full pulls; 0.6 fired every rep.
    //                             Finish 0.1–0.8 passes; stopping at ~1.0+ fires the cue.
    //                             Fires 'PULL TO YOUR STOMACH' if peak > 0.85.
    topAngle:           1.9,
    repEnterThreshold:  1.2,
    repExitThreshold:   1.4,
    goodROMThreshold:   0.85,
    insufficientROMCue: 'PULL TO YOUR STOMACH',
    formChecks:         [SEATED_ROW_TORSO_CHECK, SEATED_ROW_ELBOW_CHECK],
    readyGate:          PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    SEATED_ROW_CAMERA_JOINTS_A,
      requiredJointsAlt: SEATED_ROW_CAMERA_JOINTS_B,
    },
    minRepInterval:  0.8,
    planarityChecks: [],
  };
}

// ─── Hip-hinge family building-blocks ─────────────────────────────────────────
//
// GENUINELY NEW TEMPLATE — not a squat clone. Squat is knee-dominant (large
// knee flexion, torso stays upright); hinge is hip-dominant (torso travels
// from vertical toward horizontal, knee flexion stays minimal ~5-20°).
// Opposite emphasis, so it needs its own repMetric, not squat's.
//
// PLACEHOLDER WARNING: every threshold below is unverified — lineVsHorizontal
// has never been used in this codebase before. Do 5 reps of romanianDeadlift
// (bodyweight/dowel is fine for calibration) once this reloads, and send the
// [REP] log — real repEnterThreshold/repExitThreshold/goodROMThreshold will be
// set from your actual numbers, not these placeholders.
//
// REP METRIC: lineVsHorizontal(hip, shoulder) — the torso's angle FROM
// horizontal. Standing (vertical torso) = 90°. Fully hinged (horizontal torso)
// = 0°. DECREASES as the person hinges deeper, matching the engine's hardwired
// decreasing-metric convention (same direction as squat's knee angle). Chosen
// over lineVsVertical (used elsewhere for torso lean — squat's back_lean,
// shoulderPress's lean_back) specifically because its complement gives a
// directly decreasing signal for this movement, and matches the "degrees from
// horizontal" framing hinge depth is usually described in.
//
// hip→shoulder as a joint PAIR is already proven in this codebase (squat's
// back_lean, shoulderPress's lean_back both use it, via lineVsVertical) — the
// new part is using it as the PRIMARY rep metric via lineVsHorizontal, and
// every number below. None of it has on-device validation yet.
const HINGE_REP_METRIC: MetricDef = {
  type:  'average',
  left:  { type: 'lineVsHorizontal', from: 'leftHip',  to: 'leftShoulder'  },
  right: { type: 'lineVsHorizontal', from: 'rightHip', to: 'rightShoulder' },
};

// FORM CHECK — squatting instead of hinging: REMOVED, second time, for good.
//
// History: v1 used jointAngle(hip,knee,ankle) with an inverted operator AND a
// hip-contaminated metric (fixed once already). v2 switched to
// lineVsVertical(ankle,knee) — shin angle from vertical, excluding the hip —
// with a lenient placeholder limit of 25°.
//
// On-device data on v2 (clean hinge reps, NO squatting, confirmed by the
// user): knee_bend ranged 22–56° — a 34° spread from stance/camera-framing
// variation ALONE, within one person's own correct reps on the same set.
// Every value above 25 (34.8, 48.5, 50.0, 56.1) wrongly fired "DON'T SQUAT".
//
// VERDICT: raising the limit to 60-65 (the next thing to try) would not
// actually fix this — it only leaves a 4-9° margin above the observed noise
// ceiling (56), against a metric that already showed 34° of noise-driven
// variance in one small sample. That's not a safe margin, it just lowers how
// often it misfires. More importantly: squat's OWN analogous check
// (heel_rise, the exact same lineVsVertical(ankle,knee) metric) was written
// with a similarly lenient threshold (20°) and left disabled, never
// validated — the strongest signal in this codebase that this specific
// metric doesn't cleanly discriminate even for its ORIGINAL purpose, let
// alone for telling a hinge apart from a squat. No reliable daylight between
// the two on this metric — removing rather than shipping a check that will
// keep firing on correct form. Depth (insufficientROMCue) is the only
// Layer-1 check for this family now; the torso-angle rep metric itself
// already works well (confirmed from real device log: top=89.5, bottom=20.5).

// FORM CHECK — rounded upper back: NOT BUILT, on purpose. Apple Vision has no
// spine/mid-back landmark (only nose, shoulders, elbows, wrists, hips, knees,
// ankles — see Joints.swift's Joint enum) — there is no way to see curvature
// in the torso line from only its two endpoints. Same limitation already
// documented for the row family's flat-back attempts. Rounding itself STAYS
// not-built — nothing below changes that.

// FORM CHECK — torso pitching too far forward for the depth reached (catches
// a rounded/excessive-lean back, not a rep that's just deep). Metric:
// lineVsVertical(hip, shoulder), standing ≈ 0°.
//
// CONFIRMED on-device: a deliberately-bad full-back-roll rep read 87.4 and
// correctly failed; good reps read 54.5 and correctly passed. 72 sits
// between those two real readings — a somewhat-strict line that catches
// clearly-bad rounding without flagging borderline-but-fine reps.
//
// REVERTED 64→72 (this round): the prior round retightened this to 64 to
// chase one under-firing report, which instead made it fire too often /
// inconsistently on reps that were fine — the classic overcorrection this
// app keeps landing on for this exact check. Back to the one number that's
// actually confirmed against real good/bad readings. Simple, one check, one
// job: don't re-tighten this again without a fresh log with real numbers.
const HINGE_TORSO_ANGLE_CHECK: FormCheckDef = {
  id: 'torso_angle', cue: 'STRAIGHTEN YOUR BACK',
  metric: {
    type:  'average',
    left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
    right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
  },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 72 },
  priority: 1, enabled: true,
};

// FORM CHECK — leaning instead of hinging (torso pitches forward but the
// hips never travel back). A lean can reach the same torso_angle as a real
// hinge, so torso_angle alone can't tell them apart; a real hinge's hips
// travel backward relative to the planted ankle, a lean's don't —
// normalizedHorizontalGap(hip, ankle) measures exactly that. FLAG, not a
// gate: a low reading counts the rep and cues "STRAIGHTEN YOUR BACK" rather
// than rejecting it outright (a gate here previously caused shallow and
// knees-bent reps to vanish silently — do not reintroduce gatesCounting on
// this check).
const HINGE_HIP_DRIFT_FLAG_CHECK: FormCheckDef = {
  id: 'hip_drift_flag', cue: 'STRAIGHTEN YOUR BACK',
  metric: {
    type:  'average',
    left:  { type: 'normalizedHorizontalGap', a: 'leftHip',  b: 'leftAnkle'  },
    right: { type: 'normalizedHorizontalGap', a: 'rightHip', b: 'rightAnkle' },
  },
  // REVERTED 0.15→0.08 (this round) — same overcorrection as torso_angle
  // above: widened last round to chase an under-firing report, which
  // instead made it fire too often. 0.08 is the original, unconfirmed-but-
  // reasoned placeholder — still not device-calibrated, but not re-widened
  // blind a second time either. Send a [REP] log (already logs this value
  // every rep) if it's still wrong and I'll set a real number from that.
  evaluateAt: 'atBottom', condition: { type: 'lessThan', value: 0.08 },
  priority: 2, enabled: true,
};

// Side-on so torso travel and hip movement are both visible. Ankle added
// (wasn't previously required) — HINGE_HIP_DRIFT_FLAG_CHECK needs it visible;
// still no far-side wrist, which is what caused occlusion bugs elsewhere.
const HINGE_CAMERA_JOINTS_A = ['leftShoulder',  'leftHip',  'leftKnee',  'leftAnkle'];
const HINGE_CAMERA_JOINTS_B = ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle'];

function hingeVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
  // Widened 0.5→0.7 as part of the double-counting fix below — kettlebellSwing
  // passes its own explicit 0.3 (faster, explosive tempo) and is unaffected.
  minRepInterval:   number = 0.7,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric: HINGE_REP_METRIC,
    // Rep-range thresholds — first on-device log confirmed the shape of these:
    // top=89.5° (topAngle placeholder was 90, essentially exact), bottom=20.5°
    // for a genuinely full hinge. goodROMThreshold history: 55 → 40 → 45.
    // 55 was reported "not strict enough" (shallow hinges passed); 40 (the
    // next tightening) was then reported firing "randomly" on genuinely good
    // full reps. Those two reports pull in opposite directions, which is
    // itself useful information: it suggests either (a) real good-rep depth
    // varies more rep-to-rep than the single 20.5° data point suggested, so
    // no fixed cutoff near 40 can satisfy both without more data, or (b) a
    // single noisy frame at the exact bottom of a rep is occasionally
    // corrupting peakAngle (this check uses ONE frame's minimum reading, not
    // an average) — I can't tell which from a description alone. 45 is a
    // reasoned middle ground between the two reported extremes, NOT a
    // confirmed fix — please send a fresh [REP] log with peak values from a
    // few reps you'd call genuinely good vs shallow so I can set this from
    // real numbers instead of splitting the difference a second time.
    // DOUBLE-COUNTING FIX: hysteresis (enter→exit gap) was only 5° — narrow on
    // its own, and proportionally much tighter than tricep's already-fixed 10°
    // gap relative to each exercise's total ROM (hinge's full range is roughly
    // 55-70°, tricep's ~60°, so 5° here is under 10% of the range vs tricep's
    // ~17%). A small wobble/settle right at the top between reps could dip back
    // below entry and re-trigger a second completion for one physical rep —
    // same failure class as tricep's documented cable-rebound double-count,
    // just from body sway/settle instead of cable elasticity. Widened to a 12°
    // gap (75/87) — exit kept at 87, safely below the one confirmed real
    // standing reading (89.5°) so a genuine return to standing still completes
    // the rep; entry moved deeper (75) so a small settle near the top can't
    // reach it. Reasoned from the existing tricep precedent, not a fresh log of
    // this exact double-count event — send a log if it still double-counts and
    // I'll tune from the real oscillation values.
    topAngle:           90,
    repEnterThreshold:  75,
    repExitThreshold:   87,
    goodROMThreshold:   45,
    insufficientROMCue: 'HINGE DEEPER',
    // knee_bend removed — see "REMOVED, second time, for good" comment above.
    // torso_angle added — see HINGE_TORSO_ANGLE_CHECK comment (placeholder,
    // needs a real log — this is a NEW check, not a revival of knee_bend).
    // hip_drift_flag added — see HINGE_HIP_DRIFT_FLAG_CHECK comment — catches
    // near-zero hip travel (pure lean, knee-bent-rounded-back, or any other
    // form fault that keeps the hip over the ankle instead of behind it) as
    // a counted-but-flagged rep, cueing STRAIGHTEN YOUR BACK. No longer a
    // gate — see that comment for why.
    formChecks:         [HINGE_TORSO_ANGLE_CHECK, HINGE_HIP_DRIFT_FLAG_CHECK],
    readyGate:          PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    HINGE_CAMERA_JOINTS_A,
      requiredJointsAlt: HINGE_CAMERA_JOINTS_B,
    },
    minRepInterval,
    planarityChecks: [],
    // See ExerciseEngine.swift updateActivityState — torso-scale approach
    // detection is fundamentally unreliable for this family (confirmed
    // on-device even after the repPhase-gate fix): the hinge's own torso
    // rotation inflates the same shoulder-hip distance signal walking closer
    // to the camera would. Inactivity-based suppression (8s idle) stays.
    suppressApproachDetection: true,
    // ROOT CAUSE of "still only counts GOOD reps, imperfect ones vanish
    // silently" (reported after the hip_drift gate was already removed —
    // this is a DIFFERENT, still-active native gate): the phantom-rep guard
    // (ExerciseEngine.swift completeRep, "movement >= required") measures
    // required movement as a fraction of |repTopValue - goodROMThreshold|
    // (45°), NOT of |repTopValue - repEnterThreshold| (75°). Worked out
    // algebraically: with the default fraction (0.30), a rep only clears the
    // guard if repTopValue >= ~87.9° — just ~1.6° of headroom above the one
    // confirmed standing reading (89.5°). Any real-world dip in repTopValue
    // between reps (not fully returning to standing, camera drift, fatigue)
    // pushes a genuinely-entered, genuinely-shallow rep below that line and
    // it's silently rejected as "phantom" — logged, not counted, no cue.
    // This is the actual live mechanism behind the report, not a guess: the
    // JS-level hip_drift gate this was blamed on last round was already
    // removed, so something else native had to be doing the rejecting, and
    // this is the only other place completeRep() can be skipped for
    // literally every exercise right now (gatesCounting is currently unset
    // everywhere). FIX: lowered to 0.05 — this doesn't disable the guard
    // (a true zero-movement noise blip still fails it), it just stops it
    // from ALSO requiring near-good depth to register as a rep at all,
    // matching the explicit ask that only a true non-attempt should not
    // count. See exerciseDefinitions.ts's FormCheckDef-adjacent comment on
    // phantomGuardFraction — default (0.30) is left alone for every other
    // exercise since curl specifically NEEDS the stricter default (it was
    // raised to 0.40 there to reject small wiggles) and no other exercise
    // has a confirmed report of this failure mode.
    phantomGuardFraction: 0.05,
  };
}

// ─── Shoulder/arm isolation raise family building-blocks ──────────────────────
//
// BASED ON shoulderPress (closest existing exercise — arm-angle movement,
// front-facing). Reused directly: the bestSide combinator (shoulder press uses
// it even front-facing, for per-frame confidence robustness — not occlusion),
// the lineVsVertical(shoulder, elbow) joint pair for the rep metric, and the
// lineVsVertical(hip, shoulder) torso-lean check verbatim (same "stay upright"
// concern as shoulder press's own lean_back check).
//
// DIRECTION FIX (new for this family): shoulder press's metric naturally
// DECREASES during the press because raising the arm OVERHEAD moves it toward
// vertical, which lineVsVertical reads as low. A lateral raise moves the arm
// toward HORIZONTAL instead, which lineVsVertical reads as HIGH — backwards
// for the engine's hardwired decreasing-metric state machine (verified: entry
// requires the metric to drop below repEnterThreshold, no exception exists).
// Solved exactly as for the hip-hinge family: use the complement,
// lineVsHorizontal(shoulder, elbow), which decreases from ~90° (arms down) to
// ~0° (arms at shoulder height) — matches engine convention, no engine change.
//
// PLACEHOLDER WARNING: every threshold below is unverified — this is the first
// use of lineVsHorizontal(shoulder,elbow) in this codebase. Do 5 reps of
// lateralRaise once this reloads and send the [REP] log.
const RAISE_REP_METRIC_FRONT: MetricDef = {
  type: 'bestSide',
  left:  { type: 'lineVsHorizontal', from: 'leftShoulder',  to: 'leftElbow'  },
  right: { type: 'lineVsHorizontal', from: 'rightShoulder', to: 'rightElbow' },
  leftJoints:  ['leftShoulder',  'leftElbow'],
  rightJoints: ['rightShoulder', 'rightElbow'],
};

// Side-camera version for the front raise (see camera-angle reasoning below) —
// same joint pair and metric, bestSide here for genuine far-side occlusion
// (row/hinge's reason) rather than shoulder press's confidence-robustness reason.
const RAISE_REP_METRIC_SIDE: MetricDef = {
  type: 'bestSide',
  left:  { type: 'lineVsHorizontal', from: 'leftShoulder',  to: 'leftElbow'  },
  right: { type: 'lineVsHorizontal', from: 'rightShoulder', to: 'rightElbow' },
  leftJoints:  ['leftShoulder',  'leftElbow'],
  rightJoints: ['rightShoulder', 'rightElbow'],
};

// FORM CHECK — going too high (above shoulder height): REMOVED.
//
// This was built to be feasible (it was — normalizedVerticalGap(elbow,
// shoulder) cleanly detects the elbow rising above shoulder height, unlike
// the rep metric itself which is direction-blind), but it was the wrong
// check to build, not an unreliable one. Going above shoulder height on a
// lateral raise is not a form fault for a general user — it shifts emphasis
// from the side delt to the traps, which is "less optimal," not wrong or
// dangerous. Flagging it as bad form is misleading (and it was also firing
// inconsistently on top of that). Removed rather than kept disabled — this
// isn't a "revisit if the metric improves" situation, it's a judgment call
// that the fault itself shouldn't be flagged. Incomplete ROM (not raising
// high enough) is the only ROM-direction check that remains.

// FORM CHECK — swinging/using body momentum instead of raising with control.
// Reuses shoulder press's exact lean_back check (same joint pair, same
// condition direction) — same "stay upright" concern, proven metric type.
// Jerk/velocity-based swing detection was considered and is NOT feasible: the
// Metric/FormCheck framework has no frame-to-frame rate-of-change primitive,
// only instantaneous spatial readings — not attempting it.
// PLACEHOLDER threshold — inherited as a starting point from shoulder press's
// own value (20°), itself never on-device verified. Verify from [REP] log.
const RAISE_SWING_CHECK: FormCheckDef = {
  id:         'swinging',
  cue:        'CONTROL IT, NO SWINGING',
  metric: {
    type:  'average',
    left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
    right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
  },
  evaluateAt: 'throughoutMax',
  condition:  { type: 'greaterThan', value: 20 },  // PLACEHOLDER — verify from [REP] log
  priority:   2,
  enabled:    true,
};

// FORM CHECK — wrong direction: raised forward instead of out to the sides
// (lateral raise ONLY — front-facing camera). FEASIBILITY: assessed as
// cleanly detectable. Reasoning: a genuine lateral raise moves the wrist
// AWAY from the body's vertical centerline (large horizontal displacement,
// clearly visible face-on to a front camera). Raising forward instead keeps
// the wrist near that same centerline (motion is toward the camera, not
// sideways) — the two are geometrically distinguishable in 2D, not just in
// depth. Metric: bodyRelativeDeviation(wrist, axisFrom: shoulder, axisTo: hip)
// — perpendicular distance of the wrist from the (near-vertical, for an
// upright torso) shoulder-hip line, i.e. how far sideways the wrist has moved
// from the body's own centerline. Same primitive already proven in shoulder
// press's wrist_track_l/r checks (there: value 0.25 flags a wrist NOT
// travelling in a straight vertical line — a small deviation is already
// noteworthy in that context). A real lateral raise should reach much
// further than that (wrist travels most of an arm's length sideways), so
// firing when the rep's OWN maximum deviation never gets reasonably large is
// the fault signal here. PLACEHOLDER threshold — no on-device data for this
// specific use yet, verify from the [REP] log (wrong_direction=value/lim=...).
const RAISE_DIRECTION_CHECK: FormCheckDef = {
  id:         'wrong_direction',
  cue:        'RAISE OUT TO THE SIDES',
  metric: {
    type:  'average',
    left:  { type: 'bodyRelativeDeviation', point: 'leftWrist',  axisFrom: 'leftShoulder',  axisTo: 'leftHip'  },
    right: { type: 'bodyRelativeDeviation', point: 'rightWrist', axisFrom: 'rightShoulder', axisTo: 'rightHip' },
  },
  evaluateAt: 'throughoutMax',
  condition:  { type: 'lessThan', value: 0.4 },  // PLACEHOLDER — verify from [REP] log
  priority:   3,
  enabled:    true,
};

// FORM CHECK — bent elbows. REMOVED entirely (not just disabled).
//
// History: built with a deliberately wide placeholder (120°), then disabled
// after two on-device misfire reports (fired with arms genuinely straight;
// implicated in a second report of a correct sideways flare getting flagged).
// A disabled check still evaluates to "always passes," which reads to the
// user as "broken/fake — says GOOD on anything" — correct, since it wasn't
// running at all. With zero confirmed correct fires across two rounds of
// testing and no device data suggesting a working threshold exists, per the
// standing rule this is now a genuine "not reliably detectable with this
// primitive/camera-angle" verdict, not a "needs another guess." Removed
// rather than left disabled so it can't be mistaken for active protection.
//
// jointAngle(shoulder, elbow, wrist) itself is a proven primitive elsewhere
// (curl/tricep's own primary rep metric) — the elbow-angle reading just isn't
// clean enough for THIS exercise's camera angle/motion to support a "stay
// near-straight throughout" constraint, which no other exercise has needed.

// CAMERA — lateral raise: FRONT-facing. The raise's arc stays in the frontal
// plane (side-to-side), which is parallel to a front camera's image plane —
// no foreshortening at any point in the rep (the ideal angle for this
// movement), and both arms are genuinely visible with no occlusion (unlike
// every side-view family so far). Includes hips explicitly (unlike shoulder
// press's requiredJoints, which omits them despite its own lean_back check
// needing them) since the swing check is one of only two active checks here.
// NEAR / FAR split — repMetric is bestSide(lineVsHorizontal(shoulder→elbow)),
// tracks off one arm. (Advisory only after the FIX 1 native build.)
const RAISE_CAMERA_JOINTS_FRONT_A = ['leftShoulder',  'leftElbow',  'leftWrist',  'leftHip'];
const RAISE_CAMERA_JOINTS_FRONT_B = ['rightShoulder', 'rightElbow', 'rightWrist', 'rightHip'];

// CAMERA — front raise: SIDE-facing, not front. A front raise's arc is in the
// sagittal plane, which points straight at a front camera — the arm would
// foreshorten to nearly nothing at the top (the exact class of bug that broke
// curl's forearm planarity check). A side camera keeps the whole arc in-plane,
// same reasoning as squat/hinge. requiredJointsAlt mirrors row/hinge's
// occlusion-tolerant fallback pattern for whichever side faces the camera.
const RAISE_CAMERA_JOINTS_SIDE_A = ['leftShoulder',  'leftElbow',  'leftHip'];
const RAISE_CAMERA_JOINTS_SIDE_B = ['rightShoulder', 'rightElbow', 'rightHip'];

function lateralRaiseVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric: RAISE_REP_METRIC_FRONT,
    // FIXED from real device log. Original topAngle=90 assumed arms-down
    // reads mathematically-vertical (lineVsHorizontal=90); the real device
    // log showed [GATE] metric=71.689 with arms genuinely hanging at rest —
    // relaxed arms don't hang perfectly vertical (natural carrying angle,
    // shoulder width holds the upper arm out from true vertical slightly),
    // so real rest reads ~72, not ~90. That put repEnterThreshold=75 ABOVE
    // the resting value instead of below it — the engine's .atTop case enters
    // a rep when the metric drops BELOW repEnterThreshold, so resting at 72
    // (already below 75) looked like a rep had already started before any
    // arm movement happened, and every real raise from there just moved
    // further away from repExitThreshold instead of crossing back through
    // it. Zero reps. Metric DIRECTION was correct (confirmed: lineVsHorizontal
    // decreases from ~72 at rest toward ~0 as the arm reaches shoulder
    // height — same decreasing convention as every other exercise); this was
    // a threshold-calibration bug, not a direction bug.
    // New values: topAngle=72 (real measured rest). repEnterThreshold/
    // repExitThreshold WIDENED from the original 60/65 (only a 5° gap) to
    // 55/68 (13° gap) — the 5° gap was the same class of bug already fixed
    // for tricep (21fb43b): a small wobble near the top could dip back
    // through the narrow band and fire a second, weaker rep completion
    // (e.g. a shallow rebound) milliseconds after a real one — two
    // conflicting cues appearing to fire "at once" was almost certainly this,
    // not a cue-selection bug (verified: completeRep() can only ever assign
    // one cue, the logic doesn't allow both). minRepInterval also widened
    // 0.5→1.0, matching tricep's exact fix, as a debounce backup.
    // goodROMThreshold TIGHTENED again, 15→8: still "not strict enough on
    // raising high enough" after the first tightening. With topAngle=72 (rest)
    // and true shoulder height at 0°, 8 requires ~89% of the full range (64 of
    // 72°) — a hair below dead-parallel, leaving only a small allowance for
    // natural variation rather than a real gap. Still a reasoned value, not
    // device-verified — the [METRIC] log prints this exercise's value
    // continuously; send your real arms-up reading and I'll set the exact
    // number if 8 still isn't right.
    topAngle:           72,
    repEnterThreshold:  55,
    repExitThreshold:   68,
    goodROMThreshold:   8,
    insufficientROMCue: 'RAISE HIGHER',
    // too_high removed (see comment above — not actually a fault, was also
    // firing inconsistently). wrong_direction added (see comment above —
    // assessed as cleanly detectable for this front-facing camera). arms_bent
    // REMOVED — misfired on straight arms on-device, twice-implicated, no
    // confirmed correct fire (see removed-check comment above).
    formChecks:         [RAISE_SWING_CHECK, RAISE_DIRECTION_CHECK],
    readyGate:          PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    RAISE_CAMERA_JOINTS_FRONT_A,
      requiredJointsAlt: RAISE_CAMERA_JOINTS_FRONT_B,
    },
    minRepInterval:  1.0,
    planarityChecks: [],
    // Approach/walk-away suppression assessed and NOT needed: unlike hinge,
    // neither shoulder nor hip position changes meaningfully during a raise
    // (isolation movement — only the elbow/wrist swing) — torsoReference
    // should stay flat through a rep. Leaving suppressApproachDetection unset.
  };
}

function frontRaiseVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          RAISE_REP_METRIC_SIDE,
    // Same fixes and same reasoning as lateralRaiseVariant (see its comments):
    // topAngle/enter/exit corrected from the confirmed lateralRaise device
    // log (arms-down rest reads ~72, not the assumed 90) and widened to a 13°
    // hysteresis gap (was 5°) + minRepInterval 1.0 (was 0.5), same tricep-
    // precedent fix for conflicting/double-firing cues. Front raise hasn't
    // been separately measured yet — inheriting lateralRaise's real numbers
    // is a much better starting placeholder than the original math-only
    // guess, but still verify from this exercise's own [REP]/[METRIC] log.
    // too_high removed (not actually a fault — see lateralRaiseVariant).
    // wrong_direction NOT added here — that check was only assessed for a
    // FRONT-facing camera (lateral raise); front raise uses a SIDE camera,
    // a different geometry that hasn't been evaluated for this fault.
    // goodROMThreshold TIGHTENED again, 15→8 — same reasoning/reasoned-not-
    // verified caveat as lateralRaiseVariant (see its comment): ~89% of the
    // full arms-down-to-shoulder-height range instead of ~79%.
    topAngle:           72,
    repEnterThreshold:  55,
    repExitThreshold:   68,
    goodROMThreshold:   8,
    insufficientROMCue: 'RAISE HIGHER',
    // arms_bent REMOVED — same misfire reasoning as lateralRaiseVariant.
    formChecks:         [RAISE_SWING_CHECK],
    readyGate:          PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    RAISE_CAMERA_JOINTS_SIDE_A,
      requiredJointsAlt: RAISE_CAMERA_JOINTS_SIDE_B,
    },
    minRepInterval:  1.0,
    planarityChecks: [],
  };
}

// ─── Lat pulldown family (vertical pull) ─────────────────────────────────────
//
// REBUILT AROUND SHOULDER PRESS'S OWN METRIC, per explicit ask — not a new
// metric, not a new joint, not a guess. Investigated what shoulder press
// actually measures (SHOULDER_PRESS_REP_METRIC above): bestSide of
// lineVsVertical(shoulder, elbow) — the upper-arm's angle from vertical.
// Verified real numbers from a real press-log: topAngle=84 (rest, elbow out
// near shoulder height), repEnterThreshold=68, repExitThreshold=72,
// goodROMThreshold=55 (arm pressed to near-vertical overhead). The metric
// DECREASES as the press goes up — the engine's state machine is hardwired
// for that direction (ExerciseEngine.swift: atTop→inRep requires
// metric < repEnterThreshold, i.e. it only ever waits for a DROP).
//
// A lat pulldown is the geometric MIRROR of a press on this exact metric:
//   Shoulder press: rest = elbow out (arm ~horizontal) → press UP → arm ~vertical.
//   Lat pulldown:   rest = arm ~vertical (overhead)     → pull DOWN → elbow out/back.
// Same two joints, same angle, opposite traversal — pulldown's REST position
// (arms overhead) is the same body position shoulder press calls its GOOD-
// ROM finish, and pulldown's WORKED position (elbows driven down and back)
// is the same body position shoulder press calls its REST/topAngle. So the
// numbers mirror directly.
//
// THE CATCH: lineVsVertical is direction-agnostic (Joints.swift uses
// abs(dy), so it can't be "inverted" by swapping from/to) and always reads
// LOW when arms are overhead — using it as-is would make lat pulldown's
// metric INCREASE while pulling down, which the engine's hardwired
// decreasing-only state machine would never register as a rep.
// FIX (not a new primitive — already exists in Metric.swift and is already
// used for exactly this direction-flip problem by the lateral-raise family,
// see RAISE_REP_METRIC_FRONT's comment above): lineVsHorizontal(shoulder,
// elbow), the documented complement of lineVsVertical (90 - angle). On this
// scale, arms overhead reads HIGH (near 90) and elbows-out-and-back reads
// LOW (near 0) — decreasing into the rep, exactly what the engine expects,
// same two joints, same underlying angle, no engine change.
//
// NUMBERS — transformed from shoulder press's own verified values via
// T(x) = 90 - x. T is a REFLECTION, not a per-field relabeling: it swaps
// which endpoint (rest vs worked) each threshold sits close to, so the
// gap-from-REST has to be preserved relative to the NEW rest value, not
// computed by transforming each field in place (see the full derivation
// on latPulldownVariant()'s threshold block below — naively transforming
// exit/enter individually gives a backwards, exit<enter result):
//   topAngle           = T(pressGoodROM 55)         = 35  (rest: arms overhead)
//   repExitThreshold   = topAngle - (84-72)         = 23
//   repEnterThreshold  = topAngle - (84-68)          = 19
//   goodROMThreshold   = T(pressTopAngle 84)         = 6  (worked: elbows down/back)
// These are REAL shoulder-press-verified numbers run through a correct
// geometric mirror, not fresh guesses — but this specific application
// (lat pulldown, back-facing) has zero on-device confirmation of its own.
// [REP]/[METRIC] logs already exist generically in ExerciseEngine.swift
// (fire for every exercise, lat pulldown included, no new logging code
// needed) — send one from a real overhead-to-shoulders set to confirm.
//
// Bilateral combinator kept as average(left, right), NOT shoulder press's
// bestSide — shoulder press uses bestSide for front-facing per-frame
// confidence robustness (not occlusion); back-facing lat pulldown sees both
// shoulders/elbows symmetrically, so average matches squat/lunge/row's own
// established bilateral pattern instead.
//
// CAMERA ORIENTATION — back-to-camera (unchanged from the prior round): a
// lat pulldown machine is faced by the user, so a camera behind them sees
// their back — that's the correct real-world setup, not a misconfiguration.
// Trackability from behind (reasoned, NOT device-verified): the elbow stays
// on the visible silhouette edge the entire rep and drives further INTO
// view (toward the camera) at the bottom of the pull ("elbows down and
// back") — unlike the wrist, which tucks in close to the torso midline at
// the bottom, the highest-occlusion position from directly behind. This is
// why the metric is elbow-based, not wrist-based.
const LAT_PULLDOWN_REP_METRIC: MetricDef = {
  type:  'average',
  left:  { type: 'lineVsHorizontal', from: 'leftShoulder',  to: 'leftElbow'  },
  right: { type: 'lineVsHorizontal', from: 'rightShoulder', to: 'rightElbow' },
};

// evaluateAt CHANGED atBottom←throughoutMax (this round) — ROOT CAUSE of
// "STAY UPRIGHT fired when the user just turned around" (log-confirmed:
// torso_lean spiked to 33.6 during a turn, correctly measured but
// misleading): throughoutMax takes the SINGLE WORST frame across the ENTIRE
// rep, so a brief, transient 2D-projection artifact from turning the torso
// (which genuinely can shift the apparent hip-shoulder line in a 2D camera
// projection, even though a turn isn't real forward/backward lean) gets
// treated identically to a sustained lean held through the whole rep.
// atBottom only reads this check at the exact frame of peak pull depth —
// a turn happening at any OTHER moment in the rep (getting into position,
// between reps, adjusting) is no longer captured at all. This does not
// catch a lean that happens to occur AT peak depth specifically, but that's
// the moment where a real "yanking the bar down with a body lean" cheat
// would actually show up, so it's the more relevant single frame to check
// even before considering the turn false-positive.
const LAT_PULLDOWN_TORSO_CHECK: FormCheckDef = {
  id: 'torso_lean', cue: 'STAY UPRIGHT, NO SWINGING',
  metric: {
    type:  'average',
    left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
    right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
  },
  evaluateAt: 'atBottom', condition: { type: 'greaterThan', value: 20 }, // reused from curl's own verified lean_back check
  priority: 2, enabled: true,
};

// FORM CHECK — elbow flare. FEASIBILITY: the rep metric itself (shoulder-
// elbow angle) only measures how far the upper arm has rotated, blind to
// LATERAL elbow position — an elbow that flares wide out to the sides
// instead of tracking down-and-back close to the torso can read as a
// perfectly good rep on the core metric alone. Same primitive already
// proven for exactly this "how far sideways from the body's own centerline"
// question — bodyRelativeDeviation(point, axisFrom: shoulder, axisTo: hip)
// — used by shoulder press's wrist_track_l/r and the lateral-raise family's
// wrong_direction check, just applied to the elbow instead of the wrist.
// evaluateAt 'atBottom' — same single frame (peak pull depth) the torso
// check already reads, for the same turn-false-positive reason (see that
// check's comment). PLACEHOLDER threshold: no on-device data for elbow
// (not wrist) deviation on this exercise — send a [REP] log doing a few
// clean reps and a few deliberately-flared ones so real separation can be
// found; 0.5 is a wide starting guess (an elbow's natural sideways travel
// during "elbows out" is real but nowhere near a wrist's full arm-length
// reach, so wrist_track's own 1.2 does NOT carry over).
const LAT_PULLDOWN_ELBOW_FLARE_CHECK: FormCheckDef = {
  id: 'elbow_flare', cue: 'ELBOWS DOWN AND BACK, NOT OUT',
  metric: {
    type:  'average',
    left:  { type: 'bodyRelativeDeviation', point: 'leftElbow',  axisFrom: 'leftShoulder',  axisTo: 'leftHip'  },
    right: { type: 'bodyRelativeDeviation', point: 'rightElbow', axisFrom: 'rightShoulder', axisTo: 'rightHip' },
  },
  evaluateAt: 'atBottom', condition: { type: 'greaterThan', value: 0.5 },
  priority: 3, enabled: true,
};

// PLANARITY — shoulder-elbow segment, the SAME joint pair the rep metric
// itself tracks. Built (not just theorized) specifically for the reported
// "turned to grab my phone, got a phantom rep": a sideways turn foreshortens
// this exact segment in the 2D camera projection.
//
// ENABLED then REVERTED, same round: turning it on regressed normal reps —
// it fired "FACE AWAY FROM THE CAMERA" on real, non-turned lat pulldown
// reps and broke rep counting for an actual set, confirmed by report. Root
// cause (reasoned, not device-confirmed): minRatio 0.75 and
// fallbackReferenceRatio 0.64 were BORROWED from shoulder press (same
// joint pair, same 0.64 value) — but shoulder press is front-facing, and
// lat pulldown is back-facing with the elbow travelling down-and-back at
// the bottom of a genuinely good rep (see LAT_PULLDOWN_REP_METRIC's own
// comment on why the metric is elbow-based). That natural elbow travel
// likely foreshortens the shoulder-elbow segment on EVERY real rep, not
// just a turn, so a reference ratio calibrated on a front-facing exercise
// with no such travel was too strict here — it couldn't tell a good rep's
// bottom position from an actual turn. DISABLED again per explicit
// instruction: a turn occasionally counting a rep is a far smaller problem
// than real reps not counting during a real set. Back to matching every
// other planarity check in this file (SQUAT_PLANARITY, PUSHUP_PLANARITY,
// SHOULDER_PRESS_PLANARITY — all `enabled: false`) pending a real
// calibration pass with lat-pulldown-specific device data (a [REP] log
// from clean reps AND deliberate turns, comparing the logged planarityLog
// ratio between them) instead of a borrowed number.
const LAT_PULLDOWN_PLANARITY: PlanarityCheckDef[] = [
  { id: 'uarm_l', jointA: 'leftShoulder',  jointB: 'leftElbow',
    minRatio: 0.75, cue: 'FACE AWAY FROM THE CAMERA, DON\'T TURN', fallbackReferenceRatio: 0.64, enabled: false },
  { id: 'uarm_r', jointA: 'rightShoulder', jointB: 'rightElbow',
    minRatio: 0.75, cue: 'FACE AWAY FROM THE CAMERA, DON\'T TURN', fallbackReferenceRatio: 0.64, enabled: false },
];

// Wrist DROPPED from the required-visible set, this round — the repMetric
// no longer tracks it (see LAT_PULLDOWN_REP_METRIC's comment: wrist is the
// joint most likely to be occluded from the back-facing orientation this
// exercise actually uses), and no form check needs it either
// (LAT_PULLDOWN_TORSO_CHECK is hip/shoulder only). Requiring it during
// SETUP would only add a chance of blocking a real back-facing user for no
// functional benefit.
// NEAR / FAR split — repMetric is average(lineVsHorizontal(shoulder→elbow) L/R),
// tracks off one side. (Advisory only after the FIX 1 native build.)
const LAT_PULLDOWN_CAMERA_JOINTS_A = ['leftShoulder',  'leftElbow'];
const LAT_PULLDOWN_CAMERA_JOINTS_B = ['rightShoulder', 'rightElbow'];

// Helper — mirrors curlVariant()'s shape exactly, per the investigate-first
// process above. Only one exercise uses this template (latPulldown) — grip-
// width variants were removed (see EXERCISE_DEFINITIONS below), so this is
// no longer a multi-variant clone target the way curl/tricep/etc. are.
//
// PULL-UP / CHIN-UP DELIBERATELY NOT CLONED HERE — investigated, not built:
// the same elbow-angle metric and direction would likely apply, but the
// camera setup is fundamentally different, not a one-line clone. In a
// pulldown the BAR moves and the BODY stays put (torso roughly stationary,
// narrow framing); in a pull-up the BAR is fixed and the BODY translates
// vertically through a large range — the frame needs to be wide enough to
// keep head-to-hip in view through the whole rep, the torso-lean check's
// premise (a mostly-stationary torso) doesn't hold the same way, and the
// real pull-up cheat (kipping/leg-swinging) isn't the same fault as leaning
// back, needing a signal this file doesn't have a proven primitive for yet.
// Building it now by just relabeling this template would risk exactly the
// kind of long, iterative debugging this whole family was asked to avoid.
// Left as a separate, future exercise needing its own dedicated pass.
function latPulldownVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          LAT_PULLDOWN_REP_METRIC,
    // Mirrored from shoulder press's own verified numbers via T(x) = 90 - x
    // (see LAT_PULLDOWN_REP_METRIC's comment above) — but T is a
    // REFLECTION, so it doesn't just relabel each field, it swaps which
    // endpoint each threshold sits close to. Derivation, gap-from-rest
    // preserved (this is the part that actually transfers correctly):
    //   shoulder press: topAngle=84 (rest). exit=72 sits 12 below rest.
    //   enter=68 sits 16 below rest. goodROM=55 is the far/worked end.
    //   lat pulldown topAngle=35 is the new "rest" — apply the SAME 12/16
    //   gaps from that new rest: exit = 35-12 = 23, enter = 35-16 = 19.
    // (Naively transforming exit/enter individually via T(72)/T(68) gives
    // 18/22 — backwards, exit < enter, which inverts the intended "exit is
    // the shallower threshold, enter is the deeper one" relationship. The
    // gap-from-rest has to be preserved relative to the NEW rest value, not
    // computed by transforming each field in place.)
    // Real shoulder-press-verified numbers run through a correct geometric
    // mirror, not fresh guesses — but this specific application (lat
    // pulldown direction, back-facing camera) has no on-device confirmation
    // of its own yet. Send a [REP]/[METRIC] log from a real set (both
    // already log generically for every exercise, nothing new to add) if
    // these need adjusting.
    topAngle:           35,  // rest: arms overhead      (mirrors press's goodROM=55)
    repExitThreshold:   23,  // 12 below topAngle, mirrors press's exit gap
    repEnterThreshold:  19,  // 16 below topAngle, mirrors press's enter gap
    // goodROMThreshold TIGHTENED 6→2 — reported "too lenient on incomplete
    // reps," shallow pulls passing as good instead of getting flagged PULL
    // DOWN FURTHER. 6 was already the mirrored-from-shoulder-press
    // placeholder (see derivation above) with, by its own comment, "zero
    // on-device confirmation of its own" — this is a further reasoned
    // tightening in the reported direction, NOT a device-confirmed number
    // either. Kept away from 0 (not floored all the way) since Vision's
    // elbow tracking on a back-facing view is noisier than front-facing,
    // and a threshold sitting exactly at the metric's floor would likely
    // flag genuinely full pulls on any small tracking jitter. Send a
    // [REP]/[METRIC] log (already logs peakAngle every rep, nothing new to
    // add) from a few genuinely-full pulls and a few deliberately-shallow
    // ones if this still isn't strict enough, or starts flagging real full
    // reps, and I'll set the real number from that instead of tightening
    // blind a second time.
    goodROMThreshold:   2,   // worked: elbows down/back (mirrors press's topAngle=84)
    insufficientROMCue: 'PULL DOWN FURTHER',
    formChecks:      [LAT_PULLDOWN_TORSO_CHECK, LAT_PULLDOWN_ELBOW_FLARE_CHECK],
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    LAT_PULLDOWN_CAMERA_JOINTS_A,
      requiredJointsAlt: LAT_PULLDOWN_CAMERA_JOINTS_B,
    },
    // minRepInterval + calibration copied verbatim from shoulderPressVariant()
    // — same state machine, same tempo floor, same auto-calibration behavior.
    calibration:     { repsNeeded: 2, enterFraction: 0.50, exitFraction: 0.25 },
    minRepInterval:  0.5,
    planarityChecks: LAT_PULLDOWN_PLANARITY,
    // exitConfirmFrames RAISED 3(default)→5 — CORE double-count fix, per
    // ExerciseEngine.swift's exitConfirmCount mechanism (the same one that
    // "actually fixed double-counting everywhere else," per
    // kettlebellSwing's comment on this same field). Reasoned, not device-
    // verified: back-facing elbow tracking is inherently noisier/lower-
    // confidence than shoulder press's front-facing view (the original
    // orientation investigation already flagged this), and the enter/exit
    // gap here (19→23, 4 units) is proportionally identical to shoulder
    // press's own (68→72, also 4) — so a narrow gap alone doesn't explain a
    // double-count shoulder press doesn't have; noisier tracking crossing
    // that gap spuriously, more often, is the more likely culprit. A longer
    // confirm-dwell directly targets that. Send a [REP] log if reps still
    // double-count (raise further) or start getting missed (lower back).
    exitConfirmFrames: 5,
    // WALK-AWAY — investigated, nothing new to add here. ExerciseEngine.swift
    // already has a GENERIC receding-suppression mechanism (torsoRef
    // shrinking past RECEDE_SCALE_FACTOR, 4-frame confirm) built specifically
    // for "walked away mid-set" and deliberately NOT gated behind
    // suppressApproachDetection — it applies to every exercise automatically,
    // lat pulldown included, no per-exercise field to set. The tracking-
    // reliability gate (rejects a rep if tracking was unreliable for >50% of
    // its frames) is likewise generic and already active. The specific
    // report ("turned to grab my phone") is more likely a SEATED TURN than a
    // walk — torsoRef (a distance/scale signal) may not shrink much for an
    // in-place twist, which is exactly the gap LAT_PULLDOWN_PLANARITY above
    // targets (a turn foreshortens the shoulder-elbow segment either way).
    // No suppressApproachDetection — seated, torso-scale has no known
    // contamination source the way hinge/tricep's does. Revisit only if a
    // log shows otherwise (back-to-camera doesn't change this reasoning —
    // it was never about front vs. back, just about torso-scale growing
    // from real movement vs. the user walking closer).
    //
    // settleAnchorMinFraction — kept from the prior round: requires the
    // settle gate's anchor value to sit at least 30% of the way from
    // goodROMThreshold(6) up to topAngle(35) — i.e. above ~14.7 — before
    // it's accepted as a genuine "arms overhead" rest reading (see
    // ExerciseEngine.swift's settleCandidateAcceptable). A press-like start
    // (elbow already down near shoulder height, i.e. a LOW lineVsHorizontal
    // reading) fails to settle at all rather than silently being accepted
    // as this rep's "rest" position. This is independent of which metric
    // is in use — it's a settle-quality gate, not a threshold value, so it
    // carries over unchanged (the underlying numbers it reads, topAngle and
    // goodROMThreshold, update automatically above).
    settleAnchorMinFraction: 0.3,
    //
    // HONEST LIMIT: settleAnchorMinFraction gives the engine a real
    // mechanism to refuse to settle on a press-like low start, but whether
    // real lat-pulldown users' actual overhead elbow position clears these
    // mirrored thresholds, and whether Vision's elbow tracking holds up
    // confidence-wise for a full back-facing set, both need a real device
    // log to confirm — not reasoning alone, however well-grounded the
    // mirror math is.
    //
    // phantomGuardFraction override REMOVED, this round — it was tightened
    // to 0.05 specifically because the OLD (now-retired) elbow-vs-shoulder
    // gap metric had a narrow range where the engine default (0.30) caused
    // a "barely counts" bug. The new mirrored metric's range (35→6, a
    // 29-unit spread) is the SAME magnitude as shoulder press's own range
    // (84→55, also 29 units) — shoulder press uses no override and works
    // fine, so lat pulldown now falls back to that same engine default too,
    // for the same reason it's fine there.
  };
}

// ─── Standing glute kickback family ────────────────────────────────────────────
//
// REPLACES the old glute bridge / hip thrust family (both removed — Apple
// Vision's body-pose model failed 100% of frames for a person lying down,
// confirmed on-device: 178/178 frames rejected as unreliable, it's trained
// for upright poses; see the DIAGNOSTIC comment this investigation left in
// ExerciseEngine.swift's primaryJointConfMin/Max fields). This exercise
// keeps the person standing the whole time instead: stand on one leg, kick
// the working leg straight back (hip extension), side camera — same
// upright-body requirement as every exercise that actually works.
//
// Reference/closest family, per the ask: the hip-hinge group (romanianDeadlift
// etc, HINGE_REP_METRIC above) — singleLegRDL specifically is the closest
// literal exercise already in the catalog (standing on one leg, other leg
// extends behind the body, side camera, same "no on-device data yet"
// situation). NOT reused verbatim, though: HINGE_REP_METRIC measures TORSO
// angle from horizontal, which is the right signal for a hinge (torso travels
// from vertical toward horizontal) but is near-constant here — a standing
// kickback keeps the torso upright throughout, so torso angle barely moves
// and can't drive rep detection. The moving joint here is the working hip
// itself, not the torso.
//
// REP METRIC — jointAngle(shoulder, hip, knee) on the working leg. At rest
// (standing, leg planted under the body) the hip-to-shoulder vector points
// up and the hip-to-knee vector points straight down — close to a straight
// line, i.e. close to 180°. As the leg kicks back into hip extension, the
// knee swings posteriorly, closing the angle between those two vectors —
// the metric DECREASES, matching the engine's hardwired decreasing-metric
// state machine with no inversion trick needed (unlike gluteBridge's old
// lineVsHorizontal workaround, which existed only because ITS literal
// shoulder-hip-knee angle increased across the motion — this exercise's
// doesn't).
//
// GENUINELY NEW METRIC — jointAngle with pivot=hip has never been used
// anywhere in this codebase (grepped: every existing jointAngle pivots on
// elbow, knee, or ankle). Zero on-device data. Per the placeholder rule,
// topAngle/repEnterThreshold/repExitThreshold/goodROMThreshold below are
// NOT measured — they're a rough anatomical estimate (standing ≈ 175°,
// noticeable hip extension somewhere in the 150s-160s) spaced wide on
// purpose so reps register regardless of the real value, not a tuned
// number. Do 5 reps of standingGluteKickback once this reloads and send the
// [REP]/[METRIC] log — real numbers will replace all four thresholds below.
const STANDING_GLUTE_KICKBACK_REP_METRIC: MetricDef = {
  type:  'average',
  left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftHip',  c: 'leftKnee'  },
  right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightHip', c: 'rightKnee' },
};

// FORM CHECKS ASSESSED AND NOT BUILT:
//
// - Leaning the torso forward / arching the lower back to fake hip
//   extension (swinging the leg via lumbar arch instead of glute-driven hip
//   extension): plausibly detectable in principle (lineVsVertical(hip,
//   shoulder) is a proven pair — see HINGE_TORSO_ANGLE_CHECK above) but its
//   72° threshold was tuned for a hinge's much larger expected torso travel,
//   not this exercise's near-upright torso — no comparable data exists for
//   what a "cheating lean" looks like here specifically. NOT BUILT this
//   round, same "don't hardcode a guessed number" rule as the rep metric
//   itself — worth adding once a real log shows what good vs. cheating reps
//   look like on this metric.
// - Overarching/hyperextending the lower back at the top: NOT BUILT, same
//   verdict as the hip-hinge family's identical check — spinal CURVATURE
//   fault, and Apple Vision has no mid-spine/lumbar landmark (only shoulder
//   and hip as the torso's two endpoints). Can't be measured from two
//   endpoints no matter which pair is chosen.
// - Standing leg wobbling / losing balance: not a joint-angle fault at all
//   (it's a stability/position fault, not an angle this Metric framework
//   measures) — out of scope for a Layer-1 threshold check.
// - Not kicking the leg back far enough: this IS covered, via the base
//   goodROMThreshold/insufficientROMCue fields below (same mechanism as
//   every other exercise's depth check) — no separate FormCheckDef needed.
//
// formChecks stays empty — no additional Layer-1 check cleared feasibility.

// Side camera — same requiredJoints/requiredJointsAlt shape as the hip-hinge
// family (shoulder+hip+knee+ankle per side); ankle included for camera
// framing/future use even though the rep metric only consumes shoulder+hip+knee.
const STANDING_GLUTE_KICKBACK_CAMERA_JOINTS_A = ['leftShoulder',  'leftHip',  'leftKnee',  'leftAnkle'];
const STANDING_GLUTE_KICKBACK_CAMERA_JOINTS_B = ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle'];

function standingGluteKickbackVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          STANDING_GLUTE_KICKBACK_REP_METRIC,
    // ALL FOUR PLACEHOLDER — see the block comment above. topAngle(175) is a
    // rough "standing straight" estimate; repEnterThreshold(155)/
    // repExitThreshold(168) are spaced a wide 13° apart on purpose (same
    // anti-double-count reasoning already learned the hard way for tricep/
    // hinge/raise — narrow hysteresis gaps caused real double-count bugs in
    // this codebase before).
    topAngle:           175,
    repEnterThreshold:  155,
    repExitThreshold:   168,
    // goodROMThreshold(150) sits just below repEnterThreshold(155) — reaching
    // a counted rep isn't automatically "good," it needs a bit more kickback
    // than the bare entry line. Kept close rather than far below it, per the
    // wide/permissive-placeholder rule for a genuinely new metric — this is
    // a starting point to replace from a real [REP] log, not a tuned value.
    goodROMThreshold:   150,
    insufficientROMCue: 'KICK YOUR LEG BACK FARTHER',
    formChecks:      [],
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    STANDING_GLUTE_KICKBACK_CAMERA_JOINTS_A,
      requiredJointsAlt: STANDING_GLUTE_KICKBACK_CAMERA_JOINTS_B,
    },
    minRepInterval:  0.7,
    planarityChecks: [],
    // No suppressApproachDetection — unlike the hip-hinge family (whose own
    // torso rotation inflates the shoulder-hip distance signal used for
    // approach detection), this exercise keeps the torso upright throughout,
    // so that false-approach failure mode doesn't apply here. Leaving unset
    // (default false), same as squat/curl/every other standing-still family.
  };
}

// ─── Face pull ──────────────────────────────────────────────────────────────
//
// REFERENCE EXERCISE: the row family (ROW_REP_METRIC above — bentOverRow/
// barbellRow/singleArmRow/invertedRow/tBarRow all share it). A face pull IS
// a pull: arms start extended toward the cable anchor (elbow near-straight),
// hands get pulled in toward the face while the elbows drive back and out,
// then return to extended — the same "elbow flexes from near-straight down
// to a bent peak, then re-extends" shape row's own metric was built for.
// Reused directly: jointAngle(shoulder, elbow, wrist), decreasing as the
// elbow bends — already the correct direction for the engine's hardwired
// decreasing-metric state machine (arm extended = high angle, elbow bent at
// peak pull = low angle), no inversion trick needed, same as row's own noted
// direction correctness.
//
// COMBINATOR — bestSide, NOT row's occlusion reason (this is front-facing;
// both arms are genuinely visible, no far-side occlusion exists here) but
// the SAME choice shoulderPress/lateralRaise already make front-facing, for
// the OTHER documented reason: per-frame confidence robustness (see
// RAISE_REP_METRIC_FRONT's comment — shoulderPress uses bestSide even
// though both arms are visible). 'average' was considered and rejected:
// in this codebase 'average' is used for symmetric FORM-CHECK gates (row's
// torso_swing, raise's swinging check) where blending both sides is exactly
// the point ("is the body doing X"), not for a primary per-limb rep metric,
// where one noisy frame from either arm would corrupt the blended reading.
// bestSide is this codebase's actual established default for primary rep
// metrics — followed here, not 'average'.
//
// FORESHORTENING CHECK: a front camera on an arm-extension movement has
// broken a metric before (front raise's arc points straight at the camera,
// foreshortening a LINE-orientation metric to near-nothing at full
// extension — see RAISE_CAMERA_JOINTS_SIDE's comment). jointAngle is not
// that same risk: it's a three-point ANGLE, not a segment's on-screen
// orientation — the elbow's bend is still geometrically meaningful even
// when the forearm points partly toward the lens during the extended
// portion of a face pull, the same way row's own proven metric tolerates
// arms that aren't perfectly parallel to the image plane. Genuinely new
// PLACEMENT for this metric (first front-facing use of jointAngle(shoulder,
// elbow, wrist) in this file — every prior use was side-on), so treat the
// exact thresholds as placeholders, not the metric choice itself.
//
// PLACEHOLDER WARNING: topAngle/repEnterThreshold/repExitThreshold/
// goodROMThreshold below are SEEDED from bentOverRowVariant's own
// device-verified numbers (topAngle 168, enter/exit 100/110, goodROM 80) as
// a reasoned starting point — same joint triad and metric type, same
// "extended-to-bent-elbow" shape — but face pull's own start/peak angles
// have zero on-device confirmation yet and may differ for real (face pull's
// start reaches toward the cable at roughly face height, not hanging
// straight down like row's start — plausibly similar since "arm extended"
// reads close to straight either way, but not verified). Do 5 reps of
// facePull once this reloads and send the [REP] log — real numbers replace
// all four, not just tune them.
const FACE_PULL_REP_METRIC: MetricDef = {
  type:  'bestSide',
  left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
  right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
  leftJoints:  ['leftShoulder',  'leftElbow',  'leftWrist'],
  rightJoints: ['rightShoulder', 'rightElbow', 'rightWrist'],
};

// FORM CHECK — elbows dropping too low. A face pull's defining technique
// cue: elbows stay AT OR ABOVE shoulder height through the pull (that's
// what actually biases the movement toward rear delts/external rotators
// instead of turning into a generic low row). FEASIBILITY: this is the
// SAME primitive (normalizedVerticalGap(elbow, shoulder)) the raise family
// already proved out and shipped — there, a "went too high" version was
// built, confirmed technically reliable, then REMOVED because going high on
// a LATERAL raise isn't actually a real fault (see RAISE family's "going
// too high: REMOVED" comment — a judgment call about the fault, not a
// feasibility failure of the metric). Face pull is the opposite case on
// both counts: elbows dropping BELOW shoulder height (not above) IS a real,
// commonly-cited technique fault for this specific exercise, so the same
// proven primitive is reused here with a different condition and a genuine
// reason to flag it. PLACEHOLDER threshold (0.05) — a small permissive gap
// below shoulder height, not device-verified. Send a [REP] log (logs this
// value every rep) and I'll set the real number from it.
const FACE_PULL_ELBOW_HEIGHT_CHECK: FormCheckDef = {
  id: 'elbow_drop', cue: 'KEEP ELBOWS HIGH',
  metric: {
    type:  'average',
    left:  { type: 'normalizedVerticalGap', upper: 'leftShoulder',  lower: 'leftElbow'  },
    right: { type: 'normalizedVerticalGap', upper: 'rightShoulder', lower: 'rightElbow' },
  },
  // normalizedVerticalGap(upper, lower) reads the vertical gap as a
  // positive fraction of torso length when `upper` sits above `lower` (the
  // proven convention — see ROW_TORSO_SWING's identical shape: shoulder
  // above hip reads positive). Elbow AT OR ABOVE shoulder height should
  // read near/below zero; elbow dropping below shoulder height pushes this
  // positive. evaluateAt 'throughoutMax' — fires if the elbow drops low at
  // ANY point during the pull, not just at the end, same "catch it anywhere
  // in the rep" shape as row's torso_swing check.
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 0.05 },
  priority: 2, enabled: true,
};
// FORM CHECK — not pulling far enough: NOT a separate FormCheckDef, same as
// every other family — covered by the base goodROMThreshold/
// insufficientROMCue mechanism below (see bentOverRowVariant's identical
// note). No additional check needed for this one.

// Front camera — both arms genuinely visible simultaneously (unlike every
// side-on family's A/B near/far-side alternate pattern), same single-list
// shape as RAISE_CAMERA_JOINTS_FRONT. No hips — no torso-lean/swing check
// is built for this exercise (out of scope for this round; a standing
// face pull leaning back to cheat the pull is a plausible future check,
// not attempted here since it wasn't asked for and has zero on-device
// reasoning behind it yet).
// NEAR / FAR split (was one both-arms list). Face pull is often filmed
// side-on, where the far arm is fully occluded behind the torso — a
// both-arms setup gate then waits forever (device log: near arm 0.6-0.75,
// far arm stuck ~0.12, 0 reps). repMetric is bestSide, so one arm is all
// that's needed. Same near/far pattern the row / hinge / push-up families
// already use. (Post the FIX 1 native build the SETUP gate reads the rep
// metric directly and this list is advisory only — but it should still
// reflect reality.)
const FACE_PULL_CAMERA_JOINTS_A = ['leftShoulder',  'leftElbow',  'leftWrist'];
const FACE_PULL_CAMERA_JOINTS_B = ['rightShoulder', 'rightElbow', 'rightWrist'];

function facePullVariant(
  id:               string,
  displayName:      string,
  setupInstruction: string,
): ExerciseDefinitionDef {
  return {
    id,
    displayName,
    repMetric:          FACE_PULL_REP_METRIC,
    // SEEDED from bentOverRowVariant's own verified numbers — see the block
    // comment above for exactly why, and why these still count as
    // placeholders for THIS exercise despite coming from real device data
    // on a different one.
    topAngle:           168,
    repEnterThreshold:  100,
    repExitThreshold:   110,
    goodROMThreshold:   80,
    insufficientROMCue: 'PULL FARTHER',
    formChecks:      [FACE_PULL_ELBOW_HEIGHT_CHECK],
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    FACE_PULL_CAMERA_JOINTS_A,
      requiredJointsAlt: FACE_PULL_CAMERA_JOINTS_B,
    },
    minRepInterval:  0.7,
    planarityChecks: [],
  };
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// Record<ExerciseId, ...> — every EXERCISE_CATALOG exercise required, checked
// at compile time. (Missing key used to mean setExerciseDefinition(null) →
// Swift registry fallback used, silently — that path is now unreachable for
// any catalog exercise; TypeScript won't let this object compile without one.)

export const EXERCISE_DEFINITIONS: Record<ExerciseId, ExerciseDefinitionDef> = {

  // ─── Squat ──────────────────────────────────────────────────────────────────
  //
  // VALUES VERBATIM from ExerciseRegistry.swift.
  // repMetric: average knee angle both legs (hip→knee→ankle).
  // Camera: side view, full body in frame.
  squat: {
    id:          'squat',
    displayName: 'Squat',

    repMetric: {
      type:  'average',
      left:  { type: 'jointAngle', a: 'leftHip',  pivot: 'leftKnee',  c: 'leftAnkle'  },
      right: { type: 'jointAngle', a: 'rightHip', pivot: 'rightKnee', c: 'rightAnkle' },
    },

    topAngle:           160,
    repEnterThreshold:  150,
    repExitThreshold:   155,
    goodROMThreshold:   90,   // tightened 100→90: genuine parallel squat ≤90°; quarter squat ~130° fails
    insufficientROMCue: 'GO DEEPER',

    formChecks: [
      {
        id:         'back_lean',
        cue:        'CHEST UP',
        metric: {
          type:  'average',
          left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
          right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
        },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'greaterThan', value: 30 },
        priority:   1,
        enabled:    true,
      },
      {
        id:         'heel_rise',
        cue:        'KEEP HEELS DOWN',
        metric: {
          type:  'average',
          left:  { type: 'lineVsVertical', from: 'leftAnkle',  to: 'leftKnee'  },
          right: { type: 'lineVsVertical', from: 'rightAnkle', to: 'rightKnee' },
        },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'greaterThan', value: 20 },
        priority:   2,
        enabled:    false,
      },
      {
        id:         'knee_cave',
        cue:        'KNEES OUT',
        metric: {
          type:  'average',
          left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftKnee'  },
          right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightKnee' },
        },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'greaterThan', value: 20 },
        priority:   3,
        enabled:    false,
      },
    ],

    readyGate: PASSTHROUGH_GATE,

    cameraSetup: {
      setupInstruction: 'Stand sideways to the camera — full body in frame',
      // NEAR / FAR — the rep metric tracks one leg (avg/min jointAngle L/R);
      // the far leg is partly occluded from a side-on angle.
      requiredJoints:    ['leftShoulder',  'leftHip',  'leftKnee',  'leftAnkle'],
      requiredJointsAlt: ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle'],
    },

    calibration: {
      repsNeeded:    2,
      enterFraction: 0.50,
      exitFraction:  0.25,
    },

    minRepInterval: 0.5,

    planarityChecks: [
      // Disabled: false-positive on correctly side-on users because fallback reference
      // ratios are higher than what Vision observes in practice. Calibrated refs are
      // only learned during reps, but planarity was blocking reps before they started
      // (chicken-and-egg). Re-enable after collecting [PLANARITY] logs on-device to
      // find real ratio values for side-on squat (thigh_l, shin_l).
      { id: 'thigh_l', jointA: 'leftHip',  jointB: 'leftKnee',
        minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.80, enabled: false },
      { id: 'shin_l',  jointA: 'leftKnee', jointB: 'leftAnkle',
        minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.72, enabled: false },
    ],
  },

  // ─── Push-up ────────────────────────────────────────────────────────────────
  //
  // REWORKED after a real failure report: a clean three-quarter front-side video
  // (diagonal, low camera, whole body visible — arguably an EASIER angle for a
  // human to judge than strict side-on, since a strict side view hides the far
  // arm entirely) produced 0 reps / 0 movement.
  //
  // Root cause, traced from what this file and the engine already assume, not
  // guessed: the OLD repMetric was bestSide(jointAngle(shoulder→elbow→wrist)),
  // gated by a cameraSetup.requiredJoints of the SAME elbow+wrist joints held at
  // ≥0.30 confidence for a continuous 2s SETUP hold (ExerciseEngine.swift
  // SETUP_JOINT_MIN_CONF). Elbow and wrist are the two joints most likely to be
  // low-confidence or self-occluded at ANY non-strict-side angle — the far-side
  // elbow/wrist tuck behind the torso at the bottom of the rep even at a
  // three-quarter angle, and Apple Vision's own pose model is documented
  // (community-reported, not an Apple-published spec) to run noisier on
  // horizontal/prone bodies than upright ones. If SETUP's 2s hold on those two
  // fragile joints never passes, the engine never leaves SETUP — which reads to
  // the user as exactly "0 reps, 0 movement," with no rep-detection code ever
  // running at all. That's a definition problem (fragile-joint dependency), not
  // proof Vision "can't see" a horizontal body — shoulder/hip/ankle (the same
  // three joints the hip form-checks below already rely on) stay large,
  // high-contrast, and rarely self-occluded at almost any reasonable angle,
  // including this one.
  //
  // FIX: rep metric switched from elbow-angle to shoulder height relative to the
  // body's own hip→ankle line — bodyRelativeDeviation(shoulder, axisFrom: hip,
  // axisTo: ankle), the SAME "distance from a line drawn between two real
  // joints" family the hip pike/sag checks below already use successfully in
  // this exact landscape-phone pushup setup. That's a deliberate choice, not
  // incidental: this file's own earlier comment on the hip checks (below)
  // documents that a NAIVE raw-Vision-axis metric (normalizedVerticalGap)
  // reads ≈constant nonsense for a pushup because the phone is rotated 90° on
  // its side, so Vision's raw x/y don't correspond to real-world
  // vertical/horizontal — bodyRelativeDeviation avoids that trap by computing
  // everything relative to an axis defined by two ACTUAL joints, so it doesn't
  // care what Vision's raw axes mean. As the shoulder rises at the top of a
  // rep it sits farther from the hip-ankle line; as it lowers toward the floor
  // it sits closer — same "value drops on the way down, rises back up on the
  // way up" shape the old elbow angle had, just built from joints that survive
  // a diagonal camera.
  //
  // PLACEHOLDER thresholds below — bodyRelativeDeviation as a PRIMARY rep
  // metric (vs. just a form-check, where this file already uses it several
  // times) has no on-device precedent in this file to calibrate scale from;
  // the closest analogues (wrist_track_l/r at 1.2 on a shoulder→hip axis,
  // lateral-raise's wrong_direction at 0.4 on the same axis) use a much
  // shorter reference segment, so their numbers don't transfer directly. Do a
  // few real reps (this same three-quarter angle is fine now — it no longer
  // needs strict side-on) and send the [REP]/[VIDEO-POSE] log even if the rep
  // count still isn't right; the log will show the actual measured value swing
  // for the first time (previously SETUP never ran long enough to log
  // anything), and real thresholds get set from that, not guessed twice.
  //
  // Camera: side-on OR a clear three-quarter diagonal now both work — the
  // metric no longer assumes the arm sits in the camera's exact image plane.
  pushup: {
    id:          'pushup',
    displayName: 'Push-up',
    guideBox:    'floor',

    // leftJoints/rightJoints below feed TWO things in ExerciseEngine.swift, not
    // just this comment's headline concern:
    //   1. bestSide's per-frame side selection (Metric.swift measure(): picks
    //      whichever side has the higher summed confidence across this list).
    //   2. The whole-rep tracking-reliability gate (ExerciseEngine.swift
    //      isMetricReliable/accumulate()) that can reject an already-detected
    //      rep outright — SEPARATE from and much stricter than the metric
    //      formula's own internal per-joint gate.
    // ROOT CAUSE, confirmed from a real on-device log (three-quarter/diagonal
    // camera, floor-level): valid reps were detected correctly (metric swung
    // cleanly ~0.01–0.48, phase=down/inRep tracked fine) but 100% of frames
    // (49/49) were rejected as "tracking unreliable." The log's per-joint
    // range was leftHip=[0.13-0.35] leftAnkle=[0.00-0.53] — hip never broke
    // 0.35, ankle mostly near 0. That's a genuine, expected occlusion at a
    // floor-level diagonal angle for the far-side hip/ankle, not a tracking
    // failure.
    // The mismatch: the metric formula (bodyRelativeDeviation, in `left`/
    // `right` above) only requires kMinConf=0.25 per joint to produce a real
    // value (Joints.swift) — comfortably cleared by this log's actual
    // numbers, which is why the swing was clean. But the reliability GATE
    // above used to check ALL of leftJoints/rightJoints (shoulder+hip+ankle)
    // against FORM_CHECK_MIN_CONF=0.6 (ExerciseEngine.swift) — more than
    // double the metric's own bar, and one hip/ankle never got close to
    // clearing it for the whole rep, so every single frame failed and the
    // rep was thrown out despite being real. (ExerciseEngine.swift's own
    // accumulate() comment already documents this exact 0.25-vs-0.6 gap as a
    // known general risk — this rep is the confirmed on-device case of it.)
    // FIX: trim these lists to just the shoulder — the one joint a pushup's
    // upper-body movement actually depends on being trustworthy, and the one
    // that wasn't flagged as a problem in the log. Hip/ankle stay in the
    // metric FORMULA above (axisFrom/axisTo) — their own 0.25 gate there is
    // unchanged and still protects against a truly-zero-confidence axis
    // (leftAnkle's logged 0.00 low end) — this only removes them from the
    // stricter 0.6 whole-rep reliability gate they were never a good fit for
    // at this camera angle.
    repMetric: {
      type: 'bestSide',
      left:  { type: 'bodyRelativeDeviation', point: 'leftShoulder',  axisFrom: 'leftHip',  axisTo: 'leftAnkle'  },
      right: { type: 'bodyRelativeDeviation', point: 'rightShoulder', axisFrom: 'rightHip', axisTo: 'rightAnkle' },
      leftJoints:  ['leftShoulder'],
      rightJoints: ['rightShoulder'],
    },

    // REAL-LOG-DERIVED — set from an actual on-device [METRIC] log (one
    // three-quarter-angle pushup take), replacing the earlier guessed
    // placeholders (topAngle=0.5, enter=0.42, exit=0.45). That log showed
    // SETUP passing and phase=down/phase=inRep tracking correctly, but 0
    // reps counted — the FSM (see ExerciseEngine.swift's comment: "atTop →
    // metric < repEnterThreshold → inRep", "inRep → metric > repExitThreshold
    // → count rep → atTop") never saw exit satisfied, because the logged
    // values split into two clear clusters with the OLD thresholds sitting
    // above BOTH of them:
    //   down/bottom cluster: 0.0035–0.1776 (repMinAngle 0.0035 — a genuinely
    //     deep rep)
    //   up/top cluster:      0.3061–0.4409 (peak logged was 0.4409 — the old
    //     repExitThreshold=0.45 was literally unreachable)
    //   empty gap between the two clusters: ~0.18–0.31, nothing logged there
    // New thresholds sit inside that empty gap (real hysteresis margin on
    // both sides, not guessed) so a genuine down-then-up swing crosses both:
    //   repEnterThreshold=0.22 (~0.04 above the down cluster's max 0.1776)
    //   repExitThreshold=0.27  (~0.035 below the up cluster's min 0.3061)
    // topAngle=0.35 sits inside the observed up cluster itself (real
    // near-top value, not the single 0.44 outlier) — it doesn't gate
    // counting directly (only the ROM-quality fraction calc and the
    // 75%-of-topAngle "start zone" check), so a representative mid-cluster
    // value is more robust than pinning to the one highest sample.
    // goodROMThreshold unchanged at 0.15 — the observed trough (0.0035) is
    // already well below it, so it was never the blocker and still isn't.
    // This is still from a SINGLE take — if the next log shows the real
    // range differs, re-derive from that data rather than nudging these
    // further by feel.
    topAngle:            0.35,
    repEnterThreshold:   0.22,
    repExitThreshold:    0.27,
    goodROMThreshold:    0.15,
    insufficientROMCue: 'GO DEEPER',

    formChecks: [
      // Hip piking: hip ABOVE the shoulder→ankle plank line.
      // signedDeviationFromLine reads ≈ 0 when hip is on the line (straight plank), and
      // deviates when the hip bends away. This is the correct primitive — NOT normalizedVerticalGap,
      // which measures raw Vision-space y-distance between shoulder and hip (≈ 0.95 for ANY
      // horizontal push-up body because the phone is rotated 90° on its side, making Vision y
      // the real-world horizontal axis, not vertical).
      //
      // Sign convention: "positive = LEFT of lineFrom→lineTo direction."
      // For shoulder→ankle direction in the rotated camera: LEFT = upward in real world (for the
      // common setup where head is to the left in the camera frame). So positive = piking.
      // If cues fire backwards (HIPS DOWN on a sagging rep), swap the condition values
      // (change greaterThan → lessThan and lessThan → greaterThan on all four checks).
      //
      // Ankle visibility: if ankle confidence < 0.25, the check returns nil → no cue (silent).
      // Use [REP] log hip values to verify ankles are being seen.
      //
      // Priority = 4 (≥ FORM_OVERRIDE_ROM_PRIORITY) so hip cue overrides "GO DEEPER" even
      // when the elbow angle is short — piking reduces ROM so both faults often co-occur.
      //
      // Threshold 0.05 = 5% of shoulder→ankle distance ≈ 7cm for a 140cm body axis. Loose
      // intentionally for first test — tune from the hip_pike_l / hip_sag_l values in [REP] log.
      {
        id:         'hip_pike_l',
        cue:        'HIPS DOWN',
        metric: { type: 'signedDeviationFromLine', point: 'leftHip', lineFrom: 'leftShoulder', lineTo: 'leftAnkle' },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'greaterThan', value: 0.035 },  // tightened 0.05→0.035 (was too exaggerated-only)
        priority:   4,
        enabled:    true,
      },
      {
        id:         'hip_sag_l',
        cue:        'HIPS UP',
        metric: { type: 'signedDeviationFromLine', point: 'leftHip', lineFrom: 'leftShoulder', lineTo: 'leftAnkle' },
        evaluateAt: 'throughoutMin',
        condition:  { type: 'lessThan', value: -0.08 },
        priority:   4,
        enabled:    true,
      },
      {
        id:         'hip_pike_r',
        cue:        'HIPS DOWN',
        metric: { type: 'signedDeviationFromLine', point: 'rightHip', lineFrom: 'rightShoulder', lineTo: 'rightAnkle' },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'greaterThan', value: 0.035 },  // tightened 0.05→0.035 (was too exaggerated-only)
        priority:   4,
        enabled:    true,
      },
      {
        id:         'hip_sag_r',
        cue:        'HIPS UP',
        metric: { type: 'signedDeviationFromLine', point: 'rightHip', lineFrom: 'rightShoulder', lineTo: 'rightAnkle' },
        evaluateAt: 'throughoutMin',
        condition:  { type: 'lessThan', value: -0.08 },
        priority:   4,
        enabled:    true,
      },
    ],

    readyGate: PASSTHROUGH_GATE,

    // requiredJoints used to be elbow+wrist — the SAME two fragile joints the
    // repMetric itself no longer depends on (see fix comment above). SETUP
    // requires these held at ≥0.30 confidence for a continuous 2s
    // (ExerciseEngine.swift SETUP_JOINT_MIN_CONF) before the exercise even
    // starts — if that never passes, nothing downstream ever runs, which is
    // the most likely literal cause of "0 reps, 0 movement": not a failed
    // rep count, a SETUP phase that never exits. Switched to shoulder+hip+
    // ankle to match the repMetric's actual joint dependency.
    //
    // FOLLOW-UP (real device log): SETUP did complete, but not until frame
    // ~300 (t≈10s, near the end of the clip) — the hold kept resetting on
    // "missing rightHip". Root cause, confirmed in ExerciseEngine.swift's
    // SETUP check (missingSetupJoints/the requiredJoints+requiredJointsAlt
    // branch, ~line 654): it requires ALL joints of ONE COMPLETE side
    // simultaneously visible, no mixing across sides, no tolerance for a
    // single joint's momentary dip — any one joint on the side being
    // checked dropping below 0.30 for even one frame fails that whole
    // frame, which resets the continuous 2s hold. Hip is exactly the joint
    // most likely to flicker at a diagonal angle (the far hip self-
    // occludes), and it was never actually needed for SETUP in the first
    // place — the rep metric's own per-frame bestSide already tolerates
    // single-side hip occlusion frame-to-frame; SETUP only needs enough to
    // confirm the person is in position, which shoulder+ankle alone do.
    // Dropped hip from the gate so a flickering hip can no longer break
    // the hold on either side.
    cameraSetup: {
      setupInstruction: 'Lay your phone on its side on the floor, a few feet to your side — a side-on or clear three-quarter angle both work',
      requiredJoints:    ['leftShoulder',  'leftAnkle'],
      requiredJointsAlt: ['rightShoulder', 'rightAnkle'],
    },

    // No calibration — thresholds intended to be stable across users/distances
    // once tuned from real device data (currently placeholders, see above).

    minRepInterval: 0.8,

    planarityChecks: [
      { id: 'uarm_l', jointA: 'leftShoulder', jointB: 'leftElbow',
        minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.64,
        enabled: false },
    ],
  },

  // ─── Lunge ──────────────────────────────────────────────────────────────────
  //
  // VALUES VERBATIM from ExerciseRegistry.swift.
  // repMetric: minimum front-knee angle (hip→knee→ankle) — tracks the more-bent leg.
  // Camera: side view, full body in frame.
  lunge: {
    id:          'lunge',
    displayName: 'Lunge',

    repMetric: {
      type:  'minimum',
      left:  { type: 'jointAngle', a: 'leftHip',  pivot: 'leftKnee',  c: 'leftAnkle'  },
      right: { type: 'jointAngle', a: 'rightHip', pivot: 'rightKnee', c: 'rightAnkle' },
    },

    topAngle:           165,
    repEnterThreshold:  145,
    repExitThreshold:   150,
    goodROMThreshold:    95,  // tightened 105→95: reported not strict enough on depth
    insufficientROMCue: 'LUNGE DEEPER',

    formChecks: [
      {
        id:         'torso_lean',
        cue:        'CHEST UP',
        metric: {
          type:  'average',
          left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
          right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
        },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'greaterThan', value: 35 },
        priority:   2,
        enabled:    true,
      },
      {
        id:         'knee_drive',
        cue:        'DRIVE KNEE DOWN',
        metric: {
          type:  'minimum',
          left:  { type: 'jointAngle', a: 'leftHip',  pivot: 'leftKnee',  c: 'leftAnkle'  },
          right: { type: 'jointAngle', a: 'rightHip', pivot: 'rightKnee', c: 'rightAnkle' },
        },
        evaluateAt: 'atBottom',
        condition:  { type: 'greaterThan', value: 115 },
        priority:   1,
        enabled:    false,
      },
    ],

    readyGate: PASSTHROUGH_GATE,

    cameraSetup: {
      setupInstruction: 'Stand sideways to the camera — full body in frame',
      // NEAR / FAR — the rep metric tracks one leg (avg/min jointAngle L/R);
      // the far leg is partly occluded from a side-on angle.
      requiredJoints:    ['leftShoulder',  'leftHip',  'leftKnee',  'leftAnkle'],
      requiredJointsAlt: ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle'],
    },

    calibration: {
      repsNeeded:    2,
      enterFraction: 0.50,
      exitFraction:  0.25,
    },

    minRepInterval: 0.5,

    planarityChecks: [
      // Disabled: same false-positive issue as squat planarity checks.
      // Re-enable after collecting [PLANARITY] logs on-device.
      { id: 'thigh_l', jointA: 'leftHip',  jointB: 'leftKnee',
        minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.80, enabled: false },
      { id: 'shin_l',  jointA: 'leftKnee', jointB: 'leftAnkle',
        minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.72, enabled: false },
    ],
  },

  // ─── Shoulder Press ─────────────────────────────────────────────────────────
  //
  // VALUES VERBATIM from ExerciseRegistry.swift.
  // repMetric: lineVsVertical(shoulder→elbow) on bestSide.
  //   Angle of the upper arm from vertical. 0° = arm overhead, 90° = arm horizontal.
  //   Metric DECREASES as arms press overhead (enters rep), INCREASES on return.
  // Camera: face the camera, arms and shoulders in frame.
  shoulderPress: {
    id:          'shoulderPress',
    displayName: 'Shoulder Press',

    repMetric: {
      type: 'bestSide',
      left:  { type: 'lineVsVertical', from: 'leftShoulder',  to: 'leftElbow'  },
      right: { type: 'lineVsVertical', from: 'rightShoulder', to: 'rightElbow' },
      leftJoints:  ['leftShoulder',  'leftElbow'],
      rightJoints: ['rightShoulder', 'rightElbow'],
    },

    topAngle:           84,
    repEnterThreshold:  68,
    repExitThreshold:   72,
    // 35→60→55 — see shoulderPressVariant()'s comment for the real-press log this is based on.
    goodROMThreshold:   55,
    insufficientROMCue: 'PRESS HIGHER',
    // See shoulderPressVariant()'s identical field for the full writeup —
    // fixes a real video-re-analysis bug where the settle/resync path locked
    // onto a repTopValue (59.23) below repEnterThreshold(68) itself,
    // phantom-rejecting every rep in the clip. Same 0.3 value latPulldown
    // already uses for this exact failure mode.
    settleAnchorMinFraction: 0.3,
    // Was unset (default 0.30). Real device log (video-analysis path, same
    // repMetric/thresholds as this definition): a genuine first rep produced
    // movementPastEntry=2.5881 against required=3.9000 (|68-55|*0.30) and was
    // phantom-rejected. 0.18 clears that exact data point with a modest
    // margin (required≈2.34). Ported to native ExerciseRegistry.swift's
    // shoulderPress too, so video and live paths behave identically. ONE
    // real data point — revisit if more phantom-log data comes in.
    phantomGuardFraction: 0.18,

    formChecks: [
      {
        id:         'lean_back',
        cue:        'STAY UPRIGHT',
        metric: {
          type:  'average',
          left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
          right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
        },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'greaterThan', value: 20 },
        priority:   4,
        enabled:    true,
      },
      {
        id:         'lower_more',
        cue:        'LOWER MORE',
        metric: {
          type: 'bestSide',
          left:  { type: 'lineVsVertical', from: 'leftShoulder',  to: 'leftElbow'  },
          right: { type: 'lineVsVertical', from: 'rightShoulder', to: 'rightElbow' },
          leftJoints:  ['leftShoulder',  'leftElbow'],
          rightJoints: ['rightShoulder', 'rightElbow'],
        },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'lessThan', value: 80 },
        priority:   2,
        enabled:    false,
      },
      {
        id:         'wrist_track_l',
        cue:        'ARMS STRAIGHT UP',
        metric: {
          type:     'bodyRelativeDeviation',
          point:    'leftWrist',
          axisFrom: 'leftShoulder',
          axisTo:   'leftHip',
        },
        evaluateAt: 'atBottom',
        condition:  { type: 'greaterThan', value: 1.2 },
        priority:   3,
        enabled:    true,
      },
      {
        id:         'wrist_track_r',
        cue:        'ARMS STRAIGHT UP',
        metric: {
          type:     'bodyRelativeDeviation',
          point:    'rightWrist',
          axisFrom: 'rightShoulder',
          axisTo:   'rightHip',
        },
        evaluateAt: 'atBottom',
        condition:  { type: 'greaterThan', value: 1.2 },
        priority:   3,
        enabled:    true,
      },
    ],

    readyGate: PASSTHROUGH_GATE,

    cameraSetup: {
      // Shoulder press is FRONT-FACING: both arms move symmetrically overhead.
      // bestSide repMetric picks whichever arm gives a cleaner reading.
      // Wrists removed from requiredJoints: repMetric doesn't use wrists; requiring
      // them makes setup fail if wrists are cropped at top of frame.
      setupInstruction: 'Stand FACING the camera directly — do NOT turn sideways — both arms and shoulders clearly visible',
      // NEAR / FAR — repMetric is bestSide(lineVsVertical(shoulder→elbow)).
      requiredJoints:    ['leftShoulder',  'leftElbow'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow'],
    },

    calibration: {
      repsNeeded:    2,
      enterFraction: 0.50,
      exitFraction:  0.25,
    },

    minRepInterval: 0.5,

    planarityChecks: [
      // Disabled: shoulder press is FRONT-FACING. A foreshortened upper arm would
      // mean the user turned side-on (wrong), not that they're in a bad position.
      // The cue "TURN SIDE-ON" is backwards for this exercise. Disable until
      // a "FACE THE CAMERA" variant is needed and tuned from on-device data.
      { id: 'uarm_l', jointA: 'leftShoulder',  jointB: 'leftElbow',
        minRatio: 0.75, cue: 'FACE THE CAMERA', fallbackReferenceRatio: 0.64, enabled: false },
      { id: 'uarm_r', jointA: 'rightShoulder', jointB: 'rightElbow',
        minRatio: 0.75, cue: 'FACE THE CAMERA', fallbackReferenceRatio: 0.64, enabled: false },
    ],
  },

  // ─── Jumping Jack ───────────────────────────────────────────────────────────
  //
  // VALUES VERBATIM from ExerciseRegistry.swift — this exercise was missing
  // from EXERCISE_DEFINITIONS entirely (caught by the ExerciseId exhaustiveness
  // check in constants/exercises.ts, not by anyone noticing it misbehave).
  // Unlike a genuinely-new exercise with no native definition at all, this one
  // had been quietly running the whole time on setExerciseDefinition(null)'s
  // "Swift registry fallback" path (ATHLTCameraModule.swift) instead of the
  // JS-owned path every other exercise uses — functional, but invisible to
  // and undialed by any JS-side tuning, and a step away from silently
  // becoming a real squat-fallback bug the moment someone touches
  // ExerciseRegistry.swift's jumpingJack case. Porting it here closes that.
  //
  // repMetric: average(normalizedVerticalGap(shoulder, wrist)) both arms.
  //   = (shoulder.y − wrist.y) / torso_length. y=0 bottom, y=1 top.
  //   CLOSED (arms at sides):  shoulder above wrist → POSITIVE (~+0.7 to +1.1)
  //   OPEN (arms overhead):    wrist above shoulder → NEGATIVE (~−0.3 to −0.6)
  jumpingJack: {
    id:          'jumpingJack',
    displayName: 'Jumping Jack',
    repMetric: {
      type:  'average',
      left:  { type: 'normalizedVerticalGap', upper: 'leftShoulder',  lower: 'leftWrist'  },
      right: { type: 'normalizedVerticalGap', upper: 'rightShoulder', lower: 'rightWrist' },
    },
    topAngle:           0.90,
    repEnterThreshold:  0.30,  // arms risen above shoulder height = rep entering
    repExitThreshold:   0.50,  // arms returned below shoulder height = rep done
    goodROMThreshold:  -0.25,  // wrists must reach >=25% of torso above shoulder = overhead
    insufficientROMCue: 'ARMS HIGHER',
    formChecks: [
      // Feet-wide check: max ankle spread while arms are in the OPEN phase.
      // TUNE via "[Engine] [jumpingJack]" NSLog: good jack ~0.8-1.5, lazy ~0.2-0.4.
      {
        id: 'feet_wide', cue: 'JUMP WIDER',
        metric: { type: 'distanceRatio', a: 'leftAnkle', b: 'rightAnkle' },
        evaluateAt: 'throughoutMax', condition: { type: 'lessThan', value: 0.50 },
        priority: 2, enabled: true,
      },
    ],
    // PASSTHROUGH_GATE, not the Swift registry's own readyAngleMin/Max —
    // every other exercise moved to the 3-layer setup/settle/phantom-guard
    // approach instead of an exercise-specific ready gate (see
    // PASSTHROUGH_GATE's own comment above); porting jumpingJack onto the
    // same universal pattern instead of preserving its now-superseded
    // Swift-only readyGate values.
    readyGate: PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction: 'Face the camera — stand back so head to feet are fully in frame',
      // NEAR / FAR — repMetric is average(normalizedVerticalGap(shoulder,wrist) L/R).
      // (Jumping jack is a front-on movement; the split just keeps setup from
      // stalling on a partly-occluded side.)
      requiredJoints:    ['leftShoulder',  'leftWrist',  'leftHip',  'leftAnkle'],
      requiredJointsAlt: ['rightShoulder', 'rightWrist', 'rightHip', 'rightAnkle'],
    },
    calibration:    { repsNeeded: 2, enterFraction: 0.50, exitFraction: 0.25 },
    minRepInterval: 0.45,
    planarityChecks: [
      // Front-facing; arm motion stays in the frontal plane. Disabled until
      // tuned from real device data, matching every other planarity check.
      { id: 'uarm_l', jointA: 'leftShoulder',  jointB: 'leftElbow',
        minRatio: 0.75, cue: 'FACE CAMERA', fallbackReferenceRatio: 0.64, enabled: false },
      { id: 'uarm_r', jointA: 'rightShoulder', jointB: 'rightElbow',
        minRatio: 0.75, cue: 'FACE CAMERA', fallbackReferenceRatio: 0.64, enabled: false },
    ],
  },

  // ─── Bicep Curl ─────────────────────────────────────────────────────────────
  //
  // VALUES VERBATIM from ExerciseRegistry.swift (post planarity-removal).
  // This is the verified source template for all curl-family variants below.
  curl: curlVariant(
    'curl',
    'Bicep Curl',
    'Face the camera — stand back so both arms are fully in frame',
  ),

  // ─── Curl-family variants ─────────────────────────────────────────────────
  //
  // All variants share curl's thresholds, form checks, and joint config.
  // Grip differs (neutral / overhand / braced / cable) but Vision tracks the
  // same shoulder→elbow→wrist joints regardless of grip — angles are identical.
  // Only id, displayName, and cameraSetup instruction differ from curl.
  // Set reviewed:false — they inherit curl's verified numbers but haven't been
  // separately validated on-device.

  hammerCurl: curlVariant(
    'hammerCurl',
    'Hammer Curl',
    'Face the camera — stand back so both arms are fully in frame',
    // Neutral grip (thumbs up). Pose-identical to curl from Vision's perspective.
  ),

  concentrationCurl: curlVariant(
    'concentrationCurl',
    'Concentration Curl',
    'Film your working arm clearly — both shoulders and elbows in frame',
    // Seated single-arm. Film side-on or facing camera; same elbow joints tracked.
  ),

  preacherCurl: curlVariant(
    'preacherCurl',
    'Preacher Curl',
    'Face the camera — upper arms and both elbows clearly in frame',
    // Arm braced on preacher pad. Same shoulder→elbow→wrist landmarks tracked.
  ),

  reverseCurl: curlVariant(
    'reverseCurl',
    'Reverse Curl',
    'Face the camera — stand back so both arms are fully in frame',
    // Overhand (pronated) grip. Elbow angles are identical to standard curl.
  ),

  cableCurl: curlVariant(
    'cableCurl',
    'Cable Curl',
    'Face the cable machine — stand back so both arms are fully in frame',
    // Low cable pulley. Same joint angles; constant tension vs free weight.
  ),

  // ─── Squat-family variants ──────────────────────────────────────────────────
  //
  // All clone the squat template VERBATIM — same repMetric, thresholds, form
  // checks, readyGate, calibration, and camera setup. reviewed: false.

  gobletSquat: squatVariant(
    'gobletSquat',
    'Goblet Squat',
    'Stand side-on to the camera — full body in frame',
    // Weight held at chest. Side camera gives clean knee-angle read.
  ),

  airSquat: squatVariant(
    'airSquat',
    'Air Squat',
    'Stand side-on to the camera — full body in frame',
    // Bodyweight only. Identical movement to barbell back squat.
  ),

  frontSquat: squatVariant(
    'frontSquat',
    'Front Squat',
    'Stand side-on to the camera — full body in frame',
    // Bar front-racked; more upright torso but same knee-angle metric.
  ),

  backSquat: squatVariant(
    'backSquat',
    'Back Squat',
    'Stand side-on to the camera — full body in frame',
    // Bar on traps. Canonical squat pattern.
  ),

  sumoSquat: squatVariant(
    'sumoSquat',
    'Sumo Squat',
    'Stand side-on to the camera — full body in frame',
    // Wide stance, toes out. Knee-angle metric is the same; stance width
    // affects WHICH knee Vision tracks but both are measured.
  ),

  // ─── Push-up-family variants ────────────────────────────────────────────────
  //
  // All clone the push-up template. reviewed: false.
  // kneePushup uses PUSHUP_HIP_CHECKS_KNEE (shoulder→knee line) because ankles
  // are raised off the floor. All others use the standard ankle-based hip checks.

  kneePushup: kneePushupVariant(
    'kneePushup',
    'Knee Push-up',
    'Place phone on floor to your side — knees and hands in frame',
    // Knees on floor. Hip checks use shoulder→knee line instead of shoulder→ankle.
  ),

  inclinePushup: pushupVariant(
    'inclinePushup',
    'Incline Push-up',
    'Place phone on floor to your side — shoulders and hands in frame',
    // Hands elevated on a bench or box. Same elbow-angle metric.
  ),

  widePushup: pushupVariant(
    'widePushup',
    'Wide Push-up',
    'Place phone on floor to your side — shoulders and hands in frame',
    // Hands wider than shoulder-width. Same movement plane.
  ),

  diamondPushup: pushupVariant(
    'diamondPushup',
    'Diamond Push-up',
    'Place phone on floor to your side — shoulders and hands in frame',
    // Hands form a diamond. Narrow grip; same elbow-angle metric.
  ),

  declinePushup: pushupVariant(
    'declinePushup',
    'Decline Push-up',
    'Place phone on floor to your side — shoulders and hands in frame',
    // Feet elevated on a bench. Same shoulder→elbow→wrist metric.
  ),

  closegripPushup: pushupVariant(
    'closegripPushup',
    'Close-grip Push-up',
    'Place phone on floor to your side — shoulders and hands in frame',
    // Hands under shoulders (narrow). Same elbow-angle metric and hip checks.
    // Belongs to the push-up family, not tricep — uses jointAngle(shoulder,elbow,wrist).
  ),

  // ─── Shoulder-press-family variants ────────────────────────────────────────
  //
  // All clone the shoulderPress template VERBATIM. reviewed: false.

  overheadPress: shoulderPressVariant(
    'overheadPress',
    'Overhead Press',
    'Face the camera — stand back so both arms are clearly in frame',
    // Barbell or EZ-bar. Same upper-arm lineVsVertical metric.
  ),

  arnoldPress: shoulderPressVariant(
    'arnoldPress',
    'Arnold Press',
    'Face the camera — stand back so both arms are clearly in frame',
    // Rotating press. Vision tracks the end positions; rotation is invisible.
  ),

  dumbbellShoulderPress: shoulderPressVariant(
    'dumbbellShoulderPress',
    'Dumbbell Shoulder Press',
    'Face the camera — stand back so both arms are clearly in frame',
    // Independent dumbbells. Same joint landmarks.
  ),

  machineShoulderPress: shoulderPressVariant(
    'machineShoulderPress',
    'Machine Shoulder Press',
    'Face the camera — stand back so both arms are clearly in frame',
    // Fixed path. Same upper-arm metric applies.
  ),

  // ─── Chest press (new family, this round) ──────────────────────────────────
  // See chestPressVariant()'s comment above for the full investigate-first
  // reasoning (closest family: curl's jointAngle metric type; combinator
  // reused from the raise family's side-camera occlusion reasoning).
  chestPress: chestPressVariant(
    'chestPress',
    'Chest Press',
    'Stand or lie sideways to the camera — shoulder, elbow, and wrist visible',
  ),

  // ─── Barbell Bench Press (flat) ─────────────────────────────────────────────
  //
  // REFERENCE EXERCISE: chestPressVariant() above, reused VERBATIM — no new
  // metric, no new thresholds, no new form checks. This IS a chest press
  // (elbow bends toward ~90° lowering the bar to the chest, extends pressing
  // back up) — same joint triad (shoulder-elbow-wrist), same jointAngle
  // metric, same bestSide combinator, same lockout check, same elbow-flare
  // planarity check. A separate named entry rather than pointing the catalog
  // at chestPress directly because "Barbell Bench Press" is asked for as its
  // own prominent, correctly-labeled exercise (equipment scoped to Barbell
  // only, not Dumbbell+Barbell) — the underlying tracked movement and code
  // path are identical, deliberately, not duplicated.
  //
  // TRACKABILITY — investigated honestly, not assumed either way:
  //
  // The concern: this is a LYING-DOWN exercise, and this codebase already
  // has one confirmed floor-lying failure on record (the old gluteBridge —
  // 178/178 frames rejected as unreliable, 100%, on-device). Bench press
  // is NOT that same setup, but it isn't automatically safe either — here's
  // the honest comparison, not a guess:
  //
  // WHAT'S DIFFERENT (reasons for more confidence than gluteBridge):
  //   - ELEVATED, not floor-flat. A bench sits ~15-17in off the ground —
  //     from a side camera at roughly the exercise's own height, the
  //     person's silhouette is separated from the floor line, closer to
  //     how a seated/reclined pose looks than a person flattened onto the
  //     ground the camera is also resting on (gluteBridge's actual framing).
  //   - The joints this metric needs (shoulder, elbow, wrist) sit on the
  //     UPPER body, held up in open air above the torso for the whole rep
  //     — not resting on/near the bench or floor the way gluteBridge's
  //     hip/knee/ankle were pressed into the ground plane.
  //   - This exact camera setup (side-on, shoulder/elbow/wrist, person
  //     reclined on a bench) is NOT untested in this codebase — chestPress
  //     above already ships with "Stand or lie sideways" as a supported
  //     setup instruction. Building barbellBenchPress on the identical
  //     metric doesn't introduce a new unverified bet; it's the SAME bet
  //     chestPress already made, from one more angle.
  //
  // WHAT'S NOT RESOLVED (real, separate risks a floor bridge didn't have):
  //   - General finding from the literature (not specific to Apple Vision,
  //     but the closest evidence available — no public data exists on
  //     VNDetectHumanBodyPoseRequest's reclined-pose accuracy specifically):
  //     pose models across frameworks are trained predominantly on upright
  //     poses, and horizontal/reclined poses are consistently reported as a
  //     harder case, independent of elevation. Elevation likely helps; it
  //     is not proven to fully fix the underlying issue.
  //   - NEW occlusion risk unique to bench press, not shared with gluteBridge
  //     at all: a barbell press is bilateral and stays roughly in-plane with
  //     the body's centerline (both elbows flare out to the SAME sides,
  //     symmetric), so from a strict side camera the near arm can occlude
  //     the far arm for a real fraction of the rep — worse than a hinge or
  //     squat, where the body's natural side-on profile keeps the near-side
  //     limb clearly separated. Already mitigated structurally, not newly
  //     patched here: CHEST_PRESS_REP_METRIC uses bestSide (not curl's
  //     'minimum'), meaning the engine already only trusts whichever arm is
  //     actually confidently tracked, per-frame — see that metric's own
  //     comment. A barbell/rack briefly crossing in front of the wrist is
  //     the same class of occlusion the engine's confidence gating already
  //     exists to handle, not a new problem needing new code.
  //   - Barbell-specific positive: a barbell's path is far more constrained
  //     than dumbbells (fixed bar, both hands locked to it, minimal lateral
  //     wobble) — if anything, this should make the elbow-angle metric MORE
  //     consistent rep to rep than a dumbbell chest press, not less.
  //
  // VERDICT: genuinely uncertain, reasoned as far as it can be without a
  // real device test — NOT a guess either direction, and NOT presented as
  // confirmed working. Shipping it because the honest case for "elevated +
  // upper-body joints in open air" is real and meaningfully different from
  // the confirmed floor failure, and because the ONLY way gluteBridge's
  // actual failure was ever discovered was by building it and reading the
  // log, not by reasoning alone. Do 5 reps once this reloads and check the
  // debug log for "[REP] rejected — tracking unreliable for X/Y frames" —
  // the engine's built-in confidence gate (>50% of a rep's frames unreliable
  // rejects it, same mechanism that caught gluteBridge) surfaces exactly
  // this failure mode automatically, no extra instrumentation needed. If it
  // rejects most/all reps the same way gluteBridge did, that's the honest
  // answer and this entry should come back out.
  barbellBenchPress: chestPressVariant(
    'barbellBenchPress',
    'Barbell Bench Press',
    'Lie on a bench, side-on to the camera — shoulder, elbow, and wrist in frame',
  ),

  // ─── Lunge-family variants ──────────────────────────────────────────────────
  //
  // All clone the lunge template VERBATIM. reviewed: false.
  // stepUp note: the minimum-knee metric naturally tracks the stepping leg as it
  // bends to place the foot on the box, and the rep completes when the user
  // stands on the box (knee extends past exitThreshold). Calibration derives
  // per-user box-height thresholds automatically — no extra primitives needed.

  splitSquat: lungeVariant(
    'splitSquat',
    'Split Squat',
    'Stand side-on to the camera — full body in frame',
    // Static split stance. Front-leg knee angle is what the metric tracks.
  ),

  reverseLunge: lungeVariant(
    'reverseLunge',
    'Reverse Lunge',
    'Stand side-on to the camera — full body in frame',
    // Step back instead of forward. Same front-knee angle metric.
  ),

  stepUp: lungeVariant(
    'stepUp',
    'Step-up',
    'Stand side-on to the camera — full body and box in frame',
    // Foot placed on a box; knee angle tracks the stepping leg.
  ),

  bulgarianSplitSquat: lungeVariant(
    'bulgarianSplitSquat',
    'Bulgarian Split Squat',
    'Stand side-on to the camera — full body and bench in frame',
    // Rear foot elevated. Front-leg knee is the metric joint.
  ),

  // ─── Tricep-family variants ─────────────────────────────────────────────────
  //
  // All use lineVsVertical(wrist→elbow) as repMetric — forearm angle from vertical.
  // DECREASES as elbow extends (rest ~80°, full extension ~0-15°). reviewed: false.
  // tricepKickback excluded: its metric INCREASES during extension (see comments above).

  tricepPushdown: tricepVariant(
    'tricepPushdown',
    'Tricep Pushdown',
    'Stand sideways to the camera — shoulder, elbow, and wrist in frame',
    // Cable or band, standing. Upper arm vertical at side, forearm swings down.
  ),

  overheadTricepExtension: tricepVariant(
    'overheadTricepExtension',
    'Overhead Tricep Extension',
    'Stand sideways to the camera — arms fully above head in frame',
    // Dumbbell or cable overhead. Elbow bent behind head, forearm extends up.
  ),

  skullcrusher: skullcrusherVariant(
    'skullcrusher',
    'Skullcrusher',
    'Set camera to your side at bench height — lie flat, arms in frame',
    // EZ-bar or dumbbell, lying on bench. Elbows bent (rest), extend upward (bottom).
    // Torso lean check disabled (meaningless when lying flat).
  ),

  // ─── Row family — bent-over sub-family ─────────────────────────────────────
  bentOverRow: bentOverRowVariant(
    'bentOverRow',
    'Bent-Over Row',
    'Stand side-on — hinge forward, arm hangs from shoulder to wrist in frame',
  ),

  barbellRow: bentOverRowVariant(
    'barbellRow',
    'Barbell Row',
    'Stand side-on — hinge forward over the bar, shoulder to wrist in frame',
  ),

  singleArmRow: bentOverRowVariant(
    'singleArmRow',
    'Single-Arm Row',
    'Stand side-on — working arm in frame, shoulder to wrist clearly visible',
  ),

  invertedRow: bentOverRowVariant(
    'invertedRow',
    'Inverted Row',
    'Set camera to your side — body straight under the bar, arms in frame',
    // Body is horizontal (~90° from vertical). Torso swing check (throughoutMin < 25°)
    // never fires. Primary fault (hips dropping) not expressible with current primitives.
  ),

  tBarRow: bentOverRowVariant(
    'tBarRow',
    'T-Bar Row',
    'Stand side-on — hinge forward over the bar, shoulder to wrist in frame',
  ),

  // ─── Row family — seated sub-family ─────────────────────────────────────────
  seatedCableRow: seatedRowVariant(
    'seatedCableRow',
    'Seated Cable Row',
    'Sit side-on — hip and wrist both in frame, arm extended toward cable',
  ),

  machineRow: seatedRowVariant(
    'machineRow',
    'Machine Row',
    'Sit side-on — hip and wrist both in frame, arm extended toward handles',
  ),

  // ─── Hip-hinge family ───────────────────────────────────────────────────────
  //
  // romanianDeadlift is the reference/base exercise — the placeholder
  // thresholds above are meant to be calibrated from THIS one first (bodyweight
  // or dowel, no equipment needed), then the rest inherit the same real numbers
  // since hinge mechanics are nearly identical across all of them (per the
  // research spec). ALL thresholds here are placeholders — see the building
  // blocks above and the [REP] log.
  romanianDeadlift: hingeVariant(
    'romanianDeadlift',
    'Romanian Deadlift',
    'Stand sideways to the camera — full body in frame, hips and shoulders visible',
  ),

  deadlift: hingeVariant(
    'deadlift',
    'Deadlift',
    'Stand sideways to the camera — full body in frame, hips and shoulders visible',
    // Conventional deadlift starts from the floor (more knee bend at the very
    // bottom than an RDL) but the working ROM and torso-angle signal are the
    // same hinge pattern. Flag if on-device data shows this needs its own
    // knee_bend allowance separate from the RDL-derived placeholder.
  ),

  goodMorning: hingeVariant(
    'goodMorning',
    'Good Morning',
    'Stand sideways to the camera — full body in frame, hips and shoulders visible',
    // Bar-on-back hinge — same torso-angle mechanics as RDL, just loaded
    // differently. No mechanical reason to expect different thresholds.
  ),

  kettlebellSwing: {
    ...hingeVariant(
      'kettlebellSwing',
      'Kettlebell Swing',
      'Stand sideways to the camera — full body in frame, hips and shoulders visible',
      // Explosive/ballistic — noticeably faster tempo than a controlled RDL, so
      // minRepInterval is set shorter here (placeholder: 0.3 vs the family
      // default 0.5) to avoid missing fast reps. This is a guess about tempo
      // ONLY, not the core metric — verify against a real device log same as
      // the rest; if 0.3 turns out too short/long, it's an easy one-line fix.
      0.3,
    ),
    // Same ballistic-movement exception as minRepInterval above, applied to
    // the core exit-confirm dwell (see ExerciseDefinition.swift /
    // exerciseDefinitions.ts's exitConfirmFrames doc comments) — the default
    // (3 frames, ~0.3s) is what actually fixed double-counting everywhere
    // else; this is the ONE narrow, named exception, not a reason to lower
    // the default.
    exitConfirmFrames: 1,
  },

  singleLegRDL: hingeVariant(
    'singleLegRDL',
    'Single-Leg RDL',
    'Stand sideways to the camera — full body in frame, hips and shoulders visible',
    // Single-leg balance changes the difficulty, not the torso-angle mechanics
    // being measured — same repMetric and placeholder thresholds as the rest.
  ),

  // ─── Cable pull-through ─────────────────────────────────────────────────────
  // ADDED IN PLACE OF HIP THRUST. The ask was hip thrust (shoulders on a
  // bench, hips drive up) — investigated honestly, not built: the confirmed
  // gluteBridge failure (178/178 frames rejected, 100%, on-device) reads as
  // a whole-body SILHOUETTE recognition failure, not a single-joint
  // occlusion issue — Vision fundamentally not parsing "person reclined,
  // side view, close to the ground" as a valid pose at all. A hip thrust's
  // BOTTOM position — where every rep starts, and where the engine needs a
  // reliable rest reading before it can even recognize a rep beginning — is
  // nearly the same overall silhouette as gluteBridge's: hips low, knees
  // bent, feet planted, torso low and diagonal. Elevating the SHOULDERS
  // onto a bench doesn't change that picture at the bottom of the rep; only
  // the top (hips fully extended) gets meaningfully more upright, and a rep
  // detector needs both ends of the range working, not just one. Recommended
  // skipping the rebuild rather than shipping something with a specific,
  // reasoned expectation of repeating the same failure — user confirmed.
  //
  // This is the trackable replacement: same hip-extension muscle target
  // (glutes/hamstrings), same STANDING-the-whole-time property that already
  // fixed the glute-bridge/hip-thrust problem for standingGluteKickback, but
  // closer to hip thrust's actual loading pattern (bilateral, loaded
  // through a full hip hinge, not a single-leg kickback). A cable
  // pull-through IS a hip hinge — anchor low behind the body, hinge forward
  // reaching back through the legs, then drive the hips forward to standing
  // — mechanically the same torso-angle movement romanianDeadlift/deadlift/
  // kettlebellSwing already track, just loaded from behind instead of in
  // front. hingeVariant() reused VERBATIM, zero new metric, zero new risk:
  // the person never leaves standing at any point in the rep.
  cablePullThrough: hingeVariant(
    'cablePullThrough',
    'Cable Pull-Through',
    'Stand sideways to the camera — full body in frame, hips and shoulders visible',
  ),

  // ─── Shoulder/arm isolation raise family ───────────────────────────────────
  //
  // lateralRaise is the template — placeholder thresholds are meant to be
  // calibrated from THIS one first, no equipment needed to test the movement
  // pattern. Calf raise assessed and NOT included — see conversation notes:
  // no heel/toe landmark exists, and the real ROM is a few centimeters, an
  // order of magnitude smaller than every other exercise's swing. Not forcing
  // it in; treat as a separate investigation if you want to test the raw
  // ankle-position signal on-device first.
  lateralRaise: lateralRaiseVariant(
    'lateralRaise',
    'Lateral Raise',
    'Face the camera — stand back so both arms are fully in frame',
  ),

  frontRaise: frontRaiseVariant(
    'frontRaise',
    'Front Raise',
    'Stand sideways to the camera — full arm in frame, shoulder to wrist visible',
    // Side camera, not front — see RAISE_CAMERA_JOINTS_SIDE_A/B comment above:
    // a front raise's arc points straight at a front camera and would
    // foreshorten to nearly nothing at the top.
  ),

  // ─── Lat pulldown (vertical pull) ───────────────────────────────────────────
  // See latPulldownVariant() and its comments above for the full
  // investigate-first reasoning (metric/direction/camera/form-check
  // feasibility) and the explicit placeholder-threshold warning.
  //
  // Wide-grip/close-grip variants REMOVED on explicit request — grip width
  // doesn't change the elbow-angle metric being measured, so the two
  // "variants" were the exact same tracking/thresholds under a different
  // name, just making the exercise list longer for no functional reason.
  // One "Lat Pulldown" only.
  //
  // ORIENTATION, REVERSED this round: back-to-camera, not front-facing.
  // The PRIOR version of this note asserted front-facing was required
  // because "facing away hides the arms behind the torso" — that reasoning
  // was never actually re-examined per-joint, it just carried over from the
  // wrist-based metric of that round. Back-to-camera IS how this exercise
  // is really performed (you face the machine; a camera behind you sees
  // your back), and the "many reps facing away = nothing counts" report is
  // real evidence the WRIST specifically doesn't track reliably from behind
  // at the bottom of the pull (hands close in to the torso midline — the
  // highest self-occlusion risk in the whole rep) — not evidence the
  // exercise is untrackable from behind. Switching the tracked joint to
  // elbow (see LAT_PULLDOWN_REP_METRIC's comment for the full reasoning —
  // elbows flare out and drive back through the whole rep, staying on the
  // visible silhouette edge from a back view) should fix the actual root
  // cause instead of avoiding the correct orientation. Not device-verified
  // — send a [METRIC] log from a real back-facing set to confirm.
  latPulldown: latPulldownVariant(
    'latPulldown',
    'Lat Pulldown',
    'Back to the camera — sit back so both arms are fully in frame overhead to shoulders',
  ),

  // ─── Standing glute kickback ─────────────────────────────────────────────────
  // See standingGluteKickbackVariant() and its comments above for the full
  // investigate-first reasoning (why gluteBridge/hipThrust were removed,
  // metric direction, camera, form-check feasibility) and the explicit
  // placeholder-threshold warning.
  standingGluteKickback: standingGluteKickbackVariant(
    'standingGluteKickback',
    'Standing Glute Kickback',
    'Stand sideways to the camera — hip, knee, and ankle in frame',
  ),

  // ─── Face pull ────────────────────────────────────────────────────────────────
  // See facePullVariant() and its comments above for the full investigate-
  // first reasoning (reference exercise: the row family; combinator choice;
  // foreshortening feasibility; the explicit placeholder-threshold warning).
  facePull: facePullVariant(
    'facePull',
    'Face Pull',
    'Face the camera — stand back so both arms are fully in frame',
  ),

  // ─── Pull-up ────────────────────────────────────────────────────────────────
  //
  // REFERENCE EXERCISE: pushup's repMetric (bodyRelativeDeviation + bestSide,
  // leftJoints/rightJoints trimmed to the reliable joints only — see that
  // entry's own comment for the full history behind this shape). Pull-up
  // shares pushup's exact problem, in a different joint: the WRIST occludes
  // (gripping the bar, often right at/behind the head at the top of the
  // rep), not the ankle. Same fix, different joint — measure something that
  // changes with the movement WITHOUT ever needing the wrist.
  //
  // METRIC CHOICE: elbow's perpendicular deviation from the hip→shoulder
  // line (the torso's own long axis) — bodyRelativeDeviation(point: elbow,
  // axisFrom: hip, axisTo: shoulder). At a dead hang (rest), the arm
  // reaches up and out overhead, so the elbow sits FAR from the torso's own
  // axis — large deviation. At the top of a pull-up (chin over bar), the
  // elbows drive down and back close alongside the ribs — the elbow sits
  // NEAR the torso axis — small deviation. This is orientation-agnostic
  // (built from real joint-to-joint geometry, not raw Vision x/y) the same
  // way pushup's own metric is, and never touches the wrist. Legs are
  // deliberately absent from this metric and its joints entirely, per the
  // explicit ask — a pull-up's legs can dangle, tuck, or kick, none of
  // which should affect rep detection.
  pullup: {
    id:          'pullup',
    displayName: 'Pull-up',

    repMetric: {
      type: 'bestSide',
      left:  { type: 'bodyRelativeDeviation', point: 'leftElbow',  axisFrom: 'leftHip',  axisTo: 'leftShoulder'  },
      right: { type: 'bodyRelativeDeviation', point: 'rightElbow', axisFrom: 'rightHip', axisTo: 'rightShoulder' },
      // Reliability-gate joints (see pushup's identical fix and its own
      // comment for why) — shoulder, elbow, hip only. NOT wrist (occludes
      // at the top) and NOT ankle/knee (legs excluded on purpose).
      leftJoints:  ['leftShoulder',  'leftElbow',  'leftHip'],
      rightJoints: ['rightShoulder', 'rightElbow', 'rightHip'],
    },

    // PLACEHOLDER — no existing exercise uses elbow-vs-torso-axis deviation
    // as a PRIMARY rep signal, so there's no verified scale to calibrate
    // from the way squat/curl's angle metrics had. Deliberately wide gap
    // between enter/exit and topAngle so a real down-then-up swing
    // registers regardless of where the true numbers land. Do a few real
    // pull-ups (or send a video) and read the [REP-TRACE]/[REP] log — set
    // the real numbers from that, not from this guess.
    topAngle:            0.55,   // PLACEHOLDER — dead-hang value (large deviation)
    repEnterThreshold:   0.35,   // PLACEHOLDER
    repExitThreshold:    0.42,   // PLACEHOLDER
    goodROMThreshold:    0.18,   // PLACEHOLDER — "chin over bar" depth
    insufficientROMCue: 'PULL HIGHER',

    // Anti-kipping/swing check — same lineVsVertical(hip→shoulder) pattern
    // curl's lean_back check already uses successfully, just repurposed: a
    // pull-up done with a big kipping swing tips the torso well off
    // vertical. Threshold copied from curl's own (20°) as a starting point,
    // not re-derived — flag if it fires on a normal strict pull-up.
    formChecks: [
      {
        id: 'kip_swing', cue: 'STOP SWINGING',
        metric: {
          type:  'average',
          left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
          right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
        },
        evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 20 },
        priority: 4, enabled: true,
      },
    ],
    readyGate: PASSTHROUGH_GATE,

    cameraSetup: {
      setupInstruction: "Face the camera — shoulders, elbows, and hips in frame (hands on the bar don't need to be)",
      // NEAR / FAR — repMetric is bestSide(bodyRelativeDeviation(elbow; hip→shoulder)).
      requiredJoints:    ['leftShoulder',  'leftElbow',  'leftHip'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow', 'rightHip'],
    },

    minRepInterval:  0.6,
    planarityChecks: [],
  },

  // ─── Calf raise ─────────────────────────────────────────────────────────────
  //
  // FEASIBILITY FLAG — read this before trusting anything below it: this
  // app's tracked joint set (Joint enum, Joints.swift) has NO heel or toe
  // joint at all — the lowest point tracked is the ANKLE. A calf raise's
  // real motion (heel lifting a few inches while the ball of the foot stays
  // planted) barely moves the ANKLE joint itself — the ankle sits close to
  // the pivot of that motion, not its end, so its own vertical travel is
  // small relative to full body height, plausibly on the same order as
  // Vision's own per-frame joint-position jitter. Of everything added this
  // round, this is the one most likely to simply not register — genuinely
  // uncertain, not a guess either way. Send a real device log immediately
  // rather than assuming this works.
  //
  // METRIC: normalizedVerticalGap(upper: knee, lower: ankle) — as the ankle
  // rises (heel lift), the knee-to-ankle vertical gap shrinks slightly
  // (knee stays put, ankle moves up toward it). bestSide across both legs
  // so whichever leg the camera reads more clearly drives the value.
  calfRaise: {
    id:          'calfRaise',
    displayName: 'Calf Raise',

    repMetric: {
      type: 'bestSide',
      left:  { type: 'normalizedVerticalGap', upper: 'leftKnee',  lower: 'leftAnkle'  },
      right: { type: 'normalizedVerticalGap', upper: 'rightKnee', lower: 'rightAnkle' },
      leftJoints:  ['leftKnee',  'leftAnkle'],
      rightJoints: ['rightKnee', 'rightAnkle'],
    },

    // RECALIBRATED from a device log (8/31/2026): the previous band
    // (top 0.10 / enter 0.07 / exit 0.085) was ~10x BELOW the real metric
    // value — normalizedVerticalGap(knee,ankle) actually reads ~0.76–0.94,
    // hovering ~0.85 at rest, so the value could never approach the old
    // thresholds and zero reps registered. New band is anchored to that
    // observed range: a heel raise shrinks the knee→ankle vertical gap, so
    // a rep DROPS the value and returns.
    // STILL A PLACEHOLDER: that same log showed the value bouncing ~±0.09
    // with no visible rep structure — the calf-raise motion may sit inside
    // Vision's noise floor for this joint pair. Do ~10 SLOW, deliberate,
    // full-height raises and send the log; if the deliberate dips don't
    // separate cleanly from that noise, this exercise isn't trackable with
    // knee/ankle alone and should be dropped.
    topAngle:            0.88,    // PLACEHOLDER — heels-down baseline (top of observed range)
    repEnterThreshold:   0.80,    // PLACEHOLDER — needs a clear ~0.08 drop from rest to enter
    repExitThreshold:    0.84,    // PLACEHOLDER — back toward rest
    goodROMThreshold:    0.75,    // PLACEHOLDER — full heel raise
    insufficientROMCue: 'HIGHER RAISE',

    // No form check — with only knee/ankle available and the primary
    // signal already this thin, an unverified form check stacked on top
    // would just be a second guess on top of the first. Nothing here meets
    // this file's own feasibility bar (see rule 4 in this project's
    // CLAUDE.md — check feasibility before building a form check).
    formChecks: [],
    readyGate: PASSTHROUGH_GATE,

    cameraSetup: {
      setupInstruction: 'Stand side-on to the camera — knees and ankles in frame',
      // NEAR / FAR — repMetric is bestSide(normalizedVerticalGap(knee,ankle)).
      requiredJoints:    ['leftKnee',  'leftAnkle'],
      requiredJointsAlt: ['rightKnee', 'rightAnkle'],
    },

    minRepInterval:  0.4,
    planarityChecks: [],
  },

  // ─── Leg curl (machine) ─────────────────────────────────────────────────────
  //
  // REFERENCE EXERCISE: squat's own repMetric — the SAME hip-knee-ankle
  // jointAngle, averaged left/right (not bestSide — a machine leg curl
  // usually loads both legs symmetrically, matching squat's own choice for
  // the same reason). A leg curl is squat's knee-angle measurement run from
  // a seated/lying position instead of standing: the angle formula itself
  // is a pure 3-point geometric angle and doesn't care whether the body is
  // upright or seated, so this transfers directly — same joints, same
  // metric type, same combinator.
  legCurl: {
    id:          'legCurl',
    displayName: 'Leg Curl (Machine)',

    repMetric: {
      type:  'average',
      left:  { type: 'jointAngle', a: 'leftHip',  pivot: 'leftKnee',  c: 'leftAnkle'  },
      right: { type: 'jointAngle', a: 'rightHip', pivot: 'rightKnee', c: 'rightAnkle' },
    },

    // PLACEHOLDER, but scaled directly off squat's own VERIFIED numbers
    // (topAngle 160 / enter 150 / exit 155 / goodROM 90) since this is
    // literally the same 3-joint angle — about as close to "verified" as a
    // placeholder can start. What's genuinely unverified: a MACHINE leg
    // curl's true achievable range may differ from a standing squat's (pad/
    // carriage geometry often stops short of squat's 90° "parallel" depth)
    // — goodROMThreshold especially may need loosening. You mentioned
    // testing this one by video since it needs a machine — send that log
    // and these get set from real numbers, not this borrowed scale.
    topAngle:            160,   // PLACEHOLDER (borrowed from squat's own verified value)
    repEnterThreshold:   150,   // PLACEHOLDER
    repExitThreshold:    155,   // PLACEHOLDER
    goodROMThreshold:     90,   // PLACEHOLDER — may not be reachable on every machine, watch the log
    insufficientROMCue: 'CURL FURTHER',

    // No form check — a machine already constrains the movement path
    // mechanically (unlike a free-weight squat, where back lean/knee cave
    // are real independent faults worth checking); nothing analogous is
    // reliably measurable here with the available joints.
    formChecks: [],
    readyGate: PASSTHROUGH_GATE,

    cameraSetup: {
      setupInstruction: "Side-on to the camera — hip, knee, and ankle in frame (the machine partially blocking the leg is expected)",
      // NEAR / FAR — repMetric is average(jointAngle(hip,knee,ankle) L/R).
      requiredJoints:    ['leftHip',  'leftKnee',  'leftAnkle'],
      requiredJointsAlt: ['rightHip', 'rightKnee', 'rightAnkle'],
    },

    minRepInterval:  0.5,
    planarityChecks: [],
  },

  // ─── Crunch ─────────────────────────────────────────────────────────────────
  //
  // FEASIBILITY FLAG, stronger than a normal placeholder warning: this app
  // has a CONFIRMED on-device failure for a lying-down exercise already.
  // gluteBridge/hipThrust were built, tested, and REMOVED because Apple
  // Vision's body-pose detector rejected 100% of frames — not "low
  // confidence," genuinely couldn't find a person at all lying flat on the
  // floor (see standingGluteKickback's own comment in constants/
  // exercises.ts for that history). A crunch is also lying down. It MAY
  // fare differently — knees bent and feet planted gives a more open,
  // side-on silhouette than a flat hip thrust, and camera angle matters a
  // lot here — but that's a hope, not something verifiable without a
  // device test. The FIRST thing to check on a real log isn't rep counting
  // or thresholds — it's literally whether "[VIDEO-POSE] ... no person
  // detected" shows up at all. If it does, no threshold fix here will help;
  // this needs a different camera angle at minimum, and may share
  // gluteBridge's fate outright.
  //
  // METRIC: distanceRatio(a: shoulder, b: knee) — NOT bodyRelativeDeviation
  // despite the ask suggesting it (matching pushup's exact primitive).
  // Worked through why: bodyRelativeDeviation(shoulder, axisFrom: hip,
  // axisTo: knee) has the WRONG polarity here. Lying flat (rest), the
  // shoulder sits nearly ON the hip→knee line — a SMALL deviation; curled
  // up (the work position), the shoulder moves AWAY from that line — a
  // LARGE deviation. But this engine's rep state machine is hardwired the
  // other way for every exercise (topAngle/rest = the LARGE value, a rep
  // ENTERS when the value DROPS) — bodyRelativeDeviation would need rest to
  // be large, which it isn't here. distanceRatio doesn't have this problem:
  // it's a plain 2D image distance (shoulder-to-knee), which is naturally
  // LARGE lying flat (torso fully laid out, shoulder far from the bent
  // knee) and shrinks as the shoulder physically moves toward the knees
  // during the curl — correct polarity, and — like bodyRelativeDeviation —
  // doesn't decompose into vertical/horizontal components at all, so it's
  // just as orientation-agnostic as what was asked for, by a different
  // route.
  crunch: {
    id:          'crunch',
    displayName: 'Sit-up',   // renamed — the shoulder→knee distanceRatio tracks a full sit-up better than a shoulder-blades-only crunch (and it's what the user does)
    guideBox:    'floor',

    repMetric: {
      type: 'bestSide',
      left:  { type: 'distanceRatio', a: 'leftShoulder',  b: 'leftKnee'  },
      right: { type: 'distanceRatio', a: 'rightShoulder', b: 'rightKnee' },
      // Shoulder only — same reliability-gate trim pushup's fix and
      // pull-up above both use, for the same reason: don't let the whole
      // rep get thrown out by a hip/knee confidence dip this metric's own
      // internal 0.25 floor (Joints.swift's kMinConf) already tolerates.
      leftJoints:  ['leftShoulder'],
      rightJoints: ['rightShoulder'],
    },

    // PLACEHOLDER — genuinely novel: no existing exercise uses distanceRatio
    // as a PRIMARY rep metric (its one other use, segmentLengthRatio, is a
    // foreshortening-gate special case per that primitive's own doc
    // comment, not a calibrated rep signal). These numbers assume a
    // shoulder-to-knee distance around 1.3-1.5x torso height lying flat,
    // shrinking toward ~0.7x at a real crunch peak — a reasoned estimate
    // from body proportions, not a measurement. Wide gap on purpose so a
    // REAL-LOG-DERIVED (one on-device take, side-on floor level) — replaces
    // the earlier guessed placeholders (enter 1.0 / exit 1.2 / rom 0.7). That
    // log: rep #1 counted GOOD (polarity + swing correct); the observed
    // values are a noisy continuum, not two clean clusters:
    //   genuine rest (lying flat): ~1.87–2.15, single-frame noise dips to ~1.37
    //   crunch bottom:             ~0.50–0.68
    //   transition band:           ~0.85–1.4 (0.89, 0.95, 1.05, 1.22, 1.27…)
    // enter/exit widened slightly to 0.95 / 1.30 (from 1.0 / 1.2) for real
    // hysteresis on both sides of the transition band, so single-frame noise
    // between rest and a crunch can't flap the atTop↔inRep state (the
    // pushup-fix method). A real crunch (~0.5) still clears enter; the return
    // to flat (~2.0) still clears exit. goodROMThreshold 0.70→0.85 so a
    // genuine crunch bottoming at ~0.68 still grades as full ROM instead of
    // nagging CURL HIGHER — this does NOT gate counting (a rep counts on the
    // enter→exit crossing regardless of ROM).
    // CALIBRATED from a device [CALIB] log (8/31/2026, 3 clean reps):
    //   rest/max  avg 2.17  [2.1–2.2]
    //   bottom/min avg 0.6   [0.5–0.8]   (deep reps ~0.5; a shallow one ~0.8)
    //   swing avg 1.53
    // The old enter=0.95 sat only ~0.15 above the deepest point, so a rep
    // wasn't detected until you were ~80% of the way up — that's the "reps
    // are really late" complaint. enter raised to 1.25 (~40% into the sit-up)
    // so it registers early, with a 0.25 hysteresis gap to exit=1.50. Rest
    // noise dips only reach ~1.35, safely above 1.25, so they can't false-fire.
    // topAngle kept low-ish (1.60) so the 0.75x resume bar (1.20) stays below
    // the rest noise floor.
    // goodROMThreshold TIGHTENED HARD 0.85 -> 0.55 per explicit request:
    // a full sit-up bottoms at ~0.5, a half-rep at ~0.8, so 0.55 passes deep
    // reps and flags anything shallower with GO HIGHER (does NOT gate the
    // count — a shallow rep still counts, just as a bad rep).
    topAngle:            1.60,
    repEnterThreshold:   1.25,
    repExitThreshold:    1.50,
    goodROMThreshold:    0.55,
    insufficientROMCue: 'GO HIGHER',

    // FORM CUES. Kept per explicit request, but both thresholds are LOOSE
    // PLACEHOLDERS set ABOVE the user's own observed clean-rep readings so
    // they stop false-firing. Real values pending a labelled log: 5 clean +
    // 5 obvious leg-kick + 5 obvious arm-swing crunches, then compare the
    // crunch_legs / crunch_arms values. If a fault's readings don't separate
    // from clean reps (i.e. the signal is just noise — a real risk here,
    // Vision struggles with a planted foot and hands-behind-head lying flat),
    // that check comes back out.
    //
    //  ✓ "Go higher" — separately covered by ROM grading (goodROMThreshold
    //    0.85 + insufficientROMCue 'GO HIGHER'), not a formCheck.
    //
    //  ~ "Keep legs down" — device log (8/30/2026): crunch_legs read 32.5
    //    and 36.2 on two CLEAN reps (jointAngle hip-knee-ankle; the ankle is
    //    poorly tracked planted + foreshortened, so treat the unit as
    //    opaque). Threshold was 2.85 → fired every rep. Raised to 55
    //    (~1.5× the highest clean reading seen) so clean reps pass; a real
    //    leg kick straightening the knee should push it higher still. If it
    //    doesn't, this stays silent (harmless) until the calibration log.
    //
    //  ~ "Don't swing arms" — NO device data yet. distanceRatio(wrist,
    //    shoulder): hands near the head ≈ small, arms flung forward for
    //    momentum ≈ large. 1.30 is a first guess at "clearly reaching past
    //    the head"; calibrate from the log.
    //
    //  ✗ "Slow it down / don't be jerky" — SKIPPED. FormCheckDef has no
    //    rep-duration or jerk condition (engine-internal only).
    formChecks: [
      {
        id:         'crunch_legs',
        cue:        'KEEP LEGS DOWN',
        metric: {
          type:  'maximum',
          left:  { type: 'jointAngle', a: 'leftHip',  pivot: 'leftKnee',  c: 'leftAnkle'  },
          right: { type: 'jointAngle', a: 'rightHip', pivot: 'rightKnee', c: 'rightAnkle' },
        },
        evaluateAt:       'throughoutMax',
        // Device log: clean sit-ups read 50-53, one rep read 70.5 and FALSE-fired
        // at lim 70. Raised to 92 — clean reps have huge margin, a genuine
        // leg-drive (knees straightening) still blows past it, and it stops
        // nagging on normal reps.
        condition:        { type: 'greaterThan', value: 92 },
        priority:         3,
        enabled:          true,
        formCheckMinConf: 0.35,
      },
      {
        id:         'crunch_arms',
        cue:        'DON\'T SWING ARMS',
        metric: {
          type:  'maximum',
          left:  { type: 'distanceRatio', a: 'leftWrist',  b: 'leftShoulder'  },
          right: { type: 'distanceRatio', a: 'rightWrist', b: 'rightShoulder' },
        },
        evaluateAt:       'throughoutMax',
        condition:        { type: 'greaterThan', value: 1.65 },  // PLACEHOLDER — a rep read 1.43 and was flagged; not enough data (only 1 rep counted). Calibrate once rep counting works
        priority:         2,
        enabled:          true,
        formCheckMinConf: 0.35,
      },
    ],
    readyGate: PASSTHROUGH_GATE,

    // SETUP fix — same class as pushup's. The old gate required all four of
    // both shoulders + both knees continuously visible for a 2s hold before
    // ACTIVE; lying side-on, the FAR shoulder and FAR knee self-occlude, so
    // the hold kept resetting on "missing rightShoulder/rightKnee" → slow to
    // lock on (log symptom #1). SETUP only needs enough to confirm the
    // person is in position, and the engine's SETUP check wants ONE complete
    // side (no cross-side mixing) — so give it the NEAR side's shoulder+knee,
    // with the other side as the alternate. The rep metric's own per-frame
    // bestSide already tolerates single-side occlusion frame to frame.
    // CAMERA DISTANCE MATTERS (device log 8/30/2026 — 1 of 10 reps counted):
    // the engine resets its rep-entry gate whenever a rep-metric joint is
    // within 5% of the frame edge (isNearFrameEdge → framesSincePoseGap = 0).
    // Lying flat with your body filling the frame, a knee sits right at the
    // edge every frame, so the gate never clears and reps don't register.
    // FRAMING IS A KNIFE-EDGE for a lying pose (device logs 8/30/2026):
    //  - too close → a knee sits within 5% of the frame edge every frame →
    //    isNearFrameEdge resets the rep-entry gate → reps never register.
    //  - too far → the figure is too small / low-contrast for Apple Vision's
    //    body-pose detector, which then drops the person entirely for
    //    multi-frame stretches ("rep abandoned — person left frame") and
    //    emits garbage single-frame values.
    // Target: body filling roughly two-thirds of the frame, centred, with a
    // hand's width of margin at head and feet, and good even light on you.
    cameraSetup: {
      setupInstruction: 'Lie on your back, phone on the floor to your side, ~3-4 ft away. Fill about two-thirds of the frame — a little gap at your head and feet, good light on you',
      requiredJoints:    ['leftShoulder',  'leftKnee'],
      requiredJointsAlt: ['rightShoulder', 'rightKnee'],
    },

    // Lying flat, Vision self-occludes the far side and briefly loses the
    // whole person mid-rep (log: framesSincePoseGap resets right at the top
    // of rep #1). Default 3 frames (~0.3s) abandons an in-progress rep on
    // that flicker. Raised to 6 (~0.6-0.8s at the ~8fps this pose runs at) so
    // a normal occlusion blink no longer kills the rep — same log-confirmed
    // exception tricep already carries.
    missingPersonGraceFrames: 6,

    // At the ~8fps Vision manages for a floor pose, requiring 3 consecutive
    // frames above repExitThreshold to trust a rep as complete makes each
    // rep resolve slowly — rep #1 took 5.2s — which is what let the 8s
    // native inactivity-suppression fire and then deadlock counting. The
    // return-to-flat of a crunch is a brief, near-ballistic moment; 2 frames
    // is the sanctioned per-exercise override for exactly that (see
    // kettlebellSwing). Faster rep resolution keeps the inactivity gap under
    // 8s so suppression never engages.
    exitConfirmFrames: 2,

    // LOG-DERIVED (8/30/2026 device take): a genuine crunch was rejected —
    // "[REP] rejected — tracking unreliable for 8/12 frames (67%)" with
    // leftShoulder confidence ranging [0.28-0.67], rightShoulder [0.00-0.30].
    // Lying flat, Apple Vision's shoulder confidence simply doesn't clear the
    // 0.6 reliability floor for most of a rep, so the default 0.5 cutoff
    // deletes real reps. 0.9 keeps the gate's real purpose (catch a rep
    // logged while the user walked away — that runs ~100% unreliable) while
    // letting a normal lying-down crunch count.
    repReliabilityMaxUnreliableFraction: 0.9,
    // Reps resolve slowly lying flat and the reliability gate discards some,
    // so the real inter-rep gap runs well past 8s — a device log showed
    // inactivity suppression engaging at 9.9s and never releasing, killing
    // the rest of the set. 30s leash. (Native — needs an EAS build.)
    inactivityRepGapSec: 30,
    // LOG-DERIVED (8/31/2026 device take): rep #1 counted GOOD, then rep #2 —
    // a clearly deeper rep in the raw [METRIC] trace (value 2.05 → 0.63) — was
    // rejected as phantom because framesSincePoseGap kept resetting 1→2→3→4→0
    // every few frames (a knee/shoulder near the frame edge, lying across the
    // whole frame), so repMinAngle never recorded the 0.63 bottom — it stuck
    // at 1.21 and movementPastEntry read 0.04 vs 0.21 required. Then inactivity
    // suppression locked out the remaining ~6 reps. Disabling the edge guard
    // for this floor exercise stops the deep frames being discarded. (Native —
    // needs an EAS build.)
    edgeGuardEnabled: false,

    minRepInterval:  0.5,
    planarityChecks: [],
  },

  // ─── Dips ───────────────────────────────────────────────────────────────────
  //
  // REFERENCE EXERCISE: the push-up family (PUSHUP_REP_METRIC + pushupVariant
  // thresholds). A dip and a push-up are the SAME elbow movement — arms
  // straight (~165°) → elbow bends to lower the body (~90°) → push straight
  // again — just performed upright instead of horizontal. jointAngle is a
  // pure 3-point geometric angle and doesn't care about body orientation, so
  // the metric type, joints, combinator and threshold SCALE all transfer
  // directly from push-up. That makes these "about as close to verified as a
  // placeholder starts" (same basis as legCurl borrowing squat's angle) —
  // but the exact numbers still want a calibration pass: a dip doesn't lock
  // out as hard as a push-up and "full depth" is elbow ≈ 90° (upper arm
  // parallel), so goodROM is set deeper (100°, vs push-up's 75°). Turn on
  // the log, do 5-10 clean dips + a few shallow ones, read [CALIB-SUGGEST].
  //
  // UPRIGHT / VERTICAL — tracks well: the body lowers and rises, the elbow
  // angle opens and closes cleanly in a side view. The user's note about
  // elbows going "behind the body" at the bottom is handled by the
  // reliability-gate trim (leftJoints/rightJoints = shoulder+elbow only, no
  // wrist) — the angle is still computed from all three points, but a hand
  // gripping the bar/bench dropping below Vision's confidence floor no
  // longer discards the whole rep. bestSide picks the better-tracked arm.
  //
  // FORM CUES:
  //  ✓ "Go deeper" — the built-in ROM grade (goodROMThreshold 100 +
  //    insufficientROMCue 'GO DEEPER'); a half-depth dip bottoming at ~120°
  //    fails it. Not a separate FormCheckDef.
  //  ✓ "Lock out at top" — dips_lockout below: max elbow angle over the rep
  //    < 150° means the top was never reached. Same shape as curl's
  //    full_extension check. PLACEHOLDER threshold — calibrate from the log.
  //  ✗ Torso lean (forward = more chest, upright = more triceps) — SKIPPED.
  //    It shifts emphasis, it isn't a fault (same call as the raise family's
  //    "went too high: REMOVED").
  //  ✗ Shoulder shrug at the bottom — SKIPPED. No neck/ear landmark; a
  //    nose-height proxy is contaminated by head tilt (this file's
  //    feasibility rule).
  dips: {
    id:          'dips',
    displayName: 'Dips',
    guideBox:    'standing',

    repMetric: {
      type: 'bestSide',
      left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
      right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
      // Shoulder + elbow only for the reliability gate (NOT wrist) — same
      // trim shoulder-press / tricep use, for the same reason: the wrist is
      // occlusion-prone (hand on the bar) and shouldn't be able to delete a
      // real rep. The angle math still uses all three points.
      leftJoints:  ['leftShoulder',  'leftElbow'],
      rightJoints: ['rightShoulder', 'rightElbow'],
    },

    // PLACEHOLDERS — scale borrowed from pushupVariant (same elbow-flexion
    // movement); calibrate the exact numbers from a [CALIB] log.
    topAngle:            165,    // PLACEHOLDER — arms locked at the top
    repEnterThreshold:   135,    // PLACEHOLDER — elbow bending, descending
    repExitThreshold:    148,    // PLACEHOLDER — pushing back up (enter/exit gap = hysteresis)
    goodROMThreshold:    100,    // PLACEHOLDER — full depth ≈ elbow 90°; a shallow ~120° dip fails
    insufficientROMCue: 'GO DEEPER',

    formChecks: [
      {
        id:   'dips_lockout',
        cue:  'LOCK OUT AT TOP',
        metric: {
          type:  'maximum',
          left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
          right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
        },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'lessThan', value: 150 },  // PLACEHOLDER — max elbow angle over the rep; calibrate from [CALIB] log
        priority:   3,
        enabled:    true,
      },
    ],
    readyGate: PASSTHROUGH_GATE,

    cameraSetup: {
      setupInstruction: 'Stand side-on to the camera on the bars/bench — one shoulder and elbow in frame, whole body visible',
      requiredJoints:    ['leftShoulder',  'leftElbow'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow'],
    },

    minRepInterval:  0.7,
    planarityChecks: [],
  },

  // ─── Russian twist — REMOVED ────────────────────────────────────────────────
  // Parked as untrackable. A twist is rotation about a vertical axis; from a
  // side-on phone that's almost pure depth-axis motion, which a monocular 2D
  // camera cannot see. Device log (8/30/2026, side-on) confirmed it: the
  // near-shoulder-vs-thigh signal sat flat at ~-0.22 ±0.04 through a full set
  // of twists — no oscillation, no zero-crossing, 0 reps. The front view
  // could see it (hands sweep left↔right across frame) but needs a raised
  // camera position that isn't realistic. No metric available here works, so
  // the exercise is out of EXERCISE_CATALOG / SETUP_INFO / the picker rather
  // than shipping something that silently never counts.
};

// ─── Tracking-tier helpers ───────────────────────────────────────────────────
// See ExerciseDefinitionDef.mode. Anything not in EXERCISE_DEFINITIONS, or
// without an explicit mode, is treated as 'formCheck'.
export function exerciseMode(id: string): 'formCheck' | 'repCounter' {
  return (EXERCISE_DEFINITIONS as Record<string, ExerciseDefinitionDef | undefined>)[id]?.mode ?? 'formCheck';
}

export function isRepCounterExercise(id: string): boolean {
  return exerciseMode(id) === 'repCounter';
}

// ─── Initial rep-counter set ─────────────────────────────────────────────────
// Movements the camera can COUNT but not reliably JUDGE from the one workable
// camera angle: cable/machine work where the apparatus occludes the joints, a
// back-to-camera pulldown, side-on isolation work with a near-collapsed 2D
// signal, and the twist (still uncalibrated). Adjust freely — flipping an id
// here is the whole switch. Applied post-declaration so it stays a one-liner
// list instead of a `mode:` line buried in each block.
(['facePull', 'latPulldown', 'seatedCableRow', 'machineRow', 'cablePullThrough',
  'standingGluteKickback', 'calfRaise', 'legCurl'] as const)
  .forEach((id) => {
    const def = (EXERCISE_DEFINITIONS as Record<string, ExerciseDefinitionDef | undefined>)[id];
    if (def) def.mode = 'repCounter';
  });

// ─── SETUP facing — drives the "Turn to face the camera" / "Turn side-on"
// coaching cue and the standing-body size/edge heuristics (see
// ExerciseEngine.positionGuidance). Set post-declaration as a one-liner list,
// same as `mode` above. Anything NOT listed (push-up + sit-up families) stays
// facing-agnostic — floor exercises where those heuristics must not run.
// NATIVE — the cue itself needs an EAS build; harmless extra JSON until then.
{
  const setFacing = (ids: readonly string[], facing: 'camera' | 'side') =>
    ids.forEach((id) => {
      const cs = (EXERCISE_DEFINITIONS as Record<string, ExerciseDefinitionDef | undefined>)[id]?.cameraSetup;
      if (cs) cs.facing = facing;
    });

  setFacing([
    // Curl family
    'curl', 'hammerCurl', 'concentrationCurl', 'preacherCurl', 'reverseCurl', 'cableCurl',
    // Overhead-press family
    'shoulderPress', 'overheadPress', 'arnoldPress', 'dumbbellShoulderPress', 'machineShoulderPress',
    // Front-on pulls / raises / misc
    'latPulldown', 'facePull', 'lateralRaise', 'jumpingJack', 'pullup',
  ], 'camera');

  setFacing([
    // Squat / lunge families
    'squat', 'gobletSquat', 'airSquat', 'frontSquat', 'backSquat', 'sumoSquat',
    'lunge', 'splitSquat', 'reverseLunge', 'stepUp', 'bulgarianSplitSquat',
    // Chest press (side/lying view)
    'chestPress', 'barbellBenchPress',
    // Tricep family
    'tricepPushdown', 'overheadTricepExtension', 'skullcrusher',
    // Row families
    'bentOverRow', 'barbellRow', 'singleArmRow', 'invertedRow', 'tBarRow',
    'seatedCableRow', 'machineRow',
    // Hip-hinge family
    'romanianDeadlift', 'deadlift', 'goodMorning', 'kettlebellSwing', 'singleLegRDL', 'cablePullThrough',
    // Side-on isolation
    'frontRaise', 'standingGluteKickback', 'calfRaise', 'legCurl', 'dips',
  ], 'side');
}
