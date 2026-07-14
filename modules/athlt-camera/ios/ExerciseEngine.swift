import Foundation

// ─── Rep result ───────────────────────────────────────────────────────────────

struct RepResult {
    let good:         Bool
    let cue:          String
    let primaryAngle: Double
    let totalReps:    Int
    let goodReps:     Int
    let formValues:   [String: Double]
}

// ─── Setup status (emitted during SETUP phase) ────────────────────────────────

struct SetupStatus {
    let allJointsVisible: Bool
    let holdProgress:     Double
    let passed:           Bool
    let hint:             String
}

// ─── Calibration status (emitted during CALIBRATION phase) ───────────────────

struct CalibrationStatus {
    let repsCompleted: Int
    let repsNeeded:    Int
    let passed:        Bool
}

// ─── Debug stats (emitted every frame in ACTIVE phase) ───────────────────────

struct EngineDebugStats {
    let primaryAngle: Double
    let phase:        String
    let isReady:      Bool
    let formMetrics:  [String: Double]
}

// ─── Internal phases ──────────────────────────────────────────────────────────

private enum EnginePhase { case setup, calibration, active }
private enum RepPhase    { case waitingForReady, atTop, inRep }

private enum SetupPhaseState {
    case pending
    case holding(startTime: Date)
}

