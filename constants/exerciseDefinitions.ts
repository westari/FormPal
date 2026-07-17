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

// ─── Registry ─────────────────────────────────────────────────────────────────
// Missing key → setExerciseDefinition(null) → Swift registry fallback used.

export const EXERCISE_DEFINITIONS: Record<string, ExerciseDefinitionDef> = {

  // ─── Bicep Curl ─────────────────────────────────────────────────────────────
  //
  // Values carried verbatim from ExerciseRegistry.swift (post planarity-removal).
  // Swift source:
  //   topAngle: 160, repEnterThreshold: 145, repExitThreshold: 145
  //   goodROMThreshold: 60, insufficientROMCue: "CURL HIGHER"
  //   formChecks: full_extension (lessThan 120, p=1), elbow_drift (greaterThan 30, p=4),
  //               lean_back (greaterThan 20, p=5)
  //   readyGate: min=140, max=190, minConfidence=0.30, stableDuration=0.3
  //   cameraSetup: "Face the camera — stand back so both arms are fully in frame"
  //   calibration: repsNeeded=2, enterFraction=0.50, exitFraction=0.25
  //   minRepInterval: 0.5
  //   planarityChecks: []  ← forearm_l/r removed (false positives when arms at sides)
  curl: {
    id:          'curl',
    displayName: 'Bicep Curl',

    // repMetric: minimum elbow angle of both arms (shoulder→elbow→wrist).
    // HIGH (~155-165°) at rest, LOW (~35-45°) at peak contraction.
    repMetric: {
      type:  'minimum',
      left:  { type: 'jointAngle', a: 'leftShoulder',  pivot: 'leftElbow',  c: 'leftWrist'  },
      right: { type: 'jointAngle', a: 'rightShoulder', pivot: 'rightElbow', c: 'rightWrist' },
    },

    topAngle:           160,   // metric at rest / top of movement
    repEnterThreshold:  145,   // metric must drop below here to enter rep
    repExitThreshold:   145,   // metric must rise above here to complete rep
    goodROMThreshold:    60,   // metric must reach below here for good ROM
    insufficientROMCue: 'CURL HIGHER',

    formChecks: [
      // Priority 1: didn't fully extend arm at the bottom.
      // Threshold 120° (not 140°): calibrated exit often lands ~135-142°,
      // which would false-fire a 140° check on every rep.
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
      // Overrides "CURL HIGHER" ROM cue — drift makes angle look smaller than reality.
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
      // Overrides "CURL HIGHER" and elbow_drift.
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
    ],

    readyGate: {
      readyAngleMin:  140,
      readyAngleMax:  190,
      requiredJoints: ['leftShoulder', 'leftElbow', 'leftWrist',
                        'rightShoulder', 'rightElbow', 'rightWrist'],
      minConfidence:  0.30,
      stableDuration: 0.3,
    },

    cameraSetup: {
      setupInstruction: 'Face the camera — stand back so both arms are fully in frame',
      requiredJoints:   ['leftShoulder', 'rightShoulder', 'leftElbow',
                          'rightElbow', 'leftWrist', 'rightWrist'],
    },

    calibration: {
      repsNeeded:    2,
      enterFraction: 0.50,
      exitFraction:  0.25,
    },

    minRepInterval: 0.5,

    // Forearm planarity checks (forearm_l / forearm_r) removed.
    // They caused false positives when elbows were at the user's sides.
    // UniversalQualityEngine anchor-stability catches genuine elbow drift instead.
    planarityChecks: [],
  },
};
