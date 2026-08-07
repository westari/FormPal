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
  // Optional per-exercise override for the native swinging-check jerk-ratio
  // threshold (native default is 2.0x baseline jerk when omitted). Movements
  // with naturally more rep-to-rep velocity variance than an isolation lift
  // (e.g. a bodyweight hip-hinge) need a wider multiple before "SWINGING" fires.
  jerkSpikeMultiple?:    number;
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

// ─── Shared squat standard building-blocks ───────────────────────────────────
//
// Values mirror the verified squat standard VERBATIM. All squat-family variants
// share the same knee-angle floors and static checks. reviewed: false for all
// variants — they inherit squat's numbers but haven't been separately confirmed.

const SQUAT_STATIC_CHECKS: JointAngleCheckDef[] = [
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
];

const SQUAT_TOP_FAULTS = [
  'SHALLOW SQUAT — not reaching parallel depth',
  'CAVING KNEES — knees collapsing inward',
  'FORWARD LEAN — excessive torso lean forward',
];

function squatStandard(exerciseId: string): ExerciseStandardDef {
  return {
    exerciseId,
    reviewed: false,
    standardPeakAngleMax:  110.0,
    standardStartAngleMin: 155.0,
    romCue:    'GO DEEPER — not reaching parallel',
    extendCue: 'STAND FULLY — not returning to standing',
    staticChecks: SQUAT_STATIC_CHECKS,
    tempoMinSec: 2.0,
    tempoMaxSec: 6.0,
    topFaults: SQUAT_TOP_FAULTS,
  };
}

// ─── Shared shoulder-press standard building-blocks ──────────────────────────
//
// STATIC CHECK REMOVED after on-device data: shoulder-hip-knee angle range
// showed 22–118° during normal presses (limit was 15°), firing "arching lower
// back" on nearly every rep. Root cause: pressing overhead genuinely moves the
// tracked SHOULDER landmark (natural scapular rotation/elevation at lockout —
// not a fault), and this check uses the shoulder itself as one of its three
// points — same contamination pattern as the hinge family's removed knee_bend
// check (a joint that's supposed to be a stable anchor is actually part of the
// exercise's own primary motion). No orthogonal 3-point angle isolates real
// lumbar arch from normal shoulder movement during a press, so — same standard
// as before — removed rather than left firing unreliably.
const SHOULDER_PRESS_STATIC_CHECKS: JointAngleCheckDef[] = [];

const SHOULDER_PRESS_TOP_FAULTS = [
  'HALF REP — not pressing fully overhead',
  'BACK ARCH — excessive lumbar extension during press (not camera-detectable — watch for this yourself)',
  'FORWARD HEAD — neck jutting forward at lockout',
];

function shoulderPressStandard(exerciseId: string): ExerciseStandardDef {
  return {
    exerciseId,
    reviewed: false,
    // Loosened 45.0→65.0: on-device data showed genuine full presses reading
    // 52–63° — the 45° standard was failing normal reps outright. 65 gives a
    // small margin above the observed 63° max.
    standardPeakAngleMax:  65.0,
    standardStartAngleMin: 65.0,
    romCue:    'PRESS HIGHER — not reaching overhead',
    extendCue: 'LOWER MORE — not returning to shoulder height',
    staticChecks: SHOULDER_PRESS_STATIC_CHECKS,
    tempoMinSec: 1.5,
    tempoMaxSec: 5.0,
    topFaults: SHOULDER_PRESS_TOP_FAULTS,
  };
}

// ─── Shared lunge standard building-blocks ────────────────────────────────────
//
// Values mirror the verified lunge standard VERBATIM.

const LUNGE_STATIC_CHECKS: JointAngleCheckDef[] = [
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
];

const LUNGE_TOP_FAULTS = [
  'SHALLOW LUNGE — front knee not bending enough',
  'FORWARD LEAN — torso leaning too far forward',
  'KNEE COLLAPSE — front knee caving inward',
];

function lungeStandard(exerciseId: string): ExerciseStandardDef {
  return {
    exerciseId,
    reviewed: false,
    standardPeakAngleMax:  120.0,
    standardStartAngleMin: 155.0,
    romCue:    'LUNGE DEEPER — not reaching depth',
    extendCue: 'STAND FULLY — not returning upright',
    staticChecks: LUNGE_STATIC_CHECKS,
    tempoMinSec: 2.0,
    tempoMaxSec: 6.0,
    topFaults: LUNGE_TOP_FAULTS,
  };
}

