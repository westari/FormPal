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
            // Priority 4 → overrides "CURL HIGHER" ROM cue via FORM_OVERRIDE_ROM_PRIORITY.
            // When arm drifts sideways, the 2D-projected elbow angle looks smaller than it
            // really is, making ROM appear to fail — but drift is the actual fault, not height.
            // TUNE: read "[Engine] [curl] Rep #N elbow_drift=X.XXX[FAIL/ok]" on-device.
            //   Proper curl with elbow pinned:    expect ~5–15°
            //   Elbow drifting forward/sideways:  expect ~25–40°
            //   Threshold 30° = starting point; tighten to 25 if misses, loosen to 35 if noisy.
            FormCheck(
                id:         "elbow_drift",
                cue:        "KEEP ELBOW STILL",
                metric:     .biLateralLineFromVertical(
                    leftFrom:  .leftShoulder,  leftTo:  .leftElbow,
                    rightFrom: .rightShoulder, rightTo: .rightElbow
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(30),
                priority:   4,   // ← was 2; now overrides ROM cue
                enabled:    true
            ),
            // Lean-back / momentum: torso (hip→shoulder) angle from vertical.
            // Any significant lean = using body swing instead of bicep.
            // Priority 5 → overrides "CURL HIGHER" and elbow_drift.
            // TUNE: read "lean_back=X.XXX" in rep NSLog.
            //   Standing still:      expect ~2–8°
            //   Leaning back hard:   expect ~18–30°
            //   Threshold 20° = starting point.
            FormCheck(
                id:         "lean_back",
                cue:        "STOP SWINGING",
                metric:     .biLateralLineFromVertical(
                    leftFrom:  .leftHip,  leftTo:  .leftShoulder,
                    rightFrom: .rightHip, rightTo: .rightShoulder
                ),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(20),
                priority:   5,   // ← was 3; now overrides ROM cue and elbow_drift
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
    // Primary: shoulder-vs-elbow vertical gap (Vision Y, 0=bottom 1=top).
    //   UP position:   shoulder above elbow → gap > 0 (≈ 0.08–0.15)
    //   BOTTOM of rep: shoulder near elbow  → gap ≈ 0 or slightly negative
    //
    // ALL thresholds are Vision units (0–1), NOT degrees.
    // Tune on-device: read "[Engine] [pushup] frame: gap=X.XXXX" NSLog at ~1fps.
    //
    // Form checks — two layers:
    //
    //   Layer 1 (verticalGap, camera-side-agnostic):
    //     hip_sag_l/r:  shoulder.y − hip.y > threshold → hip dropped below shoulder level
    //     hip_pike_l/r: hip.y − shoulder.y > threshold → hip above shoulder level
    //     Only the visible side fires (low-confidence joints return nil → check skips).
    //     TUNE: read "hip_sag_l=X.XXX" / "hip_pike_l=X.XXX" from rep NSLog.
    //       Good plank: expect 0.00–0.08 (some natural shoulder-hip offset).
    //       Real sag:   expect 0.12–0.20. Real pike: expect 0.10–0.16.
    //       Thresholds 0.12 / 0.10 are conservative starting points.
    //
    //   Layer 2 (signedDeviationFromLine, shoulder→ankle, more precise):
    //     body_align_l/r: perpendicular deviation of hip from the shoulder→ankle line.
    //     Negative = hip sags below the line; positive = hip pikes above it.
    //     Sign direction depends on which end of the body faces camera — verify with NSLog.
    //     These are disabled by default; enable after confirming sign on device.
    //     TUNE: read "body_align_l=X.XXX" from rep NSLog; set threshold to ~2× good-form value.
    //
    // Priority: hip_sag (2) > hip_pike (1).

    static let pushup = ExerciseDefinition(
        id:          "pushup",
        displayName: "Push-up",

        primaryAngle: .verticalGapBestSide(
            leftUpper:  .leftShoulder,  leftLower:  .leftElbow,
            rightUpper: .rightShoulder, rightLower: .rightElbow
        ),

        // TUNE: read "[Engine] [pushup] frame: gap=X.XXXX" NSLog to calibrate.
        topAngle:           0.12,   // shoulder gap in UP position
        repEnterThreshold:  0.05,   // going down when gap < 5%
        repExitThreshold:   0.09,   // rep complete when gap > 9%
        goodROMThreshold:   0.02,   // shoulder must reach within 2% of elbow for full depth
        insufficientROMCue: "GO LOWER",

        formChecks: [

            // ── Layer 1: verticalGap — camera-side-agnostic, fires when hip is
            //    clearly out of line with the shoulder in the vertical axis.
            //    Threshold raised from 0.08 → 0.12/0.10: the old value fired on EVERY rep
            //    because the shoulder is naturally a few % higher than the hip in the frame.
            //    TUNE: "hip_sag_l=X.XXX" in rep NSLog. Good form ≈ 0.03–0.08; sag ≈ 0.13+.

            FormCheck(
                id:         "hip_sag_l",
                cue:        "HIPS UP",
                metric:     .verticalGap(upper: .leftShoulder, lower: .leftHip),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.12),   // was 0.08 — too tight, fired on good form
                priority:   2,
                enabled:    true
            ),
            FormCheck(
                id:         "hip_pike_l",
                cue:        "LOWER HIPS",
                metric:     .verticalGap(upper: .leftHip, lower: .leftShoulder),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.10),   // was 0.08
                priority:   1,
                enabled:    true
            ),
            FormCheck(
                id:         "hip_sag_r",
                cue:        "HIPS UP",
                metric:     .verticalGap(upper: .rightShoulder, lower: .rightHip),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.12),   // was 0.08
                priority:   2,
                enabled:    true
            ),
            FormCheck(
                id:         "hip_pike_r",
                cue:        "LOWER HIPS",
                metric:     .verticalGap(upper: .rightHip, lower: .rightShoulder),
                evaluateAt: .throughoutMax,
                condition:  .greaterThan(0.10),   // was 0.08
                priority:   1,
                enabled:    true
            ),

            // ── Layer 2: signedDeviationFromLine — measures hip offset from the
            //    shoulder→ankle line directly. More accurate than verticalGap because
            //    it accounts for the angle of the body in the frame, not just Y-coords.
            //
            //    Sign convention (camera on person's LEFT, head→feet = left→right in frame):
            //      negative = hip BELOW shoulder-ankle line → SAG → "HIPS UP"
            //      positive = hip ABOVE line → PIKE → "LOWER HIPS"
            //    If camera is on the RIGHT side, the sign flips — verify via NSLog first.
            //    Enable these after confirming sign on-device; disable layer-1 checks once tuned.
            //
            //    TUNE: read "body_align_l=X.XXX" in rep NSLog.
            //      Good plank: expect −0.02 to +0.02.
            //      Sag threshold: set to ~2× good-form negative value (e.g. −0.05).
            //      Pike threshold: same but positive side.

            FormCheck(
                id:         "body_align_l",
                cue:        "HIPS UP",
                metric:     .signedDeviationFromLine(
                    point:    .leftHip,
                    lineFrom: .leftShoulder,
                    lineTo:   .leftAnkle
                ),
                evaluateAt: .throughoutMin,         // min = most-negative = worst sag
                condition:  .lessThan(-0.05),       // TUNE after checking NSLog sign
                priority:   3,
                enabled:    false   // ← enable after verifying sign on-device
            ),
            FormCheck(
                id:         "body_pike_l",
                cue:        "LOWER HIPS",
                metric:     .signedDeviationFromLine(
                    point:    .leftHip,
                    lineFrom: .leftShoulder,
                    lineTo:   .leftAnkle
                ),
                evaluateAt: .throughoutMax,         // max = most-positive = worst pike
                condition:  .greaterThan(0.05),     // TUNE after checking NSLog sign
                priority:   2,
                enabled:    false   // ← enable after verifying sign on-device
            ),
            FormCheck(
                id:         "body_align_r",
                cue:        "HIPS UP",
                metric:     .signedDeviationFromLine(
                    point:    .rightHip,
                    lineFrom: .rightShoulder,
                    lineTo:   .rightAnkle
                ),
                evaluateAt: .throughoutMax,         // sign flips on right side: positive = sag
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
                evaluateAt: .throughoutMin,         // sign flips on right side: negative = pike
                condition:  .lessThan(-0.05),
                priority:   2,
                enabled:    false
            ),
        ],

        readyGate: ReadyGateConfig(
            readyAngleMin:  0.04,   // shoulder at least 4% above elbow = UP position
            readyAngleMax:  0.50,
            requiredJoints: [.leftShoulder, .leftElbow, .rightShoulder, .rightElbow],
            minConfidence:  0.15,
            stableDuration: 0.5
        ),

        // Camera setup: full body in frame (shoulder to ankle), either side to camera.
        // Ankles are now required so the body_align layer-2 checks have valid data.
        // Left joints OR right joints must all be visible — user can face either direction.
        // Instruction text is kept short here; the display string is in formcheck.tsx.
        cameraSetup: CameraSetupConfig(
            setupInstruction: "Phone on the floor to your side — full body in view",
            requiredJoints: [
                Joint.leftShoulder, .leftElbow, .leftHip, .leftAnkle,
            ],
            requiredJointsAlt: [
                Joint.rightShoulder, .rightElbow, .rightHip, .rightAnkle,
            ]
        ),

        minRepInterval: 0.8
    )
}
