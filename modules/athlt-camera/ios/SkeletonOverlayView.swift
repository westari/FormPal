import UIKit

/// Real-time skeleton overlay drawn over the camera preview during form-check.
///
/// Receives poses via update(pose:) on the MAIN thread.
/// Draws lines + filled dots using two CAShapeLayers for performance.
///
/// Coordinate transform (see visionToView):
///   Vision returns normalised coords with origin at BOTTOM-LEFT (y up).
///   The preview layer uses .resizeAspectFill, portrait orientation.
///   We correct for both the y-flip and the aspect-fill crop offset.
///
/// TUNING after first build:
///   • If skeleton is flipped left-right on FRONT camera, set isMirrored = true
///     in ATHLTCameraModule when posting .athltPoseUpdated.
///   • If skeleton is offset, verify the buffer dimensions in the NSLog
///     ("[GymCamera] pixel buffer WxH") and confirm h > w (portrait).

final class SkeletonOverlayView: UIView {

    // MARK: – Layers

    private let lineLayer = CAShapeLayer()
    private let dotLayer  = CAShapeLayer()

    // MARK: – Smoothing

    /// Smoothed joint positions in Vision normalised space [0,1].
    private var smoothed: [Joint: CGPoint] = [:]
    /// EMA factor: 1.0 = no smoothing, 0.3 = heavy smoothing.
    private let ema: CGFloat = 0.50

    // MARK: – Skeleton connections

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

    private static let minConfidence: Float = 0.30

    // #0A6CFF — matches FormPal's blue accent
    private static let blue = UIColor(red: 0.04, green: 0.42, blue: 1.00, alpha: 1.0)

    // MARK: – Init

    override init(frame: CGRect) { super.init(frame: frame); setup() }
    required init?(coder: NSCoder) { super.init(coder: coder); setup() }

    private func setup() {
        backgroundColor          = .clear
        isUserInteractionEnabled = false

        // Lines: vivid blue, semi-transparent, rounded caps
        lineLayer.fillColor   = UIColor.clear.cgColor
        lineLayer.strokeColor = Self.blue.withAlphaComponent(0.70).cgColor
        lineLayer.lineWidth   = 2.5
        lineLayer.lineCap     = .round
        lineLayer.lineJoin    = .round
        layer.addSublayer(lineLayer)

        // Dots: white fill + blue border (reads well on any background)
        dotLayer.fillColor   = UIColor.white.cgColor
        dotLayer.strokeColor = Self.blue.withAlphaComponent(0.90).cgColor
        dotLayer.lineWidth   = 2.0
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

    // MARK: – Public API (call on MAIN thread)

    /// Update with the latest pose. Call from main thread only.
    func update(pose: Pose, videoWidth: CGFloat, videoHeight: CGFloat, isMirrored: Bool) {
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
                smoothed[joint] = raw  // snap on first appearance (no lag)
            }
        }
        // Drop joints that are no longer visible
        for joint in Array(smoothed.keys) where !visible.contains(joint) {
            smoothed.removeValue(forKey: joint)
        }
        redraw(videoWidth: videoWidth, videoHeight: videoHeight, isMirrored: isMirrored)
    }

    /// Clear the overlay (person left frame or skeleton disabled).
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

        let linePath = UIBezierPath()
        let dotPath  = UIBezierPath()
        let dotR: CGFloat = 4.5

        // Helper: Vision normalised → view point (returns nil if joint not tracked)
        func pt(_ j: Joint) -> CGPoint? {
            guard let n = smoothed[j] else { return nil }
            return visionToView(nx: n.x, ny: n.y,
                                vSize: vSize,
                                videoWidth: videoWidth, videoHeight: videoHeight,
                                isMirrored: isMirrored)
        }

        // Lines
        for (a, b) in Self.connections {
            guard let pa = pt(a), let pb = pt(b) else { continue }
            linePath.move(to: pa)
            linePath.addLine(to: pb)
        }

        // Dots (on top of lines)
        for joint in Joint.allCases {
            guard let p = pt(joint) else { continue }
            dotPath.move(to: CGPoint(x: p.x + dotR, y: p.y))
            dotPath.addArc(withCenter: p, radius: dotR,
                           startAngle: 0, endAngle: .pi * 2, clockwise: true)
        }

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        lineLayer.path = linePath.cgPath
        dotLayer.path  = dotPath.cgPath
        CATransaction.commit()
    }

    // MARK: – Coordinate transform

    /// Convert Vision normalised (nx, ny) — origin bottom-left, y-up —
    /// to view coordinates — origin top-left, y-down — accounting for
    /// .resizeAspectFill cropping and optional horizontal mirroring.
    private func visionToView(nx: CGFloat, ny: CGFloat,
                               vSize: CGSize,
                               videoWidth: CGFloat, videoHeight: CGFloat,
                               isMirrored: Bool) -> CGPoint {
        // resizeAspectFill: choose scale that fills BOTH dimensions
        let s = max(vSize.width / videoWidth, vSize.height / videoHeight)

        // Scaled video dimensions in view space
        let scaledW = videoWidth  * s
        let scaledH = videoHeight * s

        // Centering offsets (negative = video is cropped on that axis)
        let ox = (vSize.width  - scaledW) / 2
        let oy = (vSize.height - scaledH) / 2

        // Pixel coords in video space (Vision: bottom-left origin → flip Y)
        var vx = nx       * scaledW + ox
        let vy = (1 - ny) * scaledH + oy

        if isMirrored { vx = vSize.width - vx }

        return CGPoint(x: vx, y: vy)
    }
}
