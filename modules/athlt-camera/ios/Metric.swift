import Foundation

// ─── Unified metric — shared by rep detection and form checks ──────────────────
//
// Every measurement in the exercise framework flows through Metric.measure(pose:).
// Both the rep primary-angle (ExerciseDefinition.repMetric) and all form checks
// (FormCheck.metric) use this one type.
//
// PRIMITIVES measure a single geometric quantity from a Pose.
// COMBINATORS compose two Metrics, handling nil (missing joints) gracefully.
//
// Adding a new exercise never requires changing this file — add config in ExerciseRegistry.

indirect enum Metric {

    // ── Primitives ───────────────────────────────────────────────────────────────

    /// Angle (°) at `pivot` formed by joints `a`–`pivot`–`c`. [0, 180].
    case jointAngle(a: Joint, pivot: Joint, c: Joint)

    /// Angle (°) of line `from`→`to` from vertical. 0° = vertical, 90° = horizontal.
    case lineVsVertical(from: Joint, to: Joint)

    /// Angle (°) of line `from`→`to` from horizontal. 0° = horizontal, 90° = vertical.
    /// Complement of lineVsVertical; use for nearly-horizontal segments.
    case lineVsHorizontal(from: Joint, to: Joint)

    /// `upper.y − lower.y` in Vision units (y=0 bottom, y=1 top). Positive = upper is higher.
    case verticalGap(upper: Joint, lower: Joint)

    /// `verticalGap(upper, lower)` divided by torso reference length (shoulder→hip).
    /// Body-scale normalised: value is independent of camera distance and user height.
    case normalizedVerticalGap(upper: Joint, lower: Joint)

    /// Perpendicular distance (unsigned) of `point` from line `lineFrom`→`lineTo` (Vision units).
    case deviationFromLine(point: Joint, lineFrom: Joint, lineTo: Joint)

    /// Signed perpendicular deviation. Positive = LEFT of direction `lineFrom`→`lineTo`.
    /// Sign depends on camera orientation — verify with NSLog on first device test.
    case signedDeviationFromLine(point: Joint, lineFrom: Joint, lineTo: Joint)

    /// |a − b| divided by torso length (shoulder→hip on best-visible side).
    /// Body-scale normalised: 0.30 = "30% of torso height".
    case distanceRatio(a: Joint, b: Joint)

    // ── Combinators ──────────────────────────────────────────────────────────────

    /// Average of two metrics. Falls back to whichever is non-nil if one side is missing.
    case average(Metric, Metric)

    /// Smaller of two values — use for "most-flexed" tracking (curls, lunges).
    case minimum(Metric, Metric)

    /// Larger of two values.
    case maximum(Metric, Metric)

    /// Picks the side whose `leftJoints`/`rightJoints` have higher total confidence.
    /// Falls back to the opposite side if the preferred side returns nil.
    case bestSide(left: Metric, right: Metric, leftJoints: [Joint], rightJoints: [Joint])
}

// ─── Measurement ──────────────────────────────────────────────────────────────

extension Metric {

    func measure(pose: Pose) -> Double? {
        switch self {

        case let .jointAngle(a, pivot, c):
            return computeJointAngle(pose: pose, a: a, b: pivot, c: c)

        case let .lineVsVertical(from, to):
            return lineAngleFromVertical(pose: pose, from: from, to: to)

        case let .lineVsHorizontal(from, to):
            return lineAngleFromVertical(pose: pose, from: from, to: to).map { 90.0 - $0 }

        case let .verticalGap(upper, lower):
            return computeVerticalGap(pose: pose, upper: upper, lower: lower)

        case let .normalizedVerticalGap(upper, lower):
            guard let gap = computeVerticalGap(pose: pose, upper: upper, lower: lower),
                  let ref = torsoReference(pose: pose), ref > 0 else { return nil }
            return gap / ref

        case let .deviationFromLine(p, a, b):
            return computeDeviationFromLine(pose: pose, point: p, lineFrom: a, lineTo: b)

        case let .signedDeviationFromLine(p, a, b):
            return computeSignedDeviationFromLine(pose: pose, point: p, lineFrom: a, lineTo: b)

        case let .distanceRatio(a, b):
            return measureDistanceRatio(pose: pose, a: a, b: b)

        case let .average(l, r):
            return combine(l.measure(pose: pose), r.measure(pose: pose)) { ($0 + $1) / 2 }

        case let .minimum(l, r):
            // Use closure instead of Swift.min function reference — avoids overload
            // ambiguity with the multi-arg min(_:_:_:rest:) overload in Swift 6.
            return combine(l.measure(pose: pose), r.measure(pose: pose)) { $0 < $1 ? $0 : $1 }

        case let .maximum(l, r):
            return combine(l.measure(pose: pose), r.measure(pose: pose)) { $0 > $1 ? $0 : $1 }

        case let .bestSide(left, right, leftJoints, rightJoints):
            let lConf = leftJoints.compactMap  { pose[$0]?.confidence }.reduce(0, +)
            let rConf = rightJoints.compactMap { pose[$0]?.confidence }.reduce(0, +)
            let preferred: Metric  = lConf >= rConf ? left  : right
            let fallback:  Metric  = lConf >= rConf ? right : left
            return preferred.measure(pose: pose) ?? fallback.measure(pose: pose)
        }
    }

    private func combine(_ l: Double?, _ r: Double?,
                         _ f: (Double, Double) -> Double) -> Double? {
        switch (l, r) {
        case let (lv?, rv?): return f(lv, rv)
        case let (lv?, nil): return lv
        case let (nil, rv?): return rv
        default:             return nil
        }
    }

    private func measureDistanceRatio(pose: Pose, a: Joint, b: Joint) -> Double? {
        guard let pa = pose[a], let pb = pose[b],
              pa.confidence >= kMinConf, pb.confidence >= kMinConf else { return nil }
        let dx   = Double(pa.x - pb.x)
        let dy   = Double(pa.y - pb.y)
        let dist = sqrt(dx * dx + dy * dy)
        guard let ref = torsoReference(pose: pose), ref > 0 else { return nil }
        return dist / ref
    }
}

// ─── Torso reference length ────────────────────────────────────────────────────
//
// Shoulder→hip distance on the higher-confidence side, in Vision units.
// Used as the body-scale reference for distanceRatio metrics.

func torsoReference(pose: Pose) -> Double? {
    func sideDist(_ sh: Joint, _ hip: Joint) -> (conf: Float, dist: Double?) {
        guard let s = pose[sh], let h = pose[hip],
              s.confidence >= kMinConf, h.confidence >= kMinConf else { return (0, nil) }
        let dx = Double(s.x - h.x), dy = Double(s.y - h.y)
        return (s.confidence + h.confidence, sqrt(dx * dx + dy * dy))
    }
    let l = sideDist(.leftShoulder,  .leftHip)
    let r = sideDist(.rightShoulder, .rightHip)
    if l.conf >= r.conf { return l.dist ?? r.dist }
    return r.dist ?? l.dist
}
