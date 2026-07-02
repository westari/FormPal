import UIKit

/// Real-time skeleton overlay drawn over the camera preview during form-check.
///
/// Performance design:
///   • Two CAShapeLayers (lineLayer + dotLayer) created once in setup() — GPU-rendered.
///   • Each frame: build two CGMutablePaths (C-level, no ObjC bridge cost) and assign
///     to layer.path inside a no-animation CATransaction. No setNeedsDisplay, no draw(rect:).
///   • Driven by a CADisplayLink in ATHLTCameraView at native refresh rate (60-120 Hz).
///
/// Coordinate transform (see visionToView):
///   Vision returns normalised coords with origin BOTTOM-LEFT (y-up).
///   Preview layer uses .resizeAspectFill, portrait orientation.
///   We correct for y-flip and aspect-fill crop offset.
///
/// TUNING after first build:
///   • If skeleton is flipped on FRONT camera, check isMirrored flag in ATHLTCameraModule.
///   • If skeleton is offset, check NSLog "[GymCamera] pixel buffer WxH" (h > w = portrait ✓).

final class SkeletonOverlayView: UIView {

    // MARK: – Layers

    private let lineLayer = CAShapeLayer()
    private let dotLayer  = CAShapeLayer()

    // MARK: – Smoothing

    /// Smoothed joint positions in Vision normalised space [0,1].
    private var smoothed: [Joint: CGPoint] = [:]
    /// EMA factor: 1.0 = no smoothing, 0.5 = moderate smoothing.
    private let ema: CGFloat = 0.50

    // MARK: – Skeleton connections (bone pairs)

    private static let connections: [(Joint, Joint)] = [
        // Head → shoulders
        (.nose,          .leftShoulder),
        (.nose,          .rightShoulder),
        // Shoulder girdle
        (.leftShoulder,  .rightShoulder),
        // Left arm
        (.leftShoulder,  .leftElbow),
        (.leftElbow,     .leftWrist),
        // Right arm
        (.rightShoulder, .rightElbow),
        (.rightElbow,    .rightWrist),
        // Torso sides
        (.leftShoulder,  .leftHip),
        (.rightShoulder, .rightHip),
        // Hip girdle
        (.leftHip,       .rightHip),
        // Left leg
        (.leftHip,       .leftKnee),
        (.leftKnee,      .leftAnkle),
        // Right leg
        (.rightHip,      .rightKnee),
        (.rightKnee,     .rightAnkle),
    ]

    private static let minConfidence: Float  = 0.30
    private static let dotRadius:     CGFloat = 5.0
    private static let lineWidth:     CGFloat = 2.5

    // #0A6CFF — FormPal accent blue
    private static let blue = UIColor(red: 0.04, green: 0.42, blue: 1.00, alpha: 1.0)

    // MARK: – Init

    override init(frame: CGRect) { super.init(frame: frame); setup() }
    required init?(coder: NSCoder) { super.init(coder: coder); setup() }

    private func setup() {
        backgroundColor          = .clear
        isUserInteractionEnabled = false

        // Bone lines — thin, rounded, semi-transparent blue
        lineLayer.fillColor   = UIColor.clear.cgColor
        lineLayer.strokeColor = Self.blue.withAlphaComponent(0.75).cgColor
        lineLayer.lineWidth   = Self.lineWidth
        lineLayer.lineCap     = .round
        lineLayer.lineJoin    = .round
        layer.addSublayer(lineLayer)

        // Joint dots — solid blue fill, thin white outline for contrast on any background.
        // NOTE: dotLayer.strokeColor is white so the outline reads against both
        //       the blue skeleton lines and the camera feed.
        dotLayer.fillColor   = Self.blue.cgColor
        dotLayer.strokeColor = UIColor.white.withAlphaComponent(0.85).cgColor
        dotLayer.lineWidth   = 1.5
        layer.addSublayer(dotLayer)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        lineLayer.frame = bounds
        dotLayer.frame  = bounds
        CATransaction.commit()
    }

    // MARK: – Public API (call on MAIN thread only)

