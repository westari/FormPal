import Foundation

// ─── Joint triplet ────────────────────────────────────────────────────────────

/// Three joints that define an angle: angle is measured AT `pivot`, formed by a–pivot–c.
struct JointTriplet {
    let a:     Joint
    let pivot: Joint
    let c:     Joint
}

// ─── Primary angle configuration ─────────────────────────────────────────────

enum PrimaryAngleConfig {
    /// Average both sides — best for bilateral movements (squat: both knees).
    case averageBothSides(left: JointTriplet, right: JointTriplet)

    /// Pick whichever side produces the SMALLER current angle (most-flexed).
    /// Best for single-limb exercises where the active arm/leg does more work (curls, pushups).
    case mostFlexed(left: JointTriplet, right: JointTriplet)

    /// Pick whichever side has the higher average joint confidence.
    /// Best when only one body side is in frame.
    case bestSide(left: JointTriplet, right: JointTriplet,
                  leftJoints: [Joint], rightJoints: [Joint])

    /// Vertical gap (upperJoint.y - lowerJoint.y) in Vision normalised units.
    /// y=0 = bottom of frame, y=1 = top. Positive = upper is higher.
    ///
    /// Picks whichever side (left/right) has better combined joint confidence —
    /// correct for side-on exercises where only one side faces the camera (push-up).
    ///
    /// Rep detection (all values in Vision units 0–1 — TUNE ON-DEVICE via NSLog):
    ///   topAngle           ≈ gap in UP position (shoulder above elbow)
    ///   repEnterThreshold  = gap drops below → going DOWN, rep starts
    ///   repExitThreshold   = gap rises above → rep complete
    ///   goodROMThreshold   = gap must reach BELOW this at bottom for full-depth rep
    case verticalGapBestSide(
        leftUpper:  Joint, leftLower:  Joint,
        rightUpper: Joint, rightLower: Joint
    )
}

// ─── Ready gate ───────────────────────────────────────────────────────────────

/// The stable starting position that must be held before counting begins.
struct ReadyGateConfig {
    /// Primary angle must fall within [min, max] to satisfy the gate.
    let readyAngleMin:  Double
    let readyAngleMax:  Double
    /// Every joint listed here must be above `minConfidence`.
    let requiredJoints: [Joint]
    let minConfidence:  Float
    /// Gate opens after holding the ready position for this many seconds.
    let stableDuration: TimeInterval
}

// ─── Camera setup — one-time calibration config ───────────────────────────────
//
// Drives the SETUP phase shown before rep counting begins.
// The engine checks that requiredJoints are visible + stable for ~2 seconds.
// Once passed, ALL calibration stops forever (until the session ends).
// Rep counting then runs with zero interference from setup checks.
//
// Design: we INSTRUCT, we don't auto-detect angle.
// Tell the user how to place the phone; then verify joints are visible.
// No shoulder-separation math — just joint visibility + edge clipping.
//
// Adding a new exercise = set its cameraSetup in ExerciseRegistry. Zero engine changes.

struct CameraSetupConfig {
    /// Short, clear instruction shown to the user during setup.
    /// Example: "Stand sideways to the camera — full body in frame"
    let setupInstruction: String

    /// Joints that must be visible (confidence ≥ threshold, not edge-clipped)
    /// for the 2-second calibration hold to pass.
    /// Keep this minimal — only joints the exercise actually measures.
    let requiredJoints: [Joint]

    /// Alternate joint set — if set, setup passes when ALL joints in `requiredJoints`
    /// OR ALL joints in `requiredJointsAlt` are visible.
    /// Use for exercises where the user can face either side of the camera (e.g. push-up:
    /// left side or right side to camera). Defaults to nil (primary set only).
    let requiredJointsAlt: [Joint]?

    init(setupInstruction: String,
         requiredJoints: [Joint],
         requiredJointsAlt: [Joint]? = nil) {
        self.setupInstruction  = setupInstruction
        self.requiredJoints    = requiredJoints
        self.requiredJointsAlt = requiredJointsAlt
    }
}

