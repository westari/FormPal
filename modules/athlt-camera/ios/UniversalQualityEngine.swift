import Foundation

// ─── Universal Movement-Quality Engine (Layer 1 + Layer 2) ───────────────────
//
// LAYER 1 — relative signals (vs user's own first 3 reps):
//   1. Range shrink:       current range < 85% of baseline range
//   2. L/R symmetry:       bilateral joint angle difference > 20% at rep peak
//   3. Smoothness/jerk:    velocity variance > 2× baseline (catches swinging)
//   4. Anchor stability:   auto-detected still joints move > 2.2× baseline
//
// LAYER 2 — form standard floor (vs ExerciseStandard, pre-cached):
//   5. Static-joint violation: torso/anchor angle range exceeds standard limit
//      (fires even during the 3 reference reps — catches swinging from rep 1)
//   6. Below-standard ROM: peak angle doesn't reach standard target
//      (prevents beginners locking in a bad baseline as "consistent")
//
// CUE PRIORITY (one per rep, highest wins):
//   static-violation > swinging > uneven > below-standard-ROM >
//   range-shrink > compensation > rushing/slowing
//
// TIMESTAMP NOTE:
//   ingestFrame MUST be called with Date() (wallclock), NOT with the
//   CMSampleBuffer camera timestamp. Camera time is a Mach absolute (uptime)
//   value — passing it through Date(timeIntervalSince1970:) yields a 1970
//   epoch date that the per-rep window filter cannot match against Date().

final class UniversalQualityEngine {

    // MARK: – Tuning

    private let nBaseline:              Int    = 3
    private let rangeShrinkLimit:       Double = 0.85
    private let durDeviationLimit:      Double = 0.40
    private let symmetryRelDiffLimit:   Double = 0.20
    private let jerkSpikeMultiple:      Double = 2.0
    private let anchorBreachMultiple:   Double = 2.2
    private let anchorCutoffFraction:   Double = 0.25
    private let frameBufferSeconds:     Double = 30.0
    private let bufferTrimInterval:     Int    = 30

    // MARK: – Frame record

    private struct FrameRecord {
        let timestamp:   Date
        let metricValue: Double
        let pose:        Pose
    }

    // MARK: – Per-rep statistics

    private struct RepStats {
        let range:        Double
        let duration:     Double
        let jerk:         Double
        let peakValue:    Double           // minimum repMetric value (most contracted)
        let startValue:   Double           // local max repMetric (most extended position)
        let peakPose:     Pose
        let jointDisp:    [Joint: Double]
        let staticAngVar: [Int: Double]    // staticChecks index → angle range (°) in rep
    }

    // MARK: – Baseline state

    private var referenceStats:    [RepStats]      = []
    private var baselineRange:     Double?
    private var baselineDuration:  Double?
    private var baselineJerk:      Double?
    private var baselineJointDisp: [Joint: Double] = [:]
    private var anchorJoints:      [Joint]         = []

    // MARK: – Frame buffer

    private var frameBuffer:  [FrameRecord] = []
    private var frameCount:   Int           = 0
    private var lastRepTime:  Date          = .distantPast

    // MARK: – Layer 2 standard

    private(set) var activeStandard: ExerciseStandard? = nil

    func setStandard(_ standard: ExerciseStandard?) {
        activeStandard = standard
        if let std = standard {
            if !std.reviewed {
                log?("[STD] ⚠ '\(std.exerciseId)' standard NOT YET HUMAN-REVIEWED — verify numbers on-device")
            }
            log?("[STD] standard loaded: peak≤\(f1(std.standardPeakAngleMax))°  start≥\(f1(std.standardStartAngleMin))°  minRange≥\(f1(std.standardMinRange))°")
        } else {
            log?("[STD] no standard for this exercise — Layer 2 inactive, relative signals only")
        }
    }

    // MARK: – Output channel

    var log: ((String) -> Void)?

    // MARK: – Per-frame ingestion
    // IMPORTANT: caller must pass Date() (wallclock), NOT the camera-timebase CMTime value.

