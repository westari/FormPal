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

// ─── Camera guidance ──────────────────────────────────────────────────────────

enum ExpectedCameraView { case side, front }

struct CameraGuidanceConfig {
    let expectedView: ExpectedCameraView
    let cue:          String   // passive hint, never blocks counting
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
//     cameraGuidance: nil,
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
    let formChecks:     [FormCheck]

    // ── Ready gate ────────────────────────────────────────────────────────────
    let readyGate:      ReadyGateConfig

    // ── Camera guidance (passive hint — never blocks counting) ─────────────────
    let cameraGuidance: CameraGuidanceConfig?

    // ── Debounce ──────────────────────────────────────────────────────────────
    let minRepInterval: TimeInterval
}
