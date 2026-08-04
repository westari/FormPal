import Foundation

// ─── Rep result ───────────────────────────────────────────────────────────────

struct RepResult {
    let good:            Bool
    let cue:             String
    let primaryAngle:    Double
    let totalReps:       Int
    let goodReps:        Int
    let formValues:      [String: Double]
    let planarityLog:    String   // one-liner: ratio/reference/pass per check
    let planarityPassed: Bool
}

// ─── Setup status (emitted during SETUP phase) ────────────────────────────────

struct SetupStatus {
    let allJointsVisible: Bool
    let holdProgress:     Double
    let passed:           Bool
    let hint:             String
}

// ─── Calibration status (emitted passively during ACTIVE tracking) ───────────

struct CalibrationStatus {
    let repsCompleted: Int
    let repsNeeded:    Int
    let passed:        Bool
}

// ─── Debug stats (emitted every frame in ACTIVE phase) ───────────────────────

struct EngineDebugStats {
    let primaryAngle:  Double
    let phase:         String
    let isReady:       Bool
    let formMetrics:   [String: Double]
    let outOfPlaneCue: String?   // nil = in-plane; non-nil = foreshortening hint
}

// ─── Internal phases ──────────────────────────────────────────────────────────

private enum EnginePhase { case setup, active }
private enum RepPhase    { case waitingForReady, atTop, inRep }

private enum SetupPhaseState {
    case pending
    case holding(startTime: Date)
}

private enum ActivityState { case active, suppressed }

// ─── The exercise engine ──────────────────────────────────────────────────────
//
// Two-phase design:
//
//   SETUP (enginePhase = .setup):
//     Checks requiredJoints visibility + edge margin.
//     Requires a 2-second continuous hold before passing.
//     Rep counting does NOT run. Emits onSetupUpdate every frame.
//
//   ACTIVE (enginePhase = .active):
//     Rep counting starts immediately on static thresholds — isReady opens in
//     ~0.27s via the ready gate, no separate blocking calibration step.
//     If def.calibration != nil, the first repsNeeded VALID completed reps also
//     feed the calibration sample buffers in the background (see completeRep /
//     feedPassiveCalibration); once collected, repEnter/repExit thresholds
//     swap to derived per-user values for every rep after that point. This
//     used to be a separate CALIBRATION phase that blocked rep counting and
//     readiness for repsNeeded slow reps — now it rides along on real reps.
//     Returns to SETUP if all required joints missing for ≥ 3 seconds.
//
// Rep logic (ACTIVE only):
//   atTop  → metric < repEnterThreshold → inRep  (track minimum)
//   inRep  → metric > repExitThreshold  → count rep → atTop
//
// Validity gate:
//   Before evaluating form: checks that repMetric can be measured on the exit frame.
//   Uses kMinConf (0.25) via repMetric.measure(), not readyGate.minConfidence (0.30).
//   Low-confidence rep → emits "ADJUST POSITION", not counted as good.
//   Logs [VALID] FAIL with which joints dropped below kMinConf.
//
// Phantom-rep guard:
//   Requires repEnterValue − peakAngle > 30% of (repEnterValue − goodROMThreshold).
//   Rejects pose-noise dips that immediately pop back above exitThreshold.
//   Logs [REP] rejected for any phantom.
//
// Form-over-ROM priority:
//   Checks with priority ≥ FORM_OVERRIDE_ROM_PRIORITY override the insufficientROMCue
//   even when goodROM is false. Handles cases where bad posture distorts the 2D angle
//   (e.g. elbow drift makes a curled arm look shallower than it really is).

final class ExerciseEngine {

    private let def: ExerciseDefinition

    // ── Engine and rep phases ────────────────────────────────────────────────
    private var enginePhase: EnginePhase = .setup
    private var repPhase:    RepPhase    = .waitingForReady
    private var repMinAngle: Double      = 999
    // Peak metric value seen while in .atTop — used as the movement baseline for the
    // phantom-rep guard. Using the actual top position (not the entry-threshold crossing)
    // makes the guard robust to frames where the metric returns nil at the bottom of the
    // rep (elbow confidence drops below kMinConf), which would otherwise leave repMinAngle
    // equal to repEnterValue and produce movement=0 on every rep.
    private var repTopValue:  Double     = 0
    // Kept for log only — the metric value at the moment we crossed enterThreshold.
    private var repEnterValue: Double    = 0

    // Backward compat: modules that check isSetupComplete still work.
    var isSetupComplete: Bool { enginePhase != .setup }

    // ── Rep counters ─────────────────────────────────────────────────────────
    private(set) var totalReps = 0
    private(set) var goodReps  = 0

    // ── Ready gate ───────────────────────────────────────────────────────────
    //
    // FIX 2 root cause: the old time-based readyStart approach reset on any
    // single bad frame. At 30fps, one low-confidence Vision reading restarted
    // the 0.8s hold timer from zero — making the gate feel random.
    //
    // Fix: consecutive-frame counters with entry hysteresis (8 pass frames) and
    // exit hysteresis (20 fail frames, before first rep only). Once totalReps>0,
    // isReady never drops — mid-set camera jitter can't break the count.
    private(set) var isReady:              Bool = false
    private var consecutivePassFrames:     Int  = 0
    private var consecutiveFailFrames:     Int  = 0
    // Throttle for [GATE] diagnostic log (~3/sec).
    private var lastGateLogTime: Double = 0

    // Frames of consecutive agreement required to enter ready (~0.27s @ 30fps).
    private static let READY_ENTER_FRAMES: Int = 8
    // Frames of consecutive disagreement required to exit ready (~0.67s @ 30fps).
    // Exit only applies before first rep — once a set is underway, isReady is permanent.
    private static let READY_EXIT_FRAMES:  Int = 20

    // ── Setup ────────────────────────────────────────────────────────────────
    private var setupPhaseState: SetupPhaseState = .pending
    private var setupLossStart:  Date? = nil

    private static let SETUP_HOLD_DURATION:   TimeInterval = 2.0
    private static let LEAVE_TIMEOUT:         TimeInterval = 3.0
    private static let SETUP_JOINT_MIN_CONF:  Float        = 0.30
    private static let SETUP_EDGE_MARGIN:     Double       = 0.05

    // ── Calibration (passive — fed from real completed reps, see completeRep) ──
    private var calibRestBuf:      [Double] = []   // top/rest value per sampled rep
    private var calibPeakAngles:   [Double] = []   // bottom/peak value per sampled rep
    private var calibRepCount:     Int      = 0
    private var calibDerivedEnter: Double?  = nil
    private var calibDerivedExit:  Double?  = nil

    // ── Active thresholds (static or derived from calibration) ────────────────
    // goodROMThreshold is always absolute — never derived from user calibration reps.
    private var effectiveEnterThreshold: Double { calibDerivedEnter ?? def.repEnterThreshold }
    private var effectiveExitThreshold:  Double { calibDerivedExit  ?? def.repExitThreshold  }
    private var effectiveROMThreshold:   Double { def.goodROMThreshold }

