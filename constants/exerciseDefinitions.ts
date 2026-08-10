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
 */

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
  // consecutiveMissingFrames doc comment). Default 3 (~0.3s, omit for every
  // normal exercise) — a log-confirmed exception exists for tricep: done
  // close to the camera with the forearm crossing the torso every rep,
  // Vision's whole-body detector can lose the person for longer than that
  // from self-occlusion alone, killing every rep before it could complete.
  missingPersonGraceFrames?: number;
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

const CURL_CAMERA_REQUIRED_JOINTS = [
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
];

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
      requiredJoints: CURL_CAMERA_REQUIRED_JOINTS,
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

const SQUAT_CAMERA_JOINTS = [
  'leftShoulder', 'rightShoulder',
  'leftHip',      'rightHip',
  'leftKnee',     'rightKnee',
  'leftAnkle',    'rightAnkle',
];

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
    cameraSetup:     { setupInstruction, requiredJoints: SQUAT_CAMERA_JOINTS },
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
      requiredJoints: ['leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow'],
    },
    calibration:     { repsNeeded: 2, enterFraction: 0.50, exitFraction: 0.25 },
    minRepInterval:  0.5,
    planarityChecks: SHOULDER_PRESS_PLANARITY,
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

const LUNGE_CAMERA_JOINTS = [
  'leftShoulder', 'rightShoulder',
  'leftHip',      'rightHip',
  'leftKnee',     'rightKnee',
  'leftAnkle',    'rightAnkle',
];

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
    cameraSetup:     { setupInstruction, requiredJoints: LUNGE_CAMERA_JOINTS },
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
const TRICEP_ELBOW_DRIFT_L: FormCheckDef = {
  id: 'elbow_drift_l', cue: 'KEEP ELBOWS IN',
  metric: { type: 'lineVsVertical', from: 'leftShoulder', to: 'leftElbow' },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 45 },
  priority: 4, enabled: true,
};
const TRICEP_ELBOW_DRIFT_R: FormCheckDef = {
  id: 'elbow_drift_r', cue: 'KEEP ELBOWS IN',
  metric: { type: 'lineVsVertical', from: 'rightShoulder', to: 'rightElbow' },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 45 },
  priority: 4, enabled: true,
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
    goodROMThreshold:   10,
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

// FORM CHECK — torso tipping too far / hips shooting up ahead of the chest
// ("stripper deadlift" — hips rise and the torso pitches forward faster than
// a controlled hinge, instead of hips and torso rising together). THIS IS a
// torso-ANGLE check (shoulder→hip line vs vertical) — the exact same
// primitive and style as squat's back_lean/chest-up check — NOT a spine/
// rounding check. Both points (shoulder, hip) are fully trackable; this is
// not a landmark-availability question the way rounding is.
//
// Metric: lineVsVertical(hip, shoulder) — the complement of HINGE_REP_METRIC
// (lineVsHorizontal on the SAME two points). Standing ≈ 0° from vertical.
// This check is NOT re-testing depth (that's what goodROMThreshold already
// does on the same underlying signal) — it's catching torso lean that goes
// MEANINGFULLY BEYOND what a controlled deep hinge produces, which is what
// "hips shoot up, chest stays down" actually looks like on this metric: more
// forward pitch than the depth alone explains.
//
// CONFIRMED WORKING on-device: a deliberately-bad full-back-roll rep read
// torso_angle=87.4 and correctly failed; good reps read 54.5 and correctly
// passed. TIGHTENED 80→72 from that same log: a rep with only SLIGHT rounding
// read 67.8 and passed at the 80 limit — 72 moves the fault line closer to
// that moderately-bad rep while keeping clear margin above the confirmed
// good-rep reading (54-55), so normal deep hinges still won't trip it.
//
// HONEST LIMIT, confirmed by that same slight-rounding rep: this check
// catches gross posture faults (hips shooting up, torso pitching forward
// beyond a controlled hinge) — it does NOT and CANNOT catch subtle spine
// rounding. A back that rounds slightly while the hip/shoulder LINE stays
// within a normal hinge angle will read as fine on this metric, because it's
// measuring torso POSITION, not spine CURVATURE. That gap is fundamental (no
// mid-spine landmark exists) — tightening this further to try to catch
// rep 3's slight rounding would mean firing on genuinely good deep hinges
// instead, not closing the gap. This check's job is hip/torso position; spine
// rounding stays explicitly not-built, per the comment above.
const HINGE_TORSO_ANGLE_CHECK: FormCheckDef = {
  id: 'torso_angle', cue: 'HIPS DOWN, CHEST UP',
  metric: {
    type:  'average',
    left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
    right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
  },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 72 }, // tightened 80→72 from real device log
  priority: 1, enabled: true,
};