    func ingestFrame(metricValue: Double, pose: Pose, timestamp: Date) {
        frameBuffer.append(FrameRecord(timestamp: timestamp, metricValue: metricValue, pose: pose))
        frameCount += 1

        // Diagnostic: log every 30 frames so we can confirm frames are arriving.
        // Also logs the timestamp epoch value — should be ~1.7B (2025 wallclock),
        // NOT ~150000 (device uptime / 1970-era Date). Remove when confirmed working.
        if frameCount % 30 == 0 {
            log?("[UNIV-DBG] ingestFrame called, total frames buffered=\(frameBuffer.count) ts_epoch=\(String(format: "%.0f", timestamp.timeIntervalSince1970))")
        }

        if frameCount % bufferTrimInterval == 0 {
            let cutoff = timestamp.addingTimeInterval(-frameBufferSeconds)
            if let idx = frameBuffer.firstIndex(where: { $0.timestamp >= cutoff }), idx > 0 {
                frameBuffer.removeFirst(idx)
            }
        }
    }

    // MARK: – Rep completion

    func onRepCompleted(repNumber: Int, peakValue: Double, repEndTime: Date) {
        let lookback: TimeInterval = baselineDuration.map { $0 * 2.5 } ?? 8.0
        let windowStart = repEndTime.addingTimeInterval(-min(lookback, frameBufferSeconds - 1))
        let rawWindow   = frameBuffer.filter { $0.timestamp >= windowStart && $0.timestamp <= repEndTime }

        // Diagnostic: log buffer and window so we can verify timestamps are consistent.
        // Remove when confirmed working.
        log?("[UNIV-DBG] rep #\(repNumber): buffer=\(frameBuffer.count) frames windowStart_epoch=\(String(format: "%.0f", windowStart.timeIntervalSince1970)) repEnd_epoch=\(String(format: "%.0f", repEndTime.timeIntervalSince1970)) window=\(rawWindow.count) frames")

        guard rawWindow.count >= 5 else {
            log?("[UNIV] rep #\(repNumber): only \(rawWindow.count) frames in window — skipped")
            lastRepTime = repEndTime
            return
        }

        let stats = computeRepStats(frames: rawWindow, peakValue: peakValue)

        // ── Reference / calibration phase ─────────────────────────────────────

        if referenceStats.count < nBaseline {
            referenceStats.append(stats)
            let n = referenceStats.count

            if let std = activeStandard {
                log?("[STD] rep #\(repNumber) ref: peak=\(f1(stats.peakValue))° start=\(f1(stats.startValue))°  (standard: peak≤\(f1(std.standardPeakAngleMax))° start≥\(f1(std.standardStartAngleMin))°)")
                for (i, check) in std.staticChecks.enumerated() {
                    if let angVar = stats.staticAngVar[i], angVar > check.maxRangeDeg {
                        log?("[STD] rep #\(repNumber) ref: static '\(check.description)' range=\(f1(angVar))° > limit \(f1(check.maxRangeDeg))° → \(check.cue)")
                    }
                }
            }

            log?("[UNIV] rep #\(repNumber): CALIBRATING (\(n)/\(nBaseline))  range=\(f3(stats.range))  dur=\(f2(stats.duration))s  jerk=\(f5(stats.jerk))")
            if n == nBaseline { buildBaseline() }
            lastRepTime = repEndTime
            return
        }

        guard let bRange = baselineRange,
              let bDur   = baselineDuration,
              let bJerk  = baselineJerk else {
            lastRepTime = repEndTime
            return
        }

        // ── Layer 2a: static-joint violation from standard ────────────────────

        var staticViolationCue: String? = nil
        if let std = activeStandard {
            for (i, check) in std.staticChecks.enumerated() {
                if let angVar = stats.staticAngVar[i], angVar > check.maxRangeDeg {
                    log?("[STD] rep #\(repNumber) static '\(check.description)' range=\(f1(angVar))° > limit \(f1(check.maxRangeDeg))°")
                    staticViolationCue = check.cue
                    break
                }
            }
        }

        // ── Layer 2b: below-standard ROM ─────────────────────────────────────

        var belowStandardCue: String? = nil
        if let std = activeStandard {
            if stats.peakValue > std.standardPeakAngleMax {
                log?("[STD] rep #\(repNumber) peak=\(f1(stats.peakValue))° > standard \(f1(std.standardPeakAngleMax))°")
                belowStandardCue = std.romCue
            } else if stats.startValue < std.standardStartAngleMin {
                log?("[STD] rep #\(repNumber) start=\(f1(stats.startValue))° < standard \(f1(std.standardStartAngleMin))°")
                belowStandardCue = std.extendCue
            }
        }

        // ── Layer 1: relative signals ─────────────────────────────────────────

        let jerkRatio  = bJerk > 1e-9 ? stats.jerk / bJerk : 1.0
        let isSwinging = jerkRatio >= jerkSpikeMultiple

        let rangeRatio    = bRange > 1e-9 ? stats.range / bRange : 1.0
        let isRangeShrink = rangeRatio < rangeShrinkLimit

        let durRatio = bDur > 1e-9 ? stats.duration / bDur : 1.0
        let isDurOff = durRatio < (1.0 - durDeviationLimit) || durRatio > (1.0 + durDeviationLimit)

        let symResult    = computeBilateralSymmetry(pose: stats.peakPose)
        let anchorResult = findAnchorViolation(jointDisp: stats.jointDisp)

        // ── Log all signal values ─────────────────────────────────────────────

        log?("[UNIV] rep #\(repNumber) | range=\(f3(stats.range)) baseline=\(f3(bRange)) ratio=\(f2(rangeRatio))\(isRangeShrink ? " ← SHORT" : "")")
        log?("[UNIV] rep #\(repNumber) | dur=\(f2(stats.duration))s baseline=\(f2(bDur))s ratio=\(f2(durRatio))\(isDurOff ? " ← OFF" : "")")
        log?("[UNIV] rep #\(repNumber) | jerk=\(f5(stats.jerk)) baseline=\(f5(bJerk)) ratio=\(f2(jerkRatio))\(isSwinging ? " ← SPIKE" : "")")
        if let (lA, rA, relDiff) = symResult {
            log?("[UNIV] rep #\(repNumber) | symmetry L=\(f1(lA))° R=\(f1(rA))° diff=\(f0(relDiff * 100))%\(relDiff >= symmetryRelDiffLimit ? " ← UNEVEN" : "")")
        } else {
            log?("[UNIV] rep #\(repNumber) | symmetry n/a (low confidence)")
        }
        if let (joint, ratio) = anchorResult {
            log?("[UNIV] rep #\(repNumber) | anchor \(joint) moved \(f2(ratio))× baseline ← COMPENSATION")
        } else {
            log?("[UNIV] rep #\(repNumber) | anchors stable")
        }

        // ── Single cue: highest priority wins ────────────────────────────────
        // static-violation > swinging > uneven > below-standard-ROM >
        // range-shrink > compensation > rushing/slowing

        let cue: String
        if let sv = staticViolationCue {
            cue = sv
        } else if isSwinging {
            cue = "SWINGING — control the weight"
        } else if let (_, _, relDiff) = symResult, relDiff >= symmetryRelDiffLimit {
            cue = "UNEVEN — one side lagging"
        } else if let bc = belowStandardCue {
            cue = bc
        } else if isRangeShrink {
            cue = "CUTTING SHORT — range dropped vs your start"
        } else if let (joint, _) = anchorResult {
            cue = "KEEP \(regionLabel(joint)) STILL — compensation"
        } else if isDurOff {
            cue = durRatio < (1.0 - durDeviationLimit)
                ? "RUSHING — rep faster than your baseline"
                : "SLOWING — rep slower than your baseline"
        } else {
            cue = "CONSISTENT ✓"
        }

        log?("[UNIV] rep #\(repNumber) | → \(cue)")
        lastRepTime = repEndTime
    }