    func update(pose: Pose, videoWidth: CGFloat, videoHeight: CGFloat, isMirrored: Bool) {
        // Update smoothed positions with EMA
        var visible = Set<Joint>()
        for (joint, p) in pose where p.confidence >= Self.minConfidence {
            visible.insert(joint)
            let raw = CGPoint(x: CGFloat(p.x), y: CGFloat(p.y))
            if let prev = smoothed[joint] {
                smoothed[joint] = CGPoint(
                    x: prev.x + ema * (raw.x - prev.x),
                    y: prev.y + ema * (raw.y - prev.y)
                )
            } else {
                smoothed[joint] = raw   // snap on first appearance — no lag
            }
        }
        // Drop joints that dropped below confidence
        for joint in Array(smoothed.keys) where !visible.contains(joint) {
            smoothed.removeValue(forKey: joint)
        }
        redraw(videoWidth: videoWidth, videoHeight: videoHeight, isMirrored: isMirrored)
    }

    func clear() {
        smoothed = [:]
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        lineLayer.path = nil
        dotLayer.path  = nil
        CATransaction.commit()
    }

    // MARK: – Drawing

    private func redraw(videoWidth: CGFloat, videoHeight: CGFloat, isMirrored: Bool) {
        let vSize = bounds.size
        guard vSize.width > 0, vSize.height > 0,
              videoWidth > 0, videoHeight > 0 else { return }

        let linePath = CGMutablePath()
        let dotPath  = CGMutablePath()
        let r = Self.dotRadius

        // Helper: Vision normalised → view point (nil if joint not tracked)
        func pt(_ j: Joint) -> CGPoint? {
            guard let n = smoothed[j] else { return nil }
            return visionToView(nx: n.x, ny: n.y,
                                vSize: vSize,
                                videoWidth: videoWidth, videoHeight: videoHeight,
                                isMirrored: isMirrored)
        }

        // ── Bone lines ──────────────────────────────────────────────────────
        // Both endpoints must be confident — don't draw a bone to an unknown joint.
        for (a, b) in Self.connections {
            guard let pa = pt(a), let pb = pt(b) else { continue }
            linePath.move(to: pa)
            linePath.addLine(to: pb)
        }

        // ── Joint dots ──────────────────────────────────────────────────────
        // KEY FIX: use addEllipse(in:) instead of addArc.
        //
        // addArc on a CGMutablePath WITHOUT a preceding move(to:) inserts a
        // straight line from the current point to the arc's start point before
        // drawing the arc. With multiple arcs and a fill colour, those implicit
        // connecting segments create filled triangles/polygons between the circles
        // — exactly the "orbs/triangles" artefact the user sees.
        //
        // addEllipse(in:) creates each ellipse as its OWN closed subpath
        // (implicit moveTo at entry, no line from previous subpath), so the
        // circles are always isolated — clean dots, nothing else.
        for joint in Joint.allCases {
            guard let p = pt(joint) else { continue }
            dotPath.addEllipse(in: CGRect(x: p.x - r, y: p.y - r,
                                          width: r * 2, height: r * 2))
        }

        // Disable CALayer implicit animations so the skeleton snaps to each new
        // pose frame without interpolating between positions (interpolation at
        // 10 fps inference looks like 1-fps lag on a 60 Hz display).
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        lineLayer.path = linePath
        dotLayer.path  = dotPath
        CATransaction.commit()
    }

    // MARK: – Coordinate transform

    /// Convert Vision normalised (nx, ny) — origin bottom-left, y-up —
    /// to view coordinates — origin top-left, y-down — accounting for
    /// .resizeAspectFill cropping and optional horizontal mirroring (front cam).
    private func visionToView(nx: CGFloat, ny: CGFloat,
                               vSize: CGSize,
                               videoWidth: CGFloat, videoHeight: CGFloat,
                               isMirrored: Bool) -> CGPoint {
        // .resizeAspectFill: pick the scale that fills BOTH view dimensions
        let s = max(vSize.width / videoWidth, vSize.height / videoHeight)

        let scaledW = videoWidth  * s
        let scaledH = videoHeight * s

        // Centering offsets (will be negative on the axis that overflows)
        let ox = (vSize.width  - scaledW) / 2
        let oy = (vSize.height - scaledH) / 2

        // Vision origin is bottom-left; view origin is top-left → flip Y
        var vx = nx       * scaledW + ox
        let vy = (1 - ny) * scaledH + oy

        // Front camera mirror correction
        if isMirrored { vx = vSize.width - vx }

        return CGPoint(x: vx, y: vy)
    }
}
