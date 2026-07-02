import Vision
import CoreGraphics

// ─── Pose representation ─────────────────────────────────────────────────────

struct PosePoint {
    let x:          CGFloat
    let y:          CGFloat
    let confidence: Float
}

/// Keyed by Joint — built once per frame in ATHLTCameraModule, consumed by ExerciseEngine.
typealias Pose = [Joint: PosePoint]

// ─── Joint identifiers ────────────────────────────────────────────────────────

/// Subset of VNHumanBodyPoseObservation joints used across all exercises.
enum Joint: CaseIterable {
    case nose
    case leftShoulder, rightShoulder
    case leftElbow,    rightElbow
    case leftWrist,    rightWrist
    case leftHip,      rightHip
    case leftKnee,     rightKnee
    case leftAnkle,    rightAnkle

    var visionName: VNHumanBodyPoseObservation.JointName {
        switch self {
        case .nose:           return .nose
        case .leftShoulder:   return .leftShoulder
        case .rightShoulder:  return .rightShoulder
        case .leftElbow:      return .leftElbow
        case .rightElbow:     return .rightElbow
        case .leftWrist:      return .leftWrist
        case .rightWrist:     return .rightWrist
        case .leftHip:        return .leftHip
        case .rightHip:       return .rightHip
        case .leftKnee:       return .leftKnee
        case .rightKnee:      return .rightKnee
        case .leftAnkle:      return .leftAnkle
        case .rightAnkle:     return .rightAnkle
        }
    }
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

private let kMinConf: Float = 0.25

/// Angle at joint B formed by A → B → C, in degrees [0, 180].
/// Returns nil if any joint falls below confidence threshold.
func jointAngle(pose: Pose, a: Joint, b: Joint, c: Joint) -> Double? {
    guard
        let pa = pose[a], pa.confidence >= kMinConf,
        let pb = pose[b], pb.confidence >= kMinConf,
        let pc = pose[c], pc.confidence >= kMinConf
    else { return nil }

    let bax = Double(pa.x - pb.x), bay = Double(pa.y - pb.y)
    let bcx = Double(pc.x - pb.x), bcy = Double(pc.y - pb.y)
    let dot = bax * bcx + bay * bcy
    let mag = (bax*bax + bay*bay).squareRoot() * (bcx*bcx + bcy*bcy).squareRoot()
    guard mag > 1e-6 else { return nil }
    return acos(max(-1, min(1, dot / mag))) * 180 / .pi
}

/// Angle of the line from joint A to joint B, measured from vertical [0°, 90°].
/// Vision coords: Y increases upward; vertical = (0,1).
/// 0° = perfectly vertical, 90° = horizontal.
func lineAngleFromVertical(pose: Pose, from a: Joint, to b: Joint) -> Double? {
    guard
        let pa = pose[a], pa.confidence >= kMinConf,
        let pb = pose[b], pb.confidence >= kMinConf
    else { return nil }

    let dx = Double(pb.x - pa.x)
    let dy = Double(pb.y - pa.y)
    let mag = (dx*dx + dy*dy).squareRoot()
    guard mag > 1e-6 else { return nil }
    // dot with unit-vertical (0,1): |dy|. acos gives angle from vertical.
    return acos(min(1.0, abs(dy) / mag)) * 180 / .pi
}

/// Average of left- and right-side lineAngleFromVertical.
/// Uses whichever sides are visible; returns nil if neither is.
func biLateralLineAngleFromVertical(pose: Pose,
                                     leftFrom: Joint,  leftTo: Joint,
                                     rightFrom: Joint, rightTo: Joint) -> Double? {
    let l = lineAngleFromVertical(pose: pose, from: leftFrom,  to: leftTo)
    let r = lineAngleFromVertical(pose: pose, from: rightFrom, to: rightTo)
    switch (l, r) {
    case let (lv?, rv?): return (lv + rv) / 2
    case let (lv?, nil): return lv
    case let (nil, rv?): return rv
    default:             return nil
    }
}

/// Perpendicular deviation of joint P from the infinite line A→B, in Vision units.
/// Useful for body-sag checks (hip deviation from shoulder–ankle line).
func deviationFromLine(pose: Pose, point p: Joint, lineFrom a: Joint, lineTo b: Joint) -> Double? {
    guard
        let pp = pose[p], pp.confidence >= kMinConf,
        let pa = pose[a], pa.confidence >= kMinConf,
        let pb = pose[b], pb.confidence >= kMinConf
    else { return nil }

    let abx = Double(pb.x - pa.x), aby = Double(pb.y - pa.y)
    let apx = Double(pp.x - pa.x), apy = Double(pp.y - pa.y)
    let ab  = (abx*abx + aby*aby).squareRoot()
    guard ab > 1e-6 else { return nil }
    return abs(abx * apy - aby * apx) / ab
}

/// Signed perpendicular deviation of joint P from the infinite line A→B, in Vision units.
/// Positive = P is to the LEFT of the direction A→B (in Vision coordinates).
/// Negative = P is to the RIGHT of the direction A→B.
///
/// Pushup convention (camera on person's left, shoulder→ankle goes left→right in frame):
///   Negative = hip sag (hip below shoulder-ankle line) → "HIPS UP"
///   Positive = hip pike (hip above line) → "LOWER HIPS"
///
/// NSLog signed values on-device to verify sign before setting thresholds:
///   look for "[FormCheck] hip_sag=..." in the rep log.
func signedDeviationFromLine(pose: Pose, point p: Joint, lineFrom a: Joint, lineTo b: Joint) -> Double? {
    guard
        let pp = pose[p], pp.confidence >= kMinConf,
        let pa = pose[a], pa.confidence >= kMinConf,
        let pb = pose[b], pb.confidence >= kMinConf
    else { return nil }

    let abx = Double(pb.x - pa.x), aby = Double(pb.y - pa.y)
    let apx = Double(pp.x - pa.x), apy = Double(pp.y - pa.y)
    let ab  = (abx*abx + aby*aby).squareRoot()
    guard ab > 1e-6 else { return nil }
    return (abx * apy - aby * apx) / ab   // no abs() — sign is the information
}

/// Vertical gap: upper.y - lower.y in Vision normalised units (y=0 bottom, y=1 top).
/// Positive = upper joint is higher in the frame than lower joint.
/// Returns nil if either joint is below kMinConf.
func verticalGap(pose: Pose, upper: Joint, lower: Joint) -> Double? {
    guard
        let pu = pose[upper], pu.confidence >= kMinConf,
        let pl = pose[lower], pl.confidence >= kMinConf
    else { return nil }
    return Double(pu.y - pl.y)
}