// FORM CHECK — leaning forward without actually hinging (torso pitches
// forward but the hips never travel back). CORE ROOT CAUSE: HINGE_REP_METRIC
// (lineVsHorizontal(hip, shoulder)) is a torso ANGLE measured only from the
// hip and shoulder's own two positions — it cannot tell a genuine hip hinge
// (hips translate backward, flat back, minimal knee bend) apart from a
// generic forward lean/waist-bend that produces the IDENTICAL shoulder/hip
// angle change without the hips ever moving. Depth alone (goodROMThreshold)
// can't fix this — a lean can reach the same torso angle as a real hinge.
// The one thing a lean and a real hinge genuinely differ on: a real hinge's
// hips travel backward relative to the (planted, stationary) ankle; a lean's
// don't. In this side-on camera view, that backward travel shows up as
// horizontal (screen-x) displacement between hip and ankle — exactly what
// the new normalizedHorizontalGap primitive measures (see Metric.swift).
//
// TWO checks on the same measurement, not one — split after real-world use
// showed they need different failure behavior:
//
//  HINGE_HIP_DRIFT_CHECK (gate, unchanged from before): near-zero hip travel
//  — a pure lean, hips never move at all — still REJECTS the rep entirely
//  (gatesCounting: true). CONFIRMED working on-device: pure leans no longer
//  count. Left exactly as-is — do not touch this threshold or behavior.
//
//  HINGE_HIP_DRIFT_FLAG_CHECK (new): a MODERATE back-roll — some real hip
//  travel, enough to clear the gate above, but not enough to trust as a
//  clean hinge — was still passing as a full "GOOD" rep (log-confirmed: ROM
//  alone was satisfying it, twice in one set). Explicit decision, made
//  without on-device calibration data (none was available and the ask was
//  to decide, not wait): this counts the rep instead of rejecting it,
//  cueing "STRAIGHTEN YOUR BACK" instead of GOOD. Chosen over tightening the
//  GATE further because a wrong gate threshold fails silently — a real deep
//  hinge would just stop registering as a rep at all, with zero explanation,
//  which is a worse failure than an occasional over-strict cue on a rep that
//  was actually fine. A flag is recoverable either way; a bad gate isn't.
//
// PLACEHOLDER WARNING per CLAUDE.md, for the FLAG check's threshold only —
// the GATE's 0.02 stays as originally reasoned (dimensional check: hip/ankle
// x-positions are in Vision's 0-1 normalized space, divided by
// torsoReference which typically runs ~0.15-0.35 for a properly-framed
// person, so 0.02 requires the hip to be within ~2% of torso length of
// directly above the ankle to reject — essentially "no real movement at
// all"). The FLAG threshold (0.08) is a REASONED middle value with zero
// device calibration behind it: meaningfully above the gate's near-zero
// floor, but still well below where a genuine deep hinge should read by the
// same dimensional logic. If it turns out too strict (flagging real deep
// hinges) or too loose (still missing moderate rolls), send a log — hip_drift
// is logged on every rep now (via the normal per-rep form-check log line, no
// longer just [GATE]) and it can be tuned from real numbers at any time.
const HINGE_HIP_DRIFT_CHECK: FormCheckDef = {
  id: 'hip_drift', cue: 'PUSH YOUR HIPS BACK',
  metric: {
    type:  'average',
    left:  { type: 'normalizedHorizontalGap', a: 'leftHip',  b: 'leftAnkle'  },
    right: { type: 'normalizedHorizontalGap', a: 'rightHip', b: 'rightAnkle' },
  },
  evaluateAt: 'atBottom', condition: { type: 'lessThan', value: 0.02 }, // confirmed working — do not change
  priority: 2, enabled: true, gatesCounting: true,
};
const HINGE_HIP_DRIFT_FLAG_CHECK: FormCheckDef = {
  id: 'hip_drift_flag', cue: 'STRAIGHTEN YOUR BACK',
  metric: {
    type:  'average',
    left:  { type: 'normalizedHorizontalGap', a: 'leftHip',  b: 'leftAnkle'  },
    right: { type: 'normalizedHorizontalGap', a: 'rightHip', b: 'rightAnkle' },
  },
  evaluateAt: 'atBottom', condition: { type: 'lessThan', value: 0.08 }, // PLACEHOLDER — see comment above
  priority: 3, enabled: true,
};

