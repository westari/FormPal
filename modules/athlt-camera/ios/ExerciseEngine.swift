import Foundation

// ─── Rep result ───────────────────────────────────────────────────────────────

struct RepResult {
    let good:         Bool
    let cue:          String    // e.g. "GOOD" | "GO DEEPER" | "CHEST UP"
    let primaryAngle: Double    // primary angle at peak flexion
    let totalReps:    Int
    let goodReps:     Int
    let formValues:   [String: Double]   // check.id → evaluated value (for event emission)
}

// ─── Setup status (emitted during SETUP phase) ────────────────────────────────

struct SetupStatus {
    let allJointsVisible: Bool
    let holdProgress:     Double   // 0.0–1.0 during the 2s hold
    let passed:           Bool
    let hint:             String   // "" when all joints visible; guidance text when not
}

// ─── Debug stats (emitted every frame) ────────────────────────────────────────

struct EngineDebugStats {
    let primaryAngle: Double
    let phase:        String
    let isReady:      Bool
    let formMetrics:  [String: Double]   // check.id → current measured value
}

// ─── Internal phase ───────────────────────────────────────────────────────────

private enum Phase { case waitingForReady, atTop, inRep }

private enum SetupPhaseState {
    case pending
    case holding(startTime: Date)
}

// ─── The shared exercise analysis engine ─────────────────────────────────────
//
// Two-phase design:
//
//   SETUP phase (isSetupComplete = false):
//     Runs runSetupCheck() every frame.
//     Checks requiredJoints visibility + edge margin.
//     Requires a continuous 2-second hold before passing.
//     Emits onSetupUpdate every frame.
//     Rep counting does NOT run.
//
//   ACTIVE phase (isSetupComplete = true):
//     Zero calibration checks — reps count with no interference.
//     Only returns to SETUP if ALL required joints missing for ≥ 3 seconds
//     (person left / phone knocked over). Normal movement never re-triggers it.
//
// Rep logic (ACTIVE only):
//   atTop  → angle < repEnterThreshold  → inRep  (start tracking)
//   inRep  → track min primary angle
//           → angle > repExitThreshold  → count rep → atTop
//
// Form evaluation at rep completion:
//   .atBottom   → value captured at the frame where repMinAngle updated
//   .throughoutMax / .throughoutMin → accumulated across all inRep frames

final class ExerciseEngine {

    private let def: ExerciseDefinition

    // ── State machine ────────────────────────────────────────────────────────
    private var phase:       Phase  = .waitingForReady
    private var repMinAngle: Double = 999

    // ── Rep counters ─────────────────────────────────────────────────────────
    private(set) var totalReps = 0
    private(set) var goodReps  = 0

    // ── Ready gate ───────────────────────────────────────────────────────────
    private(set) var isReady: Bool  = false
    private var readyStart:   Date? = nil

    // ── Setup / calibration ───────────────────────────────────────────────────
    private(set) var isSetupComplete = false
    private var setupPhaseState: SetupPhaseState = .pending
    private var setupLossStart:  Date? = nil

    private static let SETUP_HOLD_DURATION:   TimeInterval = 2.0
    private static let LEAVE_TIMEOUT:         TimeInterval = 3.0
    private static let SETUP_JOINT_MIN_CONF:  Float        = 0.30
    private static let SETUP_EDGE_MARGIN:     Double       = 0.05

    // ── Form check accumulators (reset each rep) ──────────────────────────────
    private var accumMax:    [String: Double] = [:]
    private var accumMin:    [String: Double] = [:]
    private var atBottomVal: [String: Double] = [:]

    // ── Debounce / inactivity ─────────────────────────────────────────────────
    private var lastRepTime:       Date = .distantPast
    private var lastValidPoseTime: Date = .distantPast
    private let inactivityTimeout: TimeInterval = 2.5

    // ── Form-over-ROM priority threshold ──────────────────────────────────────
    //
    // Form checks with priority >= this value override the insufficientROMCue even
    // when goodROM is false. This handles cases where bad body position distorts the
    // 2D-projected angle (e.g. elbow drift makes a full curl look shallow on camera).
    // Curl: elbow_drift=4, lean_back=5 → both override "CURL HIGHER".
    private static let FORM_OVERRIDE_ROM_PRIORITY: Int = 4

