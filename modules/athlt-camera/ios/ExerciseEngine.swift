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

// ─── Framing status ───────────────────────────────────────────────────────────

struct FramingStatus {
    let ok:     Bool
    let reason: String
}

// ─── Debug stats (emitted every frame) ────────────────────────────────────────

struct EngineDebugStats {
    let primaryAngle:  Double
    let phase:         String
    let isReady:       Bool
    let cameraOk:      Bool               // backward compat: mirrors framingStatus.ok
    let formMetrics:   [String: Double]   // check.id → current measured value
    let framingStatus: FramingStatus
}

// ─── Internal phase ───────────────────────────────────────────────────────────

private enum Phase { case waitingForReady, atTop, inRep }

// ─── The shared exercise analysis engine ─────────────────────────────────────
//
// Drives any exercise defined by an ExerciseDefinition.
// Swap the definition to change exercises — no if-exercise-equals branches here.
//
// Rep logic:
//   atTop  → angle < repEnterThreshold  → inRep  (start tracking)
//   inRep  → track min primary angle
//           → angle > repExitThreshold  → count rep → atTop
//
// Form evaluation at rep completion:
//   .atBottom   → value captured at the frame where repMinAngle updated
//   .throughoutMax / .throughoutMin → accumulated across all inRep frames
//   .primaryAngle metric → uses the primary angle value directly
//
// Framing gate (BLOCKING):
//   runFramingCheck() runs every frame before the state machine.
//   If framing goes bad mid-session, isReady is reset to false and phase
//   returns to waitingForReady — rep counters are NOT reset (preserved).
//   Rep counting resumes automatically when framing is restored.

final class ExerciseEngine {

    private let def: ExerciseDefinition

    // ── State machine ────────────────────────────────────────────────────────
    private var phase:       Phase  = .waitingForReady
    private var repMinAngle: Double = 999

    // ── Rep counters ─────────────────────────────────────────────────────────
    private(set) var totalReps = 0
    private(set) var goodReps  = 0

    // ── Ready gate ───────────────────────────────────────────────────────────
    private(set) var isReady:   Bool   = false
    private var readyStart:     Date?  = nil

    // ── Framing ───────────────────────────────────────────────────────────────
    private var lastFramingStatus = FramingStatus(ok: false, reason: "Setting up…")

    // Tune via NSLog output on-device: look for "[Framing] shoulderSep=..." lines.
    // Vision coords are normalized 0-1; shoulder sep for a true side-on person is ~0.05-0.15.
    // 0.20 = conservative threshold — fire early if getting false positives, tighten if late.
    private static let sideViewMaxShoulderSep: Double = 0.20

    // ── Form check accumulators (reset each rep) ──────────────────────────────
    private var accumMax:    [String: Double] = [:]   // throughoutMax
    private var accumMin:    [String: Double] = [:]   // throughoutMin
    private var atBottomVal: [String: Double] = [:]   // atBottom snapshot

    // ── Debounce / inactivity ─────────────────────────────────────────────────
    private var lastRepTime:       Date = .distantPast
    private var lastValidPoseTime: Date = .distantPast
    private let inactivityTimeout: TimeInterval = 2.5

    // ── Active side (for bestSide exercises) ──────────────────────────────────
    private var activeSide: Side = .right

    // ── Callbacks ─────────────────────────────────────────────────────────────
    var onRepDetected: ((RepResult)        -> Void)?
    var onDebugStats:  ((EngineDebugStats) -> Void)?

    // ─────────────────────────────────────────────────────────────────────────

    init(definition: ExerciseDefinition) {
        self.def = definition
    }

    func reset() {
        phase             = .waitingForReady
        isReady           = false
        readyStart        = nil
        totalReps         = 0
        goodReps          = 0
        lastFramingStatus = FramingStatus(ok: false, reason: "Setting up…")
        resetRepState()
    }

    // ─── Per-frame entry point ────────────────────────────────────────────────

    func ingest(pose: Pose, timestamp: Date) {
        guard let angle = computePrimaryAngle(pose: pose) else {
            handleNoPose(timestamp: timestamp); return
        }
        lastValidPoseTime = timestamp

        let framing = runFramingCheck(pose: pose)
        if framing.ok != lastFramingStatus.ok {
            NSLog("[Engine] [%@] framing → %@ (%@)",
                  def.id, framing.ok ? "OK ✓" : "BAD ✗", framing.reason)
            if !framing.ok && isReady {
                isReady    = false
                phase      = .waitingForReady
                readyStart = nil
            }
        }
        lastFramingStatus = framing

        if framing.ok {
            accumulate(pose: pose, primaryAngle: angle)
            if !isReady { updateReadyGate(pose: pose, angle: angle, timestamp: timestamp) }
            if isReady  { runStateMachine(pose: pose, angle: angle, timestamp: timestamp) }
        }

        let snapshot = currentMetricSnapshot(pose: pose)
        onDebugStats?(EngineDebugStats(
            primaryAngle:  angle,
            phase:         phaseLabel(),
            isReady:       isReady,
            cameraOk:      framing.ok,
            formMetrics:   snapshot,
            framingStatus: framing
        ))
    }