// Side-on so torso travel and hip movement are both visible. Ankle added
// (wasn't previously required) — HINGE_HIP_DRIFT_CHECK needs it visible;
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
    // hip_drift added — see HINGE_HIP_DRIFT_CHECK comment — catches a
    // forward lean with no real hip hinge (gate, confirmed working).
    // hip_drift_flag added — see HINGE_HIP_DRIFT_FLAG_CHECK comment —
    // catches a moderate back-roll that clears the gate but isn't a clean
    // hinge (flag, cues STRAIGHTEN YOUR BACK, placeholder threshold).
    formChecks:         [HINGE_TORSO_ANGLE_CHECK, HINGE_HIP_DRIFT_CHECK, HINGE_HIP_DRIFT_FLAG_CHECK],
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
const RAISE_CAMERA_JOINTS_FRONT = [
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
  'leftWrist', 'rightWrist', 'leftHip', 'rightHip',
];

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
      requiredJoints: RAISE_CAMERA_JOINTS_FRONT,
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
// INVESTIGATE-FIRST, per CLAUDE.md — what was reused and why:
//
// REFERENCE EXERCISES: CURL (constants above, ~line 167) for the metric TYPE
// and direction convention, SQUAT for the bilateral-combinator choice.
//   - Metric primitive reused from curl: jointAngle(shoulder, elbow, wrist).
//     Curl already proves this primitive is clean and reliable — no
//     contamination the way the hinge family's original knee-angle attempt
//     had (hip translation polluting a joint meant to isolate the knee).
//     Lat pulldown has no equivalent contamination risk: the elbow angle
//     here isn't shared with any other joint's motion.
//   - Direction: CONFIRMED by reasoning through the movement, matching curl's
//     own confirmed direction. jointAngle is a LOCAL angle at the elbow
//     pivot — it does not care which way the whole arm is oriented in space,
//     only how bent the elbow itself is. At the start of a lat pulldown
//     (arms extended overhead gripping the bar), the elbow is nearly
//     straight — same LOCAL joint state as curl's "arm hanging, extended"
//     start (~160-165°), even though the arm points a different direction in
//     space. Pulling the bar down bends the elbow — the angle DECREASES,
//     same direction as curl's curl-up phase. This matches the engine's
//     hardwired decreasing-metric state machine with NO workaround needed —
//     unlike tricep, which needed lineVsVertical specifically because
//     jointAngle increases (wrong direction) during tricep extension. Lat
//     pulldown does not have that problem.
//   - Bilateral combinator: average(left, right), not curl's minimum(left,
//     right) — curl uses minimum because curls are commonly done single-arm
//     or alternating; a lat pulldown pull is essentially always
//     synchronized, bilateral, like squat/lunge's own average(L,R) pattern.
//     Reused squat's combinator choice for that reason, curl's primitive/
//     direction for the metric itself.
//
// CAMERA: front-facing, both arms visible, symmetric — same framing as curl
// (CURL_CAMERA_REQUIRED_JOINTS), explicitly to avoid the far-side occlusion
// that required bestSide/planarity workarounds for the row family (a
// side-on pull). Required joints: shoulders, elbows, wrists only — the exact
// same set curl requires, nothing extra (hip is used opportunistically by
// the torso-lean check below, same graceful-degradation pattern curl's own
// lean_back check already uses — not a hard requirement).
//
// FORM CHECKS — feasibility assessed BEFORE building, per CLAUDE.md:
//   1. INCOMPLETE ROM ("PULL DOWN FURTHER") — NOT a separate FormCheck. This
//      is the core goodROMThreshold/insufficientROMCue mechanism every
//      exercise already has built in — no new check needed, just the right
//      threshold (placeholder, see below).
//   2. MOMENTUM/SWINGING via jerk — ALREADY covered, exercise-agnostic, no
//      new code needed. UniversalQualityEngine's jerk/swing-spike detection
//      applies automatically to every exercise via checkSwingOverride — and
//      as of two builds ago that hook is genuinely working (the repEndTime
//      wall-clock fix). Nothing exercise-specific to add here.
//   3. TORSO LEAN (covers BOTH "leaning back to yank the bar" and "excessive
//      lean-back turning it into a row" — the same underlying signal: a
//      throughoutMax check catches a torso that leaned back at ANY point
//      during the rep, whether from a swinging cheat or a static excessive
//      lean, so these don't need two separate checks). FEASIBLE — reused
//      verbatim from curl's OWN lean_back check (average(lineVsVertical(hip,
//      shoulder)), throughoutMax, >20° → fail) — a primitive already proven
//      reliable in production on curl and shoulder press for this exact
//      concern. Not re-guessed: the 20° threshold is curl's own verified
//      number, reused because the underlying concern (torso should stay
//      upright, don't lean back to cheat) and camera framing (front-facing)
//      are the same shape of problem.
//
// PLACEHOLDER WARNING per CLAUDE.md: topAngle/repEnterThreshold/
// repExitThreshold/goodROMThreshold below are ALL placeholders — zero
// on-device data exists for lat pulldown. Set from curl's own proven RANGE
// as a starting reference (not copied blindly — reasoned: both are "elbow
// extended → elbow bent" motions of broadly comparable scale), but
// deliberately not tightened the way curl's own numbers eventually were.
// [METRIC] logging already exists (value=/enter=/exit=/rom=, ~3/sec) — do a
// few reps and send the log; real numbers get set from that, not guessed
// further here.
const LAT_PULLDOWN_REP_METRIC: MetricDef = {
  type:  'average',
  left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
  right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
};

