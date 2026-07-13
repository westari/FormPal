import Foundation

// ─── When to evaluate ─────────────────────────────────────────────────────────

enum EvaluateAt {
    /// Value captured at the frame where the primary metric is at its minimum (deepest point).
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
//
// CONVENTION: define your FULL set of fault checks per exercise.
// The engine reports the single highest-priority failing check per rep.
// Set enabled: false for checks that are noisy on the current camera angle.
// Tune thresholds on-device via the rep NSLog: "[Engine] [<id>] Rep #N ... | check=value[FAIL/ok]"

struct FormCheck {
    let id:         String
    let cue:        String           // short ALL-CAPS cue shown to user on failure
    let metric:     Metric
    let evaluateAt: EvaluateAt
    let condition:  FormCondition    // if true → check FAILS
    let priority:   Int              // highest-priority failing check wins (sorted descending)
    let enabled:    Bool
}

extension FormCheck {
    func measure(pose: Pose) -> Double? { metric.measure(pose: pose) }

    func fails(value: Double) -> Bool {
        switch condition {
        case let .greaterThan(t): return value > t
        case let .lessThan(t):    return value < t
        }
    }
}
