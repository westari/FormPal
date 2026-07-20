/**
 * constants/exerciseStandards.ts
 *
 * Per-exercise form standards passed from JS to the native engine at setExercise
 * time via setExerciseStandard(). Moving standards here means editing a value
 * only requires a JS reload (npx expo start --dev-client --clear) — no EAS
 * rebuild. The native rebuild is a one-time cost for the new bridge function.
 *
 * To add a new exercise standard: add a key to EXERCISE_STANDARDS below.
 * Keys must match ExerciseType strings in modules/athlt-camera/src/index.ts.
 *
 * reviewed: false until a human verifies the numbers on-device.
 * After the migration build: run 5 clean reps, read [STD-LOAD] logs.
 * If Vision reads different angles than expected, edit the thresholds here
 * and do a JS reload to verify — no rebuild needed.
 */

// ─── Types ───────────────────────────────────────────────────────────────────
// Mirror the Swift ExerciseStandard / JointAngleCheck structs.
// Field names must match exactly — Swift parses these keys by string.

export interface JointAngleCheckDef {
  description: string;
  a: string;           // Joint name string (e.g. 'leftShoulder') — matches Joint enum
  b: string;           // angle is measured AT joint b
  c: string;
  maxRangeDeg: number; // max allowed angle variation during one rep
  cue: string;         // coaching string emitted if threshold is breached
}

export interface ExerciseStandardDef {
  exerciseId:            string;
  reviewed:              boolean;  // false until a human verifies on-device
  standardPeakAngleMax:  number;   // peak contraction: repMetric angle must reach ≤ this
  standardStartAngleMin: number;   // start position: repMetric angle must be ≥ this
  romCue:                string;   // cue emitted when peak isn't reached
  extendCue:             string;   // cue emitted when start isn't fully extended
  staticChecks:          JointAngleCheckDef[];
  tempoMinSec:           number;
  tempoMaxSec:           number;
  topFaults:             string[];
}

// ─── Shared curl standard building-blocks ────────────────────────────────────
//
// All bicep-curl variants inherit the same angle floors (peak ≤ 50°, start ≥ 150°)
// and the same torso-swing static checks. The only difference is exerciseId.
// reviewed:false for all variants — they inherit curl's verified numbers but
// have not been separately confirmed on-device for each grip/setup.

const CURL_STATIC_CHECKS: JointAngleCheckDef[] = [
  {
    description: 'Left torso upright — shoulder–hip–knee angle range',
    a: 'leftShoulder',
    b: 'leftHip',
    c: 'leftKnee',
    maxRangeDeg: 15.0,
    cue: 'KEEP TORSO STILL — swinging body',
  },
  {
    description: 'Right torso upright — shoulder–hip–knee angle range',
    a: 'rightShoulder',
    b: 'rightHip',
    c: 'rightKnee',
    maxRangeDeg: 15.0,
    cue: 'KEEP TORSO STILL — swinging body',
  },
];

const CURL_TOP_FAULTS = [
  'HALF REP — never fully contracting or fully extending',
  'SWINGING — using body momentum instead of bicep strength',
  'ELBOW DRIFT — upper arms should stay vertical and back',
];

