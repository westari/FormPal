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
    // When true and this check fails, the rep does not count at all — not
    // logged as a bad rep, not incremented into totalReps, silently rejected
    // (same "doesn't count, just logged" treatment as the phantom-rep guard).
    // Use ONLY for checks that mean "this wasn't the target movement at all"
    // (e.g. hinge's hip_drift — a lean with no hip travel isn't a shallow
    // hinge, it's a different movement), never for ordinary form faults,
    // which should always count-but-flag per this app's normal philosophy.
    // Defaults to false via the parser when the JSON field is absent.
    let gatesCounting: Bool

    // Per-check override of ExerciseEngine's FORM_CHECK_MIN_CONF (the
    // confidence floor a frame must clear before this check's value is
    // trusted into a rep-long throughoutMax/Min accumulator). nil = use the
    // engine's shared default. See exerciseDefinitions.ts's FormCheckDef
    // doc comment for when to set this.
    let formCheckMinConf: Float?

    // Explicit init with defaults for gatesCounting/formCheckMinConf so every
    // existing FormCheck(...) call site (ExerciseRegistry.swift's ~13
    // hardcoded definitions) keeps compiling unchanged — only call sites that
    // need gating or a custom confidence floor (currently just the JSON
    // parser) pass them.
    init(id: String, cue: String, metric: Metric, evaluateAt: EvaluateAt,
         condition: FormCondition, priority: Int, enabled: Bool,
         gatesCounting: Bool = false, formCheckMinConf: Float? = nil) {
        self.id = id
        self.cue = cue
        self.metric = metric
        self.evaluateAt = evaluateAt
        self.condition = condition
        self.priority = priority
        self.enabled = enabled
        self.gatesCounting = gatesCounting
        self.formCheckMinConf = formCheckMinConf
    }
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