    // ── Form-over-ROM priority ────────────────────────────────────────────────
    // Checks at priority ≥ this value override the ROM cue when goodROM is false.
    // Curl: elbow_drift=4, lean_back=5 → both override "CURL HIGHER".
    private static let FORM_OVERRIDE_ROM_PRIORITY: Int = 4

    // ── Form check accumulators (reset each rep) ──────────────────────────────
    private var accumMax:    [String: Double] = [:]
    private var accumMin:    [String: Double] = [:]
    private var atBottomVal: [String: Double] = [:]

    // ── Planarity / foreshortening gate ───────────────────────────────────────
    // calibratedSegmentRefs: max segmentLengthRatio per check learned during calibration.
    // planarityMinRatios: minimum ratio observed during the current rep (most foreshortened).
    private(set) var calibratedSegmentRefs: [String: Double] = [:]
    private var planarityMinRatios:         [String: Double] = [:]

    // ── Debounce / inactivity ─────────────────────────────────────────────────
    private var lastRepTime:       Date = .distantPast
    private var lastValidPoseTime: Date = .distantPast
    private let inactivityTimeout: TimeInterval = 2.5

    // ── Pose-gap settle (step-out-of-frame protection) ────────────────────────
    // A frame can pass the repMetric's confidence gate (kMinConf) while the
    // person is only PARTIALLY visible (stepping toward the frame edge) —
    // confidence isn't a perfect proxy for positional accuracy, especially
    // during rapid pose transitions. A single such frame can spuriously enter
    // a rep or corrupt repMinAngle before the person is confirmed fully gone
    // (notePersonMissing) or handleNoPose's inactivityTimeout (2.5s) resets
    // anything — a quick step-out-and-back can slip through both.
    // framesSincePoseGap resets to 0 on ANY invalid/missing-pose frame (see
    // handleNoPose) and must reach MIN_FRAMES_AFTER_POSE_GAP of consecutive
    // valid frames before a rep is allowed to ENTER or COMPLETE — same
    // consecutive-frame-hysteresis pattern already used for the ready gate,
    // settle gate, and resume counter elsewhere in this file, applied here to
    // give Vision a moment to re-settle after any pose disruption.
    private var framesSincePoseGap: Int = 0
    private static let MIN_FRAMES_AFTER_POSE_GAP: Int = 5  // ~0.5s at ~10fps effective rate

    // ── Walk-away / inactivity suppression ───────────────────────────────────
    // Suppresses rep counting and cues when the user walks toward the camera
    // (approach) or has been idle after finishing a set (inactivity).
    // Resumes automatically when the user returns to the exercise start position.
    private var activityState:           ActivityState = .active
    private var suppressionReason:       String        = ""
    private var torsoRefBaseline:        Double?       = nil  // max ref seen in first TORSO_BASELINE_FRAMES
    private var torsoRefBaselineFrames:  Int           = 0
    private var torsoRefCurrent:         Double        = 0.0
    private var resumeConsecFrames:      Int           = 0
    private var approachConsecFrames:    Int           = 0

    private static let APPROACH_SCALE_FACTOR:  Double = 1.35  // torso >35% above baseline → approaching
    private static let APPROACH_RELEASE_MULT:  Double = 1.15  // must drop to <15% above baseline to resume
    private static let INACTIVITY_REP_GAP_SEC: Double = 8.0   // idle gap after last rep before suppression
    private static let TORSO_BASELINE_FRAMES:  Int    = 60    // ~2s at 30fps to establish baseline
    private static let RESUME_CONSEC_FRAMES:   Int    = 15    // ~0.5s in start zone to resume
    private static let APPROACH_ENTER_FRAMES:  Int    = 8     // ~0.27s consecutive to suppress on approach

    // ── Settle gate ───────────────────────────────────────────────────────────
    // Prevents the first arm-raise into starting position from being counted as a rep.
    // Root cause: raising arms from ~1.1 → 2.0 is a 0.9-unit swing, which passes the
    // phantom-rep guard (requires only ~0.2 units for seated row). The settle gate holds
    // rep counting until the metric has been stably above exitThreshold for SETTLE_FRAMES.
    // Once settled, hasSettled stays true for the session — no re-settling between reps.
    private var hasSettled:       Bool = false
    private var settledTopFrames: Int  = 0

    private static let SETTLE_FRAMES: Int = 8   // ~0.27s at 30fps

    // ── Per-frame log throttle ────────────────────────────────────────────────
    private var lastFrameLogTime:    Double = 0
    private var lastActivityLogTime: Double = 0

    // ── Callbacks ─────────────────────────────────────────────────────────────
    var onRepDetected:       ((RepResult)        -> Void)?
    var onDebugStats:        ((EngineDebugStats) -> Void)?
    var onSetupUpdate:       ((SetupStatus)      -> Void)?
    var onCalibrationUpdate: ((CalibrationStatus) -> Void)?
    // Arbitrary diagnostic message — wired to sendEvent("onDebugLog") in ATHLTCameraModule.
    // Used for [METRIC], [VALID], [GATE], [REP] logs so they reach JS/Metro on Windows.
    var onDebugLog:          ((String) -> Void)?
    // ─────────────────────────────────────────────────────────────────────────

    init(definition: ExerciseDefinition) {
        self.def = definition
    }

    // Full reset — clears everything including setup and calibration.
    func reset() {
        enginePhase           = .setup
        repPhase              = .waitingForReady
        isReady               = false
        consecutivePassFrames = 0
        consecutiveFailFrames = 0
        totalReps             = 0
        goodReps              = 0
        setupPhaseState       = .pending
        setupLossStart        = nil
        lastValidPoseTime     = .distantPast
        lastGateLogTime       = 0
        lastFrameLogTime      = 0
        resetCalibrationState(keepDerived: false)
        resetRepState()
        resetActivityState()
        resetSettleState()
    }

    // Partial reset — resets rep counters but keeps enginePhase and calibration-derived thresholds.
    // Used when startTracking() is called after setup/calibration already passed.
    func resetForTracking() {
        repPhase              = .waitingForReady
        isReady               = false
        consecutivePassFrames = 0
        consecutiveFailFrames = 0
        totalReps             = 0
        goodReps              = 0
        setupLossStart        = nil
        lastValidPoseTime     = .distantPast
        lastGateLogTime       = 0
        lastFrameLogTime      = 0
        resetRepState()
        resetActivityState()
        resetSettleState()
    }

    // ─── Per-frame entry point ────────────────────────────────────────────────