// ─── Shared tricep standard building-blocks ──────────────────────────────────
//
// repMetric for all tricep variants = lineVsVertical(wrist→elbow).
//   REST  (elbow bent, forearm horizontal): ≈ 80-85°
//   PEAK  (elbow extended, forearm vertical): ≈ 0-15°
//
// standardPeakAngleMax: 20 — forearm must reach within 20° of vertical
//                              (= near-full elbow extension).
// standardStartAngleMin: 65 — forearm must be close to horizontal at start
//                              (= elbows properly bent before next rep).
//
// Static check: shoulder–hip–knee range measures body swing / momentum use.
// This check is meaningless for the skullcrusher (person lying flat) but all
// entries use the same standard since reviewed: false — verify on-device.

// LOOSENED 15→25: device log showed this check "already violating in
// baseline" — 19.5° average during the reference/calibration reps themselves,
// before any real swinging could even be assessed. Unlike shoulder press's
// analogous check (which showed a wild 22-118° range and was removed outright
// as fundamentally contaminated by the pressing motion), this is a modest,
// consistent overage — a genuine tricep pushdown appears to naturally involve
// a bit more shoulder-hip-knee variation than 15° allows, not a metric that's
// meaningless for this exercise. Loosened rather than removed; 25 sits
// comfortably above the observed 19.5° baseline average.
const TRICEP_STATIC_CHECKS: JointAngleCheckDef[] = [
  {
    description: 'Left torso — shoulder–hip–knee range (no body swing)',
    a: 'leftShoulder',
    b: 'leftHip',
    c: 'leftKnee',
    maxRangeDeg: 25.0,
    cue: 'KEEP TORSO STILL — using body to push',
  },
  {
    description: 'Right torso — shoulder–hip–knee range (no body swing)',
    a: 'rightShoulder',
    b: 'rightHip',
    c: 'rightKnee',
    maxRangeDeg: 25.0,
    cue: 'KEEP TORSO STILL — using body to push',
  },
];

const TRICEP_TOP_FAULTS = [
  'PARTIAL REP — not fully extending at the bottom',
  'ELBOW FLARE — upper arms not staying close to the body',
  'BODY SWING — using momentum instead of tricep strength',
];

function tricepStandard(exerciseId: string): ExerciseStandardDef {
  return {
    exerciseId,
    reviewed: false,
    standardPeakAngleMax:  20.0,
    standardStartAngleMin: 65.0,
    romCue:    'EXTEND FULLY — not reaching full lockout',
    extendCue: 'RETURN TO START — forearm not returning to horizontal',
    staticChecks: TRICEP_STATIC_CHECKS,
    tempoMinSec: 1.5,
    tempoMaxSec: 5.0,
    topFaults: TRICEP_TOP_FAULTS,
  };
}

// ─── Shared row standard building-blocks ──────────────────────────────────────
//
// Rep metric = bestSide elbow jointAngle(shoulder, elbow, wrist).
//   Start: arm straight (~165°). Peak: elbow flexed to ~70-90°.
//
// Static checks: shoulder-hip-knee angle range during the rep.
//   For bent-over rows: torso should stay at a constant hinge (≤20° variation).
//   For seated rows: torso should stay upright (≤15° variation; stricter).
//
// reviewed:false for all row variants — numbers need on-device verification.

// Row static checks: REMOVED.
//
// All previous attempts used shoulder–hip–knee, but the shoulder RETRACTS by design
// during every row rep — scapular retraction contaminated the angle regardless of
// threshold (on-device: 32–41° variation on correct reps even at 65° limit).
//
// The only viable torso-stability check without the shoulder would need the ankle as
// a reference (e.g. hip–knee–ankle). Ankle is not in frame for the row camera setup
// (camera captures shoulder→wrist, not floor).
//
// Torso detection is now handled by the Layer 1 per-rep form check in exerciseDefinitions.ts:
//   lineVsVertical(hip→knee) throughoutMin < 15° → 'STOP SWINGING'
// This is shoulder-free and fires when the hip travels forward over the knee.
const ROW_STATIC_CHECKS_BENT_OVER: JointAngleCheckDef[] = [];
const ROW_STATIC_CHECKS_SEATED:    JointAngleCheckDef[] = [];

