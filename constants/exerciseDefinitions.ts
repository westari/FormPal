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
}

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
  // Priority 4: shoulder→elbow drifted forward from vertical (>30°).
  {
    id:         'elbow_drift',
    cue:        'KEEP ELBOW STILL',
    metric: {
      type:  'average',
      left:  { type: 'lineVsVertical', from: 'leftShoulder',  to: 'leftElbow' },
      right: { type: 'lineVsVertical', from: 'rightShoulder', to: 'rightElbow' },
    },
    evaluateAt: 'throughoutMax',
    condition:  { type: 'greaterThan', value: 30 },
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

const CURL_READY_GATE: ReadyGateDef = {
  readyAngleMin:  140,
  readyAngleMax:  190,
  requiredJoints: ['leftShoulder', 'leftElbow', 'leftWrist',
                    'rightShoulder', 'rightElbow', 'rightWrist'],
  minConfidence:  0.30,
  stableDuration: 0.3,
};

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
    repExitThreshold:   145,
    goodROMThreshold:    60,
    insufficientROMCue: 'CURL HIGHER',

    formChecks: CURL_FORM_CHECKS,
    readyGate:  CURL_READY_GATE,

    cameraSetup: {
      setupInstruction,
      requiredJoints: CURL_CAMERA_REQUIRED_JOINTS,
    },

    calibration:    CURL_CALIBRATION,
    minRepInterval: 0.5,
    planarityChecks: [],
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
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 30 },
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

const SQUAT_READY_GATE: ReadyGateDef = {
  readyAngleMin:  155,
  readyAngleMax:  190,
  requiredJoints: ['leftHip', 'leftKnee', 'leftAnkle',
                   'rightHip', 'rightKnee', 'rightAnkle'],
  minConfidence:  0.30,
  stableDuration: 1.0,
};

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
    goodROMThreshold:   100,
    insufficientROMCue: 'GO DEEPER',
    formChecks:      SQUAT_FORM_CHECKS,
    readyGate:       SQUAT_READY_GATE,
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
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 0.05 },
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
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 0.05 },
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
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 0.05 },
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
    evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 0.05 },
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

const PUSHUP_READY_GATE: ReadyGateDef = {
  readyAngleMin:  130,
  readyAngleMax:  185,
  requiredJoints: ['leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow'],
  minConfidence:  0.15,
  stableDuration: 0.5,
};

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
    goodROMThreshold:    90,
    insufficientROMCue: 'GO DEEPER',
    formChecks:      PUSHUP_HIP_CHECKS,
    readyGate:       PUSHUP_READY_GATE,
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
    goodROMThreshold:    90,
    insufficientROMCue: 'GO DEEPER',
    formChecks:      PUSHUP_HIP_CHECKS_KNEE,
    readyGate:       PUSHUP_READY_GATE,
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
  {
    id: 'wrist_track_l', cue: 'ARMS STRAIGHT UP',
    metric: {
      type:     'bodyRelativeDeviation',
      point:    'leftWrist',
      axisFrom: 'leftShoulder',
      axisTo:   'leftHip',
    },
    evaluateAt: 'atBottom', condition: { type: 'greaterThan', value: 0.25 },
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
    evaluateAt: 'atBottom', condition: { type: 'greaterThan', value: 0.25 },
    priority: 3, enabled: true,
  },
];

const SHOULDER_PRESS_READY_GATE: ReadyGateDef = {
  readyAngleMin:  65,
  readyAngleMax:  90,
  requiredJoints: ['leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow'],
  minConfidence:  0.30,
  stableDuration: 0.8,
};

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
    goodROMThreshold:   35,
    insufficientROMCue: 'PRESS HIGHER',
    formChecks:      SHOULDER_PRESS_FORM_CHECKS,
    readyGate:       SHOULDER_PRESS_READY_GATE,
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

