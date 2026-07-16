import Foundation

// ─── Universal Movement-Quality Engine ───────────────────────────────────────
//
// Detects degradation in movement quality by comparing each rep to the user's
// OWN first N reps (their personal baseline for this set). No exercise-specific
// definitions, no absolute angle thresholds, no ML inference beyond Vision.
//
// SIGNALS (all relative or within-frame — no depth dependency):
//   1. Self-baseline consistency: range shrink + duration deviation
//   2. Left/right symmetry: bilateral joint angles at the rep's peak pose
//   3. Smoothness/jerk: variance of metric velocity during the rep
//   4. Stability: auto-detected anchor joints, flags compensation in later reps
//
// DESIGN CONTRACT:
//   • Never flags until nBaseline clean reps are recorded.
//   • Emits "[UNIV] CALIBRATING (n/N)" during baseline collection.
//   • All output goes through `log` closure → routes to onDebugLog.
//   • Confidence-gated: joints below kMinConf are skipped.
//   • One cue per rep, highest priority wins.
//   • Call reset() on exercise change or new tracking session.

final class UniversalQualityEngine {

    // MARK: – Tuning constants

    private let nBaseline:              Int    = 3     // reps needed to establish baseline
    private let rangeShrinkLimit:       Double = 0.85  // flag if range < 85% of baseline
    private let durDeviationLimit:      Double = 0.40  // flag if duration outside ±40% of baseline
    private let symmetryRelDiffLimit:   Double = 0.20  // flag if L/R relative diff > 20%
    private let jerkSpikeMultiple:      Double = 2.0   // flag if jerk-proxy > baseline × 2.0
    private let anchorBreachMultiple:   Double = 2.2   // flag if anchor joint moves > baseline × 2.2
    private let anchorCutoffFraction:   Double = 0.25  // joints below 25% of max displacement = anchor
    private let frameBufferSeconds:     Double = 30.0  // rolling buffer length
    private let bufferTrimInterval:     Int    = 30    // trim buffer every N frames

    // MARK: – Frame record

    private struct FrameRecord {
        let timestamp:   Date
        let metricValue: Double
        let pose:        Pose
    }

    // MARK: – Per-rep statistics

    private struct RepStats {
        let range:     Double           // max − min of repMetric in the effective window
        let duration:  Double           // seconds from rep-top to rep completion
        let jerk:      Double           // variance of frame-to-frame metric velocity (higher = less smooth)
        let peakPose:  Pose             // pose at the metric minimum (most-contracted position)
        let jointDisp: [Joint: Double]  // total 2-D displacement per joint during the rep window
    }

    // MARK: – State

    private var frameBuffer:    [FrameRecord]   = []
    private var frameCount:     Int             = 0

    private var referenceStats: [RepStats]      = []
    private var baselineRange:    Double?
    private var baselineDuration: Double?
    private var baselineJerk:     Double?
    private var baselineJointDisp: [Joint: Double] = [:]
    private var anchorJoints:      [Joint]         = []

    private var lastRepTime: Date = .distantPast

    // MARK: – Output channel

    /// Wire this to `sendEvent("onDebugLog", ["message": msg])` before the first frame.
    var log: ((String) -> Void)?

    // MARK: – Per-frame ingestion

    func ingestFrame(metricValue: Double, pose: Pose, timestamp: Date) {
        frameBuffer.append(FrameRecord(timestamp: timestamp, metricValue: metricValue, pose: pose))
        frameCount += 1
        if frameCount % bufferTrimInterval == 0 {
            let cutoff = timestamp.addingTimeInterval(-frameBufferSeconds)
            if let idx = frameBuffer.firstIndex(where: { $0.timestamp >= cutoff }), idx > 0 {
                frameBuffer.removeFirst(idx)
            }
        }
    }

    // MARK: – Rep completion

