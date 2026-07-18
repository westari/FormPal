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

    /// Component of `(a − b)` projected onto the CCW-perpendicular of axis `(axisFrom → axisTo)`,
    /// normalised by axis length. Positive when `a` is "above" `b` relative to the body's own
    /// longitudinal axis — orientation-agnostic for exercises where the body is non-upright.
    /// Use for push-up repMetric: axis = shoulder→hip, measures shoulder vs elbow in body frame.
    case bodyRelativeGap(a: Joint, b: Joint, axisFrom: Joint, axisTo: Joint)

    /// Perpendicular distance of `point` from line `axisFrom → axisTo`, normalised by axis length.
    /// Returns a body-scale fraction ≥ 0: 0 = on the line, 0.07 = 7% of axis length off the line.
    /// Orientation-agnostic and camera-distance independent — use for push-up hip alignment.
    case bodyRelativeDeviation(point: Joint, axisFrom: Joint, axisTo: Joint)

    /// Perpendicular distance (unsigned) of `point` from line `lineFrom`→`lineTo` (Vision units).
    case deviationFromLine(point: Joint, lineFrom: Joint, lineTo: Joint)

    /// Signed perpendicular deviation. Positive = LEFT of direction `lineFrom`→`lineTo`.
    /// Sign depends on camera orientation — verify with NSLog on first device test.
    case signedDeviationFromLine(point: Joint, lineFrom: Joint, lineTo: Joint)

    /// |a − b| divided by torso length (shoulder→hip on best-visible side).
    /// Body-scale normalised: 0.30 = "30% of torso height".
    case distanceRatio(a: Joint, b: Joint)

    /// 2D image distance between `jointA` and `jointB`, normalised by the torso reference
    /// (shoulder→hip). Semantically identical to distanceRatio but reserved exclusively for
    /// the foreshortening gate: the value is near its calibrated maximum when the limb is
    /// in-plane, and shrinks when the limb points toward or away from the camera.
    case segmentLengthRatio(jointA: Joint, jointB: Joint)

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

        case let .bodyRelativeGap(a, b, axisFrom, axisTo):
            guard let pa  = pose[a],       pa.confidence  >= kMinConf,
                  let pb  = pose[b],       pb.confidence  >= kMinConf,
                  let pfm = pose[axisFrom], pfm.confidence >= kMinConf,
                  let pto = pose[axisTo],   pto.confidence >= kMinConf else { return nil }
            let ax   = Double(pto.x - pfm.x), ay   = Double(pto.y - pfm.y)
            let aLen = (ax*ax + ay*ay).squareRoot()
            guard aLen > 1e-6 else { return nil }
            let vx = Double(pa.x - pb.x), vy = Double(pa.y - pb.y)
            // dot(v, CCW-unit-perp-of-axis) / aLen  =  (vy*ax - vx*ay) / aLen²
            return (vy * ax - vx * ay) / (aLen * aLen)

        case let .bodyRelativeDeviation(p, axisFrom, axisTo):
            guard let pp  = pose[p],       pp.confidence  >= kMinConf,
                  let pfm = pose[axisFrom], pfm.confidence >= kMinConf,
                  let pto = pose[axisTo],   pto.confidence >= kMinConf else { return nil }
            let ax  = Double(pto.x - pfm.x), ay  = Double(pto.y - pfm.y)
            let apx = Double(pp.x  - pfm.x), apy = Double(pp.y  - pfm.y)
            let ab  = (ax*ax + ay*ay).squareRoot()
            guard ab > 1e-6 else { return nil }
            // |cross| / ab² = perp_distance / axis_length = body-fraction
            return abs(ax * apy - ay * apx) / (ab * ab)

        case let .deviationFromLine(p, a, b):
            return computeDeviationFromLine(pose: pose, point: p, lineFrom: a, lineTo: b)

        case let .signedDeviationFromLine(p, a, b):
            return computeSignedDeviationFromLine(pose: pose, point: p, lineFrom: a, lineTo: b)

        case let .distanceRatio(a, b):
            return measureDistanceRatio(pose: pose, a: a, b: b)

        case let .segmentLengthRatio(a, b):
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

// ─── Referenced joints ────────────────────────────────────────────────────────
//
// Returns all joints that this metric reads from the Pose.
// Used by ExerciseEngine.dataIsValid() so the validity gate checks exactly the
// joints the repMetric needs — not readyGate.requiredJoints, which are optimised
// for starting-position detection and can include joints irrelevant to rep quality
// (e.g. hips in a front-facing shoulderPress readyGate, ankles that lose confidence
// at the bottom of a squat).

extension Metric {
    func referencedJoints() -> [Joint] {
        switch self {
        case let .jointAngle(a, pivot, c):             return [a, pivot, c]
        case let .lineVsVertical(from, to):            return [from, to]
        case let .lineVsHorizontal(from, to):          return [from, to]
        case let .verticalGap(upper, lower):           return [upper, lower]
        case let .normalizedVerticalGap(upper, lower): return [upper, lower]
        case let .bodyRelativeGap(a, b, af, at):       return [a, b, af, at]
        case let .bodyRelativeDeviation(p, af, at):    return [p, af, at]
        case let .deviationFromLine(p, lf, lt):        return [p, lf, lt]
        case let .signedDeviationFromLine(p, lf, lt):  return [p, lf, lt]
        case let .distanceRatio(a, b):                 return [a, b]
        case let .segmentLengthRatio(a, b):            return [a, b]
        case let .average(l, r),
             let .minimum(l, r),
             let .maximum(l, r):
            return l.referencedJoints() + r.referencedJoints()
        case let .bestSide(left, right, _, _):
            return left.referencedJoints() + right.referencedJoints()
        }
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
