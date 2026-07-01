import ExpoModulesCore
import AVFoundation
import UIKit

/// ATHLTCameraView — renders the AVCaptureSession preview layer + skeleton overlay.
///
/// Session ownership: this view does NOT own the session. It connects to
/// ATHLTSessionHolder.shared which is managed by ATHLTCameraModule.
///
/// Skeleton rendering pipeline:
///   1. ATHLTCameraModule (inferenceQueue) writes pose to ATHLTPoseBuffer.shared
///      once per analyzed frame (~10 fps). Zero main-thread work on the write path.
///   2. CADisplayLink (main thread, 60-120 fps) calls tick() each vsync.
///   3. tick() calls ATHLTPoseBuffer.shared.take() — O(1) NSLock read.
///   4. If a new frame is available, skeleton.update() redraws two CAShapeLayers.
///   This decouples inference rate from display rate and eliminates per-frame
///   main-thread dispatch / dictionary allocation overhead.

public class ATHLTCameraView: ExpoView {

    // MARK: – Preview layer

    private let previewLayer = AVCaptureVideoPreviewLayer()

    // MARK: – Skeleton overlay

    private let skeleton     = SkeletonOverlayView()
    private var skeletonVisible = true

    // MARK: – Display link (drives skeleton at screen refresh rate)

    private var displayLink: CADisplayLink?

    // MARK: – Init

    public required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        configure()
    }

    private func configure() {
        clipsToBounds = true
        backgroundColor = .black

        // Preview layer (fills view)
        previewLayer.videoGravity = .resizeAspectFill
        layer.addSublayer(previewLayer)

        // Skeleton overlay (covers full view, above preview)
        skeleton.frame = bounds
        skeleton.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(skeleton)

        // CADisplayLink — fires at the native screen refresh rate (60/120 Hz).
        // tick() reads ATHLTPoseBuffer and updates skeleton only when a new frame
        // is available, so there's zero work on the 50+ "empty" ticks per second.
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.preferredFramesPerSecond = 0   // match native display refresh rate
        link.add(to: .main, forMode: .common)
        displayLink = link

        // Connect to existing session if module already ran startSession()
        if let session = ATHLTSessionHolder.shared.session {
            attachSession(session)
        }

        // Session lifecycle
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSessionChanged(_:)),
            name: .athltSessionChanged,
            object: nil
        )

        // Pose cleared (no person / skeleton disabled)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePoseCleared),
            name: .athltPoseCleared,
            object: nil
        )

        // Skeleton visibility toggle
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSkeletonVisibility(_:)),
            name: .athltSkeletonVisibilityChanged,
            object: nil
        )
    }

    deinit {
        displayLink?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: – Layout

    public override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        previewLayer.frame = bounds
        CATransaction.commit()
    }

    // MARK: – CADisplayLink tick (main thread, ~60-120 fps)

    @objc private func tick() {
        guard skeletonVisible else { return }
        guard let frame = ATHLTPoseBuffer.shared.take() else { return }
        skeleton.update(pose:        frame.pose,
                        videoWidth:  frame.videoWidth,
                        videoHeight: frame.videoHeight,
                        isMirrored:  frame.isMirrored)
    }

    // MARK: – Session attachment

    private func attachSession(_ session: AVCaptureSession?) {
        previewLayer.session = session
        if let conn = previewLayer.connection, conn.isVideoOrientationSupported {
            conn.videoOrientation = .portrait
        }
    }

    // MARK: – Notification handlers

    @objc private func handleSessionChanged(_ notification: Notification) {
        let session = notification.object as? AVCaptureSession
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.attachSession(session)
            if session == nil {
                ATHLTPoseBuffer.shared.clear()
                self.skeleton.clear()
            }
        }
    }

    @objc private func handlePoseCleared() {
        skeleton.clear()
    }

    @objc private func handleSkeletonVisibility(_ notification: Notification) {
        let visible = notification.userInfo?["visible"] as? Bool ?? true
        skeletonVisible = visible
        if !visible {
            ATHLTPoseBuffer.shared.clear()
            skeleton.clear()
        }
    }
}
