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

// ─── Registry ────────────────────────────────────────────────────────────────
// Add new standards here as more exercises gain Layer 2 support.
// Missing key → Layer 2 inactive for that exercise (Layer 1 relative signals only).

export const EXERCISE_STANDARDS: Record<string, ExerciseStandardDef> = {

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
  curl: {
    exerciseId: 'curl',
    reviewed:   false,  // ← CHANGE TO true AFTER VERIFYING NUMBERS ON-DEVICE

    // Peak contraction: shoulder–elbow–wrist angle ≤ 50°.
    // Full bicep curl typically reaches 35–45°; 50° is a generous floor.
    // If the 3-rep average peak is > 50°, the user is NOT curling fully.
    standardPeakAngleMax: 50.0,

    // Start position: elbow angle ≥ 150°.
    // Full extension ≈ 165–170°; 150° allows for the natural carry angle.
    // If the user starts already bent at 120°, they are cheating the ROM.
    standardStartAngleMin: 150.0,

    romCue:    'CURL FURTHER — not reaching full contraction',
    extendCue: 'FULLY EXTEND — arm not straightening at bottom',

    // Torso static checks: angle at hip formed by (shoulder → hip → knee).
    // Upright standing ≈ 175–180°. Body swing or back-lean changes it >15°.
    staticChecks: [
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
    ],

    tempoMinSec: 1.5,
    tempoMaxSec: 5.0,

    topFaults: [
      'HALF REP — never fully contracting or fully extending',
      'SWINGING — using body momentum instead of bicep strength',
      'ELBOW DRIFT — upper arms should stay vertical and back',
    ],
  },
};
