import ExpoModulesCore
import AVFoundation
import UIKit

/// ATHLTCameraView — renders the AVCaptureSession preview layer.
///
/// This view does NOT own the session. It connects to ATHLTSessionHolder.shared
/// which is set by ATHLTCameraModule.startSession(). Any number of views can
/// observe the session (NotificationCenter broadcast), but we only ever render
/// one at a time in practice.
///
/// Exposed to React Native as the "ATHLTCameraView" native view manager.
/// Usage in JS: import { ATHLTCameraView } from 'athlt-camera'

public class ATHLTCameraView: ExpoView {

    // MARK: – Preview layer

    private let previewLayer = AVCaptureVideoPreviewLayer()

    // MARK: – Init

    public required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        configure()
    }

    private func configure() {
        // Fill parent view, clip to bounds (especially for rounded corners if used)
        clipsToBounds = true
        backgroundColor = .black

        previewLayer.videoGravity = .resizeAspectFill
        layer.addSublayer(previewLayer)

        // Connect to existing session if the module already ran startSession()
        if let session = ATHLTSessionHolder.shared.session {
            attachSession(session)
        }

        // Observe future session changes (module creates/destroys session)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSessionChanged(_:)),
            name: .athltSessionChanged,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: – Layout

    public override func layoutSubviews() {
        super.layoutSubviews()
        // Keep preview layer perfectly in sync with the view's bounds
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        previewLayer.frame = bounds
        CATransaction.commit()
    }

    // MARK: – Session attachment

    private func attachSession(_ session: AVCaptureSession?) {
        previewLayer.session = session

        // Portrait: squatting body is taller than wide; portrait keeps the full
        // person (head → ankles) in frame, which body-pose detection requires.
        if let conn = previewLayer.connection, conn.isVideoOrientationSupported {
            conn.videoOrientation = .portrait
        }
    }

    @objc private func handleSessionChanged(_ notification: Notification) {
        let session = notification.object as? AVCaptureSession
        DispatchQueue.main.async { [weak self] in
            self?.attachSession(session)
        }
    }
}