// ─── The exercise engine ──────────────────────────────────────────────────────
//
// Three-phase design:
//
//   SETUP (enginePhase = .setup):
//     Checks requiredJoints visibility + edge margin.
//     Requires a 2-second continuous hold before passing.
//     Rep counting does NOT run. Emits onSetupUpdate every frame.
//
//   CALIBRATION (enginePhase = .calibration) — optional:
//     Runs if def.calibration != nil.
//     User does repsNeeded slow reps; engine records rest/peak metric values.
//     On completion, derives repEnter/repExit/goodROM thresholds for this user.
//     Emits onCalibrationUpdate on each calib rep and when done.
//
//   ACTIVE (enginePhase = .active):
//     Pure rep counting with zero calibration interference.
//     Uses derived thresholds if calibration ran, otherwise static ones.
//     Returns to SETUP if all required joints missing for ≥ 3 seconds.
//
// Rep logic (ACTIVE only):
//   atTop  → metric < repEnterThreshold → inRep  (track minimum)
//   inRep  → metric > repExitThreshold  → count rep → atTop
//
// Validity gate:
//   Before evaluating form: checks required joint confidence.
//   Low-confidence rep → emits "ADJUST POSITION", not counted as good.
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

    // Backward compat: modules that check isSetupComplete still work.
    var isSetupComplete: Bool { enginePhase != .setup }

    // ── Rep counters ─────────────────────────────────────────────────────────
    private(set) var totalReps = 0
    private(set) var goodReps  = 0

    // ── Ready gate ───────────────────────────────────────────────────────────
    private(set) var isReady: Bool  = false
    private var readyStart:   Date? = nil

    // ── Setup ────────────────────────────────────────────────────────────────
    private var setupPhaseState: SetupPhaseState = .pending
    private var setupLossStart:  Date? = nil

    private static let SETUP_HOLD_DURATION:   TimeInterval = 2.0
    private static let LEAVE_TIMEOUT:         TimeInterval = 3.0
    private static let SETUP_JOINT_MIN_CONF:  Float        = 0.30
    private static let SETUP_EDGE_MARGIN:     Double       = 0.05

    // ── Calibration ───────────────────────────────────────────────────────────
    private var calibInRep:        Bool     = false
    private var calibRepPeak:      Double   = 999
    private var calibRestBuf:      [Double] = []   // rest-angle rolling buffer
    private var calibPeakAngles:   [Double] = []
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

    // ── Debounce / inactivity ─────────────────────────────────────────────────
    private var lastRepTime:       Date = .distantPast
    private var lastValidPoseTime: Date = .distantPast
    private let inactivityTimeout: TimeInterval = 2.5

    // ── Per-frame log throttle ────────────────────────────────────────────────
    private var lastFrameLogTime: Double = 0

    // ── Callbacks ─────────────────────────────────────────────────────────────
    var onRepDetected:       ((RepResult)        -> Void)?
    var onDebugStats:        ((EngineDebugStats) -> Void)?
    var onSetupUpdate:       ((SetupStatus)      -> Void)?
    var onCalibrationUpdate: ((CalibrationStatus) -> Void)?
    var onNewPeakDetected:   ((Double)           -> Void)?  // fires each time repMinAngle improves; arg = new peak metric

    // ─────────────────────────────────────────────────────────────────────────

    init(definition: ExerciseDefinition) {
        self.def = definition
    }

    // Full reset — clears everything including setup and calibration.
    func reset() {
        enginePhase     = .setup
        repPhase        = .waitingForReady
        isReady         = false
        readyStart      = nil
        totalReps       = 0
        goodReps        = 0
        setupPhaseState = .pending
        setupLossStart  = nil
        lastValidPoseTime = .distantPast
        resetCalibrationState(keepDerived: false)
        resetRepState()
    }

    // Partial reset — resets rep counters but keeps enginePhase and calibration-derived thresholds.
    // Used when startTracking() is called after setup/calibration already passed.
    func resetForTracking() {
        repPhase          = .waitingForReady
        isReady           = false
        readyStart        = nil
        totalReps         = 0
        goodReps          = 0
        setupLossStart    = nil
        lastValidPoseTime = .distantPast
        resetRepState()
    }

    // ─── Per-frame entry point ────────────────────────────────────────────────

    func ingest(pose: Pose, timestamp: Date) {
        if enginePhase == .active { setupLossStart = nil }

        guard let angle = def.repMetric.measure(pose: pose) else {
            handleNoPose(timestamp: timestamp)
            return
        }

        // Generic per-frame log (~1 fps) for threshold tuning on-device.
        let now = timestamp.timeIntervalSinceReferenceDate
        if now - lastFrameLogTime >= 1.0 {
            lastFrameLogTime = now
            NSLog("[Engine] [%@] frame: metric=%g phase=%@", def.id, angle, phaseLabel())
        }

        switch enginePhase {
        case .setup:
            runSetupCheck(pose: pose, timestamp: timestamp)
            onDebugStats?(EngineDebugStats(primaryAngle: angle, phase: "setup",
                                           isReady: false, formMetrics: [:]))
            return

        case .calibration:
            lastValidPoseTime = timestamp
            runCalibration(pose: pose, angle: angle, timestamp: timestamp)
            onDebugStats?(EngineDebugStats(primaryAngle: angle, phase: "calibration",
                                           isReady: false, formMetrics: [:]))
            return

        case .active:
            break
        }

        // ── ACTIVE phase ──────────────────────────────────────────────────────
        lastValidPoseTime = timestamp
        accumulate(pose: pose)
        if !isReady { updateReadyGate(pose: pose, angle: angle, timestamp: timestamp) }
        if isReady  { runStateMachine(pose: pose, angle: angle, timestamp: timestamp) }

        let snapshot = currentMetricSnapshot(pose: pose)
        onDebugStats?(EngineDebugStats(primaryAngle: angle, phase: phaseLabel(),
                                       isReady: isReady, formMetrics: snapshot))
    }

    func notePersonMissing(timestamp: Date) {
        if enginePhase == .active {
            if setupLossStart == nil { setupLossStart = timestamp }
            let gone = timestamp.timeIntervalSince(setupLossStart!)
            if gone >= Self.LEAVE_TIMEOUT {
                NSLog("[Engine] [%@] Person gone %.1fs — returning to SETUP", def.id, gone)
                enginePhase     = .setup
                setupPhaseState = .pending
                setupLossStart  = nil
                isReady         = false
                repPhase        = .waitingForReady
                resetCalibrationState(keepDerived: false)
                onSetupUpdate?(SetupStatus(allJointsVisible: false, holdProgress: 0.0,
                                           passed: false, hint: "Step back into view to continue"))
            }
        } else {
            if case .holding = setupPhaseState {
                NSLog("[Engine] [%@] Setup: person left — hold reset", def.id)
                setupPhaseState = .pending
            }
            if enginePhase == .calibration {
                calibInRep   = false
                calibRestBuf = []
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

    // Called when setup passes — transitions to CALIBRATION (if configured) or ACTIVE.
    private func transitionFromSetup() {
        if let config = def.calibration {
            enginePhase    = .calibration
            calibRepCount  = 0
            calibRestBuf   = []
            calibPeakAngles = []
            calibInRep     = false
            calibRepPeak   = 999
            NSLog("[Engine] [%@] Entering CALIBRATION — do %d slow reps", def.id, config.repsNeeded)
            onCalibrationUpdate?(CalibrationStatus(repsCompleted: 0,
                                                   repsNeeded: config.repsNeeded,
                                                   passed: false))
        } else {
            enginePhase = .active
        }
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

    // ─── Calibration phase ────────────────────────────────────────────────────

    private func runCalibration(pose: Pose, angle: Double, timestamp: Date) {
        guard let config = def.calibration else { return }

        if !calibInRep {
            calibRestBuf.append(angle)
            if calibRestBuf.count > 40 { calibRestBuf.removeFirst() }

            if angle < def.repEnterThreshold {
                calibInRep   = true
                calibRepPeak = angle
                NSLog("[Engine] [%@] Calib rep %d entering — metric=%g",
                      def.id, calibRepCount + 1, angle)
            }
        } else {
            if angle < calibRepPeak { calibRepPeak = angle }

            if angle > def.repExitThreshold {
                calibPeakAngles.append(calibRepPeak)
                calibRepCount += 1
                calibInRep = false
                NSLog("[Engine] [%@] Calib rep %d done — peak=%g", def.id, calibRepCount, calibRepPeak)

                if calibRepCount >= config.repsNeeded {
                    finishCalibration(config: config)
                } else {
                    onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                                           repsNeeded: config.repsNeeded,
                                                           passed: false))
                }
            }
        }
    }

    private func finishCalibration(config: CalibrationConfig) {
        // Use the last 15 rest-period frames for rest angle (captures post-rep stillness).
        let restSample = Array(calibRestBuf.suffix(15))
        guard !calibPeakAngles.isEmpty, restSample.count >= 3 else {
            NSLog("[Engine] [%@] Calib: insufficient data — using static thresholds", def.id)
            enginePhase = .active
            onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                                   repsNeeded: config.repsNeeded,
                                                   passed: true))
            return
        }

        let avgPeak = calibPeakAngles.reduce(0, +) / Double(calibPeakAngles.count)
        let avgRest = restSample.reduce(0, +)       / Double(restSample.count)
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

        enginePhase = .active
        onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                               repsNeeded: config.repsNeeded,
                                               passed: true))
    }

    private func resetCalibrationState(keepDerived: Bool) {
        calibInRep      = false
        calibRepPeak    = 999
        calibRestBuf    = []
        calibPeakAngles = []
        calibRepCount   = 0
        if !keepDerived {
            calibDerivedEnter = nil
            calibDerivedExit  = nil
        }
    }

    // ─── Ready gate ───────────────────────────────────────────────────────────

    private func updateReadyGate(pose: Pose, angle: Double, timestamp: Date) {
        let gate     = def.readyGate
        let angleOk  = angle >= gate.readyAngleMin && angle <= gate.readyAngleMax
        let jointsOk = gate.requiredJoints.allSatisfy {
            (pose[$0]?.confidence ?? 0) >= gate.minConfidence
        }

        if angleOk && jointsOk {
            if readyStart == nil { readyStart = timestamp }
            if timestamp.timeIntervalSince(readyStart!) >= gate.stableDuration {
                isReady    = true
                repPhase   = .atTop
                readyStart = nil
                NSLog("[Engine] [%@] READY — metric=%g", def.id, angle)
            }
        } else {
            readyStart = nil
        }
    }

    // ─── State machine ────────────────────────────────────────────────────────

    private func runStateMachine(pose: Pose, angle: Double, timestamp: Date) {
        switch repPhase {

        case .waitingForReady:
            repPhase = .atTop

        case .atTop:
            if angle < effectiveEnterThreshold {
                repPhase    = .inRep
                repMinAngle = angle
                resetRepAccumulators()
                NSLog("[Engine] [%@] Rep entered — metric=%g (enter=%.4f)",
                      def.id, angle, effectiveEnterThreshold)
            }

        case .inRep:
            if angle < repMinAngle {
                repMinAngle = angle
                snapshotAtBottom(pose: pose)
                onNewPeakDetected?(angle)
            }
            if angle > effectiveExitThreshold {
                guard timestamp.timeIntervalSince(lastRepTime) >= def.minRepInterval else {
                    NSLog("[Engine] [%@] Debounce — skip", def.id)
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

        // Validity gate: if key joints are low-confidence, don't evaluate form.
        guard dataIsValid(pose: pose) else {
            NSLog("[Engine] [%@] Rep #%d — invalid data (low joint confidence)", def.id, totalReps)
            onRepDetected?(RepResult(good: false, cue: "ADJUST POSITION",
                                     primaryAngle: peakAngle, totalReps: totalReps,
                                     goodReps: goodReps, formValues: [:]))
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

        let checkLog = def.formChecks.filter(\.enabled).map { ch -> String in
            let v   = evaluated[ch.id].map { String(format: "%.3f", $0) } ?? "nil"
            let tag = failed.contains { $0.id == ch.id } ? "FAIL" : "ok"
            return "\(ch.id)=\(v)[\(tag)]"
        }.joined(separator: " ")

        NSLog("[Engine] [%@] Rep #%d peak=%g ROM=%@ cue=%@ %d/%d | %@",
              def.id, totalReps, peakAngle, goodROM ? "ok" : "short", cue,
              goodReps, totalReps, checkLog)

        onRepDetected?(RepResult(
            good:         isGood,
            cue:          cue,
            primaryAngle: peakAngle,
            totalReps:    totalReps,
            goodReps:     goodReps,
            formValues:   evaluated
        ))
    }

    // ─── Data validity gate ───────────────────────────────────────────────────

    private func dataIsValid(pose: Pose) -> Bool {
        def.readyGate.requiredJoints.allSatisfy {
            (pose[$0]?.confidence ?? 0) >= def.readyGate.minConfidence
        }
    }

    // ─── Form metric accumulation ─────────────────────────────────────────────

    private func resetRepAccumulators() {
        accumMax    = [:]
        accumMin    = [:]
        atBottomVal = [:]
    }

    private func accumulate(pose: Pose) {
        guard repPhase == .inRep else { return }
        for check in def.formChecks where check.enabled {
            guard let v = check.measure(pose: pose) else { continue }
            accumMax[check.id] = max(accumMax[check.id] ?? -999, v)
            accumMin[check.id] = min(accumMin[check.id] ??  999, v)
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
        let elapsed = timestamp.timeIntervalSince(lastValidPoseTime)
        guard lastValidPoseTime != .distantPast,
              elapsed > inactivityTimeout else { return }
        if repPhase == .inRep {
            NSLog("[Engine] [%@] Inactivity reset after %.1fs", def.id, elapsed)
        }
        repPhase = isReady ? .atTop : .waitingForReady
        resetRepState()
    }

    private func resetRepState() {
        repMinAngle = 999
        resetRepAccumulators()
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private func phaseLabel() -> String {
        switch enginePhase {
        case .setup:       return "setup"
        case .calibration: return "calibration"
        case .active:
            switch repPhase {
            case .waitingForReady: return "waiting"
            case .atTop:           return "top"
            case .inRep:           return "inRep"
            }
        }
    }
}
