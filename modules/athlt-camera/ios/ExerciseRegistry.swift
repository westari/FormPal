import Foundation

// ─── Exercise registry ────────────────────────────────────────────────────────
//
// Adding a new exercise = adding ONE ExerciseDefinition here.
// No engine code changes needed — ever.
//
// FORM-CHECK CONVENTION: every exercise defines its FULL fault set as FormChecks.
// The engine reports the single highest-priority failing check per rep.
// Priority is sorted descending — highest number wins over lower numbers.
// See ExerciseDefinition.swift formChecks comment for full convention rules.

enum ExerciseRegistry {

    static func definition(for id: String) -> ExerciseDefinition? {
        switch id {
        case "squat":  return squat
        case "curl":   return curl
        case "pushup": return pushup
        default:       return nil
        }
    }

    // ── SQUAT ─────────────────────────────────────────────────────────────────
    //
    // Primary: hip → knee → ankle, averaged across both legs.
    // Thresholds preserved from SquatAnalyzer on-device tuning:
    //   intermediateEntryAngle: 150° → repEnterThreshold
    //   topExitThreshold:       155° → repExitThreshold (hysteresis)
    //   bottomThreshold:        100° → goodROMThreshold
    //   backLeanThreshold:       25° → back_lean condition
    //   readyStandingDuration:    1.0s
    //
    // Form checks (all well-tuned from on-device data):
    //   back_lean:  CHEST UP when torso-vertical angle > 25°
    //   heel_rise:  defined-but-disabled (ankle keypoints too noisy at typical distance)
    //
    // Camera setup: side view, full body in frame.