const ROW_TOP_FAULTS_BENT_OVER = [
  'HALF ROW — not pulling elbow past torso',
  'BODY SWING — using momentum to heave the weight',
  'SHRUG — trapping with shoulder instead of pulling through elbow',
];

const ROW_TOP_FAULTS_SEATED = [
  'HALF ROW — not pulling handle all the way back',
  'LEAN BACK — rocking body instead of pulling with lats',
  'SHRUG — shoulder rising instead of staying packed',
];

function bentOverRowStandard(exerciseId: string): ExerciseStandardDef {
  return {
    exerciseId,
    reviewed:              false,
    standardPeakAngleMax:  90.0,   // must flex to ≤90° for quality rep
    standardStartAngleMin: 150.0,  // must straighten to ≥150° before next pull
    romCue:    'PULL HIGHER — not reaching elbow flexion',
    extendCue: 'LOWER FULLY — arm not returning to straight',
    staticChecks: ROW_STATIC_CHECKS_BENT_OVER,
    tempoMinSec: 1.0,
    tempoMaxSec: 5.0,
    topFaults: ROW_TOP_FAULTS_BENT_OVER,
  };
}

function seatedRowStandard(exerciseId: string): ExerciseStandardDef {
  // Metric is maximum(distanceRatio(wrist,hip)) — body-normalized, always picks near arm.
  // Values calibrated from on-device [REP] log (measured: start ~2.0, finish ~0.1).
  // standardPeakAngleMax:  handle must reach ≤ 0.85 torso lengths from hip (GOOD rep)
  //                        Calibrated: on-device peak=0.8 on full pulls; 0.6 fired every rep.
  // standardStartAngleMin: wrist should be ≥ 1.9 torso lengths from hip at the start
  return {
    exerciseId,
    reviewed:              false,
    standardPeakAngleMax:  0.85,  // wrist-to-hip distanceRatio at peak of good rep
    standardStartAngleMin: 1.9,   // wrist-to-hip distanceRatio at full arm extension
    romCue:    'PULL TO YOUR STOMACH — handle not reaching the torso',
    extendCue: 'REACH FORWARD — arm not fully extending between reps',
    staticChecks: ROW_STATIC_CHECKS_SEATED,
    tempoMinSec: 1.0,
    tempoMaxSec: 5.0,
    topFaults: ROW_TOP_FAULTS_SEATED,
  };
}

// ─── Shared hip-hinge standard building-blocks ────────────────────────────────
//
// repMetric = average(lineVsHorizontal(hip, shoulder)) — torso angle FROM horizontal.
//   HIGH (~90°) standing (start position). LOW (~30-45° per research spec) at
//   the bottom of a proper hinge.
//
// PLACEHOLDER — mirrors the placeholder rep-range thresholds in
// constants/exerciseDefinitions.ts's hingeVariant(). lineVsHorizontal has no
// on-device validation in this codebase yet. Verify from a real device log
// before trusting these; set reviewed: true only after that.
//
// Static checks: REMOVED. Same resolution already used for the row family
// above (see ROW_STATIC_CHECKS_BENT_OVER) for the identical class of problem.
//
// The original static check used hip→knee→ankle angle range as a "knee
// stability" proxy. On-device data (from the Layer-1 knee_bend check, which
// used the same joint triple) showed this angle swinging 119-125° during a
// rep with near-zero real knee bend — the HIP translates substantially during
// a hinge and contaminates any angle computed through it, regardless of the
// maxRangeDeg threshold chosen. Loosening the number doesn't fix that; the
// signal itself doesn't isolate knee flexion for this movement.
//
// The fix used for the Layer-1 check (constants/exerciseDefinitions.ts's
// HINGE_KNEE_BEND_CHECK) — lineVsVertical(ankle, knee), which excludes the hip
// — isn't expressible here: JointAngleCheckDef only supports a 3-point angle
// (a, b, c), not a 2-point line-vs-vertical. Knee stability is fully covered
// by that fixed Layer-1 check instead; nothing is lost by removing this.
const HINGE_STATIC_CHECKS: JointAngleCheckDef[] = [];