const LUNGE_READY_GATE: ReadyGateDef = {
  readyAngleMin:  155,
  readyAngleMax:  190,
  requiredJoints: ['leftHip', 'leftKnee', 'leftAnkle',
                   'rightHip', 'rightKnee', 'rightAnkle'],
  minConfidence:  0.30,
  stableDuration: 1.0,
};

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
    goodROMThreshold:   105,
    insufficientROMCue: 'LUNGE DEEPER',
    formChecks:      LUNGE_FORM_CHECKS,
    readyGate:       LUNGE_READY_GATE,
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
const TRICEP_ELBOW_DRIFT_L: FormCheckDef = {
  id: 'elbow_drift_l', cue: 'KEEP ELBOWS IN',
  metric: { type: 'lineVsVertical', from: 'leftShoulder', to: 'leftElbow' },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 30 },
  priority: 4, enabled: true,
};
const TRICEP_ELBOW_DRIFT_R: FormCheckDef = {
  id: 'elbow_drift_r', cue: 'KEEP ELBOWS IN',
  metric: { type: 'lineVsVertical', from: 'rightShoulder', to: 'rightElbow' },
  evaluateAt: 'throughoutMax', condition: { type: 'greaterThan', value: 30 },
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

// Ready gate: accept any starting position where elbows are visible.
// lineVsVertical(wrist→elbow) ranges widely across variants:
//   pushdown at rest: wrist above elbow (cable from overhead) → metric ~20-60°
//   overhead extension at rest: forearm behind head, wrist below elbow → metric ~0-40°
//   skullcrusher at rest: forearm angled off chest → metric ~30-80°
// Setting readyAngleMin:0 covers all three without forcing a specific start angle.
// requiredJoints uses only elbows (not wrists) because these are side-view exercises:
//   the far-side wrist is occluded by the body and will have near-zero confidence,
//   causing the gate to never pass even when the near-side arm is clearly visible.
const TRICEP_READY_GATE: ReadyGateDef = {
  readyAngleMin:  0,
  readyAngleMax:  92,
  requiredJoints: ['leftElbow', 'rightElbow'],
  minConfidence:  0.10,
  stableDuration: 0.5,
};

const TRICEP_PLANARITY: PlanarityCheckDef[] = [
  { id: 'forearm_l', jointA: 'leftWrist',  jointB: 'leftElbow',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.70, enabled: false },
  { id: 'forearm_r', jointA: 'rightWrist', jointB: 'rightElbow',
    minRatio: 0.75, cue: 'TURN SIDE-ON', fallbackReferenceRatio: 0.70, enabled: false },
];

// Standing tricep variants (pushdown, overhead extension).
//
// Threshold design:
//   topAngle: 85°       — rest with forearm ~horizontal
//   repEnterThreshold: 72° — rep starts here (user has pushed ~13° below rest)
//   repExitThreshold: 82°  — rep ends when user returns within 3° of rest
//   goodROMThreshold: 25°  — extension must reach ≤25° from vertical for GOOD
//
// Hysteresis = exit(82) - enter(72) = 10°.
// Previously 5° (exit=77); that allowed cable rebound from 77° back to ~60°
// to register as a second phantom rep. 10° hysteresis requires the rebound to
// drop the metric 17° from the exit point (82° → 65°) before re-triggering —
// a much larger overshoot that is physically implausible in normal use.
// minRepInterval=1.0 provides a debounce backup for slow rebounds.
function tricepVariant(
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
    formChecks:      TRICEP_FORM_CHECKS_STANDING,
    readyGate:       TRICEP_READY_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    ['leftShoulder',  'leftElbow',  'leftWrist'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow', 'rightWrist'],
    },
    minRepInterval:  1.0,
    planarityChecks: TRICEP_PLANARITY,
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
    readyGate:       TRICEP_READY_GATE,
    cameraSetup: {
      setupInstruction,
      requiredJoints:    ['leftShoulder',  'leftElbow',  'leftWrist'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow', 'rightWrist'],
    },
    minRepInterval:  1.0,
    planarityChecks: TRICEP_PLANARITY,
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
    goodROMThreshold:   100,
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

    readyGate: {
      readyAngleMin:  155,
      readyAngleMax:  190,
      requiredJoints: ['leftHip', 'leftKnee', 'leftAnkle',
                        'rightHip', 'rightKnee', 'rightAnkle'],
      minConfidence:  0.30,
      stableDuration: 1.0,
    },

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
    goodROMThreshold:    90,   // was 100 — tightened so elbows must reach near right-angle
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
        condition:  { type: 'greaterThan', value: 0.05 },
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
        condition:  { type: 'greaterThan', value: 0.05 },
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

    readyGate: {
      // readyAngleMin set 10° below repEnterThreshold (140°) so the gate condition doesn't
      // start accumulating exit-frames the instant the first rep starts. Gate stays passing
      // until angle < 130° — well into the rep, giving the 20-frame exit buffer plenty of
      // headroom before the rep completes. After the first rep, isReady is permanent.
      readyAngleMin:  130,
      readyAngleMax:  185,
      requiredJoints: ['leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow'],
      minConfidence:  0.15,
      stableDuration: 0.5,
    },

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
    goodROMThreshold:   105,
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

    readyGate: {
      readyAngleMin:  155,
      readyAngleMax:  190,
      requiredJoints: ['leftHip', 'leftKnee', 'leftAnkle',
                        'rightHip', 'rightKnee', 'rightAnkle'],
      minConfidence:  0.30,
      stableDuration: 1.0,
    },

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
    goodROMThreshold:   35,
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
        condition:  { type: 'greaterThan', value: 0.25 },
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
        condition:  { type: 'greaterThan', value: 0.25 },
        priority:   3,
        enabled:    true,
      },
    ],

    readyGate: {
      readyAngleMin:  65,
      readyAngleMax:  90,
      // Hips removed: repMetric only uses shoulders+elbows. Hips can be at the
      // frame edge when the phone is at chest height, causing the gate to never
      // trigger (ROOT CAUSE A was the validity gate; this fixes the ready gate).
      requiredJoints: ['leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow'],
      minConfidence:  0.30,
      stableDuration: 0.8,
    },

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
};
