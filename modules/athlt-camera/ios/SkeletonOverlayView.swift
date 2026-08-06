import UIKit

/// Real-time skeleton overlay drawn over the camera preview during form-check.
///
/// Performance design:
///   • CAShapeLayers created once in setup() — GPU-rendered.
///   • Each frame: build two CGMutablePaths (C-level, no ObjC bridge cost) and assign
///     to layer.path inside a no-animation CATransaction. No setNeedsDisplay, no draw(rect:).
///   • Driven by a CADisplayLink in ATHLTCameraView at native refresh rate (60-120 Hz).
///
/// VISUAL DESIGN (glow style): a plain flat-blue wireframe read as "cheap." Detection/
/// tracking/smoothing/coordinate-transform logic below is UNCHANGED — only how the
/// same computed paths get drawn changed. Each bone line and joint dot is now two
/// layers sharing the same path: a wider, blurred, low-opacity "glow" layer underneath
/// (CALayer's native shadow* properties, applied to a layer whose own content is
/// invisible — a standard, cheap way to get a soft glow from a CAShapeLayer without a
/// custom blur/Metal pass) and a slim, bright "core" layer on top. Joint dots use a
/// warm-white core over a colored glow so they read as small glowing points rather than
/// flat filled circles — closer to the AR-fitness-app look than a solid dot+outline.
final class SkeletonOverlayView: UIView {

    // MARK: – Layers
    // "Glow" layers are wider/blurred and sit underneath; "core" layers are thin/bright
    // and sit on top, sharing the exact same path per frame.

    private let lineGlowLayer = CAShapeLayer()
    private let lineCoreLayer = CAShapeLayer()
    private let dotGlowLayer  = CAShapeLayer()
    private let dotCoreLayer  = CAShapeLayer()

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

    // Core (bright, crisp) sizes — slightly slimmer than the old flat design (2.5pt)
    // for a more refined line weight.
    private static let dotCoreRadius: CGFloat = 3.6
    private static let lineCoreWidth: CGFloat = 2.0
    // Glow (soft, wide) sizes — the shadow radius does the actual softening; the
    // shape itself is drawn a little wider than the core so the blur has something
    // to spread from.
    private static let dotGlowRadius: CGFloat = 7.0
    private static let lineGlowWidth: CGFloat = 5.0

    // FormPal accent blue for the glow; a warm near-white for the crisp core, which
    // is what actually reads as "glowing" rather than flat-colored.
    private static let accent    = UIColor(red: 0.10, green: 0.55, blue: 1.00, alpha: 1.0)
    private static let coreLine  = UIColor(red: 0.55, green: 0.80, blue: 1.00, alpha: 1.0)
    private static let coreDot   = UIColor(red: 0.92, green: 0.97, blue: 1.00, alpha: 1.0)

    // MARK: – Init

    override init(frame: CGRect) { super.init(frame: frame); setup() }
    required init?(coder: NSCoder) { super.init(coder: coder); setup() }

    private func setup() {
        backgroundColor          = .clear
        isUserInteractionEnabled = false

        // ── Bone glow (wide, blurred, underneath) ──────────────────────────────
        lineGlowLayer.fillColor    = UIColor.clear.cgColor
        lineGlowLayer.strokeColor  = Self.accent.withAlphaComponent(0.55).cgColor
        lineGlowLayer.lineWidth    = Self.lineGlowWidth
        lineGlowLayer.lineCap      = .round
        lineGlowLayer.lineJoin     = .round
        lineGlowLayer.shadowColor  = Self.accent.cgColor
        lineGlowLayer.shadowRadius = 6
        lineGlowLayer.shadowOpacity = 0.85
        lineGlowLayer.shadowOffset = .zero
        layer.addSublayer(lineGlowLayer)

        // ── Bone core (slim, bright, on top) ───────────────────────────────────
        lineCoreLayer.fillColor   = UIColor.clear.cgColor
        lineCoreLayer.strokeColor = Self.coreLine.withAlphaComponent(0.95).cgColor
        lineCoreLayer.lineWidth   = Self.lineCoreWidth
        lineCoreLayer.lineCap     = .round
        lineCoreLayer.lineJoin    = .round
        layer.addSublayer(lineCoreLayer)

        // ── Joint glow (wide, blurred, underneath) ─────────────────────────────
        dotGlowLayer.fillColor    = Self.accent.withAlphaComponent(0.45).cgColor
        dotGlowLayer.strokeColor  = UIColor.clear.cgColor
        dotGlowLayer.shadowColor  = Self.accent.cgColor
        dotGlowLayer.shadowRadius = 7
        dotGlowLayer.shadowOpacity = 0.9
        dotGlowLayer.shadowOffset = .zero
        layer.addSublayer(dotGlowLayer)

        // ── Joint core (small, bright, on top) ─────────────────────────────────
        dotCoreLayer.fillColor   = Self.coreDot.cgColor
        dotCoreLayer.strokeColor = Self.accent.withAlphaComponent(0.9).cgColor
        dotCoreLayer.lineWidth   = 1.25
        layer.addSublayer(dotCoreLayer)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        lineGlowLayer.frame = bounds
        lineCoreLayer.frame = bounds
        dotGlowLayer.frame  = bounds
        dotCoreLayer.frame  = bounds
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
        lineGlowLayer.path = nil
        lineCoreLayer.path = nil
        dotGlowLayer.path  = nil
        dotCoreLayer.path  = nil
        CATransaction.commit()
    }

    // MARK: – Drawing

    private func redraw(videoWidth: CGFloat, videoHeight: CGFloat, isMirrored: Bool) {
        let vSize = bounds.size
        guard vSize.width > 0, vSize.height > 0,
              videoWidth > 0, videoHeight > 0 else { return }

        let linePath     = CGMutablePath()
        let dotCorePath  = CGMutablePath()
        let dotGlowPath  = CGMutablePath()
        let rCore = Self.dotCoreRadius
        let rGlow = Self.dotGlowRadius

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
        // Same single path reused for both the glow and core line layers.
        for (a, b) in Self.connections {
            guard let pa = pt(a), let pb = pt(b) else { continue }
            linePath.move(to: pa)
            linePath.addLine(to: pb)
        }

        // ── Joint dots ──────────────────────────────────────────────────────
        // KEY FIX (kept from the original design): addEllipse(in:) instead of
        // addArc — addArc without a preceding move(to:) draws an implicit
        // connecting line from the previous subpath, which with a fill colour
        // creates filled triangle/polygon artefacts between circles.
        // addEllipse(in:) is always its own closed subpath, so dots stay isolated.
        for joint in Joint.allCases {
            guard let p = pt(joint) else { continue }
            dotCorePath.addEllipse(in: CGRect(x: p.x - rCore, y: p.y - rCore,
                                              width: rCore * 2, height: rCore * 2))
            dotGlowPath.addEllipse(in: CGRect(x: p.x - rGlow, y: p.y - rGlow,
                                              width: rGlow * 2, height: rGlow * 2))
        }

        // Disable CALayer implicit animations so the skeleton snaps to each new
        // pose frame without interpolating between positions (interpolation at
        // 10 fps inference looks like 1-fps lag on a 60 Hz display).
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        lineGlowLayer.path = linePath
        lineCoreLayer.path = linePath
        dotGlowLayer.path  = dotGlowPath
        dotCoreLayer.path  = dotCorePath
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
