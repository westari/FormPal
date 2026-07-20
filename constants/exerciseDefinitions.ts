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
  // VALUES VERBATIM from ExerciseRegistry.swift.
  // repMetric: bodyRelativeGap(shoulder, elbow, shoulder→hip axis). Orientation-agnostic.
  // Camera: phone on its side on the floor, a few feet to your side.
  // No calibration — body-relative thresholds are stable across users and distances.
  pushup: {
    id:          'pushup',
    displayName: 'Push-up',

    repMetric: {
      type: 'bestSide',
      left: {
        type: 'bodyRelativeGap',
        a: 'leftShoulder', b: 'leftElbow',
        axisFrom: 'leftShoulder', axisTo: 'leftHip',
      },
      right: {
        type: 'bodyRelativeGap',
        a: 'rightShoulder', b: 'rightElbow',
        axisFrom: 'rightShoulder', axisTo: 'rightHip',
      },
      leftJoints:  ['leftShoulder',  'leftElbow',  'leftHip'],
      rightJoints: ['rightShoulder', 'rightElbow', 'rightHip'],
    },

    topAngle:           0.40,
    repEnterThreshold:  0.17,
    repExitThreshold:   0.30,
    goodROMThreshold:   -0.15,
    insufficientROMCue: 'GO LOWER',

    formChecks: [
      {
        id:         'hip_align_l',
        cue:        'HIPS UP',
        metric: {
          type: 'bodyRelativeDeviation',
          point: 'leftHip',
          axisFrom: 'leftShoulder', axisTo: 'leftAnkle',
        },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'greaterThan', value: 0.07 },
        priority:   2,
        enabled:    true,
      },
      {
        id:         'hip_align_r',
        cue:        'HIPS UP',
        metric: {
          type: 'bodyRelativeDeviation',
          point: 'rightHip',
          axisFrom: 'rightShoulder', axisTo: 'rightAnkle',
        },
        evaluateAt: 'throughoutMax',
        condition:  { type: 'greaterThan', value: 0.07 },
        priority:   2,
        enabled:    true,
      },
    ],

    readyGate: {
      readyAngleMin:  0.13,
      readyAngleMax:  1.50,
      requiredJoints: ['leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow'],
      minConfidence:  0.15,
      stableDuration: 0.5,
    },

    cameraSetup: {
      setupInstruction: 'Lay your phone on its side on the floor, a few feet to your side',
      // Ankles removed: repMetric (bestSide bodyRelativeGap) only needs shoulder+elbow+hip.
      // Requiring ankles forced full-body framing and blocked setup in landscape.
      // hip_align form checks still use ankles but return nil gracefully when off-screen.
      requiredJoints:    ['leftShoulder',  'leftElbow',  'leftHip'],
      requiredJointsAlt: ['rightShoulder', 'rightElbow', 'rightHip'],
    },

    // No calibration — body-relative thresholds stable across users and distances.

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
};