    // Public stateless framing check — used by ATHLTCameraModule in monitoring
    // mode (before startTracking) so the framing overlay works before rep counting starts.
    func checkFramingOnly(pose: Pose) -> FramingStatus {
        return runFramingCheck(pose: pose)
    }

    func notePersonMissing(timestamp: Date) {
        handleNoPose(timestamp: timestamp)
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
        }
    }

    // ─── Framing check ────────────────────────────────────────────────────────
    //
    // Checks two things:
    //   1. Required joints are visible at ≥ 0.35 confidence.
    //   2. For side-view exercises: shoulder horizontal separation is small
    //      (large separation → person is facing camera, not sideways).
    //
    // NSLog shoulder sep every frame for on-device threshold tuning.

    private func runFramingCheck(pose: Pose) -> FramingStatus {
        guard let setup = def.cameraSetup else { return FramingStatus(ok: true, reason: "") }

        let minConf: Float = 0.35
        var missingLegs = false
        var missingHips = false
        var missingArms = false

        for joint in setup.requiredJoints {
            let conf = pose[joint]?.confidence ?? 0
            guard conf >= minConf else {
                switch joint {
                case .leftAnkle, .rightAnkle, .leftKnee, .rightKnee:
                    missingLegs = true
                case .leftHip, .rightHip:
                    missingHips = true
                case .leftWrist, .rightWrist, .leftElbow, .rightElbow:
                    missingArms = true
                default:
                    break
                }
                continue
            }
        }

        if missingLegs { return FramingStatus(ok: false, reason: "MOVE BACK — legs not visible") }
        if missingHips { return FramingStatus(ok: false, reason: "MOVE BACK — hips not visible") }
        if missingArms { return FramingStatus(ok: false, reason: "STEP INTO FRAME — arms not visible") }

        if setup.requiredView == .side {
            if let ls = pose[.leftShoulder], let rs = pose[.rightShoulder],
               ls.confidence >= minConf, rs.confidence >= minConf {
                let sep = abs(Double(ls.x) - Double(rs.x))
                NSLog("[Framing] shoulderSep=%.3f threshold<%.2f side=%@",
                      sep, Self.sideViewMaxShoulderSep,
                      sep < Self.sideViewMaxShoulderSep ? "YES" : "NO")
                if sep > Self.sideViewMaxShoulderSep {
                    return FramingStatus(ok: false, reason: "TURN SIDEWAYS to the camera")
                }
            }
        }

        return FramingStatus(ok: true, reason: "")
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
                NSLog("[Engine] [\(def.id)] READY — angle=\(String(format: "%.1f°", angle))")
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
                NSLog("[Engine] [\(def.id)] Rep entered at \(String(format: "%.1f°", angle))")
            }

        case .inRep:
            if angle < repMinAngle {
                repMinAngle = angle
                snapshotAtBottom(pose: pose)
            }
            if angle > def.repExitThreshold {
                guard timestamp.timeIntervalSince(lastRepTime) >= def.minRepInterval else {
                    NSLog("[Engine] [\(def.id)] Debounce — skip")
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

        // Evaluate enabled form checks; collect failures by priority
        var failed: [FormCheck] = []
        var evaluated: [String: Double] = [:]

        for check in def.formChecks where check.enabled {
            guard let value = resolveValue(check: check) else { continue }
            evaluated[check.id] = value
            if check.fails(value: value) { failed.append(check) }
        }

        // ROM failure takes precedence over form failures
        let topFormFail = failed.sorted { $0.priority > $1.priority }.first
        let cue:    String
        let isGood: Bool

        if !goodROM {
            cue    = def.insufficientROMCue
            isGood = false
        } else if let f = topFormFail {
            cue    = f.cue
            isGood = false
        } else {
            cue    = "GOOD"
            isGood = true
        }
        if isGood { goodReps += 1 }

        // NSLog the full picture for on-device tuning
        let checkLog = def.formChecks.filter(\.enabled).map { ch -> String in
            let v   = evaluated[ch.id].map { String(format: "%.1f", $0) } ?? "nil"
            let tag = failed.contains { $0.id == ch.id } ? "FAIL" : "ok"
            return "\(ch.id)=\(v)[\(tag)]"
        }.joined(separator: " ")

        NSLog("[Engine] [\(def.id)] Rep #\(totalReps) peak=\(String(format: "%.1f°", peakAngle)) ROM=\(goodROM) cue=\(cue) \(totalReps)/\(goodReps) | \(checkLog)")

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
            NSLog("[Engine] [\(def.id)] Inactivity reset after \(String(format: "%.1f", elapsed))s")
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
