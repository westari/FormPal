import Foundation

// ─── Camera setup ─────────────────────────────────────────────────────────────
//
// Drives the SETUP phase shown before rep counting begins.
// The engine checks requiredJoints are visible + stable for ~2 seconds.
// Adding a new exercise = set its cameraSetup in ExerciseRegistry. Zero engine changes.

// Which way the athlete should face for this exercise. Drives the SETUP
// "Turn to face the camera" / "Turn side-on" coaching cue (see
// ExerciseEngine.positionGuidance). `.any` = no preference (floor exercises)
// and disables the facing cue plus the standing-body size/edge heuristics.
enum SetupFacing: String {
    case camera
    case side
    case any
}

struct CameraSetupConfig {
    let setupInstruction:  String
    let requiredJoints:    [Joint]
    let requiredJointsAlt: [Joint]?
    let facing:            SetupFacing

    init(setupInstruction: String,
         requiredJoints: [Joint],
         requiredJointsAlt: [Joint]? = nil,
         facing: SetupFacing = .any) {
        self.setupInstruction  = setupInstruction
        self.requiredJoints    = requiredJoints
        self.requiredJointsAlt = requiredJointsAlt
        self.facing            = facing
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

// ─── Planarity check (foreshortening gate) ────────────────────────────────────
//
// Declares one body segment whose apparent 2D length must not be too far below
// its calibrated reference before the rep's joint angles can be trusted.
//
// HOW IT WORKS
//   Vision body-pose tracks 2D projections. When a limb points toward or away from
//   the camera its projected length SHRINKS (foreshortening). segmentLengthRatio
//   measures that shrinkage (segment / torso). The gate suppresses the ROM verdict
//   when the ratio drops below (minRatio × reference).
//
// CALIBRATION
//   During calibration reps the engine records the per-frame MAXIMUM segmentLengthRatio
//   for each check. That max = limb most in-plane = true reference length. Without
//   calibration the fallbackReferenceRatio (anatomical estimate) is used.
//
// THRESHOLD
//   minRatio = 0.75 (start): gate fails when segment appears < 75 % of reference.
//   Tune from onDebugLog data — look at ratio= values in good vs bad reps.

struct PlanarityCheck {
    let id:                     String
    let jointA:                 Joint
    let jointB:                 Joint
    let minRatio:               Double   // fraction of reference below which = foreshortened
    let cue:                    String   // shown when gate fails
    let fallbackReferenceRatio: Double   // anatomical estimate used without calibration
    let enabled:                Bool

    init(id: String, jointA: Joint, jointB: Joint,
         minRatio: Double = 0.75, cue: String,
         fallbackReferenceRatio: Double,
         enabled: Bool = true) {
        self.id                     = id
        self.jointA                 = jointA
        self.jointB                 = jointB
        self.minRatio               = minRatio
        self.cue                    = cue
        self.fallbackReferenceRatio = fallbackReferenceRatio
        self.enabled                = enabled
    }
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

    // ── Planarity checks (foreshortening gate) ────────────────────────────────
    let planarityChecks: [PlanarityCheck]

    // ── Walk-away/approach suppression opt-out ────────────────────────────────
    // The approach-detection half of walk-away suppression (see ExerciseEngine's
    // updateActivityState) treats a growing shoulder-hip 2D distance as "user
    // walked toward the camera". That assumption breaks for any exercise whose
    // PRIMARY movement is the torso rotating in the camera's view plane (hip
    // hinge family: RDL, deadlift, good morning, kettlebell swing, single-leg
    // RDL) — the rotation itself inflates the same measurement, indistinguishable
    // from real approach. Default false preserves existing behavior for every
    // other exercise; only hinge-pattern exercises set this true.
    let suppressApproachDetection: Bool

    // ── Phantom-rep guard sensitivity ─────────────────────────────────────────
    // Fraction of |repTopValue - goodROMThreshold| that a rep's recorded movement
    // (repTopValue - repMinAngle) must clear to avoid being rejected as noise (see
    // ExerciseEngine.swift runStateMachine's phantom-rep guard). Default 0.30
    // preserves EXACT existing behavior for every exercise that doesn't set this —
    // only exercises with a documented "small movement counts as a real rep"
    // problem (curl) raise it.
    let phantomGuardFraction: Double

    // ── Exit-confirmation dwell (CORE double-count fix, per-exercise override) ─
    // Consecutive frames the metric must hold above repExitThreshold before a
    // rep is trusted as complete (see ExerciseEngine.swift's EXIT_CONFIRM_FRAMES
    // doc comment for the full root-cause story — a single-frame noise spike
    // mid-rep was completing reps early, producing "one rep counted going up,
    // one coming back down"). Default 3 is the value that actually closed the
    // reported double-counting on shoulder press/tricep; it must NOT be
    // weakened globally to accommodate one exercise. kettlebellSwing overrides
    // this down to 1 (effectively immediate, like the original behavior) since
    // it's an explicitly ballistic, fast-tempo movement whose brief moment at
    // full extension may not sustain for multiple frames — same treatment as
    // its own minRepInterval/tempoMinSec exceptions elsewhere in this app.
    let exitConfirmFrames: Int

    // ── Missing-person abandonment grace period (per-exercise override) ──────
    // Consecutive frames Vision must report NO person at all, while mid-rep,
    // before the in-progress rep is abandoned (see ExerciseEngine.swift's
    // MISSING_PERSON_GRACE_FRAMES doc comment). FIX 2c — raised 3 → 5 (~0.5s):
    // a 1-4 frame Vision blip mid-rep shouldn't abandon the rep. A real
    // departure still trips it, and completion has independent protection
    // (framesSincePoseGap). Tricep pushdown/overhead
    // extension is done close to the camera with the forearm crossing in
    // front of the torso every single rep — a log confirmed Vision's
    // whole-body detector can lose the person for MORE than 3 consecutive
    // frames from that self-occlusion alone, aborting every rep before it
    // could complete. Raised for that family specifically (see
    // tricepVariant() in exerciseDefinitions.ts) rather than weakened
    // globally — completion still has its own independent protection
    // (framesSincePoseGap requires MIN_FRAMES_AFTER_POSE_GAP clean frames
    // after ANY pose gap before trusting a completion), so a larger grace
    // period here does not reopen the original "stale data silently
    // completes a bogus rep" bug this abandonment logic exists to prevent.
    let missingPersonGraceFrames: Int

    // ── Settle-anchor floor (per-exercise, opt-in — see ExerciseEngine.swift's
    // settleCandidateAcceptable doc comment for the full root-cause story).
    // nil (default) preserves existing settle behavior exactly for every
    // exercise. Set only where a genuinely different movement performed in
    // this exercise's slot could otherwise settle on its own low starting
    // value and get miscounted (lat pulldown vs. a press sharing the same
    // wrist/elbow-vs-shoulder metric shape, just opposite temporal order).
    let settleAnchorMinFraction: Double?

    // ── Tracking-reliability gate cutoff (per-exercise override) ──────────────
    // Max fraction of a completed rep's .inRep frames that may be
    // primary-metric-unreliable before the whole rep is thrown out as
    // "[REP] rejected — tracking unreliable" (see ExerciseEngine.swift's
    // tracking-reliability gate). Default 0.5 is the value the pushup / lat
    // pulldown "walked away" fix was tuned against — it must NOT be loosened
    // globally. Crunch overrides it up: lying flat, Apple Vision's shoulder
    // confidence tops out around 0.6-0.7 and routinely dips below the 0.6
    // reliability floor mid-rep, so a perfectly real crunch legitimately runs
    // ~60-70% "unreliable" frames and was being deleted. A device log
    // confirmed exactly this (leftShoulder=[0.28-0.67], 8/12 frames, rep
    // rejected). Raised for crunch only; the walk-away case it guards against
    // still runs ~100% unreliable and is still caught.
    let repReliabilityMaxUnreliableFraction: Double

    // ── Inactivity-suppression gap (per-exercise override) ───────────────────
    // Seconds since the last COUNTED rep, with the person present and not
    // mid-rep, before rep counting is suppressed until they return to the
    // start position (see ExerciseEngine.swift's updateActivityState). Default
    // 8.0. Crunch overrides it long: lying flat, reps resolve slowly and some
    // get thrown out by the reliability gate, so the real inter-rep gap
    // legitimately exceeds 8s and suppression was locking out the rest of a
    // set. The walk-away case is still caught — just after a longer wait.
    let inactivityRepGapSec: Double

    // ── Frame-edge guard (per-exercise override) ─────────────────────────────
    // When true (default), a repMetric joint sitting within SETUP_EDGE_MARGIN
    // (5%) of any frame edge during ACTIVE tracking is treated like a pose gap:
    // framesSincePoseGap resets to 0, and no rep can enter/complete and no
    // repMinAngle can be recorded until MIN_FRAMES_AFTER_POSE_GAP clean frames
    // pass (see ExerciseEngine.swift's ingest() edge call site). Built for
    // STANDING exercises, where an edge-adjacent joint really does mean the
    // user is walking out of frame with a garbled reading.
    //
    // A FLOOR exercise (crunch/sit-up) breaks that assumption: the person lies
    // across the whole frame with the phone on the floor beside them, so a
    // knee or the far shoulder is legitimately near an edge on EVERY rep,
    // especially at the top of the curl. A device log showed this resetting
    // framesSincePoseGap 1→2→3→4→reset every few frames, so the deep frames of
    // every rep after the first were never recorded into repMinAngle — the rep
    // then failed the phantom guard (recorded movement far short of real) and
    // was dropped, after which inactivity suppression locked out the set.
    // Setting this false for floor exercises skips ONLY the edge reset; a
    // genuine missing pose still resets via handleNoPose/notePersonMissing, so
    // the "stale data completes a bogus rep" protection is unaffected.
    let edgeGuardEnabled: Bool

    init(id: String, displayName: String,
         repMetric: Metric,
         topAngle: Double, repEnterThreshold: Double, repExitThreshold: Double,
         goodROMThreshold: Double, insufficientROMCue: String,
         formChecks: [FormCheck],
         readyGate: ReadyGateConfig,
         cameraSetup: CameraSetupConfig? = nil,
         calibration: CalibrationConfig? = nil,
         minRepInterval: TimeInterval,
         planarityChecks: [PlanarityCheck] = [],
         suppressApproachDetection: Bool = false,
         phantomGuardFraction: Double = 0.30,
         exitConfirmFrames: Int = 3,
         missingPersonGraceFrames: Int = 5,
         settleAnchorMinFraction: Double? = nil,
         repReliabilityMaxUnreliableFraction: Double = 0.5,
         inactivityRepGapSec: Double = 8.0,
         edgeGuardEnabled: Bool = true) {
        self.id                        = id
        self.displayName               = displayName
        self.repMetric                 = repMetric
        self.topAngle                  = topAngle
        self.repEnterThreshold         = repEnterThreshold
        self.repExitThreshold          = repExitThreshold
        self.goodROMThreshold          = goodROMThreshold
        self.insufficientROMCue        = insufficientROMCue
        self.formChecks                = formChecks
        self.readyGate                 = readyGate
        self.cameraSetup               = cameraSetup
        self.calibration               = calibration
        self.minRepInterval            = minRepInterval
        self.planarityChecks           = planarityChecks
        self.suppressApproachDetection = suppressApproachDetection
        self.phantomGuardFraction      = phantomGuardFraction
        self.exitConfirmFrames         = exitConfirmFrames
        self.missingPersonGraceFrames  = missingPersonGraceFrames
        self.settleAnchorMinFraction   = settleAnchorMinFraction
        self.repReliabilityMaxUnreliableFraction = repReliabilityMaxUnreliableFraction
        self.inactivityRepGapSec       = inactivityRepGapSec
        self.edgeGuardEnabled          = edgeGuardEnabled
    }
}