    // ── Active side (for bestSide exercises) ──────────────────────────────────
    private var activeSide: Side = .right

    // ── Per-frame debug log throttle (verticalGapBestSide exercises only) ─────
    private var lastFrameLogTime: Double = 0

    // ── Callbacks ─────────────────────────────────────────────────────────────
    var onRepDetected:  ((RepResult)      -> Void)?
    var onDebugStats:   ((EngineDebugStats) -> Void)?
    var onSetupUpdate:  ((SetupStatus)    -> Void)?

    // ─────────────────────────────────────────────────────────────────────────

    init(definition: ExerciseDefinition) {
        self.def = definition
    }

    // Full reset — clears everything including setup. Used when session ends.
    func reset() {
        phase             = .waitingForReady
        isReady           = false
        readyStart        = nil
        totalReps         = 0
        goodReps          = 0
        isSetupComplete   = false
        setupPhaseState   = .pending
        setupLossStart    = nil
        lastValidPoseTime = .distantPast
        resetRepState()
    }

    // Partial reset — resets rep counters but keeps isSetupComplete.
    // Used when startTracking() is called after calibration already passed.
    func resetForTracking() {
        phase             = .waitingForReady
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
        // Person is back in frame — cancel any "person left" countdown
        if isSetupComplete { setupLossStart = nil }

        guard let angle = computePrimaryAngle(pose: pose) else {
            handleNoPose(timestamp: timestamp)
            return
        }

        // Per-frame tuning log for verticalGapBestSide (push-up) — ~1 fps rate.
        // Read "[Engine] [pushup] frame:" NSLog to calibrate repEnterThreshold,
        // repExitThreshold, and goodROMThreshold before shipping.
        if case let .verticalGapBestSide(lu, ll, ru, rl) = def.primaryAngle {
            let now = timestamp.timeIntervalSinceReferenceDate
            if now - lastFrameLogTime >= 1.0 {
                lastFrameLogTime = now
                let lShY = pose[lu].map { Double($0.y) } ?? -1
                let lElY = pose[ll].map { Double($0.y) } ?? -1
                let rShY = pose[ru].map { Double($0.y) } ?? -1
                let rElY = pose[rl].map { Double($0.y) } ?? -1
                NSLog("[Engine] [%@] frame: gap=%.4f phase=%@ | L sh=%.3f el=%.3f gap=%.4f | R sh=%.3f el=%.3f gap=%.4f",
                      def.id, angle, phaseLabel(),
                      lShY, lElY, lShY - lElY,
                      rShY, rElY, rShY - rElY)
            }
        }

        if !isSetupComplete {
            // SETUP phase: one-time calibration check, no rep counting
            runSetupCheck(pose: pose, timestamp: timestamp)
            onDebugStats?(EngineDebugStats(primaryAngle: angle, phase: "setup",
                                           isReady: false, formMetrics: [:]))
            return
        }

        // ACTIVE phase: pure rep counting, zero calibration checks
        lastValidPoseTime = timestamp
        accumulate(pose: pose, primaryAngle: angle)
        if !isReady { updateReadyGate(pose: pose, angle: angle, timestamp: timestamp) }
        if isReady  { runStateMachine(pose: pose, angle: angle, timestamp: timestamp) }

        let snapshot = currentMetricSnapshot(pose: pose)
        onDebugStats?(EngineDebugStats(primaryAngle: angle, phase: phaseLabel(),
                                       isReady: isReady, formMetrics: snapshot))
    }

    func notePersonMissing(timestamp: Date) {
        if isSetupComplete {
            // ACTIVE phase: track how long person has been gone
            if setupLossStart == nil { setupLossStart = timestamp }
            let gone = timestamp.timeIntervalSince(setupLossStart!)
            if gone >= Self.LEAVE_TIMEOUT {
                NSLog("[Engine] [%@] Person gone %.1fs — returning to SETUP", def.id, gone)
                isSetupComplete = false
                setupPhaseState = .pending
                setupLossStart  = nil
                isReady         = false
                phase           = .waitingForReady
                onSetupUpdate?(SetupStatus(allJointsVisible: false, holdProgress: 0.0,
                                           passed: false, hint: "Step back into view to continue"))
            }
            // else: person hasn't been gone long enough — don't interrupt active workout
        } else {
            // SETUP phase: person left, reset the hold timer
            if case .holding = setupPhaseState {
                NSLog("[Engine] [%@] Setup: person left — hold reset", def.id)
                setupPhaseState = .pending
            }
            onSetupUpdate?(SetupStatus(allJointsVisible: false, holdProgress: 0.0,
                                       passed: false, hint: "Step into frame to start"))
        }
        handleNoPose(timestamp: timestamp)
    }