    func ingest(pose: Pose, timestamp: Date) {
        if enginePhase == .active { setupLossStart = nil }

        guard let angle = def.repMetric.measure(pose: pose) else {
            handleNoPose(timestamp: timestamp)
            return
        }

        // FIX 3: throttled per-frame metric log via onDebugLog (~3/sec).
        // Replaces the old NSLog-only frame log that was invisible on Windows.
        // Shows live metric value vs thresholds — essential for diagnosing exercises
        // (like push-up) where zero reps suggests the metric never crosses the
        // enter threshold. Compare value vs enter: if value stays well above enter,
        // the geometry or thresholds are wrong.
        let now = timestamp.timeIntervalSinceReferenceDate
        if now - lastFrameLogTime >= 0.33 {
            lastFrameLogTime = now
            let stateLabel: String
            switch repPhase {
            case .waitingForReady: stateLabel = "waiting"
            case .atTop:           stateLabel = "up"
            case .inRep:           stateLabel = "down"
            }
            let msg = "[METRIC] \(def.id) value=\(String(format: "%.4f", angle)) " +
                      "enter=\(String(format: "%.4f", effectiveEnterThreshold)) " +
                      "exit=\(String(format: "%.4f", effectiveExitThreshold)) " +
                      "rom=\(String(format: "%.4f", effectiveROMThreshold)) " +
                      "top=\(def.topAngle) " +
                      "state=\(stateLabel) phase=\(phaseLabel())"
            onDebugLog?(msg)
        }

        switch enginePhase {
        case .setup:
            runSetupCheck(pose: pose, timestamp: timestamp)
            onDebugStats?(EngineDebugStats(primaryAngle: angle, phase: "setup",
                                           isReady: false, formMetrics: [:], outOfPlaneCue: nil))
            return

        case .active:
            break
        }

        // ── ACTIVE phase ──────────────────────────────────────────────────────
        lastValidPoseTime = timestamp
        framesSincePoseGap = min(framesSincePoseGap + 1, Self.MIN_FRAMES_AFTER_POSE_GAP + 100)
        accumulate(pose: pose)
        trackSegmentReferences(pose: pose)
        updateReadyGate(pose: pose, angle: angle, timestamp: timestamp)
        updateActivityState(pose: pose, angle: angle, timestamp: timestamp)

        // Pre-accumulate settle gate in parallel with the ready gate.
        // With the passthrough gate, isReady opens in ~0.27s (8 frames). Without this
        // block, settle needs 8 MORE frames AFTER ready opens — if the user starts their
        // first rep in that window the settle gate consumes it. Accumulating concurrently
        // means hasSettled can complete during the same window as isReady, so the first
        // real rep is allowed immediately when the user was in start position from the start.
        if !isReady && !hasSettled && angle > effectiveExitThreshold {
            settledTopFrames = min(settledTopFrames + 1, Self.SETTLE_FRAMES + 2)
            if settledTopFrames >= Self.SETTLE_FRAMES {
                hasSettled = true
                let msg = "[SETTLE] pre-ready stable — first rep allowed immediately"
                NSLog("[Engine] [%@] %@", def.id, msg)
                onDebugLog?(msg)
            }
        }

        // Runs even while suppressed (activityState == .suppressed): a genuinely
        // completed rep is a strong enough signal on its own to force-resume — see
        // the force-resume check in completeRep(). Blocking the state machine here
        // entirely would mean no motion is ever tracked during suppression, so a
        // real rep could never be recognized as evidence the user is back.
        if isReady {
            runStateMachine(pose: pose, angle: angle, timestamp: timestamp)
        }

        let snapshot      = currentMetricSnapshot(pose: pose)
        let outOfPlaneCue = isReady ? currentOutOfPlaneCue(pose: pose) : nil
        onDebugStats?(EngineDebugStats(primaryAngle: angle, phase: phaseLabel(),
                                       isReady: isReady, formMetrics: snapshot,
                                       outOfPlaneCue: outOfPlaneCue))
    }

    func notePersonMissing(timestamp: Date) {
        if enginePhase == .active {
            // Abandon any in-progress rep IMMEDIATELY — Vision found no person at
            // all this frame, an unambiguous signal (stronger than a single
            // low-confidence joint) that whatever was being tracked is now stale.
            // Previously this only happened after LEAVE_TIMEOUT (3s) here, or
            // inactivityTimeout (2.5s) via handleNoPose — a quick step-out-and-
            // back could stay under both, leaving a corrupted repMinAngle (from a
            // garbled frame right before vanishing) to silently "complete" a bogus
            // rep once the person returned. Same pattern as suppressAndLog's
            // existing in-progress-rep cleanup.
            if repPhase == .inRep {
                repPhase = .atTop
                resetRepState()
                let msg = "[ACTIVITY] rep abandoned — person left frame"
                NSLog("[Engine] [%@] %@", def.id, msg)
                onDebugLog?(msg)
            }

            if setupLossStart == nil { setupLossStart = timestamp }
            let gone = timestamp.timeIntervalSince(setupLossStart!)
            if gone >= Self.LEAVE_TIMEOUT {
                NSLog("[Engine] [%@] Person gone %.1fs — returning to SETUP", def.id, gone)
                enginePhase           = .setup
                setupPhaseState       = .pending
                setupLossStart        = nil
                isReady               = false
                consecutivePassFrames = 0
                consecutiveFailFrames = 0
                repPhase              = .waitingForReady
                resetCalibrationState(keepDerived: false)
                onSetupUpdate?(SetupStatus(allJointsVisible: false, holdProgress: 0.0,
                                           passed: false, hint: "Step back into view to continue"))
            }
        } else {
            if case .holding = setupPhaseState {
                NSLog("[Engine] [%@] Setup: person left — hold reset", def.id)
                setupPhaseState = .pending
            }
            onSetupUpdate?(SetupStatus(allJointsVisible: false, holdProgress: 0.0,
                                       passed: false, hint: "Step into frame to start"))
        }
        handleNoPose(timestamp: timestamp)
    }

    // ─── Setup phase ──────────────────────────────────────────────────────────

    private func runSetupCheck(pose: Pose, timestamp: Date) {
        guard let setup = def.cameraSetup else {
            transitionFromSetup()
            onSetupUpdate?(SetupStatus(allJointsVisible: true, holdProgress: 1.0,
                                       passed: true, hint: ""))
            return
        }

        let missingMain = missingSetupJoints(setup.requiredJoints, pose: pose)
        var missingJoints = missingMain
        var allVisible = missingMain.isEmpty

        if !allVisible, let altJoints = setup.requiredJointsAlt {
            let missingAlt = missingSetupJoints(altJoints, pose: pose)
            if missingAlt.isEmpty {
                allVisible    = true
                missingJoints = []
            } else if missingAlt.count < missingMain.count {
                missingJoints = missingAlt
            }
        }

        var holdProgress: Double = 0.0

        if allVisible {
            switch setupPhaseState {
            case .pending:
                NSLog("[Engine] [%@] Setup: all joints visible — starting %.0fs hold",
                      def.id, Self.SETUP_HOLD_DURATION)
                let logJoints: [Joint] = (!missingMain.isEmpty && setup.requiredJointsAlt != nil)
                    ? (setup.requiredJointsAlt ?? []) : setup.requiredJoints
                for joint in logJoints {
                    let conf = pose[joint]?.confidence ?? 0
                    NSLog("[Engine] [%@]   %@: conf=%.2f x=%.2f y=%.2f",
                          def.id, "\(joint)", conf,
                          Double(pose[joint]?.x ?? 0), Double(pose[joint]?.y ?? 0))
                }
                setupPhaseState = .holding(startTime: timestamp)
                holdProgress    = 0.0

            case .holding(let start):
                let elapsed = timestamp.timeIntervalSince(start)
                holdProgress = min(1.0, elapsed / Self.SETUP_HOLD_DURATION)
                if elapsed >= Self.SETUP_HOLD_DURATION {
                    NSLog("[Engine] [%@] Setup PASSED", def.id)
                    onSetupUpdate?(SetupStatus(allJointsVisible: true, holdProgress: 1.0,
                                               passed: true, hint: ""))
                    transitionFromSetup()
                    return
                }
            }
        } else {
            if case .holding = setupPhaseState {
                NSLog("[Engine] [%@] Setup: hold broken — missing [%@]",
                      def.id, missingJoints.map { "\($0)" }.joined(separator: ","))
            }
            setupPhaseState = .pending
            holdProgress    = 0.0
        }

        onSetupUpdate?(SetupStatus(allJointsVisible: allVisible, holdProgress: holdProgress,
                                   passed: false, hint: hintForMissingJoints(missingJoints)))
    }

