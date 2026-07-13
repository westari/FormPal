import Foundation

// ─── Camera setup ─────────────────────────────────────────────────────────────
//
// Drives the SETUP phase shown before rep counting begins.
// The engine checks requiredJoints are visible + stable for ~2 seconds.
// Adding a new exercise = set its cameraSetup in ExerciseRegistry. Zero engine changes.

struct CameraSetupConfig {
    let setupInstruction:  String
    let requiredJoints:    [Joint]
    let requiredJointsAlt: [Joint]?

    init(setupInstruction: String,
         requiredJoints: [Joint],
         requiredJointsAlt: [Joint]? = nil) {
        self.setupInstruction  = setupInstruction
        self.requiredJoints    = requiredJoints
        self.requiredJointsAlt = requiredJointsAlt
    }
}

// ─── Ready gate ───────────────────────────────────────────────────────────────

/// The stable starting position that must be held before rep counting begins.
struct ReadyGateConfig {
    let readyAngleMin:  Double
    let readyAngleMax:  Double
    let requiredJoints: [Joint]
    let minConfidence:  Float
    let stableDuration: TimeInterval
}

// ─── Auto-calibration ─────────────────────────────────────────────────────────
//
// If non-nil, the engine runs a CALIBRATION phase between SETUP and ACTIVE.
// The user does repsNeeded slow full-ROM reps; the engine observes the actual
// rest and peak metric values, then derives camera/person-dependent thresholds.
//
// Derived thresholds (range = avgRest − avgPeak):
//   repEnterThreshold = avgRest − range × enterFraction  (where to start a rep)
//   repExitThreshold  = avgRest − range × exitFraction   (where to complete it)
//
// goodROMThreshold is intentionally NOT derived from calibration — it is a
// biomechanical standard and must remain absolute (defined in ExerciseDefinition).
// Deriving it from user reps would certify bad form as correct for weaker users.
//
// exitFraction < enterFraction → exit is closer to rest → hysteresis band.
// If data is insufficient the engine falls back to the static thresholds.
// Derived thresholds survive resetForTracking() within the same session.

struct CalibrationConfig {
    let repsNeeded:    Int     // typically 2
    let enterFraction: Double  // typically 0.50
    let exitFraction:  Double  // typically 0.25 (< enterFraction for hysteresis)
}

// ─── Exercise definition ──────────────────────────────────────────────────────
//
// To add a new exercise: write one ExerciseDefinition in ExerciseRegistry.
// Zero engine code changes needed — ever.
//
// Example — shoulder press (not yet shipped):
//
//   ExerciseDefinition(
//     id: "shoulder_press", displayName: "Shoulder Press",
//     repMetric: .minimum(
//       .jointAngle(a: .leftElbow,  pivot: .leftShoulder,  c: .leftHip),
//       .jointAngle(a: .rightElbow, pivot: .rightShoulder, c: .rightHip)
//     ),
//     topAngle: 170, repEnterThreshold: 130, repExitThreshold: 150,
//     goodROMThreshold: 90, insufficientROMCue: "PRESS FULLY",
//     formChecks: [
//       FormCheck(id: "trunk_lean", cue: "STAY UPRIGHT",
//         metric: .average(
//           .lineVsVertical(from: .leftHip,  to: .leftShoulder),
//           .lineVsVertical(from: .rightHip, to: .rightShoulder)
//         ),
//         evaluateAt: .throughoutMax, condition: .greaterThan(15), priority: 1, enabled: true)
//     ],
//     readyGate: ReadyGateConfig(readyAngleMin: 0, readyAngleMax: 90,
//       requiredJoints: [.leftShoulder, .leftElbow, .rightShoulder, .rightElbow],
//       minConfidence: 0.35, stableDuration: 0.8),
//     cameraSetup: CameraSetupConfig(
//       setupInstruction: "Face the camera — upper body in frame",
//       requiredJoints: [.leftShoulder, .rightShoulder, .leftElbow, .rightElbow]
//     ),
//     calibration: CalibrationConfig(repsNeeded: 2, enterFraction: 0.50,
//                                    exitFraction: 0.25),
//     minRepInterval: 0.6
//   )

struct ExerciseDefinition {
    let id:          String
    let displayName: String

    // ── Rep detection ────────────────────────────────────────────────────────
    // repMetric drives the rep state machine. Thresholds are static starting
    // points; calibration (if configured) replaces them with user-specific values.
    let repMetric:          Metric
    let topAngle:           Double   // approximate metric value at rest / top of movement
    let repEnterThreshold:  Double   // metric must drop BELOW this to enter a rep
    let repExitThreshold:   Double   // metric must rise ABOVE this to complete a rep

    // ── ROM quality ──────────────────────────────────────────────────────────
    let goodROMThreshold:   Double   // repMetric must reach BELOW this for good ROM
    let insufficientROMCue: String

    // ── Secondary form checks ─────────────────────────────────────────────────
    let formChecks: [FormCheck]

    // ── Ready gate ────────────────────────────────────────────────────────────
    let readyGate: ReadyGateConfig

    // ── Camera setup ──────────────────────────────────────────────────────────
    let cameraSetup: CameraSetupConfig?

    // ── Auto-calibration ──────────────────────────────────────────────────────
    // nil = skip calibration phase and use static thresholds above.
    let calibration: CalibrationConfig?

    // ── Debounce ──────────────────────────────────────────────────────────────
    let minRepInterval: TimeInterval

    init(id: String, displayName: String,
         repMetric: Metric,
         topAngle: Double, repEnterThreshold: Double, repExitThreshold: Double,
         goodROMThreshold: Double, insufficientROMCue: String,
         formChecks: [FormCheck],
         readyGate: ReadyGateConfig,
         cameraSetup: CameraSetupConfig? = nil,
         calibration: CalibrationConfig? = nil,
         minRepInterval: TimeInterval) {
        self.id                 = id
        self.displayName        = displayName
        self.repMetric          = repMetric
        self.topAngle           = topAngle
        self.repEnterThreshold  = repEnterThreshold
        self.repExitThreshold   = repExitThreshold
        self.goodROMThreshold   = goodROMThreshold
        self.insufficientROMCue = insufficientROMCue
        self.formChecks         = formChecks
        self.readyGate          = readyGate
        self.cameraSetup        = cameraSetup
        self.calibration        = calibration
        self.minRepInterval     = minRepInterval
    }
}
