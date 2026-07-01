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

// ─── Camera setup — framing check + UI guidance ───────────────────────────────
//
// BLOCKING: the framing check uses this config to gate rep counting.
// If any requiredJoints are low-confidence or the view angle is wrong,
// the engine will NOT count reps until framing is corrected.
//
// Adding a new exercise = set its cameraSetup in ExerciseRegistry.
// Zero engine code changes.

enum RequiredView { case side, front }

struct CameraSetupConfig {
    /// Which camera angle is needed for this exercise.
    /// .side: squat / pushup / curl (need side profile for angle measurement).
    /// .front: future exercises (facing camera, e.g. overhead press with barbell).
    let requiredView: RequiredView

    /// Joints that MUST be visible at ≥ framingConfidenceThreshold for framing to be ok.
    /// Missing any of these blocks rep counting with an appropriate cue.
    let requiredJoints: [Joint]

    /// Short user-facing instruction shown LARGE in the framing overlay.
    /// Example: "Stand SIDEWAYS — full body in frame"
    let framingInstruction: String

    /// General phone placement hint shown below the instruction.
    /// Example: "Prop your phone ~7 ft away so your whole body is visible."
    let setupHint: String
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
//       requiredView: .front,
//       requiredJoints: [.leftShoulder, .rightShoulder, .leftElbow, .rightElbow],
//       framingInstruction: "Face the camera — upper body in frame",
//       setupHint: "Prop your phone ~6 ft away so your upper body is visible."
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
    //   2. Set enabled: false for checks that are noisy on the current camera angle
    //      (define them anyway so they can be re-enabled with future improvements).
    //   3. All thresholds are heuristic starting points — tune on-device via NSLog.
    //      The rep log "[Engine] [<id>] Rep #N ... | check=value[FAIL/ok]" shows
    //      every metric value for every rep.
    let formChecks:     [FormCheck]

    // ── Ready gate ────────────────────────────────────────────────────────────
    let readyGate:      ReadyGateConfig

    // ── Camera setup (BLOCKING framing check + UI guidance) ──────────────────
    // If nil, framing is always considered ok (for exercises without a camera requirement).
    let cameraSetup:    CameraSetupConfig?

    // ── Debounce ──────────────────────────────────────────────────────────────
    let minRepInterval: TimeInterval
}
