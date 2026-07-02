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
        goodROMThreshold:    60,  // relaxed for front-view elbow measurement (was 50)
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
                condition:  .greaterThan(20),  // was 15; front-view measures lateral sway
                priority:   3,
                enabled:    true
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  140,  // was 155; front-view arms-at-sides angle is smaller
            readyAngleMax:  190,
            requiredJoints: [.leftShoulder, .leftElbow, .leftWrist,
                              .rightShoulder, .rightElbow, .rightWrist],
            minConfidence:  0.30,
            stableDuration: 0.3   // was 1.0; short gate so first rep isn't missed
        ),

        cameraSetup: CameraSetupConfig(
            setupInstruction: "Face the camera — stand back so both arms are fully in frame",
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
    // Primary: shoulder-vs-elbow vertical position (Vision Y).
    //   UP position:   shoulderY > elbowY → gap positive (shoulder above elbow)
    //   DOWN position: shoulderY ≈ elbowY → gap near zero or negative
    //
    // ALL thresholds are in Vision units (0–1). Tune on-device:
    //   read "[Engine] [pushup] frame: gap=X.XXXX" NSLog at ~1fps.
    //   Current starting values assume camera flat on floor, person side-on
    //   with ~30–50% of frame height from floor to shoulder.
    //
    // Form checks use .verticalGap (camera-side-agnostic):
    //   hip_sag:  verticalGap(shoulder, hip) > threshold → shoulder much higher than hip
    //   hip_pike: verticalGap(hip, shoulder) > threshold → hip much higher than shoulder
    //   Four checks (L+R each) so whichever side is visible contributes.
    //
    // Priority: hip_sag (2) > hip_pike (1).
    // Tune thresholds from rep log: "[Engine] [pushup] Rep #N ... hip_sag_l=X.XX"

    static let pushup = ExerciseDefinition(
        id:          "pushup",
        displayName: "Push-up",

        // Vision Y: 0=bottom, 1=top. UP = shoulder above elbow = positive gap.
        // Picks whichever side has better joint confidence (side-on: one side faces camera).
        primaryAngle: .verticalGapBestSide(
            leftUpper:  .leftShoulder,  leftLower:  .leftElbow,
            rightUpper: .rightShoulder, rightLower: .rightElbow
        ),

        // TUNE: read "[Engine] [pushup] frame:" NSLog before relying on these.
        topAngle:           0.12,   // approximate gap in UP position
        repEnterThreshold:  0.05,   // shoulder drops within 5% of elbow → going down
        repExitThreshold:   0.09,   // shoulder rises back to 9% above elbow → rep done
        goodROMThreshold:   0.02,   // shoulder must reach within 2% of elbow for full depth
        insufficientROMCue: "GO LOWER",

        formChecks: [
            // Hip sag — left side: shoulder much higher than hip = hip dropped.
            // verticalGap(shoulder, hip) > 0.08 → hip sagging > 8% below shoulder.
            // TUNE on-device — returns nil if left joints not visible (right-side-to-camera).
            FormCheck(
                id:         "hip_sag_l",
                cue:        "HIPS UP",
                metric:     .verticalGap(upper: .leftShoulder, lower: .leftHip),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.08),
                priority:   2,
                enabled:    true
            ),
            // Hip pike — left side: hip higher than shoulder = butt in air.
            FormCheck(
                id:         "hip_pike_l",
                cue:        "LOWER HIPS",
                metric:     .verticalGap(upper: .leftHip, lower: .leftShoulder),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.08),
                priority:   1,
                enabled:    true
            ),
            // Hip sag — right side (fires when right shoulder/hip are the visible pair).
            FormCheck(
                id:         "hip_sag_r",
                cue:        "HIPS UP",
                metric:     .verticalGap(upper: .rightShoulder, lower: .rightHip),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.08),
                priority:   2,
                enabled:    true
            ),
            // Hip pike — right side.
            FormCheck(
                id:         "hip_pike_r",
                cue:        "LOWER HIPS",
                metric:     .verticalGap(upper: .rightHip, lower: .rightShoulder),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.08),
                priority:   1,
                enabled:    true
            ),
        ],

        // Ready gate: shoulder must be clearly above elbow (in UP push-up position).
        // TUNE: readyAngleMin may need raising if gate opens too easily while standing.
        readyGate: ReadyGateConfig(
            readyAngleMin:  0.04,   // shoulder at least 4% above elbow = in UP position
            readyAngleMax:  0.50,   // sanity cap
            requiredJoints: [.leftShoulder, .leftElbow, .rightShoulder, .rightElbow],
            minConfidence:  0.15,   // low enough to accept Vision's inferred hidden side
            stableDuration: 0.5
        ),

        // Camera setup: upper body + hips, either side to camera.
        // Left-side joints in requiredJoints, right-side in requiredJointsAlt —
        // passes when EITHER set is fully in frame so the user can face either way.
        cameraSetup: CameraSetupConfig(
            setupInstruction: "Place your phone on the floor a couple feet to your side, camera facing you. Get in push-up position so your head, shoulders, arms and hips are in view.",
            requiredJoints: [
                Joint.leftShoulder, .leftElbow, .leftWrist, .leftHip,
            ],
            requiredJointsAlt: [
                Joint.rightShoulder, .rightElbow, .rightWrist, .rightHip,
            ]
        ),

        minRepInterval: 0.8
    )
}