    // Called when setup passes — goes straight to ACTIVE. If def.calibration is
    // configured, its sample buffers are reset here but collection now happens
    // passively off real completed reps (see feedPassiveCalibration) instead of
    // a separate blocking phase.
    //
    // BUG FIX: this used to leave activityState/torsoRefBaseline untouched, which only
    // matters the FIRST time (both already start clean from reset()). But when a user
    // steps fully out of frame for ≥LEAVE_TIMEOUT, notePersonMissing() force-returns
    // enginePhase to .setup WITHOUT touching activityState or the torso baseline. If
    // they re-pass SETUP at a different distance/angle, the stale pre-departure
    // baseline could permanently block the resume check (torsoOk never satisfied) —
    // and if they'd left while already suppressed, that state carried over too, so
    // isReady/rep counting could stay silently gated after they were clearly back.
    // Resetting here guarantees every entry into ACTIVE starts from a clean baseline.
    private func transitionFromSetup() {
        resetActivityState()
        if let config = def.calibration {
            calibRepCount   = 0
            calibRestBuf    = []
            calibPeakAngles = []
            NSLog("[Engine] [%@] Entering ACTIVE — calibrating silently over first %d reps",
                  def.id, config.repsNeeded)
            onCalibrationUpdate?(CalibrationStatus(repsCompleted: 0,
                                                   repsNeeded: config.repsNeeded,
                                                   passed: false))
        }
        enginePhase = .active
    }

    private func missingSetupJoints(_ joints: [Joint], pose: Pose) -> [Joint] {
        var missing: [Joint] = []
        for joint in joints {
            guard let p = pose[joint], p.confidence >= Self.SETUP_JOINT_MIN_CONF else {
                missing.append(joint); continue
            }
            let x = Double(p.x), y = Double(p.y)
            if x < Self.SETUP_EDGE_MARGIN || x > 1 - Self.SETUP_EDGE_MARGIN ||
               y < Self.SETUP_EDGE_MARGIN || y > 1 - Self.SETUP_EDGE_MARGIN {
                missing.append(joint)
            }
        }
        return missing
    }

    private func hintForMissingJoints(_ joints: [Joint]) -> String {
        if joints.isEmpty { return "" }
        let hasLeg = joints.contains(.leftAnkle)  || joints.contains(.rightAnkle) ||
                     joints.contains(.leftKnee)   || joints.contains(.rightKnee)
        let hasHip = joints.contains(.leftHip)    || joints.contains(.rightHip)
        let hasArm = joints.contains(.leftWrist)  || joints.contains(.rightWrist) ||
                     joints.contains(.leftElbow)  || joints.contains(.rightElbow)
        if hasLeg  { return "Move back — feet not in frame" }
        if hasHip  { return "Move back — hips not visible" }
        if hasArm  { return "Step sideways — arms not visible" }
        return "Adjust so your body fills the frame"
    }