const HINGE_TOP_FAULTS = [
  'INCOMPLETE HINGE — not reaching enough torso travel toward horizontal',
  'SQUATTING IT — bending the knees too much instead of sending the hips back',
  'ROUNDED BACK — losing a neutral spine at the bottom (not camera-detectable — watch for this yourself)',
];

function hingeStandard(exerciseId: string): ExerciseStandardDef {
  return {
    exerciseId,
    reviewed: false,  // PLACEHOLDER numbers below — verify on-device before flipping to true
    standardPeakAngleMax:  60.0,   // must hinge to at least this close to horizontal
    standardStartAngleMin: 80.0,   // must return to near-vertical before rep counts
    romCue:    'HINGE DEEPER — not reaching enough depth',
    extendCue: 'STAND FULLY — not returning upright',
    staticChecks: HINGE_STATIC_CHECKS,
    tempoMinSec: 1.5,
    tempoMaxSec: 5.0,
    topFaults: HINGE_TOP_FAULTS,
    // Loosened from the native default (2.0) after an on-device log showed
    // SWINGING firing on nearly every normal-tempo rep (2.75x-4.83x baseline
    // jerk). Root cause was a poisoned baseline (a short rep #1 locked in an
    // artificially low reference jerk — now fixed in UniversalQualityEngine.swift
    // by excluding non-standard reps from baseline calibration). This 3.0
    // multiple is an ADDITIONAL safety margin on top of that fix, not a
    // replacement for it: a bodyweight hinge is a bigger, more ballistic-feeling
    // movement on a noisier 2D torso-angle metric than an isolation exercise, so
    // it likely needs more headroom even with a clean baseline. Not disabled —
    // real momentum-swinging is a genuine, common hinge fault worth keeping a
    // check for. This value is a reasoned starting point, not device-verified —
    // send a fresh log (with the baseline fix in place) and I'll tighten it.
    jerkSpikeMultiple: 3.0,
  };
}

// ─── Shared shoulder/arm isolation raise standard building-blocks ────────────
//
// repMetric = bestSide(lineVsHorizontal(shoulder, elbow)) — upper arm angle
// FROM horizontal. HIGH (~90°) arms down (start). LOW (~0°) at shoulder height.
//
// PLACEHOLDER — mirrors the placeholder rep-range thresholds in
// constants/exerciseDefinitions.ts's lateralRaiseVariant()/frontRaiseVariant().
// lineVsHorizontal(shoulder,elbow) has no on-device validation yet.
//
// Static check = torso stability, reusing shoulder press's own static-check
// pattern verbatim (shoulder-hip-knee angle range, same "stay upright"
// concern) — unlike the hinge family, this IS expressible in the 3-point-only
// JointAngleCheckDef schema without contamination: the hip here is correctly
// used as the torso's own anchor point, not a translating unrelated joint.

const RAISE_STATIC_CHECKS: JointAngleCheckDef[] = [
  {
    description: 'Left torso upright — shoulder-hip-knee angle range (no swinging)',
    a: 'leftShoulder',
    b: 'leftHip',
    c: 'leftKnee',
    maxRangeDeg: 15.0,
    cue: 'CONTROL IT — no swinging',
  },
  {
    description: 'Right torso upright — shoulder-hip-knee angle range (no swinging)',
    a: 'rightShoulder',
    b: 'rightHip',
    c: 'rightKnee',
    maxRangeDeg: 15.0,
    cue: 'CONTROL IT — no swinging',
  },
];

// "TOO HIGH" removed — raising past shoulder height isn't actually a fault
// for a general user (shifts emphasis to traps, not wrong or dangerous), and
// the matching Layer-1 check was removed for the same reason. See
// constants/exerciseDefinitions.ts's raiseVariant comment.
const RAISE_TOP_FAULTS = [
  'PARTIAL REP — not raising to shoulder height',
  'WRONG DIRECTION — raising forward instead of out to the sides (lateral raise)',
  'SWINGING — using body momentum instead of controlled raise strength',
];