    // MARK: – Reset

    func reset() {
        // Diagnostic: confirm reset() is only called on stopSession/startTracking/setExercise.
        // Remove when confirmed not firing spuriously.
        log?("[UNIV-DBG] reset() called")

        frameBuffer.removeAll()
        frameCount = 0
        referenceStats.removeAll()
        baselineRange    = nil
        baselineDuration = nil
        baselineJerk     = nil
        baselineJointDisp.removeAll()
        anchorJoints.removeAll()
        lastRepTime = .distantPast
        // activeStandard NOT cleared — persists for the same exercise across tracking sessions
    }

    // MARK: – Baseline construction

    private func buildBaseline() {
        let n = Double(referenceStats.count)
        baselineRange    = referenceStats.map(\.range).reduce(0,+)    / n
        baselineDuration = referenceStats.map(\.duration).reduce(0,+) / n
        baselineJerk     = referenceStats.map(\.jerk).reduce(0,+)     / n

        for joint in Joint.allCases {
            let vals = referenceStats.compactMap { $0.jointDisp[joint] }
            if !vals.isEmpty { baselineJointDisp[joint] = vals.reduce(0,+) / Double(vals.count) }
        }

        let maxDisp = baselineJointDisp.values.max() ?? 0
        if maxDisp > 0 {
            anchorJoints = baselineJointDisp
                .filter { $0.value < maxDisp * anchorCutoffFraction && $0.value > 0 }
                .map    { $0.key }
                .sorted { "\($0)" < "\($1)" }
        }

        log?("[UNIV] ─── BASELINE SET ───")
        log?("[UNIV] range=\(f3(baselineRange!))  dur=\(f2(baselineDuration!))s  jerk=\(f5(baselineJerk!))")
        log?("[UNIV] anchors: \(anchorJoints.isEmpty ? "none" : anchorJoints.map{"\($0)"}.joined(separator: ", "))")

        if let std = activeStandard {
            validateBaseline(standard: std)
        } else {
            log?("[UNIV] no standard set — Layer 1 relative signals are the only floor")
        }

        log?("[UNIV] flagging begins next rep")
    }

