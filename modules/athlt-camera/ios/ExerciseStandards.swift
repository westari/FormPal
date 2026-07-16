import Foundation

// ─── Exercise Form Standards ──────────────────────────────────────────────────
//
// Per-exercise form floors used by UniversalQualityEngine (Layer 2).
// Prevents beginners from locking in a bad baseline.
//
// DESIGN RULES:
//   • Angle-based only — rotation/translation invariant, no pixel coordinates.
//   • Conservative targets to tolerate camera angle + anatomical variation.
//   • reviewed = false until a human verifies the numbers on-device.
//
// EDITING THIS FILE REQUIRES A NATIVE REBUILD (EAS iOS build):
//   git push origin master → run GitHub Action ios-dev-build
//
// FUTURE: migrate to TS-side config + setExerciseStandard() bridge call so
// editing standards is a JS-only reload instead. Estimated ~2 hours of work.

// ─── JointAngleCheck ─────────────────────────────────────────────────────────

/// A "should stay still" check for a single angle during a rep.
/// At runtime: compute angle A→B→C for every frame in the rep window.
/// If (max − min) exceeds maxRangeDeg, emit `cue`.
struct JointAngleCheck {
    let description: String  // human-readable; appears in [STD] debug logs
    let a:           Joint   // angle at joint B, formed by A → B → C
    let b:           Joint
    let c:           Joint
    let maxRangeDeg: Double  // max allowed angle variation (°) during one rep
    let cue:         String  // coaching string if threshold is breached
}

// ─── ExerciseStandard ────────────────────────────────────────────────────────

/// Per-exercise form floor. UniversalQualityEngine validates the user's first-3-rep
/// baseline against this before trusting it as "good form."
struct ExerciseStandard {
    let exerciseId:           String
    let reviewed:             Bool     // set true after a human verifies on-device

    // ── Primary rep metric (angle, degrees) ──────────────────────────────────
    // "peak" = most contracted position (angle is at its LOWEST during a curl).
    // At peak, the repMetric should reach ≤ standardPeakAngleMax.
    let standardPeakAngleMax:  Double
    // "start" = most extended position (angle is at its HIGHEST during a curl).
    // At start, the repMetric should be ≥ standardStartAngleMin.
    let standardStartAngleMin: Double
    // Minimum expected range in one rep (computed).
    var standardMinRange: Double { standardStartAngleMin - standardPeakAngleMax }

    // ── Coaching strings ──────────────────────────────────────────────────────
    let romCue:    String   // emitted when peak doesn't reach standard
    let extendCue: String   // emitted when start position isn't extended enough

    // ── Static joint checks ───────────────────────────────────────────────────
    let staticChecks: [JointAngleCheck]

    // ── Tempo (informational — used for future soft cue) ──────────────────────
    let tempoMinSec: Double
    let tempoMaxSec: Double

    // ── Common faults (for logging / future coach UI) ─────────────────────────
    let topFaults: [String]
}

// ─── Registry ─────────────────────────────────────────────────────────────────

enum ExerciseStandards {

    /// Returns the standard for the given exercise ID, or nil if none defined.
    /// nil → Layer 2 is inactive; only the 4 relative (Layer 1) signals run.
    static func standard(for exerciseId: String) -> ExerciseStandard? {
        switch exerciseId {
        case "curl": return curl
        default:     return nil
        }
    }

    // ─── Bicep Curl ──────────────────────────────────────────────────────────
    //
    // Camera setup: person faces the camera, full body in frame.
    //
    // repMetric = minimum(leftElbowAngle, rightElbowAngle)
    //   Each is angle at elbow in: shoulder → elbow → wrist (°).
    //   HIGH (~155-165°) at rest / fully extended.
    //   LOW  (~35-45°)   at peak contraction.
    //
    // Biomechanics basis:
    //   Full elbow ROM ≈ 145° (anatomical extension ~170° → full flex ~25°).
    //   Coached curl range: ~160° extended → ~40° curled. Range ≈ 120°.
    //   Conservative floor (start ≥ 150°, peak ≤ 50°, range ≥ 100°) to account
    //   for camera angle differences and individual anatomy. These are FLOORS —
    //   the relative Layer 1 signals still apply on top.
    //
    // Torso stability:
    //   A strict curl leaves the torso upright. Body-momentum swinging causes
    //   the shoulder–hip–knee angle to swing >15° during the rep.
    //   15° threshold: filters natural postural sway (~3-5°), catches swinging.
    //
    // REVIEWED: false
    // ← Ari: run 5 clean full curls, read [STD] lines on the debug panel.
    //     "baseline peak=__°" should be clearly ≤ 50° for YOUR full curl.
    //     "baseline start=__°" should be clearly ≥ 150° for YOUR extended arm.
    //   If Vision consistently reads a different number (e.g. your full curl
    //   reads 65° not 45°), adjust standardPeakAngleMax to match, then set
    //   reviewed: true. The field exists so bad defaults cannot be silently shipped.

    static let curl = ExerciseStandard(
        exerciseId: "curl",
        reviewed:   false,  // ← CHANGE TO true AFTER VERIFYING NUMBERS ON-DEVICE

        // ── Dynamic joint (elbow flexion) ─────────────────────────────────────
        // Peak contraction: shoulder–elbow–wrist angle ≤ 50°.
        //   Full bicep curl typically reaches 35–45°; 50° is a generous floor.
        //   If the user's 3-rep average peak is > 50°, they are NOT curling fully.
        standardPeakAngleMax: 50.0,

        // Start position: elbow angle ≥ 150°.
        //   Full extension ≈ 165–170°; 150° allows for the natural carry angle.
        //   If user starts already bent at 120°, they are cheating the ROM.
        standardStartAngleMin: 150.0,

        // ── Coaching strings ──────────────────────────────────────────────────
        romCue:    "CURL FURTHER — not reaching full contraction",
        extendCue: "FULLY EXTEND — arm not straightening at bottom",

        // ── Static joints (torso should remain upright) ───────────────────────
        // Angle at hip formed by (shoulder → hip → knee).
        // For an upright standing person this is ~175–180°.
        // Body swing or back-lean changes it significantly (>15°).
        staticChecks: [
            JointAngleCheck(
                description: "Left torso upright — shoulder–hip–knee angle range",
                a: .leftShoulder,
                b: .leftHip,
                c: .leftKnee,
                maxRangeDeg: 15.0,
                cue: "KEEP TORSO STILL — swinging body"
            ),
            JointAngleCheck(
                description: "Right torso upright — shoulder–hip–knee angle range",
                a: .rightShoulder,
                b: .rightHip,
                c: .rightKnee,
                maxRangeDeg: 15.0,
                cue: "KEEP TORSO STILL — swinging body"
            ),
        ],

        tempoMinSec: 1.5,   // under 1.5 s/rep = swinging (jerk signal also catches this)
        tempoMaxSec: 5.0,   // over 5 s/rep = unusually slow

        topFaults: [
            "HALF REP — never fully contracting or fully extending",
            "SWINGING — using body momentum instead of bicep strength",
            "ELBOW DRIFT — upper arms should stay vertical and back"
        ]
    )
}