function raiseStandard(exerciseId: string): ExerciseStandardDef {
  return {
    exerciseId,
    reviewed: false,  // PLACEHOLDER numbers below — verify on-device before flipping to true
    // Tightened twice now: 35.0→15.0→8.0 — still "not strict enough on raising
    // high enough" after the first pass. Kept in sync with the matching
    // Layer-0 goodROMThreshold tightening (30→15→8) in
    // constants/exerciseDefinitions.ts's lateralRaiseVariant()/frontRaiseVariant().
    // Still a reasoned value, not device-verified — send a [REP] log with your
    // real arms-up reading and I'll set the exact number.
    standardPeakAngleMax:  8.0,   // must raise to at least this close to shoulder height
    standardStartAngleMin: 80.0,   // must return arms fully down before rep counts
    romCue:    'RAISE HIGHER — not reaching enough depth',
    extendCue: 'LOWER FULLY — not returning arms down',
    staticChecks: RAISE_STATIC_CHECKS,
    tempoMinSec: 1.0,
    tempoMaxSec: 4.0,
    topFaults: RAISE_TOP_FAULTS,
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

    // Loosened 45.0→65.0 — same on-device evidence as shoulderPressStandard()
    // below (genuine full presses read 52-63°). staticChecks removed — same
    // contamination as that function's comment (shoulder landmark moves
    // naturally during a press, so shoulder-hip-knee range isn't real arch).
    standardPeakAngleMax:  65.0,    // must press close to overhead
    standardStartAngleMin: 65.0,    // must lower arms to shoulder height

    romCue:    'PRESS HIGHER — not reaching overhead',
    extendCue: 'LOWER MORE — not returning to shoulder height',

    staticChecks: [],

    tempoMinSec: 1.5,
    tempoMaxSec: 5.0,

    topFaults: [
      'HALF REP — not pressing fully overhead',
      'BACK ARCH — excessive lumbar extension during press (not camera-detectable — watch for this yourself)',
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

  // ─── Squat-family variants ─────────────────────────────────────────────────
  gobletSquat:  squatStandard('gobletSquat'),
  airSquat:     squatStandard('airSquat'),
  frontSquat:   squatStandard('frontSquat'),
  backSquat:    squatStandard('backSquat'),
  sumoSquat:    squatStandard('sumoSquat'),

  // ─── Shoulder-press-family variants ───────────────────────────────────────
  overheadPress:          shoulderPressStandard('overheadPress'),
  arnoldPress:            shoulderPressStandard('arnoldPress'),
  dumbbellShoulderPress:  shoulderPressStandard('dumbbellShoulderPress'),
  machineShoulderPress:   shoulderPressStandard('machineShoulderPress'),

  // ─── Lunge-family variants ─────────────────────────────────────────────────
  splitSquat:          lungeStandard('splitSquat'),
  reverseLunge:        lungeStandard('reverseLunge'),
  stepUp:              lungeStandard('stepUp'),
  bulgarianSplitSquat: lungeStandard('bulgarianSplitSquat'),

  // ─── Tricep-family variants ────────────────────────────────────────────────
  // closegripPushup is in the push-up family and has no Layer 2 standard (same
  // as all other push-up variants).
  tricepPushdown:          tricepStandard('tricepPushdown'),
  overheadTricepExtension: tricepStandard('overheadTricepExtension'),
  skullcrusher:            tricepStandard('skullcrusher'),

  // ─── Row family ────────────────────────────────────────────────────────────
  bentOverRow:   bentOverRowStandard('bentOverRow'),
  barbellRow:    bentOverRowStandard('barbellRow'),
  singleArmRow:  bentOverRowStandard('singleArmRow'),
  invertedRow:   bentOverRowStandard('invertedRow'),
  tBarRow:       bentOverRowStandard('tBarRow'),
  seatedCableRow: seatedRowStandard('seatedCableRow'),
  machineRow:     seatedRowStandard('machineRow'),

  // ─── Hip-hinge family ───────────────────────────────────────────────────────
  romanianDeadlift: hingeStandard('romanianDeadlift'),
  deadlift:         hingeStandard('deadlift'),
  goodMorning:      hingeStandard('goodMorning'),
  kettlebellSwing:  hingeStandard('kettlebellSwing'),
  singleLegRDL:     hingeStandard('singleLegRDL'),

  // ─── Shoulder/arm isolation raise family ───────────────────────────────────
  lateralRaise: raiseStandard('lateralRaise'),
  frontRaise:   raiseStandard('frontRaise'),
};