    // MARK: – Layer 2 baseline validation

    private func validateBaseline(standard: ExerciseStandard) {
        let n        = Double(referenceStats.count)
        let avgPeak  = referenceStats.map(\.peakValue).reduce(0,+) / n
        let avgStart = referenceStats.map(\.startValue).reduce(0,+) / n

        log?("[STD] ─── BASELINE vs STANDARD ('\(standard.exerciseId)') ───")
        log?("[STD] avg peak=\(f1(avgPeak))° (standard: ≤\(f1(standard.standardPeakAngleMax))°)  avg start=\(f1(avgStart))° (standard: ≥\(f1(standard.standardStartAngleMin))°)")

        var standardMet = true

        if avgPeak > standard.standardPeakAngleMax {
            standardMet = false
            log?("[STD] BELOW STANDARD ROM: baseline peak=\(f1(avgPeak))° > standard \(f1(standard.standardPeakAngleMax))°")
            log?("[STD] → will cue '\(standard.romCue)' until peak reaches ≤\(f1(standard.standardPeakAngleMax))°")
        } else {
            log?("[STD] peak ROM ✓ (\(f1(avgPeak))° ≤ \(f1(standard.standardPeakAngleMax))°)")
        }

        if avgStart < standard.standardStartAngleMin {
            standardMet = false
            log?("[STD] NOT FULLY EXTENDING: baseline start=\(f1(avgStart))° < standard \(f1(standard.standardStartAngleMin))°")
            log?("[STD] → will cue '\(standard.extendCue)' until start reaches ≥\(f1(standard.standardStartAngleMin))°")
        } else {
            log?("[STD] start position ✓ (\(f1(avgStart))° ≥ \(f1(standard.standardStartAngleMin))°)")
        }

        for (i, check) in standard.staticChecks.enumerated() {
            let allVars = referenceStats.compactMap { $0.staticAngVar[i] }
            let avgVar  = allVars.isEmpty ? 0.0 : allVars.reduce(0,+) / Double(allVars.count)
            let maxVar  = allVars.max() ?? 0.0
            if maxVar > check.maxRangeDeg {
                log?("[STD] static '\(check.description)': avg=\(f1(avgVar))° max=\(f1(maxVar))° > limit \(f1(check.maxRangeDeg))° — already violating in baseline")
            } else {
                log?("[STD] static '\(check.description)': avg=\(f1(avgVar))° ✓")
            }
        }

        if standardMet {
            log?("[STD] baseline meets standard ✓ — relative (Layer 1) signals are the active floor")
        } else {
            log?("[STD] baseline BELOW standard — standard acts as coaching floor for ROM cues")
        }

        if !standard.reviewed {
            log?("[STD] ⚠ verify these numbers on-device before trusting cues (reviewed=false)")
        }
    }

    // MARK: – Rep stats computation

