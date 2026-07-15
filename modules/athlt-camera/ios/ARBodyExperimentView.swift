import ExpoModulesCore
import ARKit
import SceneKit
import UIKit

// Joint raw value strings for ARSkeleton.JointName(rawValue:)
// ARSkeleton.JointName has no static dot-syntax members — always use rawValue init.
private let jLeftShoulder  = ARSkeleton.JointName(rawValue: "left_arm_joint")
private let jLeftElbow     = ARSkeleton.JointName(rawValue: "left_forearm_joint")
private let jLeftWrist     = ARSkeleton.JointName(rawValue: "left_hand_joint")
private let jRightShoulder = ARSkeleton.JointName(rawValue: "right_arm_joint")
private let jRightElbow    = ARSkeleton.JointName(rawValue: "right_forearm_joint")
private let jRightWrist    = ARSkeleton.JointName(rawValue: "right_hand_joint")

public final class ARBodyExperimentView: ExpoView, ARSessionDelegate {

    // ── Expo view event ───────────────────────────────────────────────────────
    let onDebugLog = EventDispatcher()

    // ── Static handle so ARBodyExperimentModule.mark() can reach the live view.
    static weak var activeInstance: ARBodyExperimentView?

    // ── AR scene view (shows camera feed) ─────────────────────────────────────
    private let scnView = ARSCNView()

    // ── On-screen overlays ────────────────────────────────────────────────────
    private let angleLabel  = UILabel()   // large live elbow angle
    private let statusLabel = UILabel()   // TRACKING / NO BODY

    // ── Throttle: emit debug log ~3× per second, not every frame ─────────────
    private var lastLogTime: CFTimeInterval = 0

    // ── Thread-safe mark() flag ───────────────────────────────────────────────
    private let markLock      = NSLock()
    private var markRequested = false

    // MARK: – Init / deinit ───────────────────────────────────────────────────