    /// Call once per rep (fired by the existing engine's onRepDetected callback).
    func onRepCompleted(repNumber: Int, peakValue: Double, repEndTime: Date) {
        // Determine lookback window. Before baseline: generous 8s. After: 2.5× learned duration.
        let lookback: TimeInterval = baselineDuration.map { $0 * 2.5 } ?? 8.0
        let windowStart = repEndTime.addingTimeInterval(-min(lookback, frameBufferSeconds - 1))
        let rawWindow = frameBuffer.filter { $0.timestamp >= windowStart && $0.timestamp <= repEndTime }

        guard rawWindow.count >= 5 else {
            log?("[UNIV] rep #\(repNumber): only \(rawWindow.count) frames — skipped")
            lastRepTime = repEndTime
            return
        }

        let stats = computeRepStats(frames: rawWindow, peakValue: peakValue)

        // ── Reference / calibration phase ─────────────────────────────────────

        if referenceStats.count < nBaseline {
            referenceStats.append(stats)
            let n = referenceStats.count
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

        // ── Compute all signals ───────────────────────────────────────────────

        // Signal 3: smoothness / jerk-proxy
        let jerkRatio  = bJerk > 1e-9 ? stats.jerk / bJerk : 1.0
        let isSwinging = jerkRatio >= jerkSpikeMultiple

        // Signal 1a: range shrink
        let rangeRatio    = bRange > 1e-9 ? stats.range / bRange : 1.0
        let isRangeShrink = rangeRatio < rangeShrinkLimit

        // Signal 1b: duration deviation
        let durRatio      = bDur > 1e-9 ? stats.duration / bDur : 1.0
        let isDurOff      = durRatio < (1.0 - durDeviationLimit) || durRatio > (1.0 + durDeviationLimit)

        // Signal 2: bilateral symmetry
        let symResult = computeBilateralSymmetry(pose: stats.peakPose)

        // Signal 4: anchor stability
        let anchorResult = findAnchorViolation(jointDisp: stats.jointDisp)

        // ── Log all values ────────────────────────────────────────────────────

        log?("[UNIV] rep #\(repNumber) | range=\(f3(stats.range)) baseline=\(f3(bRange)) ratio=\(f2(rangeRatio))\(isRangeShrink ? " ← SHORT" : "")")
        log?("[UNIV] rep #\(repNumber) | dur=\(f2(stats.duration))s baseline=\(f2(bDur))s ratio=\(f2(durRatio))\(isDurOff ? " ← OFF" : "")")
        log?("[UNIV] rep #\(repNumber) | jerk=\(f5(stats.jerk)) baseline=\(f5(bJerk)) ratio=\(f2(jerkRatio))\(isSwinging ? " ← SPIKE" : "")")

        if let (lA, rA, relDiff) = symResult {
            let flag = relDiff >= symmetryRelDiffLimit ? " ← UNEVEN" : ""
            log?("[UNIV] rep #\(repNumber) | symmetry L=\(f1(lA))° R=\(f1(rA))° diff=\(f0(relDiff * 100))%\(flag)")
        } else {
            log?("[UNIV] rep #\(repNumber) | symmetry n/a (low joint confidence)")
        }

        if let (joint, ratio) = anchorResult {
            log?("[UNIV] rep #\(repNumber) | anchor \(joint) moved \(f2(ratio))× baseline ← COMPENSATION")
        } else {
            log?("[UNIV] rep #\(repNumber) | anchors stable")
        }

        // ── Pick highest-priority cue ─────────────────────────────────────────
        // Priority: swinging > uneven > range-shrink > compensation > rushing/slowing

        let cue: String
        if isSwinging {
            cue = "SWINGING — control the weight"
        } else if let (_, _, relDiff) = symResult, relDiff >= symmetryRelDiffLimit {
            cue = "UNEVEN — one side lagging"
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
        frameBuffer.removeAll()
        frameCount = 0
        referenceStats.removeAll()
        baselineRange    = nil
        baselineDuration = nil
        baselineJerk     = nil
        baselineJointDisp.removeAll()
        anchorJoints.removeAll()
        lastRepTime = .distantPast
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
        log?("[UNIV] flagging begins next rep")
    }

    // MARK: – Rep stats computation

    private func computeRepStats(frames: [FrameRecord], peakValue: Double) -> RepStats {
        // Find the frame closest to peakValue (the actual trough of the rep metric).
        let peakIdx = frames.indices.min {
            abs(frames[$0].metricValue - peakValue) < abs(frames[$1].metricValue - peakValue)
        } ?? 0

        // Walk back from peakIdx to find the local maximum before the descent started.
        // That max is the "at-rest top" position where this rep began.
        var localMaxIdx = 0
        var localMax    = frames[0].metricValue
        for i in 1..<peakIdx {
            if frames[i].metricValue > localMax {
                localMax    = frames[i].metricValue
                localMaxIdx = i
            }
        }

        // Effective window: from the local max to the end of the look-back.
        let eff = localMaxIdx < frames.count ? Array(frames[localMaxIdx...]) : frames

        let vals     = eff.map(\.metricValue)
        let range    = (vals.max() ?? 0) - (vals.min() ?? 0)
        let duration = eff.count >= 2
            ? eff.last!.timestamp.timeIntervalSince(eff.first!.timestamp)
            : 0.0

        // Peak pose: frame with metric closest to peakValue inside the effective window.
        let effPeakIdx = eff.indices.min {
            abs(eff[$0].metricValue - peakValue) < abs(eff[$1].metricValue - peakValue)
        } ?? 0
        let peakPose = eff[effPeakIdx].pose

        // Jerk-proxy: variance of frame-to-frame metric velocity.
        var velocities: [Double] = []
        for i in 1..<eff.count {
            let dt = eff[i].timestamp.timeIntervalSince(eff[i-1].timestamp)
            guard dt > 0.001 else { continue }
            velocities.append((eff[i].metricValue - eff[i-1].metricValue) / dt)
        }
        let jerk = varianceOf(velocities)

        // Joint displacement: sum of consecutive 2-D distances for each joint.
        var jointDisp: [Joint: Double] = [:]
        for joint in Joint.allCases {
            var disp = 0.0
            for i in 1..<eff.count {
                guard let p0 = eff[i-1].pose[joint], p0.confidence >= kMinConf,
                      let p1 = eff[i].pose[joint],   p1.confidence >= kMinConf else { continue }
                let dx = Double(p1.x - p0.x)
                let dy = Double(p1.y - p0.y)
                disp += sqrt(dx*dx + dy*dy)
            }
            if disp > 0 { jointDisp[joint] = disp }
        }

        return RepStats(range: range, duration: duration, jerk: jerk,
                        peakPose: peakPose, jointDisp: jointDisp)
    }

    // MARK: – Bilateral symmetry

    // Returns (leftAngle°, rightAngle°, relativeDiff) for the most-active bilateral limb pair.
    // "Most active" = the pair with the greatest average deviation from 180° (straight).
    // Returns nil if neither pair has sufficient joint confidence.
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
            guard activity > 10.0 else { continue }   // must show meaningful flexion
            if activity > bestActivity {
                bestActivity = activity
                let maxA     = max(lA, rA)
                let relDiff  = maxA > 0 ? abs(lA - rA) / maxA : 0.0
                best = (lA, rA, relDiff)
            }
        }
        return best
    }

    // MARK: – Anchor stability check

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