const LAT_PULLDOWN_TORSO_CHECK: FormCheckDef = {
  id: 'torso_lean', cue: 'STAY UPRIGHT, NO SWINGING',
  metric: {
    type:  'average',
    left:  { type: 'lineVsVertical', from: 'leftHip',  to: 'leftShoulder'  },
    right: { type: 'lineVsVertical', from: 'rightHip', to: 'rightShoulder' },
  },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 20 }, // reused from curl's own verified lean_back check
  priority: 2, enabled: true,
};

const LAT_PULLDOWN_CAMERA_JOINTS = [
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
];

// Helper — mirrors curlVariant()'s shape exactly, per the investigate-first
// process above. Clone target for wide-grip and close-grip pulldown: elbow
// angle doesn't fundamentally change with grip width, so both variants share
// this template with only id/displayName/setupInstruction differing, same
// pattern as every other family in this file.
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
    topAngle:           160,
    repEnterThreshold:  145,
    repExitThreshold:   150,
    goodROMThreshold:   90,
    insufficientROMCue: 'PULL DOWN FURTHER',
    formChecks:      [LAT_PULLDOWN_TORSO_CHECK],
    readyGate:       PASSTHROUGH_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints: LAT_PULLDOWN_CAMERA_JOINTS,
    },
    minRepInterval:  0.6,
    planarityChecks: [],
    // No suppressApproachDetection — seated, front-facing, torso-scale has
    // no known contamination source the way hinge/tricep's does. Revisit
    // only if a log shows otherwise.
  };
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// Missing key → setExerciseDefinition(null) → Swift registry fallback used.

