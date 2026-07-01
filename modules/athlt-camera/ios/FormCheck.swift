import Foundation

// ─── What to measure ─────────────────────────────────────────────────────────

enum FormCheckMetric {
    /// Angle at the pivot, formed by joints A–pivot–C.
    case angle(a: Joint, pivot: Joint, c: Joint)

    /// Angle of line from→to relative to vertical (0° = vertical, 90° = horizontal).
    case lineFromVertical(from: Joint, to: Joint)

    /// Average line-from-vertical of both sides. Used when the exercise uses
    /// both limbs and either side might be more visible (e.g. squat back lean).
    case biLateralLineFromVertical(leftFrom: Joint, leftTo: Joint,
                                    rightFrom: Joint, rightTo: Joint)

    /// Perpendicular deviation of `point` from the line `lineFrom`→`lineTo`.
    case deviationFromLine(point: Joint, lineFrom: Joint, lineTo: Joint)

    /// Tracks the exercise's own primary angle — handled by ExerciseEngine directly.
    /// Use with .throughoutMax or .throughoutMin to track peak extension / peak flexion.
    case primaryAngle
}

// ─── When to evaluate ────────────────────────────────────────────────────────

enum EvaluateAt {
    /// Value captured at the frame where the primary angle is at its minimum (deepest point).
    case atBottom

    /// Maximum value accumulated across all frames of the rep.
    case throughoutMax

    /// Minimum value accumulated across all frames of the rep.
    case throughoutMin
}

// ─── Pass/fail condition ──────────────────────────────────────────────────────

enum FormCondition {
    case greaterThan(Double)   // metric > threshold → FAIL
    case lessThan(Double)      // metric < threshold → FAIL
}

// ─── One form rule ────────────────────────────────────────────────────────────

struct FormCheck {
    let id:         String
    let cue:        String           // short ALL-CAPS cue shown to user on failure
    let metric:     FormCheckMetric
    let evaluateAt: EvaluateAt
    let condition:  FormCondition    // if true → check FAILS
    let priority:   Int              // highest priority failing check wins
    let enabled:    Bool
}

// ─── Measurement helpers ──────────────────────────────────────────────────────

extension FormCheck {
    /// Measure the metric against the current pose.
    /// Returns nil for .primaryAngle (the engine handles those directly).
    func measure(pose: Pose) -> Double? {
        switch metric {
        case let .angle(a, pivot, c):
            return jointAngle(pose: pose, a: a, b: pivot, c: c)

        case let .lineFromVertical(from, to):
            return lineAngleFromVertical(pose: pose, from: from, to: to)

        case let .biLateralLineFromVertical(lF, lT, rF, rT):
            return biLateralLineAngleFromVertical(pose: pose,
                                                  leftFrom: lF,  leftTo: lT,
                                                  rightFrom: rF, rightTo: rT)

        case let .deviationFromLine(p, a, b):
            return deviationFromLine(pose: pose, point: p, lineFrom: a, lineTo: b)

        case .primaryAngle:
            return nil  // injected by ExerciseEngine from its tracked primary angle
        }
    }

    func fails(value: Double) -> Bool {
        switch condition {
        case let .greaterThan(t): return value > t
        case let .lessThan(t):    return value < t
        }
    }
}