    public required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        ARBodyExperimentView.activeInstance = self
        buildUI()
        startARSession()
    }

    deinit {
        scnView.session.pause()
        scnView.session.delegate = nil
        if ARBodyExperimentView.activeInstance === self {
            ARBodyExperimentView.activeInstance = nil
        }
    }

    // MARK: – Layout ──────────────────────────────────────────────────────────

    public override func layoutSubviews() {
        super.layoutSubviews()
        scnView.frame = bounds
    }

    // MARK: – UI ──────────────────────────────────────────────────────────────

    private func buildUI() {
        backgroundColor = .black

        scnView.automaticallyUpdatesLighting = false
        scnView.autoenablesDefaultLighting   = false
        scnView.showsStatistics              = false
        addSubview(scnView)

        angleLabel.text            = "L: —    R: —"
        angleLabel.font            = UIFont.monospacedSystemFont(ofSize: 28, weight: .bold)
        angleLabel.textColor       = .white
        angleLabel.backgroundColor = UIColor.black.withAlphaComponent(0.60)
        angleLabel.textAlignment   = .center
        angleLabel.layer.cornerRadius = 14
        angleLabel.clipsToBounds   = true
        angleLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(angleLabel)

        statusLabel.text      = "○ NOT TRACKING"
        statusLabel.font      = UIFont.systemFont(ofSize: 13, weight: .semibold)
        statusLabel.textColor = UIColor(red: 1, green: 0.23, blue: 0.19, alpha: 1)
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(statusLabel)

        NSLayoutConstraint.activate([
            angleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 62),
            angleLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
            angleLabel.widthAnchor.constraint(lessThanOrEqualTo: widthAnchor, multiplier: 0.92),

            statusLabel.topAnchor.constraint(equalTo: angleLabel.bottomAnchor, constant: 8),
            statusLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
        ])
    }

    // MARK: – ARKit ───────────────────────────────────────────────────────────

    private func startARSession() {
        let supported = ARBodyTrackingConfiguration.isSupported
        let model     = deviceModel()
        let hasLiDAR  = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)

        emitLog("[AR] isSupported=\(supported) device=\(model) lidar=\(hasLiDAR)")

        guard supported else {
            emitLog("[AR] BODY TRACKING NOT SUPPORTED — cannot run experiment on this device")
            DispatchQueue.main.async { self.showUnsupportedBanner() }
            return
        }

        scnView.session.delegate = self
        let config = ARBodyTrackingConfiguration()
        scnView.session.run(config)
        emitLog("[AR] session started — stand ~6-8 ft back, FULL BODY in frame")
    }

    private func showUnsupportedBanner() {
        let lbl = UILabel()
        lbl.text = "ARKit Body Tracking\nNOT supported\non this device\n(requires A12+)"
        lbl.numberOfLines = 0
        lbl.font = UIFont.systemFont(ofSize: 20, weight: .bold)
        lbl.textColor = .white
        lbl.textAlignment = .center
        lbl.translatesAutoresizingMaskIntoConstraints = false
        addSubview(lbl)
        NSLayoutConstraint.activate([
            lbl.centerXAnchor.constraint(equalTo: centerXAnchor),
            lbl.centerYAnchor.constraint(equalTo: centerYAnchor),
            lbl.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 24),
        ])
    }

    // MARK: – mark() ──────────────────────────────────────────────────────────

    func markSnapshot() {
        markLock.lock()
        markRequested = true
        markLock.unlock()
    }

    // MARK: – ARSessionDelegate ───────────────────────────────────────────────

    public func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        guard let bodyAnchor = anchors.compactMap({ $0 as? ARBodyAnchor }).first else { return }

        let t0 = CACurrentMediaTime()
        let sk = bodyAnchor.skeleton

        // Joint positions in model space (meters, root = hip origin).
        // modelTransform(for:) returns nil when the joint is not tracked — handled gracefully.
        let lSh = jointPos(sk, jLeftShoulder,  name: "lSh")
        let lEl = jointPos(sk, jLeftElbow,     name: "lEl")
        let lWr = jointPos(sk, jLeftWrist,     name: "lWr")
        let rSh = jointPos(sk, jRightShoulder, name: "rSh")
        let rEl = jointPos(sk, jRightElbow,    name: "rEl")
        let rWr = jointPos(sk, jRightWrist,    name: "rWr")

        // 3D elbow angles — nil if any joint in the triple is not tracked
        let lAng = elbowAngle(lSh, lEl, lWr)
        let rAng = elbowAngle(rSh, rEl, rWr)

        // Drift: how far forward the elbow is vs the shoulder in model space.
        // Positive = elbow in front of shoulder (toward camera when person faces forward).
        let lFwd: Float? = lEl.flatMap { e in lSh.map { s in e.z - s.z } }
        let rFwd: Float? = rEl.flatMap { e in rSh.map { s in e.z - s.z } }

        // Elbow−shoulder vector (shows drift direction as xyz)
        let lVec: simd_float3? = lEl.flatMap { e in lSh.map { s in e - s } }
        let rVec: simd_float3? = rEl.flatMap { e in rSh.map { s in e - s } }

        let dt      = Int((CACurrentMediaTime() - t0) * 1000)
        let tracked = bodyAnchor.isTracked
        let camStr  = camStateStr(session.currentFrame?.camera.trackingState)

        // Consume mark flag
        markLock.lock()
        let doMark    = markRequested
        markRequested = false
        markLock.unlock()

        // Live angle overlay — every body anchor, no throttle
        let lStr = lAng.map { String(format: "%.1f", $0) } ?? "—"
        let rStr = rAng.map { String(format: "%.1f", $0) } ?? "—"
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.angleLabel.text       = "L: \(lStr)°    R: \(rStr)°"
            self.statusLabel.text      = tracked ? "● TRACKING" : "○ NO BODY"
            self.statusLabel.textColor = tracked
                ? UIColor(red: 0.18, green: 0.80, blue: 0.44, alpha: 1)
                : UIColor(red: 1.00, green: 0.23, blue: 0.19, alpha: 1)
        }

        // Throttled debug log (~3fps) or immediately on mark
        let now = CACurrentMediaTime()
        guard doMark || (now - lastLogTime) >= 0.333 else { return }
        lastLogTime = now

        let tag = doMark ? "[AR-MARK]" : "[AR]"
        let msg = "\(tag) L=\(lStr)° R=\(rStr)°"
            + " | Lsh=\(fmtV(lSh)) Lel=\(fmtV(lEl)) Lwr=\(fmtV(lWr))"
            + " | Rsh=\(fmtV(rSh)) Rel=\(fmtV(rEl)) Rwr=\(fmtV(rWr))"
            + " | LelVec=\(fmtV(lVec)) RElVec=\(fmtV(rVec))"
            + " | Lfwd=\(fmtF(lFwd)) Rfwd=\(fmtF(rFwd))"
            + " | trk=\(tracked) cam=\(camStr) dt=\(dt)ms"
        emitLog(msg)
    }

    public func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        guard anchors.contains(where: { $0 is ARBodyAnchor }) else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.angleLabel.text       = "L: —    R: —"
            self.statusLabel.text      = "○ NO BODY"
            self.statusLabel.textColor = UIColor(red: 1, green: 0.23, blue: 0.19, alpha: 1)
        }
        emitLog("[AR] body anchor removed — body lost from frame")
    }

    public func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        emitLog("[AR] cam tracking → \(camStateStr(camera.trackingState))")
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        emitLog("[AR] session error: \(error.localizedDescription)")
    }

    // MARK: – Helpers ─────────────────────────────────────────────────────────

    private func emitLog(_ msg: String) {
        onDebugLog(["message": msg])
    }

    private func jointPos(_ sk: ARSkeleton3D,
                          _ name: ARSkeleton.JointName,
                          name debugName: String) -> simd_float3? {
        guard let t = sk.modelTransform(for: name) else {
            // Joint not currently tracked — not an error, just no data this frame.
            return nil
        }
        return simd_float3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    }

    private func elbowAngle(_ shoulder: simd_float3?,
                             _ elbow:   simd_float3?,
                             _ wrist:   simd_float3?) -> Float? {
        guard let s = shoulder, let e = elbow, let w = wrist else { return nil }
        let va = s - e   // shoulder direction from elbow
        let vb = w - e   // wrist direction from elbow
        let la = simd_length(va)
        let lb = simd_length(vb)
        guard la > 0.001, lb > 0.001 else { return nil }
        let cosA = simd_dot(va, vb) / (la * lb)
        return acos(max(-1, min(1, cosA))) * (180 / .pi)
    }

    private func fmtV(_ v: simd_float3?) -> String {
        guard let v else { return "nil" }
        return String(format: "(%+.2f,%+.2f,%+.2f)", v.x, v.y, v.z)
    }

    private func fmtF(_ f: Float?) -> String {
        guard let f else { return "nil" }
        return String(format: "%+.3f", f)
    }

    private func camStateStr(_ state: ARCamera.TrackingState?) -> String {
        guard let state else { return "n/a" }
        switch state {
        case .normal:                          return "normal"
        case .limited(.initializing):          return "init"
        case .limited(.relocalizing):          return "reloc"
        case .limited(.excessiveMotion):       return "motion"
        case .limited(.insufficientFeatures):  return "features"
        case .limited:                         return "limited"
        case .notAvailable:                    return "n/a"
        @unknown default:                      return "?"
        }
    }

    private func deviceModel() -> String {
        var info = utsname(); uname(&info)
        return withUnsafePointer(to: &info.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(validatingUTF8: $0) ?? UIDevice.current.model
            }
        }
    }
}