export const EXERCISE_DEFINITIONS: Record<string, ExerciseDefinitionDef> = {

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
      requiredJoints: [
        'leftShoulder', 'rightShoulder',
        'leftHip',      'rightHip',
        'leftKnee',     'rightKnee',
        'leftAnkle',    'rightAnkle',
      ],
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
  // repMetric: bestSide(jointAngle(shoulder→elbow→wrist)) — elbow flexion angle.
  // Industry-standard method: angle DECREASES as user lowers (arms extended ~160°,
  // elbows bent at bottom ~70-100°). Large clean swing (~70°) reliably separates
  // up from down with no ambiguity. Orientation-agnostic: 2D joint angle is
  // invariant to body orientation when the arm is in the camera's plane of view,
  // which is guaranteed by side camera placement.
  // Camera: phone on its side on the floor, a few feet to your side.
  // No calibration — joint angle thresholds are stable across users and distances.
  pushup: {
    id:          'pushup',
    displayName: 'Push-up',

    repMetric: {
      type: 'bestSide',
      left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
      right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
      leftJoints:  ['leftShoulder',  'leftElbow',  'leftWrist'],
      rightJoints: ['rightShoulder', 'rightElbow', 'rightWrist'],
    },

    // Top (arms extended): ~160°.
    // repEnterThreshold is LENIENT (140°) so even a shallow push-up attempt (~20° bend
    // from top) registers as a counted rep. This is the rep-COUNTING threshold.
    // repExitThreshold (150°) is 10° above enter — hysteresis prevents double-count.
    // goodROMThreshold is the SEPARATE depth-quality check: if repMinAngle didn't reach
    // ≤100° the rep counts but is marked BAD with cue "GO DEEPER". Reps that reach ≤100°
    // pass the depth check and can be marked GOOD. These are two independent thresholds.
    topAngle:           160,
    repEnterThreshold:  140,
    repExitThreshold:   150,
    goodROMThreshold:    75,   // tightened 90→75: proper push-up ≤75°; half push-up (~85-90°) fails
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

    cameraSetup: {
      setupInstruction: 'Lay your phone on its side on the floor, a few feet to your side',
      // repMetric now uses shoulder+elbow+wrist (jointAngle). Hip removed.
      requiredJoints:    ['leftShoulder',  'leftElbow',  'leftWrist'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow', 'rightWrist'],
    },

    // No calibration — joint angle thresholds stable across users and distances.

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
      requiredJoints: [
        'leftShoulder', 'rightShoulder',
        'leftHip',      'rightHip',
        'leftKnee',     'rightKnee',
        'leftAnkle',    'rightAnkle',
      ],
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
      requiredJoints: [
        'leftShoulder', 'leftElbow',
        'rightShoulder', 'rightElbow',
      ],
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

  // ─── Lat pulldown family (vertical pull) ───────────────────────────────────
  // See latPulldownVariant() and its comments above for the full
  // investigate-first reasoning (metric/direction/camera/form-check
  // feasibility) and the explicit placeholder-threshold warning.
  latPulldownWide: latPulldownVariant(
    'latPulldownWide',
    'Lat Pulldown (Wide Grip)',
    'Face the camera — sit back so both arms are fully in frame, from bar to shoulders',
  ),

  closeGripPulldown: latPulldownVariant(
    'closeGripPulldown',
    'Close-Grip Pulldown',
    'Face the camera — sit back so both arms are fully in frame, from bar to shoulders',
    // Same template as latPulldownWide — grip width changes hand position,
    // not the elbow-angle metric being measured. See latPulldownVariant()'s
    // comment for why this clone is safe (unlike pull-up/chin-up, which is
    // deliberately NOT cloned here).
  ),
};
