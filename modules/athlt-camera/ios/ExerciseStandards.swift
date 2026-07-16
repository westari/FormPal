import Foundation

// ─── Exercise Form Standard types ────────────────────────────────────────────
//
// These Swift structs define the shape of a per-exercise form floor.
// The DATA lives in constants/exerciseStandards.ts (JS side).
//
// At setExercise time the JS standard is serialised to JSON, passed to the
// native bridge via setExerciseStandard(), parsed here, and handed to
// UniversalQualityEngine.setStandard().
//
// EDITING A STANDARD VALUE:
//   1. Edit constants/exerciseStandards.ts
//   2. JS reload: npx expo start --dev-client --clear
//   3. No native rebuild required.
//
// ADDING A NEW EXERCISE STANDARD:
//   Add a key to constants/exerciseStandards.ts — no Swift changes needed
//   unless you introduce a new field type that the parser doesn't yet handle.

// ─── JointAngleCheck ─────────────────────────────────────────────────────────

/// A "should stay still" check for a single joint angle across all frames in a rep.
/// At runtime: compute angle A→B→C for every frame in the rep window.
/// If (max − min) exceeds maxRangeDeg, emit `cue`.
struct JointAngleCheck {
    let description: String  // appears in [STD] debug logs
    let a:           Joint   // angle at joint b, formed by A → B → C
    let b:           Joint
    let c:           Joint
    let maxRangeDeg: Double  // max allowed angle variation (°) during one rep
    let cue:         String  // coaching string emitted if threshold is breached
}

// ─── ExerciseStandard ────────────────────────────────────────────────────────

/// Per-exercise form floor. Populated from JS JSON via setExerciseStandard().
struct ExerciseStandard {
    let exerciseId:            String
    let reviewed:              Bool     // false until a human verifies on-device
    let standardPeakAngleMax:  Double   // peak contraction: angle must reach ≤ this
    let standardStartAngleMin: Double   // start position: angle must be ≥ this
    var standardMinRange: Double { standardStartAngleMin - standardPeakAngleMax }
    let romCue:                String
    let extendCue:             String
    let staticChecks:          [JointAngleCheck]
    let tempoMinSec:           Double
    let tempoMaxSec:           Double
    let topFaults:             [String]
}

// ─── Joint string initializer ─────────────────────────────────────────────────
// Used by the setExerciseStandard() bridge to parse joint name strings from JS.
// String values match the TS constant names in exerciseStandards.ts.

extension Joint {
    init?(string: String) {
        switch string {
        case "nose":           self = .nose
        case "leftShoulder":   self = .leftShoulder
        case "rightShoulder":  self = .rightShoulder
        case "leftElbow":      self = .leftElbow
        case "rightElbow":     self = .rightElbow
        case "leftWrist":      self = .leftWrist
        case "rightWrist":     self = .rightWrist
        case "leftHip":        self = .leftHip
        case "rightHip":       self = .rightHip
        case "leftKnee":       self = .leftKnee
        case "rightKnee":      self = .rightKnee
        case "leftAnkle":      self = .leftAnkle
        case "rightAnkle":     self = .rightAnkle
        default:               return nil
        }
    }
}
