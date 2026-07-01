import ExpoModulesCore
import AVFoundation
import UIKit

/// ATHLTCameraView — renders the AVCaptureSession preview layer + skeleton overlay.
///
/// This view does NOT own the session. It connects to ATHLTSessionHolder.shared
/// which is set by ATHLTCameraModule.startSession(). Any number of views can
/// observe the session (NotificationCenter broadcast), but we only ever render
/// one at a time in practice.
///
/// The skeleton overlay is updated via .athltPoseUpdated notifications posted by
/// ATHLTCameraModule once per analysed frame on the main queue.

public class ATHLTCameraView: ExpoView {

    // MARK: – Preview layer

    private let previewLayer = AVCaptureVideoPreviewLayer()

    // MARK: – Skeleton overlay

    private let skeleton = SkeletonOverlayView()
    private var skeletonVisible = true

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

        // Connect to existing session if module already ran startSession()
        if let session = ATHLTSessionHolder.shared.session {
            attachSession(session)
        }

        // Observe session changes (module creates/destroys session)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSessionChanged(_:)),
            name: .athltSessionChanged,
            object: nil
        )

        // Observe pose updates (posted by ATHLTCameraModule per analysed frame)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePoseUpdated(_:)),
            name: .athltPoseUpdated,
            object: nil
        )

        // Observe pose cleared (no person / skeleton disabled)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePoseCleared),
            name: .athltPoseCleared,
            object: nil
        )

        // Observe skeleton visibility toggle
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSkeletonVisibility(_:)),
            name: .athltSkeletonVisibilityChanged,
            object: nil
        )
    }

    deinit {
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

    // MARK: – Session attachment

    private func attachSession(_ session: AVCaptureSession?) {
        previewLayer.session = session
        // Portrait keeps the full person (head → ankles) in frame.
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
            if session == nil { self.skeleton.clear() }
        }
    }

    @objc private func handlePoseUpdated(_ notification: Notification) {
        guard skeletonVisible,
              let info       = notification.userInfo,
              let pose       = info["pose"]        as? Pose,
              let videoWidth  = info["videoWidth"]  as? CGFloat,
              let videoHeight = info["videoHeight"] as? CGFloat,
              let isMirrored  = info["isMirrored"]  as? Bool
        else { return }

        skeleton.update(pose: pose,
                        videoWidth:  videoWidth,
                        videoHeight: videoHeight,
                        isMirrored:  isMirrored)
    }

    @objc private func handlePoseCleared() {
        skeleton.clear()
    }

    @objc private func handleSkeletonVisibility(_ notification: Notification) {
        let visible = notification.userInfo?["visible"] as? Bool ?? true
        skeletonVisible = visible
        if !visible { skeleton.clear() }
    }
}