    static let squat = ExerciseDefinition(
        id:          "squat",
        displayName: "Squat",

        primaryAngle: .averageBothSides(
            left:  JointTriplet(a: .leftHip,  pivot: .leftKnee,  c: .leftAnkle),
            right: JointTriplet(a: .rightHip, pivot: .rightKnee, c: .rightAnkle)
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
                metric:     .biLateralLineFromVertical(
                    leftFrom: .leftHip,   leftTo: .leftShoulder,
                    rightFrom: .rightHip, rightTo: .rightShoulder
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(25),
                priority:   1,
                enabled:    true
            ),
            // Heel rise — defined but disabled; ankle confidence too low at typical distance.
            FormCheck(
                id:         "heel_rise",
                cue:        "KEEP HEELS DOWN",
                metric:     .biLateralLineFromVertical(
                    leftFrom: .leftAnkle,   leftTo: .leftKnee,
                    rightFrom: .rightAnkle, rightTo: .rightKnee
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(20),
                priority:   2,
                enabled:    false
            ),
            // Knee-over-toes: defined for future tuning, currently disabled.
            // Measure angle at knee (hip-knee-ankle), should not exceed ~150° at depth.
            FormCheck(
                id:         "knee_cave",
                cue:        "KNEES OUT",
                metric:     .biLateralLineFromVertical(
                    leftFrom: .leftHip,   leftTo: .leftKnee,
                    rightFrom: .rightHip, rightTo: .rightKnee
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

        minRepInterval: 0.5
    )

    // ── CURL ──────────────────────────────────────────────────────────────────
    //
    // Primary: shoulder → elbow → wrist, most-flexed arm.
    // Uses min of both elbows so single-arm curls are tracked without interference.
    //
    // Thresholds from CurlAnalyzer:
    //   entryAngle:       145° → repEnterThreshold
    //   exitThreshold:    145° → repExitThreshold (no hysteresis — same as original)
    //   fullCurlThreshold: 50° → goodROMThreshold
    //   minExtensionAngle: 140° → full_extension condition
    //
    // Form checks (ALL ON, heuristic thresholds — tune on-device via rep NSLog):
    //   full_extension: didn't return to straight arm (throughoutMax < 140°)
    //   elbow_drift:    upper arm drifted forward from vertical (throughoutMax > 30°)
    //   lean_back:      torso leaned back using momentum (throughoutMax > 15°)
    //
    // Priority order (highest wins): lean_back (3) > elbow_drift (2) > full_extension (1)
    //
    // Thresholds needing on-device tuning:
    //   elbow_drift threshold (30°): look for "[Engine] [curl] Rep #N ... elbow_drift=X.X[ok/FAIL]"
    //   lean_back threshold (15°):   same log, lean_back=X.X

    static let curl = ExerciseDefinition(
        id:          "curl",
        displayName: "Bicep Curl",

        primaryAngle: .mostFlexed(
            left:  JointTriplet(a: .leftShoulder,  pivot: .leftElbow,  c: .leftWrist),
            right: JointTriplet(a: .rightShoulder, pivot: .rightElbow, c: .rightWrist)
        ),

        topAngle:           160,
        repEnterThreshold:  145,
        repExitThreshold:   145,
        goodROMThreshold:    50,
        insufficientROMCue: "CURL HIGHER",

        formChecks: [
            // ROM: didn't fully extend arm at the bottom of the movement.
            // throughoutMax of primary angle = peak extension reached during the rep.
            FormCheck(
                id:         "full_extension",
                cue:        "FULL EXTENSION",
                metric:     .primaryAngle,
                evaluateAt: .throughoutMax,
                condition:  .lessThan(140),
                priority:   1,
                enabled:    true
            ),
            // Elbow drift: upper arm should stay vertical; shoulder→elbow angle from vertical
            // increases when elbow swings forward. throughoutMax captures worst drift.
            // Heuristic: 30° — tune upward if too many false positives, down if too many misses.
            FormCheck(
                id:         "elbow_drift",
                cue:        "KEEP ELBOW STILL",
                metric:     .biLateralLineFromVertical(
                    leftFrom:  .leftShoulder,  leftTo:  .leftElbow,
                    rightFrom: .rightShoulder, rightTo: .rightElbow
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(30),
                priority:   2,
                enabled:    true
            ),
            // Lean-back / momentum: torso (hip→shoulder) angle from vertical.
            // Any significant lean = using body swing instead of bicep.
            // Tighter than squat's 25° — curls should have zero torso deviation.
            // Heuristic: 15° — tune on-device.
            FormCheck(
                id:         "lean_back",
                cue:        "STOP SWINGING",
                metric:     .biLateralLineFromVertical(
                    leftFrom:  .leftHip,  leftTo:  .leftShoulder,
                    rightFrom: .rightHip, rightTo: .rightShoulder
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(15),
                priority:   3,
                enabled:    true
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  155,
            readyAngleMax:  190,
            requiredJoints: [.leftShoulder, .leftElbow, .leftWrist,
                              .rightShoulder, .rightElbow, .rightWrist],
            minConfidence:  0.30,
            stableDuration: 1.0
        ),

        cameraSetup: CameraSetupConfig(
            setupInstruction: "Stand sideways to the camera — upper body in frame",
            requiredJoints: [
                .leftShoulder, .rightShoulder,
                .leftElbow,    .rightElbow,
                .leftWrist,    .rightWrist,
            ]
        ),

        minRepInterval: 0.5
    )

    // ── PUSH-UP ───────────────────────────────────────────────────────────────
    //
    // Primary: shoulder → elbow → wrist, most-flexed arm.
    // Thresholds are heuristic starting points — tune on-device via NSLog output.
    //
    // Form checks:
    //   hip_sag:   hips drop below the shoulder-hip-ankle line → "HIPS UP"
    //   hip_pike:  hips rise above the line → "LOWER HIPS"
    //   elbow_flare: defined-but-disabled (noisy from side view)
    //
    // Priority: hip_sag (2) > hip_pike (1) — sag is more injury-prone, wins if both fire.
    //
    // SIGN CONVENTION WARNING for hip_sag / hip_pike:
    //   signedDeviationFromLine positive = hip LEFT of shoulder→ankle direction.
    //   Expected with camera on person's left side:
    //     sag → negative (hip.lessThan(-0.05)), pike → positive (hip.greaterThan(0.05))
    //   If your NSLog shows sag as positive, swap the threshold signs.
    //   Tune thresholds from rep log: "[Engine] [pushup] Rep #N ... hip_sag=X.XX"

    static let pushup = ExerciseDefinition(
        id:          "pushup",
        displayName: "Push-up",

        primaryAngle: .mostFlexed(
            left:  JointTriplet(a: .leftShoulder,  pivot: .leftElbow,  c: .leftWrist),
            right: JointTriplet(a: .rightShoulder, pivot: .rightElbow, c: .rightWrist)
        ),

        topAngle:           160,
        repEnterThreshold:  120,
        repExitThreshold:   150,
        goodROMThreshold:    90,
        insufficientROMCue: "GO LOWER",

        formChecks: [
            // Hip pike: hips rise above shoulder-ankle line.
            // throughoutMax catches worst-case upward deviation during the rep.
            // Heuristic: 0.05 Vision units — tune on-device.
            FormCheck(
                id:         "hip_pike",
                cue:        "LOWER HIPS",
                metric:     .signedDeviationFromLine(
                    point:    .leftHip,
                    lineFrom: .leftShoulder,
                    lineTo:   .leftAnkle
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.05),
                priority:   1,
                enabled:    true
            ),
            // Hip sag: hips drop below shoulder-ankle line.
            // throughoutMin catches worst-case downward deviation.
            // Condition: value < -0.05 (negative = below line, per sign convention above).
            FormCheck(
                id:         "hip_sag",
                cue:        "HIPS UP",
                metric:     .signedDeviationFromLine(
                    point:    .leftHip,
                    lineFrom: .leftShoulder,
                    lineTo:   .leftAnkle
                ),
                evaluateAt: .throughoutMin,
                condition:  .lessThan(-0.05),
                priority:   2,
                enabled:    true
            ),
            // Elbow flare: disabled — hard to measure reliably from side view.
            FormCheck(
                id:         "elbow_flare",
                cue:        "TUCK YOUR ELBOWS",
                metric:     .lineFromVertical(from: .leftShoulder, to: .leftElbow),
                evaluateAt: .atBottom,
                condition:  .greaterThan(40),
                priority:   3,
                enabled:    false
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  145,
            readyAngleMax:  190,
            requiredJoints: [.leftShoulder, .leftElbow, .leftWrist, .leftHip, .leftAnkle,
                              .rightShoulder, .rightElbow, .rightWrist],
            minConfidence:  0.30,
            stableDuration: 1.0
        ),

        cameraSetup: CameraSetupConfig(
            setupInstruction: "Get into position sideways to the camera — full body in frame",
            requiredJoints: [
                .leftShoulder, .rightShoulder,
                .leftElbow,    .rightElbow,
                .leftWrist,    .rightWrist,
                .leftHip,      .rightHip,
                .leftAnkle,    .rightAnkle,
            ]
        ),

        minRepInterval: 0.5
    )
}
