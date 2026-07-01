import Foundation

// ─── Exercise registry ────────────────────────────────────────────────────────
//
// Adding a new exercise = adding ONE ExerciseDefinition here.
// No engine code changes needed — ever.

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
    // Thresholds preserved exactly from SquatAnalyzer on-device tuning:
    //   topThreshold:           160° (ready gate)
    //   intermediateEntryAngle: 150° → repEnterThreshold
    //   topExitThreshold:       155° → repExitThreshold (creates hysteresis)
    //   bottomThreshold:        100° → goodROMThreshold
    //   backLeanThreshold:       25° → form check condition
    //   minRepInterval:           0.5s
    //   readyStandingDuration:    1.0s
    //
    // NOTE: SquatAnalyzer also used hip-Y variance to detect walking; this simplified
    // ready gate uses joint visibility + angle stability only. In practice the user
    // stands still before pressing Start, making walking detection redundant.

    static let squat = ExerciseDefinition(
        id:          "squat",
        displayName: "Squat",

        primaryAngle: .averageBothSides(
            left:  JointTriplet(a: .leftHip,  pivot: .leftKnee,  c: .leftAnkle),
            right: JointTriplet(a: .rightHip, pivot: .rightKnee, c: .rightAnkle)
        ),

        topAngle:           160,
        repEnterThreshold:  150,   // preserved from SquatAnalyzer.intermediateEntryAngle
        repExitThreshold:   155,   // preserved from SquatAnalyzer.topExitThreshold
        goodROMThreshold:   100,   // preserved from SquatAnalyzer.bottomThreshold
        insufficientROMCue: "GO DEEPER",

        formChecks: [
            // Torso-vertical angle averaged across both sides.
            // On-device calibration: upright ≈ 3.7°, hunched ≈ 47.2°. 25° = reliable threshold.
            FormCheck(
                id:         "back_lean",
                cue:        "CHEST UP",
                metric:     .biLateralLineFromVertical(
                    leftFrom:  .leftHip,  leftTo:  .leftShoulder,
                    rightFrom: .rightHip, rightTo: .rightShoulder
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(25),
                priority:   1,
                enabled:    true
            ),
            // Heel rise — disabled (ankle keypoints too low-confidence at typical camera angles)
            FormCheck(
                id:         "heel_rise",
                cue:        "KEEP HEELS DOWN",
                metric:     .biLateralLineFromVertical(
                    leftFrom:  .leftAnkle,  leftTo:  .leftKnee,
                    rightFrom: .rightAnkle, rightTo: .rightKnee
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(20),
                priority:   2,
                enabled:    false   // noisy — leave defined for future tuning
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  155,
            readyAngleMax:  190,
            requiredJoints: [.leftHip, .leftKnee, .leftAnkle,
                              .rightHip, .rightKnee, .rightAnkle],
            minConfidence:  0.30,   // preserved from SquatAnalyzer.jointConfidenceMin
            stableDuration: 1.0     // preserved from SquatAnalyzer.readyStandingDuration
        ),

        cameraGuidance: CameraGuidanceConfig(
            expectedView: .side,
            cue: "POSITION CAMERA TO THE SIDE"
        ),

        minRepInterval: 0.5   // preserved from SquatAnalyzer.minRepInterval
    )

    // ── CURL ──────────────────────────────────────────────────────────────────
    //
    // Primary: shoulder → elbow → wrist, most-flexed arm.
    // Uses min of both elbows so single-arm curls are tracked correctly
    // without interference from the resting arm.
    //
    // Thresholds preserved exactly from CurlAnalyzer:
    //   topThreshold:    160° (ready gate)
    //   entryAngle:      145° → repEnterThreshold
    //   exitThreshold:   145° → repExitThreshold (no hysteresis — same as original)
    //   fullCurlThreshold: 50° → goodROMThreshold
    //   minExtensionAngle: 140° → full_extension check condition
    //   minRepInterval:    0.5s
    //   readyDuration:     1.0s
    //
    // NOTE: full_extension check condition (< 140°) is below exitThreshold (145°),
    // so the rep won't complete until ≥ 145°, meaning this check effectively
    // never fires — preserved exactly from original CurlAnalyzer behavior.

    static let curl = ExerciseDefinition(
        id:          "curl",
        displayName: "Bicep Curl",

        primaryAngle: .mostFlexed(
            left:  JointTriplet(a: .leftShoulder,  pivot: .leftElbow,  c: .leftWrist),
            right: JointTriplet(a: .rightShoulder, pivot: .rightElbow, c: .rightWrist)
        ),

        topAngle:           160,
        repEnterThreshold:  145,   // preserved from CurlAnalyzer.entryAngle
        repExitThreshold:   145,   // preserved from CurlAnalyzer.exitThreshold
        goodROMThreshold:    50,   // preserved from CurlAnalyzer.fullCurlThreshold
        insufficientROMCue: "CURL HIGHER",

        formChecks: [
            // Extension at top: track max primary angle during rep.
            // Since exitThreshold = 145° and this condition fires at < 140°,
            // the check effectively never fires — intentional; matches original.
            FormCheck(
                id:         "full_extension",
                cue:        "FULL EXTENSION",
                metric:     .primaryAngle,    // uses engine's tracked primary angle
                evaluateAt: .throughoutMax,
                condition:  .lessThan(140),   // preserved from CurlAnalyzer.minExtensionAngle
                priority:   1,
                enabled:    true
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  155,
            readyAngleMax:  190,
            requiredJoints: [.leftShoulder, .leftElbow, .leftWrist,
                              .rightShoulder, .rightElbow, .rightWrist],
            minConfidence:  0.30,   // preserved from CurlAnalyzer.jointConfidenceMin
            stableDuration: 1.0     // preserved from CurlAnalyzer.readyDuration
        ),

        cameraGuidance: CameraGuidanceConfig(
            expectedView: .side,
            cue: "POSITION CAMERA TO THE SIDE"
        ),

        minRepInterval: 0.5   // preserved from CurlAnalyzer.minRepInterval
    )

    // ── PUSH-UP ───────────────────────────────────────────────────────────────
    //
    // Primary: shoulder → elbow → wrist, most-flexed arm (both arms active simultaneously).
    // Arms extended at top ~160°, elbows ~80–90° at bottom.
    //
    // Thresholds are heuristic starting points — tune on-device via NSLog output:
    //   [Engine] [pushup] Rep #N peak=XX.X° ROM=Y ...
    //
    // Body alignment form check uses LEFT side joints — present your LEFT side
    // to the camera for the most accurate alignment feedback.
    // The deviation threshold (0.08 in Vision normalized units) is approximate;
    // tune by observing measured values in NSLog output.
    //
    // elbow_flare check is disabled pending on-device validation.

    static let pushup = ExerciseDefinition(
        id:          "pushup",
        displayName: "Push-up",

        primaryAngle: .mostFlexed(
            left:  JointTriplet(a: .leftShoulder,  pivot: .leftElbow,  c: .leftWrist),
            right: JointTriplet(a: .rightShoulder, pivot: .rightElbow, c: .rightWrist)
        ),

        topAngle:           160,   // arms-extended elbow angle at top position
        repEnterThreshold:  120,   // start counting when elbow bends past 120°
        repExitThreshold:   150,   // rep completes when elbow extends back past 150°
        goodROMThreshold:    90,   // elbow must reach ≤90° for full ROM
        insufficientROMCue: "GO LOWER",

        formChecks: [
            // Hip deviation from the shoulder–ankle line (body sag or pike).
            // Present LEFT side to camera for best accuracy.
            FormCheck(
                id:         "body_alignment",
                cue:        "KEEP BODY STRAIGHT",
                metric:     .deviationFromLine(
                    point:    .leftHip,
                    lineFrom: .leftShoulder,
                    lineTo:   .leftAnkle
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.08),  // Vision normalized units — tune on-device
                priority:   1,
                enabled:    true
            ),
            // Elbow flare — disabled until on-device validation confirms reliability
            FormCheck(
                id:         "elbow_flare",
                cue:        "TUCK YOUR ELBOWS",
                metric:     .lineFromVertical(from: .leftShoulder, to: .leftElbow),
                evaluateAt: .atBottom,
                condition:  .greaterThan(40),
                priority:   2,
                enabled:    false
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  145,   // elbow roughly straight in starting position
            readyAngleMax:  190,
            requiredJoints: [.leftShoulder, .leftElbow, .leftWrist, .leftHip, .leftAnkle,
                              .rightShoulder, .rightElbow, .rightWrist],
            minConfidence:  0.30,
            stableDuration: 1.0
        ),

        cameraGuidance: CameraGuidanceConfig(
            expectedView: .side,
            cue: "POSITION CAMERA TO THE SIDE"
        ),

        minRepInterval: 0.5
    )
}
