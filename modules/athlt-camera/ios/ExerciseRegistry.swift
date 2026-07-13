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
        case "squat":  return squat
        case "curl":   return curl
        case "pushup": return pushup
        case "lunge":  return lunge
        default:       return nil
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

        minRepInterval: 0.5
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
    //   full_extension: didn't fully extend arm (throughoutMax < 140°) — priority 1
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
            // throughoutMax of the rep metric = peak extension (most-straightened) reached.
            FormCheck(
                id:         "full_extension",
                cue:        "FULL EXTENSION",
                metric:     .minimum(
                    .jointAngle(a: .leftShoulder,  pivot: .leftElbow,  c: .leftWrist),
                    .jointAngle(a: .rightShoulder, pivot: .rightElbow, c: .rightWrist)
                ),
                evaluateAt: .throughoutMax,
                condition:  .lessThan(140),
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

        minRepInterval: 0.5
    )

    // ── PUSH-UP ───────────────────────────────────────────────────────────────
    //
    // repMetric: shoulder-vs-elbow vertical gap on best-visible side, normalised
    // by torso length (shoulder→hip). Body-scale independent of camera distance.
    //   UP position:   shoulder above elbow → gap/torso > 0 (≈ 0.27–0.50)
    //   BOTTOM of rep: shoulder near elbow  → gap/torso ≈ 0 or negative
    //
    // ALL thresholds are torso-relative (normalised). Tune via NSLog at ~1fps.
    // Old raw Vision-unit values noted in comments (raw ÷ typical torso ~0.30).
    //
    // No calibration — normalised thresholds are stable across users and distances.
    //
    // Form checks — two layers:
    //   Layer 1 (normalizedVerticalGap, camera-side-agnostic):
    //     hip_sag_l/r:  (shoulder.y − hip.y) / torso > threshold
    //     hip_pike_l/r: (hip.y − shoulder.y) / torso > threshold
    //     TUNE: "hip_sag_l=X.XXX" in rep NSLog. Flat plank ≈ 0.0–0.10; sag ≈ 0.40+.
    //
    //   Layer 2 (signedDeviationFromLine — more precise, camera-side-dependent):
    //     Disabled by default. Enable after confirming sign direction on device.
    //     TUNE: read "body_align_l=X.XXX" in rep NSLog.
    //
    // Priority: hip_sag (2) > hip_pike (1).

    static let pushup = ExerciseDefinition(
        id:          "pushup",
        displayName: "Push-up",

        repMetric: .bestSide(
            left:        .normalizedVerticalGap(upper: .leftShoulder,  lower: .leftElbow),
            right:       .normalizedVerticalGap(upper: .rightShoulder, lower: .rightElbow),
            leftJoints:  [.leftShoulder,  .leftElbow],
            rightJoints: [.rightShoulder, .rightElbow]
        ),

        topAngle:           0.40,    // was 0.12 (raw Vision units)
        repEnterThreshold:  0.17,    // was 0.05 (raw Vision units)
        repExitThreshold:   0.30,    // was 0.09 (raw Vision units)
        goodROMThreshold:   0.07,    // was 0.02 (raw Vision units)
        insufficientROMCue: "GO LOWER",

        formChecks: [

            // ── Layer 1: normalizedVerticalGap — camera-side-agnostic ────────
            FormCheck(
                id:         "hip_sag_l",
                cue:        "HIPS UP",
                metric:     .normalizedVerticalGap(upper: .leftShoulder, lower: .leftHip),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.40),    // was 0.12 (raw Vision units)
                priority:   2,
                enabled:    true
            ),
            FormCheck(
                id:         "hip_pike_l",
                cue:        "LOWER HIPS",
                metric:     .normalizedVerticalGap(upper: .leftHip, lower: .leftShoulder),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.33),    // was 0.10 (raw Vision units)
                priority:   1,
                enabled:    true
            ),
            FormCheck(
                id:         "hip_sag_r",
                cue:        "HIPS UP",
                metric:     .normalizedVerticalGap(upper: .rightShoulder, lower: .rightHip),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.40),    // was 0.12 (raw Vision units)
                priority:   2,
                enabled:    true
            ),
            FormCheck(
                id:         "hip_pike_r",
                cue:        "LOWER HIPS",
                metric:     .normalizedVerticalGap(upper: .rightHip, lower: .rightShoulder),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.33),    // was 0.10 (raw Vision units)
                priority:   1,
                enabled:    true
            ),

            // ── Layer 2: signedDeviationFromLine — disable until sign verified ──
            //
            // Sign convention (camera on person's LEFT, head→feet = left→right in frame):
            //   negative = hip BELOW shoulder-ankle line → SAG → "HIPS UP"
            //   positive = hip ABOVE line → PIKE → "LOWER HIPS"
            // Sign FLIPS if camera is on the RIGHT — verify via NSLog first.

            FormCheck(
                id:         "body_align_l",
                cue:        "HIPS UP",
                metric:     .signedDeviationFromLine(
                    point:    .leftHip,
                    lineFrom: .leftShoulder,
                    lineTo:   .leftAnkle
                ),
                evaluateAt: .throughoutMin,
                condition:  .lessThan(-0.05),
                priority:   3,
                enabled:    false
            ),
            FormCheck(
                id:         "body_pike_l",
                cue:        "LOWER HIPS",
                metric:     .signedDeviationFromLine(
                    point:    .leftHip,
                    lineFrom: .leftShoulder,
                    lineTo:   .leftAnkle
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.05),
                priority:   2,
                enabled:    false
            ),
            FormCheck(
                id:         "body_align_r",
                cue:        "HIPS UP",
                metric:     .signedDeviationFromLine(
                    point:    .rightHip,
                    lineFrom: .rightShoulder,
                    lineTo:   .rightAnkle
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.05),
                priority:   3,
                enabled:    false
            ),
            FormCheck(
                id:         "body_pike_r",
                cue:        "LOWER HIPS",
                metric:     .signedDeviationFromLine(
                    point:    .rightHip,
                    lineFrom: .rightShoulder,
                    lineTo:   .rightAnkle
                ),
                evaluateAt: .throughoutMin,
                condition:  .lessThan(-0.05),
                priority:   2,
                enabled:    false
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  0.13,    // was 0.04 (raw Vision units) — arms extended at top
            readyAngleMax:  1.50,    // was 0.50 (raw Vision units)
            requiredJoints: [.leftShoulder, .leftElbow, .rightShoulder, .rightElbow],
            minConfidence:  0.15,
            stableDuration: 0.5
        ),

        cameraSetup: CameraSetupConfig(
            setupInstruction: "Phone on the floor to your side — full body in view",
            requiredJoints: [
                Joint.leftShoulder, .leftElbow, .leftHip, .leftAnkle,
            ],
            requiredJointsAlt: [
                Joint.rightShoulder, .rightElbow, .rightHip, .rightAnkle,
            ]
        ),

        calibration: nil,   // normalised thresholds are stable across users and camera distances

        minRepInterval: 0.8
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

        minRepInterval: 0.5
    )
}