// ─── Exercise definition — the COMPLETE spec for one exercise ─────────────────
//
// To add a new exercise: write one ExerciseDefinition here and register it in
// ExerciseRegistry.  No engine code changes needed — ever.
//
// Example — shoulder press (not yet shipped):
//
//   ExerciseDefinition(
//     id: "shoulder_press", displayName: "Shoulder Press",
//     primaryAngle: .mostFlexed(
//       left:  JointTriplet(a: .leftElbow,  pivot: .leftShoulder,  c: .leftHip),
//       right: JointTriplet(a: .rightElbow, pivot: .rightShoulder, c: .rightHip)
//     ),
//     topAngle: 170, repEnterThreshold: 130, repExitThreshold: 150,
//     goodROMThreshold: 90, insufficientROMCue: "PRESS FULLY",
//     formChecks: [
//       FormCheck(id: "trunk_lean", cue: "STAY UPRIGHT",
//         metric: .biLateralLineFromVertical(leftFrom:.leftHip, leftTo:.leftShoulder,
//                                             rightFrom:.rightHip, rightTo:.rightShoulder),
//         evaluateAt: .throughoutMax, condition: .greaterThan(15), priority: 1, enabled: true)
//     ],
//     readyGate: ReadyGateConfig(readyAngleMin: 0, readyAngleMax: 90,
//       requiredJoints: [.leftShoulder, .leftElbow, .rightShoulder, .rightElbow],
//       minConfidence: 0.35, stableDuration: 0.8),
//     cameraSetup: CameraSetupConfig(
//       setupInstruction: "Face the camera — upper body in frame",
//       requiredJoints: [.leftShoulder, .rightShoulder, .leftElbow, .rightElbow]
//     ),
//     minRepInterval: 0.6
//   )
//
// Zero engine changes.  One struct literal.

struct ExerciseDefinition {
    let id:          String
    let displayName: String

    // ── Primary angle ────────────────────────────────────────────────────────
    let primaryAngle: PrimaryAngleConfig

    // ── Rep thresholds (all exercises: top = large angle, bottom = small angle) ─
    let topAngle:           Double   // approximate resting / extended angle
    let repEnterThreshold:  Double   // angle must drop BELOW this to start a rep
    let repExitThreshold:   Double   // angle must rise ABOVE this to complete a rep
    //   repEnterThreshold < repExitThreshold creates hysteresis — prevents double-count

    // ── ROM quality ──────────────────────────────────────────────────────────
    let goodROMThreshold:   Double   // primary angle must reach BELOW this for good ROM
    let insufficientROMCue: String   // cue when rep is counted but ROM wasn't reached

    // ── Secondary form checks ─────────────────────────────────────────────────
    //
    // CONVENTION: every exercise must define its FULL set of realistic form faults
    // as FormChecks with distinct priorities.  The engine reports the single highest-
    // priority failing check per rep (sorted descending — highest number wins).
    //
    // When adding a new exercise:
    //   1. Cover ROM, alignment, and movement-quality faults each as a separate FormCheck.
    //   2. Set enabled: false for checks that are noisy on the current camera angle.
    //   3. All thresholds are heuristic starting points — tune on-device via NSLog.
    //      The rep log "[Engine] [<id>] Rep #N ... | check=value[FAIL/ok]" shows
    //      every metric value for every rep.
    let formChecks:     [FormCheck]

    // ── Ready gate ────────────────────────────────────────────────────────────
    let readyGate:      ReadyGateConfig

    // ── Camera setup (one-time calibration before rep counting begins) ────────
    // If nil, calibration is skipped and the engine starts in ACTIVE phase immediately.
    let cameraSetup:    CameraSetupConfig?

    // ── Debounce ──────────────────────────────────────────────────────────────
    let minRepInterval: TimeInterval
}