    // ─── Passive calibration ──────────────────────────────────────────────────
    //
    // Reps count from the very first one on static thresholds — there is no
    // blocking calibration step. If def.calibration is configured, the first
    // repsNeeded VALID completed reps (see completeRep) also feed these sample
    // buffers in the background; once collected, finishCalibration() derives
    // per-user repEnter/repExit thresholds that apply to every rep after that
    // point. Called with the same top/bottom values used for the [REP] log.
    private func feedPassiveCalibration(topValue: Double, peakValue: Double) {
        guard let config = def.calibration,
              calibDerivedEnter == nil,
              calibRepCount < config.repsNeeded else { return }

        calibRestBuf.append(topValue)
        calibPeakAngles.append(peakValue)
        calibRepCount += 1
        NSLog("[Engine] [%@] Passive calib sample %d/%d — top=%g peak=%g",
              def.id, calibRepCount, config.repsNeeded, topValue, peakValue)

        let passed = calibRepCount >= config.repsNeeded
        onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                               repsNeeded: config.repsNeeded,
                                               passed: passed))
        if passed { finishCalibration(config: config) }
    }

    // Tracks the maximum segment-length ratio seen for each planarity check — the
    // most in-plane (side-on) moment becomes the per-user reference used later to
    // judge foreshortening. Runs every ACTIVE frame (previously only during the
    // blocking CALIBRATION phase, which delayed the reference by repsNeeded reps).
    private func trackSegmentReferences(pose: Pose) {
        for check in def.planarityChecks where check.enabled {
            if let v = Metric.segmentLengthRatio(jointA: check.jointA, jointB: check.jointB)
                             .measure(pose: pose) {
                calibratedSegmentRefs[check.id] = max(calibratedSegmentRefs[check.id] ?? 0, v)
            }
        }
    }

    private func finishCalibration(config: CalibrationConfig) {
        // One sample per real rep now (not a continuous per-frame buffer), so just
        // require at least one of each — calibRepCount already guarantees repsNeeded.
        guard !calibPeakAngles.isEmpty, !calibRestBuf.isEmpty else {
            NSLog("[Engine] [%@] Calib: insufficient data — using static thresholds", def.id)
            enginePhase = .active
            onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                                   repsNeeded: config.repsNeeded,
                                                   passed: true))
            return
        }

        let avgPeak = calibPeakAngles.reduce(0, +) / Double(calibPeakAngles.count)
        let avgRest = calibRestBuf.reduce(0, +)    / Double(calibRestBuf.count)
        let range   = avgRest - avgPeak

        // Reject if range is less than 10% of rest value (not enough movement detected).
        guard avgRest > 0, range / avgRest > 0.10 else {
            NSLog("[Engine] [%@] Calib: range too small (%.4f / %.4f) — using static thresholds",
                  def.id, range, avgRest)
            enginePhase = .active
            onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                                   repsNeeded: config.repsNeeded,
                                                   passed: true))
            return
        }

        calibDerivedEnter = avgRest - range * config.enterFraction
        calibDerivedExit  = avgRest - range * config.exitFraction

        NSLog("[Engine] [%@] Calib DONE: rest=%g peak=%g range=%g → enter=%g exit=%g ROM=%g (absolute)",
              def.id, avgRest, avgPeak, range,
              calibDerivedEnter!, calibDerivedExit!, def.goodROMThreshold)

        if !calibratedSegmentRefs.isEmpty {
            let segLog = calibratedSegmentRefs.sorted { $0.key < $1.key }
                .map { "\($0.key)=\(String(format: "%.3f", $0.value))" }
                .joined(separator: "  ")
            NSLog("[Engine] [%@] Calib planarity refs: %@", def.id, segLog)
        }

        enginePhase = .active
        onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                               repsNeeded: config.repsNeeded,
                                               passed: true))
    }

    private func resetCalibrationState(keepDerived: Bool) {
        calibRestBuf    = []
        calibPeakAngles = []
        calibRepCount   = 0
        if !keepDerived {
            calibDerivedEnter   = nil
            calibDerivedExit    = nil
            calibratedSegmentRefs = [:]
        }
    }

    // ─── Ready gate ───────────────────────────────────────────────────────────
    //
    // FIX 2: frame-counter hysteresis replaces the time-based readyStart approach.
    //
    // ROOT CAUSE of random gate: readyStart was reset to nil on any single bad frame.
    // At 30fps, a single Vision confidence flicker below gate.minConfidence reset
    // the 0.8s timer to zero. The gate appeared non-deterministic because it was
    // extremely sensitive to per-frame pose noise.
    //
    // NEW BEHAVIOR:
    //   ENTER: READY_ENTER_FRAMES consecutive pass frames → isReady = true.
    //          Bad frames during accumulation decay the counter by 1 (not reset to 0),
    //          providing grace for single-frame noise.
    //   EXIT:  READY_EXIT_FRAMES consecutive fail frames → isReady = false.
    //          Only applied before first rep. Once totalReps > 0, isReady is permanent
    //          — mid-set camera jitter, brief position changes, and angle oscillation
    //          during the set can no longer break the rep counter.
    //
    // Diagnostic: [GATE] log emitted via onDebugLog ~3/sec (reaches JS/Metro on Windows).
    //   Format: [GATE] metric=<v> range=<min>-<max> conf=<minConf> consecutivePass=<n> ready=<bool>

    private func updateReadyGate(pose: Pose, angle: Double, timestamp: Date) {
        let gate      = def.readyGate
        let angleOk   = angle >= gate.readyAngleMin && angle <= gate.readyAngleMax
        let jointsOk  = gate.requiredJoints.allSatisfy {
            (pose[$0]?.confidence ?? 0) >= gate.minConfidence
        }
        let conditionsMet = angleOk && jointsOk

        if conditionsMet {
            consecutiveFailFrames = 0
            if !isReady {
                consecutivePassFrames = min(consecutivePassFrames + 1, Self.READY_ENTER_FRAMES + 5)
                if consecutivePassFrames >= Self.READY_ENTER_FRAMES {
                    isReady  = true
                    repPhase = .atTop
                    let msg = "[GATE] READY after \(Self.READY_ENTER_FRAMES) pass frames — metric=\(String(format: "%.3f", angle))"
                    NSLog("[Engine] [%@] %@", def.id, msg)
                    onDebugLog?(msg)
                }
            }
        } else {
            if !isReady {
                // Graceful decay — single bad frames don't fully reset progress.
                consecutivePassFrames = max(0, consecutivePassFrames - 1)
            } else if totalReps == 0 {
                // Exit hysteresis: only lose ready before the first rep.
                consecutiveFailFrames += 1
                if consecutiveFailFrames >= Self.READY_EXIT_FRAMES {
                    isReady               = false
                    consecutivePassFrames = 0
                    consecutiveFailFrames = 0
                    let msg = "[GATE] LOST READY — \(Self.READY_EXIT_FRAMES) fail frames (no reps yet)"
                    NSLog("[Engine] [%@] %@", def.id, msg)
                    onDebugLog?(msg)
                }
            }
            // If totalReps > 0: set is underway — isReady stays true regardless of position.
        }

        // Throttled [GATE] diagnostic ~3/sec. Always emitted so you can see gate state
        // whether passing or failing. conf= shows the weakest required joint.
        let now = timestamp.timeIntervalSinceReferenceDate
        if now - lastGateLogTime >= 0.33 {
            lastGateLogTime = now
            let minConf = gate.requiredJoints
                .map { pose[$0]?.confidence ?? 0 }
                .min() ?? 0
            let msg = "[GATE] metric=\(String(format: "%.3f", angle)) " +
                      "range=\(String(format: "%.2f", gate.readyAngleMin))-\(String(format: "%.2f", gate.readyAngleMax)) " +
                      "conf=\(String(format: "%.2f", minConf)) " +
                      "consecutivePass=\(consecutivePassFrames) " +
                      "ready=\(isReady)"
            NSLog("[Engine] [%@] %@", def.id, msg)
            onDebugLog?(msg)
        }
    }

    // ─── State machine ────────────────────────────────────────────────────────

    private func runStateMachine(pose: Pose, angle: Double, timestamp: Date) {
        switch repPhase {

        case .waitingForReady:
            repPhase = .atTop

        case .atTop:
            repTopValue = max(repTopValue, angle)

            // Settle gate: block rep entry until the metric has held above exitThreshold for
            // SETTLE_FRAMES consecutive frames. Prevents the initial arm-raise into starting
            // position from registering as a rep (the motion crosses enter/exit thresholds with
            // enough swing to pass the phantom-rep guard).
            // hasSettled stays true once set — no re-settling between reps or rest periods.
            if !hasSettled {
                if angle > effectiveExitThreshold {
                    settledTopFrames = min(settledTopFrames + 1, Self.SETTLE_FRAMES + 2)
                    if settledTopFrames >= Self.SETTLE_FRAMES {
                        hasSettled = true
                        let msg = "[SETTLE] top stable — rep counting active"
                        NSLog("[Engine] [%@] %@", def.id, msg)
                        onDebugLog?(msg)
                    }
                } else {
                    // Graceful decay for single-frame noise (don't hard-reset on one bad frame).
                    settledTopFrames = max(0, settledTopFrames - 1)
                }
                return
            }

            // framesSincePoseGap gate: don't trust a rep ENTRY on a frame that just
            // recovered from a pose gap (step-out-of-frame, occlusion) — see the
            // var's doc comment. A garbled edge-of-frame reading could otherwise
            // spuriously dip below effectiveEnterThreshold and start a phantom rep.
            if framesSincePoseGap >= Self.MIN_FRAMES_AFTER_POSE_GAP, angle < effectiveEnterThreshold {
                repPhase      = .inRep
                repMinAngle   = angle
                repEnterValue = angle
                resetRepAccumulators()
                NSLog("[Engine] [%@] Rep entered — metric=%g top=%g (enter=%.4f)",
                      def.id, angle, repTopValue, effectiveEnterThreshold)
            }

        case .inRep:
            // Same framesSincePoseGap gate as entry, applied to BOTH the min-angle
            // tracking and the completion check — a garbled post-gap frame must not
            // corrupt repMinAngle (the recorded depth) even if it doesn't complete
            // a rep outright. Skip this frame entirely until settled.
            guard framesSincePoseGap >= Self.MIN_FRAMES_AFTER_POSE_GAP else { return }

            if angle < repMinAngle {
                repMinAngle = angle
                snapshotAtBottom(pose: pose)
            }
            if angle > effectiveExitThreshold {
                guard timestamp.timeIntervalSince(lastRepTime) >= def.minRepInterval else {
                    NSLog("[Engine] [%@] Debounce — skip", def.id)
                    repPhase = .atTop
                    return
                }

                // ─ Phantom-rep guard ──────────────────────────────────────────────────
                // Rejects noise dips: a real rep must travel at least 30% of the range
                // from the pre-rep top to the goodROM target.
                //
                // Uses repTopValue (max seen in .atTop) not repEnterValue (crossing point)
                // because at the BOTTOM of the rep the pose metric often returns nil (elbow
                // confidence < kMinConf while close to the floor), so runStateMachine never
                // runs and repMinAngle stays equal to repEnterValue. repTopValue is always
                // well above enterThreshold (~0.40 vs 0.17), giving a real movement reading
                // even when nil frames swallow the bottom of the rep.
                let movement = repTopValue - repMinAngle
                let required = max(abs(repTopValue - effectiveROMThreshold) * 0.30, 0.01)
                guard movement >= required else {
                    let msg = "[REP] rejected — movement=\(String(format: "%.4f", movement)) " +
                              "(start=\(String(format: "%.4f", repTopValue)) peak=\(String(format: "%.4f", repMinAngle))) " +
                              "required=\(String(format: "%.4f", required)) (phantom)"
                    NSLog("[Engine] [%@] %@", def.id, msg)
                    onDebugLog?(msg)
                    repPhase = .atTop
                    return
                }

                completeRep(pose: pose, peakAngle: repMinAngle, timestamp: timestamp)
                repPhase = .atTop
            }
        }
    }

    // ─── Rep completion ───────────────────────────────────────────────────────

    private func completeRep(pose: Pose, peakAngle: Double, timestamp: Date) {
        totalReps   += 1
        lastRepTime  = timestamp

        // Validity gate: data is valid if the repMetric can be measured on this frame.
        // Uses kMinConf (0.25) via Metric.measure(), NOT readyGate.minConfidence (0.30).
        // This avoids "ADJUST POSITION" from joints irrelevant to the exercise metric
        // (e.g. hips in shoulderPress readyGate, ankles at bottom of squat).
        guard dataIsValid(pose: pose) else {
            onRepDetected?(RepResult(good: false, cue: "ADJUST POSITION",
                                     primaryAngle: peakAngle, totalReps: totalReps,
                                     goodReps: goodReps, formValues: [:],
                                     planarityLog: "planarity=n/a", planarityPassed: false))
            return
        }

        // Fail-safe force-resume: reaching this point means a rep just passed the
        // phantom-rep guard AND the validity gate — real, deliberate movement, not
        // noise. If we were suppressed (walked away / inactive), that's stronger
        // evidence the user is back than the resume heuristic above needs — a
        // missed rep from staying stuck suppressed is worse than the suppression's
        // benefit, so clear it here regardless of torso scale / start-zone state.
        if activityState == .suppressed {
            activityState      = .active
            resumeConsecFrames = 0
            let msg = "[ACTIVITY] state=active reason=forced_by_completed_rep_during_suppression"
            NSLog("[Engine] [%@] %@", def.id, msg)
            onDebugLog?(msg)
        }

        // Feed the passive calibration buffers off this valid, real rep — see
        // feedPassiveCalibration doc comment. No-ops once already calibrated.
        feedPassiveCalibration(topValue: repTopValue, peakValue: peakAngle)

        // ── Planarity gate ────────────────────────────────────────────────────────
        // If any segment was foreshortened during this rep the 2D angles are unreliable.
        // Suppress ROM verdict and GOOD status; emit the planarity cue instead.
        let enabledPlanarity = def.planarityChecks.filter { $0.enabled }
        var planarityFailCue: String? = nil
        var planParts: [String] = []

        for check in enabledPlanarity {
            let minR  = planarityMinRatios[check.id] ?? 999
            let ref   = calibratedSegmentRefs[check.id] ?? check.fallbackReferenceRatio
            let thr   = check.minRatio * ref
            let pass  = minR >= thr
            planParts.append(
                "\(check.id)=\(String(format: "%.3f", minR))" +
                "(ref=\(String(format: "%.3f", ref)) thr=\(String(format: "%.3f", thr)) \(pass ? "OK" : "FAIL"))"
            )
            if !pass && planarityFailCue == nil { planarityFailCue = check.cue }
        }

        let planarityPassed = planarityFailCue == nil
        let planDetail = planParts.isEmpty ? "n/a" : planParts.joined(separator: "  ")
        let planarityLog = (planarityPassed ? "planarity=PASS" : "planarity=FAIL") + "  " + planDetail

        if let planCue = planarityFailCue {
            NSLog("[Engine] [%@] Rep #%d PLANARITY FAIL — cue=%@ %@",
                  def.id, totalReps, planCue, planDetail)
            onRepDetected?(RepResult(
                good: false, cue: planCue, primaryAngle: peakAngle,
                totalReps: totalReps, goodReps: goodReps,
                formValues: [:], planarityLog: planarityLog, planarityPassed: false
            ))
            return
        }

        let goodROM = peakAngle <= effectiveROMThreshold

        var failed:    [FormCheck]       = []
        var evaluated: [String: Double]  = [:]

        for check in def.formChecks where check.enabled {
            guard let value = resolveValue(check: check) else { continue }
            evaluated[check.id] = value
            if check.fails(value: value) { failed.append(check) }
        }

        let topFormFail = failed.sorted { $0.priority > $1.priority }.first
        let topOverride = failed.filter { $0.priority >= Self.FORM_OVERRIDE_ROM_PRIORITY }
                                .sorted { $0.priority > $1.priority }
                                .first

        let cue:    String
        let isGood: Bool

        if !goodROM {
            if let override = topOverride {
                cue    = override.cue
                isGood = false
            } else {
                cue    = def.insufficientROMCue
                isGood = false
            }
        } else if let f = topFormFail {
            cue    = f.cue
            isGood = false
        } else {
            cue    = "GOOD"
            isGood = true
        }
        if isGood { goodReps += 1 }

        // [REP] log to onDebugLog → visible in JS session review.
        // top = repTopValue (max in .atTop before this rep), bottom = repMinAngle.
        // Appends raw form check values after " | " so hip deviation can be read directly
        // (e.g. "| hip_pike_l=0.021 hip_sag_l=-0.018") without NSLog access on Windows.
        let swing = repTopValue - repMinAngle
        let formLog = def.formChecks.filter(\.enabled).compactMap { ch -> String? in
            guard let v = evaluated[ch.id] else { return nil }
            let lim: Double
            switch ch.condition {
            case .greaterThan(let t): lim = t
            case .lessThan(let t):    lim = t
            }
            let tag = failed.contains { $0.id == ch.id } ? "FAIL" : "ok"
            return "\(ch.id)=\(String(format: "%.3f", v))/lim=\(String(format: "%.3f", lim))[\(tag)]"
        }.joined(separator: " ")
        onDebugLog?("[REP] #\(totalReps) top=\(String(format: "%.1f", repTopValue)) " +
                    "bottom=\(String(format: "%.1f", repMinAngle)) " +
                    "thr=\(String(format: "%.1f", effectiveROMThreshold)) " +
                    "swing=\(String(format: "%.1f", swing)) " +
                    "ROM=\(goodROM ? "ok" : "short") cue=\(cue)" +
                    (formLog.isEmpty ? "" : " | \(formLog)"))

        let checkLog = def.formChecks.filter(\.enabled).map { ch -> String in
            let v   = evaluated[ch.id].map { String(format: "%.3f", $0) } ?? "nil"
            let lim: Double
            switch ch.condition {
            case .greaterThan(let t): lim = t
            case .lessThan(let t):    lim = t
            }
            let tag = failed.contains { $0.id == ch.id } ? "FAIL" : "ok"
            return "\(ch.id)=\(v)/lim=\(String(format: "%.3f", lim))[\(tag)]"
        }.joined(separator: " ")

        NSLog("[Engine] [%@] Rep #%d peak=%g ROM=%@ cue=%@ %d/%d | %@",
              def.id, totalReps, peakAngle, goodROM ? "ok" : "short", cue,
              goodReps, totalReps, checkLog)

        onRepDetected?(RepResult(
            good:            isGood,
            cue:             cue,
            primaryAngle:    peakAngle,
            totalReps:       totalReps,
            goodReps:        goodReps,
            formValues:      evaluated,
            planarityLog:    planarityLog,
            planarityPassed: true
        ))
    }

    // ─── Data validity gate ───────────────────────────────────────────────────
    //
    // ROOT CAUSE A fix: was checking def.readyGate.requiredJoints at minConf=0.30,
    // but metric functions use kMinConf=0.25. Joints irrelevant to the repMetric
    // (hips in shoulderPress, ankles at squat bottom) caused constant false failures.
    // Now: valid iff repMetric.measure() returns non-nil (same gate the metric uses).

    private func dataIsValid(pose: Pose) -> Bool {
        guard def.repMetric.measure(pose: pose) != nil else {
            // Log which joints dropped below kMinConf — helps diagnose false invalids.
            let joints = def.repMetric.referencedJoints()
            let low = joints.filter { (pose[$0]?.confidence ?? 0) < kMinConf }
            let failStr = low.map {
                "\($0)=\(String(format: "%.2f", pose[$0]?.confidence ?? 0))"
            }.joined(separator: " ")
            let msg = "[VALID] FAIL — repMetric nil; low-conf: \(failStr.isEmpty ? "n/a" : failStr)"
            NSLog("[Engine] [%@] %@", def.id, msg)
            onDebugLog?(msg)
            return false
        }
        return true
    }

    // ─── Form metric accumulation ─────────────────────────────────────────────

    private func resetRepAccumulators() {
        accumMax           = [:]
        accumMin           = [:]
        atBottomVal        = [:]
        planarityMinRatios = [:]
    }

    private func accumulate(pose: Pose) {
        guard repPhase == .inRep else { return }
        for check in def.formChecks where check.enabled {
            guard let v = check.measure(pose: pose) else { continue }
            accumMax[check.id] = max(accumMax[check.id] ?? -999, v)
            accumMin[check.id] = min(accumMin[check.id] ??  999, v)
        }
        // Track minimum segment ratio (most foreshortened moment) during rep.
        for check in def.planarityChecks where check.enabled {
            if let v = Metric.segmentLengthRatio(jointA: check.jointA, jointB: check.jointB)
                             .measure(pose: pose) {
                planarityMinRatios[check.id] = min(planarityMinRatios[check.id] ?? 999, v)
            }
        }
    }

    private func snapshotAtBottom(pose: Pose) {
        for check in def.formChecks where check.enabled {
            guard case .atBottom = check.evaluateAt else { continue }
            if let v = check.measure(pose: pose) { atBottomVal[check.id] = v }
        }
    }

    private func resolveValue(check: FormCheck) -> Double? {
        switch check.evaluateAt {
        case .atBottom:      return atBottomVal[check.id]
        case .throughoutMax: return accumMax[check.id]
        case .throughoutMin: return accumMin[check.id]
        }
    }

    private func currentMetricSnapshot(pose: Pose) -> [String: Double] {
        var result: [String: Double] = [:]
        for check in def.formChecks where check.enabled {
            if let v = check.measure(pose: pose) { result[check.id] = v }
        }
        return result
    }

    // ─── Inactivity reset ─────────────────────────────────────────────────────

    private func handleNoPose(timestamp: Date) {
        // Reset immediately, before the inactivityTimeout guard below — a single
        // invalid/missing-pose frame should restart the settle count even if it's
        // too brief to trigger the full rep-state reset that follows.
        framesSincePoseGap = 0

        let elapsed = timestamp.timeIntervalSince(lastValidPoseTime)
        guard lastValidPoseTime != .distantPast,
              elapsed > inactivityTimeout else { return }
        if repPhase == .inRep {
            NSLog("[Engine] [%@] Inactivity reset after %.1fs", def.id, elapsed)
        }
        consecutivePassFrames = 0
        consecutiveFailFrames = 0
        repPhase = isReady ? .atTop : .waitingForReady
        resetRepState()
    }

    // ── Walk-away suppression ─────────────────────────────────────────────────

    private func updateActivityState(pose: Pose, angle: Double, timestamp: Date) {
        // Build torso-scale baseline during the first TORSO_BASELINE_FRAMES of ACTIVE phase.
        // Uses max over the window so the baseline reflects the user's closest natural position;
        // the approach threshold is then relative to a position the user actually held.
        if let ref = torsoReference(pose: pose) {
            torsoRefCurrent = ref
            if torsoRefBaselineFrames < Self.TORSO_BASELINE_FRAMES {
                torsoRefBaseline = max(torsoRefBaseline ?? 0.0, ref)
                torsoRefBaselineFrames += 1
            }
        }

        switch activityState {
        case .active:
            // Approach: torso reference has grown significantly above baseline (user walking closer).
            //
            // ROOT CAUSE (hinge family false-positive): torsoReference is the 2D shoulder-hip
            // distance in-frame — a proxy for camera distance ONLY if the torso's ANGLE to the
            // camera stays roughly constant. A hip-hinge's entire movement IS the torso rotating
            // from vertical to horizontal in the camera's view plane; real-world hinging isn't
            // perfectly planar and Vision's landmark estimate drifts more at extreme bent-over
            // angles, so the rotation itself inflates torsoRef exactly like walking closer would.
            //
            // A first fix gated this to repPhase != .inRep (only evaluate at rest) plus
            // consecutive-frame hysteresis, matching the inactivity check below and every other
            // gate in this file. On-device data showed it's still not enough — even the
            // "at rest" torsoRef reading for this family doesn't reliably return within
            // APPROACH_SCALE_FACTOR of the original standing baseline (natural rep-to-rep
            // posture variance, cumulative Vision drift). Torso-scale approach detection is
            // fundamentally unreliable for any exercise whose primary movement is a large
            // torso-angle change, not just mid-rep — so exercises that need it opt out entirely
            // via def.suppressApproachDetection (see ExerciseDefinition.swift). Currently: the
            // hip-hinge family. The repPhase gate + hysteresis stays for every other exercise.
            if !def.suppressApproachDetection, repPhase != .inRep {
                if let baseline = torsoRefBaseline,
                   torsoRefBaselineFrames >= Self.TORSO_BASELINE_FRAMES,
                   torsoRefCurrent > baseline * Self.APPROACH_SCALE_FACTOR {
                    approachConsecFrames = min(approachConsecFrames + 1, Self.APPROACH_ENTER_FRAMES + 5)
                    if approachConsecFrames >= Self.APPROACH_ENTER_FRAMES {
                        suppressAndLog(reason: "approach " +
                                       "torsoRef=\(String(format: "%.3f", torsoRefCurrent)) " +
                                       "baseline=\(String(format: "%.3f", baseline))")
                        approachConsecFrames = 0
                        return
                    }
                } else {
                    approachConsecFrames = max(0, approachConsecFrames - 1)
                }
            }
            // Inactivity: at least one rep done, not mid-rep, long gap since last rep.
            if totalReps > 0,
               repPhase != .inRep,
               timestamp.timeIntervalSince(lastRepTime) >= Self.INACTIVITY_REP_GAP_SEC {
                suppressAndLog(reason: "inactivity gap=\(String(format: "%.1f", timestamp.timeIntervalSince(lastRepTime)))s")
            }

        case .suppressed:
            // Resume when torso scale has normalised AND metric is back in the start zone.
            // "Start zone" = metric >= 75% of topAngle (user has arm extended toward start position).
            let torsoOk: Bool = {
                guard let baseline = torsoRefBaseline else { return true }
                return torsoRefCurrent <= baseline * Self.APPROACH_RELEASE_MULT
            }()
            let inStartZone = angle >= def.topAngle * 0.75

            // ROOT CAUSE: this counter used to hard-reset to 0 on any single failing
            // frame — the exact bug already fixed for the ready gate (FIX 2, above) and
            // the settle gate. At ~10fps effective sampling (frameSkip=3 of 30fps), one
            // noisy Vision frame (confidence dip, motion blur) was enough to keep this
            // permanently at 0, so RESUME_CONSEC_FRAMES (15 consecutive clean frames)
            // was almost never reached in practice — suppression looked "stuck".
            // Fix: graceful decay, matching every other hysteresis counter in this file.
            if torsoOk && inStartZone {
                resumeConsecFrames = min(resumeConsecFrames + 1, Self.RESUME_CONSEC_FRAMES + 5)
            } else {
                resumeConsecFrames = max(0, resumeConsecFrames - 1)
            }

            // [ACTIVITY] diagnostic — always emitted (throttled ~3/sec) while suppressed,
            // so a stuck resume is debuggable instead of silent.
            let nowLog = timestamp.timeIntervalSinceReferenceDate
            if nowLog - lastActivityLogTime >= 0.33 {
                lastActivityLogTime = nowLog
                let baselineStr = torsoRefBaseline.map { String(format: "%.3f", $0) } ?? "n/a"
                let releaseStr  = torsoRefBaseline.map { String(format: "%.3f", $0 * Self.APPROACH_RELEASE_MULT) } ?? "n/a"
                let msg = "[ACTIVITY] suppressed reason=\(suppressionReason) " +
                          "torso=\(String(format: "%.3f", torsoRefCurrent)) baseline=\(baselineStr) releaseMax=\(releaseStr) torsoOk=\(torsoOk) " +
                          "metric=\(String(format: "%.1f", angle)) needMetric>=\(String(format: "%.1f", def.topAngle * 0.75)) inStartZone=\(inStartZone) " +
                          "resumeFrames=\(resumeConsecFrames)/\(Self.RESUME_CONSEC_FRAMES)"
                NSLog("[Engine] [%@] %@", def.id, msg)
                onDebugLog?(msg)
            }

            if resumeConsecFrames >= Self.RESUME_CONSEC_FRAMES {
                activityState = .active
                resumeConsecFrames = 0
                let msg = "[ACTIVITY] state=active reason=returned_to_start_position"
                NSLog("[Engine] [%@] %@", def.id, msg)
                onDebugLog?(msg)
            }
        }
    }

    private func suppressAndLog(reason: String) {
        activityState = .suppressed
        suppressionReason = reason
        resumeConsecFrames = 0
        approachConsecFrames = 0
        // Abandon any in-progress rep cleanly so stale accumulators don't carry over.
        if repPhase == .inRep {
            repPhase = .atTop
            resetRepState()
        }
        let msg = "[ACTIVITY] state=suppressed reason=\(reason)"
        NSLog("[Engine] [%@] %@", def.id, msg)
        onDebugLog?(msg)
    }

    private func resetActivityState() {
        activityState          = .active
        suppressionReason      = ""
        torsoRefBaseline       = nil
        torsoRefBaselineFrames = 0
        torsoRefCurrent        = 0.0
        resumeConsecFrames     = 0
        approachConsecFrames   = 0
    }

    private func resetSettleState() {
        hasSettled       = false
        settledTopFrames = 0
    }

    private func resetRepState() {
        repMinAngle   = 999
        repTopValue   = 0
        repEnterValue = 0
        resetRepAccumulators()
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    // Returns the cue of the first foreshortened segment, or nil if all in-plane.
    private func currentOutOfPlaneCue(pose: Pose) -> String? {
        for check in def.planarityChecks where check.enabled {
            guard let current = Metric.segmentLengthRatio(jointA: check.jointA, jointB: check.jointB)
                                      .measure(pose: pose) else { continue }
            let reference = calibratedSegmentRefs[check.id] ?? check.fallbackReferenceRatio
            if current < check.minRatio * reference { return check.cue }
        }
        return nil
    }

    private func phaseLabel() -> String {
        switch enginePhase {
        case .setup: return "setup"
        case .active:
            switch repPhase {
            case .waitingForReady: return "waiting"
            case .atTop:           return "top"
            case .inRep:           return "inRep"
            }
        }
    }
}
