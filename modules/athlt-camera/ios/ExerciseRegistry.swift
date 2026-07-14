import Foundation

// ─── Exercise registry ────────────────────────────────────────────────────────
//
// Adding a new exercise = adding ONE ExerciseDefinition here.
// No engine code changes needed — ever.
//
// METRIC CONVENTION:
//   repMetric must use the same units as the thresholds (degrees or Vision units).
//   Use .average for bilateral exercises (squat, lunge).
//   Use .minimum for "most-flexed" tracking (curl, lunge alternate leg).
//   Use .bestSide for side-on exercises where only one side faces camera (push-up).
//
// FORM-CHECK CONVENTION:
//   Define the full fault set per exercise. Engine reports highest-priority failing check.
//   Set enabled: false for checks that are noisy until tuned on-device.
//   Tune thresholds via the rep NSLog: "[Engine] [<id>] Rep #N ... | check=value[FAIL/ok]"

enum ExerciseRegistry {

    static func definition(for id: String) -> ExerciseDefinition? {
        switch id {
        case "squat":         return squat
        case "curl":          return curl
        case "pushup":        return pushup
        case "lunge":         return lunge
        case "shoulderPress": return shoulderPress
        default:              return nil
        }
    }

    // ── SQUAT ─────────────────────────────────────────────────────────────────
    //
    // repMetric: average knee angle both legs (hip→knee→ankle).
    // Camera: side view, full body in frame.
    //
    // Calibration: 2 slow reps calibrate per-user thresholds.
    // Static thresholds (fallback): enter=150, exit=155, ROM=100.
    //
    // Form checks:
    //   back_lean: CHEST UP when torso-vertical angle > 25° (on-device: upright≈4°, hunched≈47°)
    //   heel_rise: disabled — ankle confidence too low at typical distance
    //   knee_cave: disabled — pending tuning