    // ─── Setup calibration ────────────────────────────────────────────────────
    //
    // Checks: confidence ≥ SETUP_JOINT_MIN_CONF AND not edge-clipped (≥ 5% from edges).
    // On pass: logs confidence for each required joint (useful for tuning min conf).
    // On hold reset: logs which joints were lost.
    // Hold duration and leave timeout are constants at the top of this file.

    private func runSetupCheck(pose: Pose, timestamp: Date) {
        guard let setup = def.cameraSetup else {
            // No setup required — pass immediately
            isSetupComplete = true
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
                allVisible = true
                missingJoints = []
            } else if missingAlt.count < missingMain.count {
                missingJoints = missingAlt
            }
        }

        var holdProgress: Double = 0.0

        if allVisible {
            switch setupPhaseState {
            case .pending:
                NSLog("[Engine] [%@] Setup: all joints visible — starting %.0fs hold", def.id, Self.SETUP_HOLD_DURATION)
                // Log whichever joint set is the one that passed
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
                    isSetupComplete = true
                    NSLog("[Engine] [%@] Setup PASSED", def.id)
                    onSetupUpdate?(SetupStatus(allJointsVisible: true, holdProgress: 1.0,
                                               passed: true, hint: ""))
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

    // ─── Primary angle ────────────────────────────────────────────────────────

    private func computePrimaryAngle(pose: Pose) -> Double? {
        switch def.primaryAngle {

        case let .averageBothSides(left, right):
            let l = jointAngle(pose: pose, a: left.a,  b: left.pivot,  c: left.c)
            let r = jointAngle(pose: pose, a: right.a, b: right.pivot, c: right.c)
            switch (l, r) {
            case let (lv?, rv?): return (lv + rv) / 2
            case let (lv?, nil): return lv
            case let (nil, rv?): return rv
            default:             return nil
            }

        case let .mostFlexed(left, right):
            let l = jointAngle(pose: pose, a: left.a,  b: left.pivot,  c: left.c)
            let r = jointAngle(pose: pose, a: right.a, b: right.pivot, c: right.c)
            switch (l, r) {
            case let (lv?, rv?): return min(lv, rv)
            case let (lv?, nil): return lv
            case let (nil, rv?): return rv
            default:             return nil
            }

        case let .bestSide(left, right, leftJoints, rightJoints):
            let lConf = leftJoints.compactMap  { pose[$0]?.confidence }.reduce(0, +)
            let rConf = rightJoints.compactMap { pose[$0]?.confidence }.reduce(0, +)
            activeSide = rConf >= lConf ? .right : .left
            let t = activeSide == .left ? left : right
            return jointAngle(pose: pose, a: t.a, b: t.pivot, c: t.c)

        case let .verticalGapBestSide(lu, ll, ru, rl):
            let lGap  = verticalGap(pose: pose, upper: lu, lower: ll)
            let rGap  = verticalGap(pose: pose, upper: ru, lower: rl)
            let lConf = (pose[lu]?.confidence ?? 0) + (pose[ll]?.confidence ?? 0)
            let rConf = (pose[ru]?.confidence ?? 0) + (pose[rl]?.confidence ?? 0)
            if lConf >= rConf { return lGap ?? rGap }
            return rGap ?? lGap
        }
    }

    // ─── Ready gate ───────────────────────────────────────────────────────────

    private func updateReadyGate(pose: Pose, angle: Double, timestamp: Date) {
        let gate     = def.readyGate
        let angleOk  = angle >= gate.readyAngleMin && angle <= gate.readyAngleMax
        let jointsOk = gate.requiredJoints.allSatisfy { (pose[$0]?.confidence ?? 0) >= gate.minConfidence }

        if angleOk && jointsOk {
            if readyStart == nil { readyStart = timestamp }
            if timestamp.timeIntervalSince(readyStart!) >= gate.stableDuration {
                isReady    = true
                phase      = .atTop
                readyStart = nil
                NSLog("[Engine] [%@] READY — angle=%.1f°", def.id, angle)
            }
        } else {
            readyStart = nil
        }
    }

    // ─── State machine ────────────────────────────────────────────────────────

    private func runStateMachine(pose: Pose, angle: Double, timestamp: Date) {
        switch phase {

        case .waitingForReady:
            phase = .atTop

        case .atTop:
            if angle < def.repEnterThreshold {
                phase       = .inRep
                repMinAngle = angle
                resetRepAccumulators()
                NSLog("[Engine] [%@] Rep entered at %.1f°", def.id, angle)
            }

        case .inRep:
            if angle < repMinAngle {
                repMinAngle = angle
                snapshotAtBottom(pose: pose)
            }
            if angle > def.repExitThreshold {
                guard timestamp.timeIntervalSince(lastRepTime) >= def.minRepInterval else {
                    NSLog("[Engine] [%@] Debounce — skip", def.id)
                    phase = .atTop
                    return
                }
                completeRep(pose: pose, peakAngle: repMinAngle, timestamp: timestamp)
                phase = .atTop
            }
        }
    }

    // ─── Rep completion ───────────────────────────────────────────────────────

    private func completeRep(pose: Pose, peakAngle: Double, timestamp: Date) {
        totalReps  += 1
        lastRepTime = timestamp

        let goodROM = peakAngle <= def.goodROMThreshold

        var failed: [FormCheck] = []
        var evaluated: [String: Double] = [:]

        for check in def.formChecks where check.enabled {
            guard let value = resolveValue(check: check) else { continue }
            evaluated[check.id] = value
            if check.fails(value: value) { failed.append(check) }
        }

        let topFormFail = failed.sorted { $0.priority > $1.priority }.first
        // Checks at priority >= FORM_OVERRIDE_ROM_PRIORITY beat the ROM cue.
        // Handles drifted-arm curls: 2D projection makes a high curl look shallow,
        // but elbow_drift (p=4) should win over "CURL HIGHER".
        let topOverride = failed.filter { $0.priority >= Self.FORM_OVERRIDE_ROM_PRIORITY }
                                .sorted { $0.priority > $1.priority }
                                .first

        let cue:    String
        let isGood: Bool

        if !goodROM {
            if let override = topOverride {
                cue    = override.cue   // position cue beats ROM miss
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

        // peak uses %g so squat/curl show degrees (e.g. 52.3) and push-up shows
        // Vision units (e.g. 0.003) without truncation from %.1f
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

    // ─── Form metric accumulation ─────────────────────────────────────────────

    private func resetRepAccumulators() {
        accumMax    = [:]
        accumMin    = [:]
        atBottomVal = [:]
    }

    private func accumulate(pose: Pose, primaryAngle: Double) {
        guard phase == .inRep else { return }
        for check in def.formChecks where check.enabled {
            let value: Double?
            if case .primaryAngle = check.metric {
                value = primaryAngle
            } else {
                value = check.measure(pose: pose)
            }
            guard let v = value else { continue }
            accumMax[check.id] = max(accumMax[check.id] ?? -999, v)
            accumMin[check.id] = min(accumMin[check.id] ??  999, v)
        }
    }

    private func snapshotAtBottom(pose: Pose) {
        for check in def.formChecks where check.enabled {
            guard case .atBottom = check.evaluateAt else { continue }
            if case .primaryAngle = check.metric {
                atBottomVal[check.id] = repMinAngle
            } else if let v = check.measure(pose: pose) {
                atBottomVal[check.id] = v
            }
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

        if phase == .inRep {
            NSLog("[Engine] [%@] Inactivity reset after %.1fs", def.id, elapsed)
        }
        phase = isReady ? .atTop : .waitingForReady
        resetRepState()
    }

    private func resetRepState() {
        repMinAngle = 999
        resetRepAccumulators()
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private func phaseLabel() -> String {
        switch phase {
        case .waitingForReady: return "waiting"
        case .atTop:           return "top"
        case .inRep:           return "inRep"
        }
    }
}

// Used by bestSide primary angle config
private enum Side { case left, right }