    private func computeRepStats(frames: [FrameRecord], peakValue: Double) -> RepStats {
        let peakIdx = frames.indices.min {
            abs(frames[$0].metricValue - peakValue) < abs(frames[$1].metricValue - peakValue)
        } ?? 0

        var localMaxIdx = 0
        var localMax    = frames[0].metricValue
        for i in 1..<peakIdx {
            if frames[i].metricValue > localMax {
                localMax    = frames[i].metricValue
                localMaxIdx = i
            }
        }

        let eff      = localMaxIdx < frames.count ? Array(frames[localMaxIdx...]) : frames
        let vals     = eff.map(\.metricValue)
        let range    = (vals.max() ?? 0) - (vals.min() ?? 0)
        let duration = eff.count >= 2
            ? eff.last!.timestamp.timeIntervalSince(eff.first!.timestamp)
            : 0.0

        let effPeakIdx = eff.indices.min {
            abs(eff[$0].metricValue - peakValue) < abs(eff[$1].metricValue - peakValue)
        } ?? 0
        let peakPose = eff[effPeakIdx].pose

        var velocities: [Double] = []
        for i in 1..<eff.count {
            let dt = eff[i].timestamp.timeIntervalSince(eff[i-1].timestamp)
            guard dt > 0.001 else { continue }
            velocities.append((eff[i].metricValue - eff[i-1].metricValue) / dt)
        }
        let jerk = varianceOf(velocities)

        var jointDisp: [Joint: Double] = [:]
        for joint in Joint.allCases {
            var disp = 0.0
            for i in 1..<eff.count {
                guard let p0 = eff[i-1].pose[joint], p0.confidence >= kMinConf,
                      let p1 = eff[i].pose[joint],   p1.confidence >= kMinConf else { continue }
                let dx = Double(p1.x - p0.x), dy = Double(p1.y - p0.y)
                disp += sqrt(dx*dx + dy*dy)
            }
            if disp > 0 { jointDisp[joint] = disp }
        }

        var staticAngVar: [Int: Double] = [:]
        if let std = activeStandard {
            for (i, check) in std.staticChecks.enumerated() {
                var angles: [Double] = []
                for record in eff {
                    if let angle = computeJointAngle(pose: record.pose, a: check.a, b: check.b, c: check.c) {
                        angles.append(angle)
                    }
                }
                if angles.count >= 2, let hi = angles.max(), let lo = angles.min() {
                    staticAngVar[i] = hi - lo
                }
            }
        }

        return RepStats(
            range:        range,
            duration:     duration,
            jerk:         jerk,
            peakValue:    vals.min() ?? peakValue,
            startValue:   localMax,
            peakPose:     peakPose,
            jointDisp:    jointDisp,
            staticAngVar: staticAngVar
        )
    }

    // MARK: – Bilateral symmetry

    private func computeBilateralSymmetry(pose: Pose) -> (Double, Double, Double)? {
        let candidates: [(Joint, Joint, Joint, Joint, Joint, Joint)] = [
            (.leftShoulder, .leftElbow,  .leftWrist,
             .rightShoulder, .rightElbow, .rightWrist),
            (.leftHip,      .leftKnee,   .leftAnkle,
             .rightHip,      .rightKnee,  .rightAnkle),
        ]

        var best: (Double, Double, Double)? = nil
        var bestActivity = 0.0

        for (la, lp, lc, ra, rp, rc) in candidates {
            guard let lA = computeJointAngle(pose: pose, a: la, b: lp, c: lc),
                  let rA = computeJointAngle(pose: pose, a: ra, b: rp, c: rc) else { continue }
            let activity = (abs(180.0 - lA) + abs(180.0 - rA)) / 2.0
            guard activity > 10.0 else { continue }
            if activity > bestActivity {
                bestActivity = activity
                let relDiff  = max(lA, rA) > 0 ? abs(lA - rA) / max(lA, rA) : 0.0
                best = (lA, rA, relDiff)
            }
        }
        return best
    }

    // MARK: – Anchor violation

    private func findAnchorViolation(jointDisp: [Joint: Double]) -> (Joint, Double)? {
        var worst: (Joint, Double)? = nil
        for joint in anchorJoints {
            guard let baseline = baselineJointDisp[joint], baseline > 1e-9,
                  let current  = jointDisp[joint] else { continue }
            let ratio = current / baseline
            if ratio >= anchorBreachMultiple {
                if let (_, wr) = worst, ratio <= wr { continue }
                worst = (joint, ratio)
            }
        }
        return worst
    }

    // MARK: – Helpers

    private func varianceOf(_ vals: [Double]) -> Double {
        guard vals.count >= 2 else { return 0 }
        let mean = vals.reduce(0,+) / Double(vals.count)
        return vals.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(vals.count)
    }

    private func regionLabel(_ joint: Joint) -> String {
        switch joint {
        case .leftShoulder, .rightShoulder: return "SHOULDERS"
        case .leftElbow,    .rightElbow:    return "ELBOWS"
        case .leftWrist,    .rightWrist:    return "WRISTS"
        case .leftHip,      .rightHip:      return "HIPS"
        case .leftKnee,     .rightKnee:     return "KNEES"
        case .leftAnkle,    .rightAnkle:    return "ANKLES"
        case .nose:                         return "HEAD"
        }
    }

    private func f0(_ v: Double) -> String { String(format: "%.0f", v) }
    private func f1(_ v: Double) -> String { String(format: "%.1f", v) }
    private func f2(_ v: Double) -> String { String(format: "%.2f", v) }
    private func f3(_ v: Double) -> String { String(format: "%.3f", v) }
    private func f5(_ v: Double) -> String { String(format: "%.5f", v) }
}