function curlStandard(exerciseId: string): ExerciseStandardDef {
  return {
    exerciseId,
    reviewed: false,  // ← CHANGE TO true AFTER VERIFYING NUMBERS ON-DEVICE PER VARIANT

    // Peak contraction: shoulder–elbow–wrist angle ≤ 50°.
    // Full bicep curl typically reaches 35–45°; 50° is a generous floor.
    standardPeakAngleMax: 50.0,

    // Start position: elbow angle ≥ 150°.
    // Full extension ≈ 165–170°; 150° allows for natural carry angle.
    standardStartAngleMin: 150.0,

    romCue:    'CURL FURTHER — not reaching full contraction',
    extendCue: 'FULLY EXTEND — arm not straightening at bottom',

    staticChecks: CURL_STATIC_CHECKS,

    tempoMinSec: 1.5,
    tempoMaxSec: 5.0,

    topFaults: CURL_TOP_FAULTS,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────
// Add new standards here as more exercises gain Layer 2 support.
// Missing key → Layer 2 inactive for that exercise (Layer 1 relative signals only).

export const EXERCISE_STANDARDS: Record<string, ExerciseStandardDef> = {

  // ─── Squat ────────────────────────────────────────────────────────────────
  //
  // repMetric = average(leftKneeAngle, rightKneeAngle) — hip→knee→ankle.
  //   HIGH (~160–175°) standing (start position).
  //   LOW  (~80–100°)  at bottom of squat (peak contraction).
  //
  // Floors: must reach ≤ 110° (past parallel) and return to ≥ 155° standing.
  // 110° is generous — real parallel is ~90–100°. Adjust down after on-device check.
  // reviewed: false — verify angles live before tightening.
  squat: {
    exerciseId: 'squat',
    reviewed:   false,

    standardPeakAngleMax:  110.0,   // must reach at least this deep (past parallel = ~90°)
    standardStartAngleMin: 155.0,   // must stand fully upright before rep counts

    romCue:    'GO DEEPER — not reaching parallel',
    extendCue: 'STAND FULLY — not returning to standing',

    staticChecks: [
      {
        description: 'Left torso upright — hip→knee→ankle lateral lean range',
        a: 'leftHip',
        b: 'leftKnee',
        c: 'leftAnkle',
        maxRangeDeg: 15.0,
        cue: 'KNEES TRACKING — lateral knee drift',
      },
      {
        description: 'Right torso upright — hip→knee→ankle lateral lean range',
        a: 'rightHip',
        b: 'rightKnee',
        c: 'rightAnkle',
        maxRangeDeg: 15.0,
        cue: 'KNEES TRACKING — lateral knee drift',
      },
    ],

    tempoMinSec: 2.0,
    tempoMaxSec: 6.0,

    topFaults: [
      'SHALLOW SQUAT — not reaching parallel depth',
      'CAVING KNEES — knees collapsing inward',
      'FORWARD LEAN — excessive torso lean forward',
    ],
  },

  // ─── Lunge ────────────────────────────────────────────────────────────────
  //
  // repMetric = minimum(leftKneeAngle, rightKneeAngle) — tracks the more-bent leg.
  //   HIGH (~165°) standing (start position).
  //   LOW  (~90–110°) at bottom of lunge (peak contraction).
  //
  // Floors: must reach ≤ 120° (front knee bent) and return to ≥ 155°.
  // reviewed: false — verify angles live.
  lunge: {
    exerciseId: 'lunge',
    reviewed:   false,

    standardPeakAngleMax:  120.0,   // front knee must bend to at least this
    standardStartAngleMin: 155.0,   // must return to standing before rep counts

    romCue:    'LUNGE DEEPER — not reaching depth',
    extendCue: 'STAND FULLY — not returning upright',

    staticChecks: [
      {
        description: 'Left torso upright — shoulder–hip–knee angle range',
        a: 'leftShoulder',
        b: 'leftHip',
        c: 'leftKnee',
        maxRangeDeg: 15.0,
        cue: 'CHEST UP — excessive forward lean',
      },
      {
        description: 'Right torso upright — shoulder–hip–knee angle range',
        a: 'rightShoulder',
        b: 'rightHip',
        c: 'rightKnee',
        maxRangeDeg: 15.0,
        cue: 'CHEST UP — excessive forward lean',
      },
    ],

    tempoMinSec: 2.0,
    tempoMaxSec: 6.0,

    topFaults: [
      'SHALLOW LUNGE — front knee not bending enough',
      'FORWARD LEAN — torso leaning too far forward',
      'KNEE COLLAPSE — front knee caving inward',
    ],
  },

  // ─── Shoulder Press ───────────────────────────────────────────────────────
  //
  // repMetric = bestSide(lineVsVertical shoulder→elbow).
  //   Angle of upper arm from vertical. 0° = fully overhead, 90° = horizontal.
  //   HIGH (~82–88°) at shoulder height (start position).
  //   LOW  (~0–15°)  at full lockout overhead (peak contraction).
  //
  // Floors: must press to ≤ 30° (near overhead) and return to ≥ 65° (shoulder level).
  // reviewed: false — verify angles live.
  shoulderPress: {
    exerciseId: 'shoulderPress',
    reviewed:   false,

    standardPeakAngleMax:  45.0,    // must press close to overhead
    standardStartAngleMin: 65.0,    // must lower arms to shoulder height

    romCue:    'PRESS HIGHER — not reaching overhead',
    extendCue: 'LOWER MORE — not returning to shoulder height',

    staticChecks: [
      {
        description: 'Left torso upright — shoulder–hip–knee angle range',
        a: 'leftShoulder',
        b: 'leftHip',
        c: 'leftKnee',
        maxRangeDeg: 15.0,
        cue: 'STAY UPRIGHT — arching lower back',
      },
      {
        description: 'Right torso upright — shoulder–hip–knee angle range',
        a: 'rightShoulder',
        b: 'rightHip',
        c: 'rightKnee',
        maxRangeDeg: 15.0,
        cue: 'STAY UPRIGHT — arching lower back',
      },
    ],

    tempoMinSec: 1.5,
    tempoMaxSec: 5.0,

    topFaults: [
      'HALF REP — not pressing fully overhead',
      'BACK ARCH — excessive lumbar extension during press',
      'FORWARD HEAD — neck jutting forward at lockout',
    ],
  },

  // ─── Bicep Curl ───────────────────────────────────────────────────────────
  //
  // Camera setup: person faces camera, full body in frame.
  // repMetric = minimum(leftElbowAngle, rightElbowAngle)
  //   HIGH (~155-165°) at rest / fully extended.
  //   LOW  (~35-45°)   at peak contraction.
  //
  // Biomechanics: full elbow ROM ≈ 145°. Coached range: ~160° extended → ~40° curled.
  // Conservative floor (start ≥ 150°, peak ≤ 50°) to account for camera angle
  // differences and individual anatomy. These are FLOORS — Layer 1 relative
  // signals still apply on top.
  //
  // REVIEWED: false
  // After migration build: run 5 clean curls, read [STD-LOAD] + [STD] logs.
  //   "baseline peak=__°" should clearly be ≤ 50° for a full curl.
  //   "baseline start=__°" should clearly be ≥ 150° for a fully extended arm.
  // If Vision reads different numbers, edit the thresholds here, JS-reload, verify.
  // Then set reviewed: true.
  curl: curlStandard('curl'),

  // ─── Curl-family variants ─────────────────────────────────────────────────
  //
  // All variants inherit curl's angle floors. The shoulder→elbow→wrist joint
  // angles are the same regardless of grip (neutral / overhand / cable / braced).
  // Spot-check each: run 5 reps, read [STD] logs, adjust if Vision reads
  // significantly different angles for a given setup/grip.

  hammerCurl:        curlStandard('hammerCurl'),
  concentrationCurl: curlStandard('concentrationCurl'),
  preacherCurl:      curlStandard('preacherCurl'),
  reverseCurl:       curlStandard('reverseCurl'),
  cableCurl:         curlStandard('cableCurl'),
};