    static let squat = ExerciseDefinition(
        id:          "squat",
        displayName: "Squat",

        repMetric: .average(
            .jointAngle(a: .leftHip,  pivot: .leftKnee,  c: .leftAnkle),
            .jointAngle(a: .rightHip, pivot: .rightKnee, c: .rightAnkle)
        ),

        topAngle:           160,
        repEnterThreshold:  150,
        repExitThreshold:   155,
        goodROMThreshold:   100,
        insufficientROMCue: "GO DEEPER",

        formChecks: [
            // Torso-vertical angle averaged both sides.
            // On-device calibration: upright ≈ 3.7°, hunched ≈ 47.2°. 25° reliable.
            FormCheck(
                id:         "back_lean",
                cue:        "CHEST UP",
                metric:     .average(
                    .lineVsVertical(from: .leftHip,   to: .leftShoulder),
                    .lineVsVertical(from: .rightHip,  to: .rightShoulder)
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(25),
                priority:   1,
                enabled:    true
            ),
            FormCheck(
                id:         "heel_rise",
                cue:        "KEEP HEELS DOWN",
                metric:     .average(
                    .lineVsVertical(from: .leftAnkle,  to: .leftKnee),
                    .lineVsVertical(from: .rightAnkle, to: .rightKnee)
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(20),
                priority:   2,
                enabled:    false
            ),
            FormCheck(
                id:         "knee_cave",
                cue:        "KNEES OUT",
                metric:     .average(
                    .lineVsVertical(from: .leftHip,  to: .leftKnee),
                    .lineVsVertical(from: .rightHip, to: .rightKnee)
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(20),
                priority:   3,
                enabled:    false
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  155,
            readyAngleMax:  190,
            requiredJoints: [.leftHip, .leftKnee, .leftAnkle,
                              .rightHip, .rightKnee, .rightAnkle],
            minConfidence:  0.30,
            stableDuration: 1.0
        ),

        cameraSetup: CameraSetupConfig(
            setupInstruction: "Stand sideways to the camera — full body in frame",
            requiredJoints: [
                .leftShoulder, .rightShoulder,
                .leftHip,  .rightHip,
                .leftKnee, .rightKnee,
                .leftAnkle, .rightAnkle,
            ]
        ),

        calibration: CalibrationConfig(
            repsNeeded:    2,
            enterFraction: 0.50,
            exitFraction:  0.25
        ),

        minRepInterval: 0.5,

        planarityChecks: [
            // Squat is side-on: thigh and shin must appear nearly full-length.
            // Fails when user faces camera instead of turning sideways.
            PlanarityCheck(id: "thigh_l", jointA: .leftHip,  jointB: .leftKnee,
                           minRatio: 0.75, cue: "TURN SIDE-ON", fallbackReferenceRatio: 0.80),
            PlanarityCheck(id: "shin_l",  jointA: .leftKnee, jointB: .leftAnkle,
                           minRatio: 0.75, cue: "TURN SIDE-ON", fallbackReferenceRatio: 0.72),
        ]
    )

    // ── CURL ──────────────────────────────────────────────────────────────────
    //
    // repMetric: minimum elbow angle (shoulder→elbow→wrist) of both arms — "most flexed."
    // Camera: front-facing, full arms in frame.
    //
    // Calibration: 2 slow reps calibrate per-user thresholds.
    // Static thresholds (fallback): enter=145, exit=145, ROM=60.
    //
    // Form checks:
    //   full_extension: didn't fully extend arm (throughoutMax < 120°) — priority 1
    //   elbow_drift:    upper arm drifted forward (throughoutMax > 30°) — priority 4
    //   lean_back:      torso leaned back for momentum (throughoutMax > 20°) — priority 5
    //
    // Priority 4/5 → both override the ROM cue via FORM_OVERRIDE_ROM_PRIORITY.
    // When arm drifts, the 2D-projected elbow angle looks smaller than it really is,
    // making ROM appear to fail — but drift is the actual fault.
    //
    // TUNE: read "[Engine] [curl] Rep #N ... elbow_drift=X.X[FAIL/ok]" on-device.
    //   Proper curl with elbow pinned:   ~5–15°
    //   Elbow drifting forward:          ~25–40°
    //   lean_back standing still:        ~2–8°; hard swing: ~18–30°

    static let curl = ExerciseDefinition(
        id:          "curl",
        displayName: "Bicep Curl",

        repMetric: .minimum(
            .jointAngle(a: .leftShoulder,  pivot: .leftElbow,  c: .leftWrist),
            .jointAngle(a: .rightShoulder, pivot: .rightElbow, c: .rightWrist)
        ),

        topAngle:           160,
        repEnterThreshold:  145,
        repExitThreshold:   145,
        goodROMThreshold:    60,
        insufficientROMCue: "CURL HIGHER",

        formChecks: [
            // ROM: didn't fully extend arm at the bottom of the movement.
            // throughoutMax = most-extended angle reached during inRep.
            // Threshold 120° (not 140°): calibrated exit threshold often lands ~135–142°,
            // which undercuts a 140° check and causes false fires on every rep.
            // 120° still catches genuine non-extension while clearing normal anatomy variation.
            FormCheck(
                id:         "full_extension",
                cue:        "FULL EXTENSION",
                metric:     .minimum(
                    .jointAngle(a: .leftShoulder,  pivot: .leftElbow,  c: .leftWrist),
                    .jointAngle(a: .rightShoulder, pivot: .rightElbow, c: .rightWrist)
                ),
                evaluateAt: .throughoutMax,
                condition:  .lessThan(120),
                priority:   1,
                enabled:    true
            ),
            // Elbow drift: shoulder→elbow angle from vertical.
            // Priority 4 → overrides "CURL HIGHER" ROM cue via FORM_OVERRIDE_ROM_PRIORITY.
            FormCheck(
                id:         "elbow_drift",
                cue:        "KEEP ELBOW STILL",
                metric:     .average(
                    .lineVsVertical(from: .leftShoulder,  to: .leftElbow),
                    .lineVsVertical(from: .rightShoulder, to: .rightElbow)
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(30),
                priority:   4,
                enabled:    true
            ),
            // Lean-back / momentum: torso (hip→shoulder) angle from vertical.
            // Priority 5 → overrides "CURL HIGHER" and elbow_drift.
            FormCheck(
                id:         "lean_back",
                cue:        "STOP SWINGING",
                metric:     .average(
                    .lineVsVertical(from: .leftHip,  to: .leftShoulder),
                    .lineVsVertical(from: .rightHip, to: .rightShoulder)
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(20),
                priority:   5,
                enabled:    true
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  140,
            readyAngleMax:  190,
            requiredJoints: [.leftShoulder, .leftElbow, .leftWrist,
                              .rightShoulder, .rightElbow, .rightWrist],
            minConfidence:  0.30,
            stableDuration: 0.3
        ),

        cameraSetup: CameraSetupConfig(
            setupInstruction: "Face the camera — stand back so both arms are fully in frame",
            requiredJoints: [
                .leftShoulder, .rightShoulder,
                .leftElbow,    .rightElbow,
                .leftWrist,    .rightWrist,
            ]
        ),

        calibration: CalibrationConfig(
            repsNeeded:    2,
            enterFraction: 0.50,
            exitFraction:  0.25
        ),

        minRepInterval: 0.5,

        planarityChecks: [
            // Curl is front-facing: forearm must appear near full-length.
            // Fails when elbow drifts toward/away from camera (arm goes out-of-plane).
            // Check both arms — repMetric uses .minimum of left/right, so either can be measured.
            PlanarityCheck(id: "forearm_l", jointA: .leftElbow,  jointB: .leftWrist,
                           minRatio: 0.75, cue: "KEEP ELBOW IN", fallbackReferenceRatio: 0.56),
            PlanarityCheck(id: "forearm_r", jointA: .rightElbow, jointB: .rightWrist,
                           minRatio: 0.75, cue: "KEEP ELBOW IN", fallbackReferenceRatio: 0.56),
        ]
    )

    // ── PUSH-UP ───────────────────────────────────────────────────────────────
    //
    // repMetric: bodyRelativeGap(shoulder, elbow, shoulder→hip axis).
    //   Measures shoulder-vs-elbow displacement projected onto the CCW-perp of the
    //   shoulder→hip axis, normalised by shoulder→hip length. Orientation-agnostic —
    //   works with phone on floor in landscape because it uses the BODY's own frame,
    //   not the image's vertical axis.
    //   UP position:   shoulder above elbow in body frame → ≈ +0.30 to +0.65
    //   BOTTOM of rep: shoulder drops below elbow          → ≈ −0.10 to −0.30
    //
    // ALL thresholds are body-relative fractions. Tune via per-frame NSLog:
    //   "[Engine] [pushup] frame: metric=X.XXX phase=..." in Xcode console.
    //
    // No calibration — body-relative thresholds are stable across users and distances.
    //
    // Form checks (bodyRelativeDeviation — orientation-agnostic):
    //   hip_align_l/r: hip deviation from shoulder→ankle plank line, as fraction of
    //                  body length. 0 = perfect plank; 0.07 ≈ 3–4 inches off line.
    //                  Catches both sag AND pike with a single unsigned check.
    //   TUNE: "hip_align_l=X.XXX" in rep NSLog. Perfect plank ≈ 0.00–0.03; noticeable sag ≈ 0.07+.

    static let pushup = ExerciseDefinition(
        id:          "pushup",
        displayName: "Push-up",

        repMetric: .bestSide(
            left: .bodyRelativeGap(
                a: .leftShoulder,  b: .leftElbow,
                axisFrom: .leftShoulder, axisTo: .leftHip
            ),
            right: .bodyRelativeGap(
                a: .rightShoulder, b: .rightElbow,
                axisFrom: .rightShoulder, axisTo: .rightHip
            ),
            leftJoints:  [.leftShoulder,  .leftElbow,  .leftHip],
            rightJoints: [.rightShoulder, .rightElbow, .rightHip]
        ),

        topAngle:           0.40,    // up-position value ≈ 0.35–0.65; generous ceiling
        repEnterThreshold:  0.17,    // rep starts when gap drops below here (descending)
        repExitThreshold:   0.30,    // rep completes when gap rises above here (ascending)
        goodROMThreshold:   0.07,    // must reach below here for full ROM (goes negative at bottom)
        insufficientROMCue: "GO LOWER",

        formChecks: [

            // bodyRelativeDeviation: hip off the shoulder→ankle plank line.
            // Unsigned — catches sag and pike equally. Camera-side-agnostic.
            // TUNE: flat plank ≈ 0.00–0.03; 3-inch sag ≈ 0.07.
            FormCheck(
                id:         "hip_align_l",
                cue:        "HIPS LEVEL",
                metric:     .bodyRelativeDeviation(
                    point:    .leftHip,
                    axisFrom: .leftShoulder,
                    axisTo:   .leftAnkle
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.07),
                priority:   2,
                enabled:    true
            ),
            FormCheck(
                id:         "hip_align_r",
                cue:        "HIPS LEVEL",
                metric:     .bodyRelativeDeviation(
                    point:    .rightHip,
                    axisFrom: .rightShoulder,
                    axisTo:   .rightAnkle
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.07),
                priority:   2,
                enabled:    true
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  0.13,    // bodyRelativeGap at top ≈ 0.30–0.65; 0.13 allows entry
            readyAngleMax:  1.50,
            requiredJoints: [.leftShoulder, .leftElbow, .rightShoulder, .rightElbow],
            minConfidence:  0.15,
            stableDuration: 0.5
        ),

        cameraSetup: CameraSetupConfig(
            setupInstruction: "Lay your phone on its side on the floor, a few feet to your side",
            requiredJoints: [
                Joint.leftShoulder, .leftElbow, .leftHip, .leftAnkle,
            ],
            requiredJointsAlt: [
                Joint.rightShoulder, .rightElbow, .rightHip, .rightAnkle,
            ]
        ),

        calibration: nil,   // body-relative thresholds are stable across users and camera distances

        minRepInterval: 0.8,

        planarityChecks: [
            // Push-up is side-on: upper arm check disabled until tuned from real data.
            // Body-relative metrics already handle orientation, so this gate is low-priority.
            PlanarityCheck(id: "uarm_l", jointA: .leftShoulder, jointB: .leftElbow,
                           minRatio: 0.75, cue: "TURN SIDE-ON", fallbackReferenceRatio: 0.64,
                           enabled: false),
        ]
    )

    // ── LUNGE ─────────────────────────────────────────────────────────────────
    //
    // repMetric: minimum front-knee angle (hip→knee→ankle) — tracks the more-bent leg.
    // Camera: side view, full body in frame (same as squat).
    //
    // Calibration: 2 slow reps calibrate per-user thresholds.
    // Static thresholds (fallback): enter=145, exit=150, ROM=105.
    //
    // Form checks:
    //   torso_lean:  CHEST UP when torso deviates from vertical > 20° (priority 2)
    //   knee_drive:  DRIVE KNEE DOWN if front knee doesn't reach ~115° at bottom (disabled)
    //                Enable after on-device tuning — knee depth varies by lunge style.
    //
    // Proof of config-only architecture: adding lunge required ZERO engine changes.
    // The repMetric (.minimum of two jointAngles) and all form checks use existing Metric cases.

    static let lunge = ExerciseDefinition(
        id:          "lunge",
        displayName: "Lunge",

        repMetric: .minimum(
            .jointAngle(a: .leftHip,  pivot: .leftKnee,  c: .leftAnkle),
            .jointAngle(a: .rightHip, pivot: .rightKnee, c: .rightAnkle)
        ),

        topAngle:           165,
        repEnterThreshold:  145,
        repExitThreshold:   150,
        goodROMThreshold:   105,
        insufficientROMCue: "LUNGE DEEPER",

        formChecks: [
            // Torso-vertical angle averaged both sides.
            // TUNE: "torso_lean=X.X" in rep NSLog. Upright ≈ 3–8°; significant lean ≈ 20°+.
            FormCheck(
                id:         "torso_lean",
                cue:        "CHEST UP",
                metric:     .average(
                    .lineVsVertical(from: .leftHip,  to: .leftShoulder),
                    .lineVsVertical(from: .rightHip, to: .rightShoulder)
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(20),
                priority:   2,
                enabled:    true
            ),
            // Front-knee depth: re-uses repMetric, checks atBottom value.
            // Enabled:false — knee depth varies by lunge style (forward vs reverse vs walking).
            // TUNE after on-device testing: typical good lunge bottom ≈ 90–110°.
            FormCheck(
                id:         "knee_drive",
                cue:        "DRIVE KNEE DOWN",
                metric:     .minimum(
                    .jointAngle(a: .leftHip,  pivot: .leftKnee,  c: .leftAnkle),
                    .jointAngle(a: .rightHip, pivot: .rightKnee, c: .rightAnkle)
                ),
                evaluateAt: .atBottom,
                condition:  .greaterThan(115),
                priority:   1,
                enabled:    false
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  155,
            readyAngleMax:  190,
            requiredJoints: [.leftHip, .leftKnee, .leftAnkle,
                              .rightHip, .rightKnee, .rightAnkle],
            minConfidence:  0.30,
            stableDuration: 1.0
        ),

        cameraSetup: CameraSetupConfig(
            setupInstruction: "Stand sideways to the camera — full body in frame",
            requiredJoints: [
                .leftShoulder, .rightShoulder,
                .leftHip,  .rightHip,
                .leftKnee, .rightKnee,
                .leftAnkle, .rightAnkle,
            ]
        ),

        calibration: CalibrationConfig(
            repsNeeded:    2,
            enterFraction: 0.50,
            exitFraction:  0.25
        ),

        minRepInterval: 0.5,

        planarityChecks: [
            // Lunge is side-on: same thigh/shin check as squat.
            PlanarityCheck(id: "thigh_l", jointA: .leftHip,  jointB: .leftKnee,
                           minRatio: 0.75, cue: "TURN SIDE-ON", fallbackReferenceRatio: 0.80),
            PlanarityCheck(id: "shin_l",  jointA: .leftKnee, jointB: .leftAnkle,
                           minRatio: 0.75, cue: "TURN SIDE-ON", fallbackReferenceRatio: 0.72),
        ]
    )

    // ── SHOULDER PRESS ────────────────────────────────────────────────────────
    //
    // repMetric: lineVsVertical(shoulder→elbow) on bestSide.
    //   Angle of the upper arm from vertical. 0° = arm straight up overhead,
    //   90° = arm horizontal at shoulder height.
    //
    //   DIRECTION: the angle DECREASES as arms press overhead — matches the
    //   engine's standard direction (metric drops during rep, rises on return).
    //
    //   The elbow jointAngle (90°→165°) also tracks the press but INCREASES —
    //   wrong direction without a complement/invert Metric case. Not used here.
    //
    //   Works from FRONT or SIDE: bestSide picks the more-visible arm.
    //
    // Thresholds:
    //   topAngle 84° — upper arm near-horizontal at shoulder height (≈80–88°)
    //   repEnterThreshold 68° — arm is 22° above horizontal, press beginning
    //   repExitThreshold 72° — arm has returned to 18° above horizontal (~shoulder height)
    //   goodROMThreshold 20° — must press arm to within 20° of vertical (lockout)
    //
    // TUNE via per-frame NSLog: "[Engine] [shoulderPress] frame: metric=X.X phase=..."
    //   arms at shoulder height  ≈ 82–88°
    //   fully pressed overhead   ≈ 0–15°
    //
    // Form checks:
    //   lean_back (priority 4): torso angle from vertical. Overrides "PRESS HIGHER"
    //     via FORM_OVERRIDE_ROM_PRIORITY. TUNE: "lean_back=X.X[FAIL/ok]" in rep NSLog.
    //     Upright ≈ 3–8°; visible arch ≈ 20°+.
    //
    //   lower_more (disabled): rep exit threshold (72°) enforces return to shoulder
    //     height implicitly — the rep doesn't complete until the arm reaches 72°.
    //     An explicit post-rep form check needs evaluateAt: .atReturn, which the
    //     framework doesn't have. throughoutMax is always ≈ repExitThreshold, so
    //     any threshold above it never fires and any threshold below always fires.
    //     Framework gap: no "at-return" evaluateAt phase exists.
    //
    // CONFIG ONLY — zero engine or Metric.swift changes needed.

    static let shoulderPress = ExerciseDefinition(
        id:          "shoulderPress",
        displayName: "Shoulder Press",

        repMetric: .bestSide(
            left:  .lineVsVertical(from: .leftShoulder,  to: .leftElbow),
            right: .lineVsVertical(from: .rightShoulder, to: .rightElbow),
            leftJoints:  [.leftShoulder, .leftElbow],
            rightJoints: [.rightShoulder, .rightElbow]
        ),

        topAngle:           84,
        repEnterThreshold:  68,    // arm 22° above horizontal — press has begun
        repExitThreshold:   72,    // arm back to 18° above horizontal — rep done
        goodROMThreshold:   20,    // must reach within 20° of vertical overhead
        insufficientROMCue: "PRESS HIGHER",

        formChecks: [

            // Torso lean-back: hip→shoulder angle from vertical.
            // Priority 4 → overrides "PRESS HIGHER" via FORM_OVERRIDE_ROM_PRIORITY.
            // TUNE: "lean_back=X.X" in rep NSLog. Upright: 3–8°; arching: 20°+.
            FormCheck(
                id:         "lean_back",
                cue:        "STAY UPRIGHT",
                metric:     .average(
                    .lineVsVertical(from: .leftHip,  to: .leftShoulder),
                    .lineVsVertical(from: .rightHip, to: .rightShoulder)
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(20),
                priority:   4,
                enabled:    true
            ),

            // "LOWER MORE" — disabled; repExitThreshold enforces return to shoulder
            // height. Framework gap: throughoutMax is always clipped at repExitThreshold,
            // so no threshold can distinguish "returned far enough" from "barely met exit."
            // Enable if a future engine adds evaluateAt: .atReturn.
            FormCheck(
                id:         "lower_more",
                cue:        "LOWER MORE",
                metric:     .bestSide(
                    left:  .lineVsVertical(from: .leftShoulder,  to: .leftElbow),
                    right: .lineVsVertical(from: .rightShoulder, to: .rightElbow),
                    leftJoints:  [.leftShoulder, .leftElbow],
                    rightJoints: [.rightShoulder, .rightElbow]
                ),
                evaluateAt: .throughoutMax,
                condition:  .lessThan(80),    // always true with exitThreshold=72 — disabled
                priority:   2,
                enabled:    false
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  65,    // upper arm at most 25° above horizontal (shoulder level)
            readyAngleMax:  90,    // upper arm at or below horizontal
            requiredJoints: [.leftShoulder, .leftElbow, .leftHip,
                              .rightShoulder, .rightElbow, .rightHip],
            minConfidence:  0.30,
            stableDuration: 0.8
        ),

        cameraSetup: CameraSetupConfig(
            setupInstruction: "Face the camera — arms and shoulders in frame",
            requiredJoints: [
                .leftShoulder, .leftElbow, .leftWrist,
                .rightShoulder, .rightElbow, .rightWrist,
            ]
        ),

        calibration: CalibrationConfig(
            repsNeeded:    2,
            enterFraction: 0.50,
            exitFraction:  0.25
        ),

        minRepInterval: 0.5,

        planarityChecks: [
            // Shoulder press: upper arm both sides must be in-plane.
            // Fails when user stands at an angle to the camera instead of facing it.
            PlanarityCheck(id: "uarm_l", jointA: .leftShoulder,  jointB: .leftElbow,
                           minRatio: 0.75, cue: "TURN SIDE-ON", fallbackReferenceRatio: 0.64),
            PlanarityCheck(id: "uarm_r", jointA: .rightShoulder, jointB: .rightElbow,
                           minRatio: 0.75, cue: "TURN SIDE-ON", fallbackReferenceRatio: 0.64),
        ]
    )
}
