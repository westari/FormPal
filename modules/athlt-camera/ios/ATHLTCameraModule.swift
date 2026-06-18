import ExpoModulesCore
import AVFoundation
import Vision
import CoreMedia
import CoreVideo
import UIKit

// ─── Notification for broadcasting session to ATHLTCameraView instances ────────

extension Notification.Name {
    static let athltSessionChanged = Notification.Name("com.athlt.camera.sessionChanged")
}

// ─── Shared session holder ─────────────────────────────────────────────────────

final class ATHLTSessionHolder {
    static let shared = ATHLTSessionHolder()
    private(set) var session: AVCaptureSession?
    private init() {}
    func set(_ session: AVCaptureSession?) {
        self.session = session
        NotificationCenter.default.post(name: .athltSessionChanged, object: session)
    }
}

// ─── SquatAnalyzer ──────────────────────────────────────────────────────────────
//
// Reads a Vision body-pose observation, computes knee angle (hip→knee→ankle),
// and runs a standing↔descending state machine to count reps and judge depth.
//
// ✓ / ✗ is decided on DEPTH only for v1:
//   - good rep  = knee angle reached ≤ goodDepthAngle (parallel-ish or below)
//   - shallow ✗ = real rep but didn't get deep enough
//
// Angles are geometric (invariant to coordinate origin), so no flip/convert needed.

final class SquatAnalyzer {

    // MARK: – Tuning constants

    /// Min per-joint Vision confidence to use a joint in the angle calc.
    static let jointConfidenceMin: Float = 0.30

    /// Knee angle (deg) at/above which the person is considered standing.
    static let standingKneeAngle: Double = 160.0

    /// Knee angle (deg) below which a descent has begun (hysteresis vs standing).
    static let descentStartAngle: Double = 150.0

    /// Min knee angle (deg) for a GOOD rep — ~parallel is 90°, 100° gives margin.
    static let goodDepthAngle: Double = 100.0

    /// A rep only counts if the knee bent past this (filters tiny bobs/noise).
    static let minRepDepthAngle: Double = 140.0

    // MARK: – Public state
    private(set) var reps: Int = 0
    private(set) var goodReps: Int = 0
    private(set) var lastKneeAngle: Double = 180.0
    private(set) var state: String = "waiting for person"

    struct RepResult {
        let good: Bool
        let reason: String
        let depthAngle: Double
    }

    // MARK: – Private state
    private enum Phase { case standing, descending }
    private var phase: Phase = .standing
    private var minAngleThisRep: Double = 180.0

    // MARK: – Session control

    func reset() {
        reps = 0
        goodReps = 0
        lastKneeAngle = 180.0
        state = "waiting for person"
        phase = .standing
        minAngleThisRep = 180.0
    }

    func notePersonMissing() {
        state = "no person / legs not fully visible"
    }

    // MARK: – Ingestion ────────────────────────────────────────────────────────
    //
    // Returns a RepResult on the frame a rep completes, nil otherwise.

    func ingest(pose: VNHumanBodyPoseObservation, timestamp: Double) -> RepResult? {
        var angles: [Double] = []
        if let h = point(pose, .leftHip), let k = point(pose, .leftKnee), let a = point(pose, .leftAnkle) {
            angles.append(angleAt(vertex: k, h, a))
        }
        if let h = point(pose, .rightHip), let k = point(pose, .rightKnee), let a = point(pose, .rightAnkle) {
            angles.append(angleAt(vertex: k, h, a))
        }
        guard !angles.isEmpty else {
            state = "no person / legs not fully visible"
            return nil
        }

        let kneeAngle = angles.reduce(0, +) / Double(angles.count)
        lastKneeAngle = kneeAngle

        switch phase {
        case .standing:
            state = String(format: "standing (knee %.0f°)", kneeAngle)
            if kneeAngle < Self.descentStartAngle {
                phase = .descending
                minAngleThisRep = kneeAngle
            }

        case .descending:
            if kneeAngle < minAngleThisRep { minAngleThisRep = kneeAngle }
            state = String(format: "descending (min %.0f°)", minAngleThisRep)

            if kneeAngle > Self.standingKneeAngle {
                // Returned to standing — was it a real rep?
                if minAngleThisRep < Self.minRepDepthAngle {
                    reps += 1
                    let good = minAngleThisRep <= Self.goodDepthAngle
                    if good { goodReps += 1 }
                    let result = RepResult(
                        good: good,
                        reason: good ? "good depth" : "too shallow — go deeper",
                        depthAngle: minAngleThisRep
                    )
                    NSLog("[SquatAnalyzer] REP %@ depth=%.0f° (%d good / %d total)",
                          good ? "GOOD" : "SHALLOW", minAngleThisRep, goodReps, reps)
                    phase = .standing
                    minAngleThisRep = 180.0
                    return result
                } else {
                    // Didn't dip far enough to be a rep — ignore.
                    phase = .standing
                    minAngleThisRep = 180.0
                }
            }
        }
        return nil
    }

    // MARK: – Helpers ────────────────────────────────────────────────────────────

    private func point(_ pose: VNHumanBodyPoseObservation,
                       _ joint: VNHumanBodyPoseObservation.JointName) -> CGPoint? {
        guard let p = try? pose.recognizedPoint(joint),
              p.confidence >= Self.jointConfidenceMin else { return nil }
        return p.location
    }

    /// Angle (degrees) at `vertex`, formed by vertex→a and vertex→c.
    private func angleAt(vertex b: CGPoint, _ a: CGPoint, _ c: CGPoint) -> Double {
        let v1x = Double(a.x - b.x), v1y = Double(a.y - b.y)
        let v2x = Double(c.x - b.x), v2y = Double(c.y - b.y)
        let dot = v1x * v2x + v1y * v2y
        let m1  = (v1x * v1x + v1y * v1y).squareRoot()
        let m2  = (v2x * v2x + v2y * v2y).squareRoot()
        guard m1 > 1e-6, m2 > 1e-6 else { return 180.0 }
        let cosA = max(-1.0, min(1.0, dot / (m1 * m2)))
        return acos(cosA) * 180.0 / .pi
    }
}

// ─── Capture delegate ──────────────────────────────────────────────────────────

private final class ATHLTCaptureDelegate: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    weak var module: ATHLTCameraModule?
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        module?.handleSampleBuffer(sampleBuffer)
    }
}

// ─── Main Expo Module ──────────────────────────────────────────────────────────

public class ATHLTCameraModule: Module {

    // MARK: – Session infrastructure
    private let sessionQueue   = DispatchQueue(label: "com.athlt.camera.session",   qos: .userInteractive)
    private let inferenceQueue = DispatchQueue(label: "com.athlt.camera.inference", qos: .userInteractive)

    private var captureSession:  AVCaptureSession?
    private var videoOutput:     AVCaptureVideoDataOutput?
    private var captureDelegate: ATHLTCaptureDelegate?

    // MARK: – Camera position (back = propped phone facing the lifter)
    private var currentPosition: AVCaptureDevice.Position = .back

    // MARK: – Mode
    private var currentMode: String = "idle"   // "idle" | "tracking"
    private var isTracking  = false

    // MARK: – Frame throttle (~10fps from 30fps input — plenty for squat tempo)
    private var frameCounter = 0
    private let frameSkip    = 3

    // MARK: – Squat analysis (accessed on inferenceQueue only)
    private let squatAnalyzer = SquatAnalyzer()
    private var personDetected = false

    // MARK: – Diagnostics
    private var diagnosticMode = false
    private var totalFramesReceived: Int = 0   // sessionQueue — camera-alive indicator
    private var totalFramesAnalyzed: Int = 0   // inferenceQueue — analysis-ran indicator
    private var lastDebugStatsTime: Double = 0.0
    private let debugStatsThrottle: Double = 1.0   // once per second

    // MARK: – Module definition ─────────────────────────────────────────────────

    public func definition() -> ModuleDefinition {
        Name("ATHLTCamera")

        Events("onRepDetected", "onError", "onCameraState", "onDebugStats")

        View(ATHLTCameraView.self) {
            Prop("isActive") { (_: ATHLTCameraView, _: Bool) in }
        }

        AsyncFunction("startSession") { (promise: Promise) in
            self.sessionQueue.async { self.doStartSession(promise: promise) }
        }

        AsyncFunction("stopSession") { (promise: Promise) in
            self.sessionQueue.async {
                self.videoOutput?.setSampleBufferDelegate(nil, queue: nil)
                self.captureSession?.stopRunning()
                self.captureSession  = nil
                self.videoOutput     = nil
                self.captureDelegate = nil
                ATHLTSessionHolder.shared.set(nil)
                self.inferenceQueue.async {
                    self.isTracking  = false
                    self.currentMode = "idle"
                    self.squatAnalyzer.reset()
                }
                NSLog("[GymCamera] session stopped")
                promise.resolve(["success": true])
            }
        }

        // setMode kept as a thin control: "idle" stops analysis, "tracking" starts it.
        AsyncFunction("setMode") { (mode: String, promise: Promise) in
            self.inferenceQueue.async {
                self.currentMode = mode
                self.isTracking  = (mode == "tracking")
                NSLog("[GymCamera] mode: %@", mode)
                promise.resolve()
            }
        }

        AsyncFunction("flipCamera") { (promise: Promise) in
            self.sessionQueue.async { self.doFlipCamera(promise: promise) }
        }

        AsyncFunction("setDiagnosticMode") { (enabled: Bool, promise: Promise) in
            self.inferenceQueue.async {
                self.diagnosticMode = enabled
                NSLog("[GymCamera] diagnostic: %@", enabled ? "ON" : "OFF")
                promise.resolve()
            }
        }

        AsyncFunction("startTracking") { (promise: Promise) in
            self.inferenceQueue.async {
                self.squatAnalyzer.reset()
                self.isTracking          = true
                self.currentMode         = "tracking"
                self.totalFramesAnalyzed = 0
                self.lastDebugStatsTime  = 0.0
                self.personDetected      = false
                NSLog("[GymCamera] tracking started")
                promise.resolve()
            }
        }

        AsyncFunction("stopTracking") { (promise: Promise) in
            self.inferenceQueue.async {
                self.isTracking  = false
                self.currentMode = "idle"
                let r  = self.squatAnalyzer.reps
                let gr = self.squatAnalyzer.goodReps
                NSLog("[GymCamera] tracking stopped — %d good / %d reps", gr, r)
                promise.resolve(["reps": r, "goodReps": gr])
            }
        }
    }

    // MARK: – startSession ─────────────────────────────────────────────────────

    private func doStartSession(promise: Promise) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        switch status {
        case .authorized:
            configureSession(position: currentPosition, promise: promise)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard let self else { return }
                if granted { self.sessionQueue.async { self.configureSession(position: self.currentPosition, promise: promise) } }
                else { promise.resolve(["success": false, "error": "Camera permission denied"]) }
            }
        default:
            promise.resolve(["success": false, "error": "Camera permission denied. Enable in iOS Settings."])
        }
    }

    private func configureSession(position: AVCaptureDevice.Position, promise: Promise) {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else {
            promise.resolve(["success": false, "error": "No camera found"])
            return
        }

        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720

        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else {
                promise.resolve(["success": false, "error": "Cannot add camera input"])
                return
            }
            session.addInput(input)
        } catch {
            promise.resolve(["success": false, "error": "Input error: \(error.localizedDescription)"])
            return
        }

        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.alwaysDiscardsLateVideoFrames = true

        let delegate = ATHLTCaptureDelegate()
        delegate.module = self
        captureDelegate = delegate
        output.setSampleBufferDelegate(delegate, queue: sessionQueue)

        guard session.canAddOutput(output) else {
            promise.resolve(["success": false, "error": "Cannot add video output"])
            return
        }
        session.addOutput(output)

        // PORTRAIT: a standing/squatting body is taller than wide — portrait keeps the
        // whole person (head → ankles) in frame, which body-pose needs.
        if let conn = output.connection(with: .video) {
            if conn.isVideoOrientationSupported { conn.videoOrientation = .portrait }
            if conn.isVideoMirroringSupported   { conn.isVideoMirrored  = (position == .front) }
        }

        session.commitConfiguration()
        captureSession = session
        videoOutput    = output
        ATHLTSessionHolder.shared.set(session)
        session.startRunning()

        NSLog("[GymCamera] session configured (%@), running: %@",
              position == .front ? "front" : "back", session.isRunning ? "YES" : "NO")
        sendEvent("onCameraState", ["running": session.isRunning,
                                    "position": position == .front ? "front" : "back"])
        promise.resolve(["success": session.isRunning])
    }

    // MARK: – flipCamera ───────────────────────────────────────────────────────

    private func doFlipCamera(promise: Promise) {
        guard let session = captureSession, let output = videoOutput else {
            promise.resolve(["position": currentPosition == .back ? "back" : "front"])
            return
        }

        let newPos: AVCaptureDevice.Position = (currentPosition == .back) ? .front : .back
        guard let newDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: newPos),
              let newInput  = try? AVCaptureDeviceInput(device: newDevice) else {
            promise.resolve(["position": currentPosition == .back ? "back" : "front"])
            return
        }

        session.beginConfiguration()
        for input in session.inputs { session.removeInput(input) }
        if session.canAddInput(newInput) { session.addInput(newInput) }
        if let conn = output.connection(with: .video) {
            if conn.isVideoOrientationSupported { conn.videoOrientation = .portrait }
            if conn.isVideoMirroringSupported   { conn.isVideoMirrored  = (newPos == .front) }
        }
        session.commitConfiguration()
        currentPosition = newPos

        let posStr = newPos == .front ? "front" : "back"
        NSLog("[GymCamera] camera flipped → %@", posStr)
        promise.resolve(["position": posStr])
    }

    // MARK: – Frame handling ───────────────────────────────────────────────────

    func handleSampleBuffer(_ buffer: CMSampleBuffer) {
        totalFramesReceived += 1

        frameCounter += 1
        guard frameCounter % frameSkip == 0 else { return }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(buffer) else { return }

        let ts = CMSampleBufferGetPresentationTimeStamp(buffer)
        let timestampSec: Double = ts.timescale > 0
            ? Double(ts.value) / Double(ts.timescale)
            : Date().timeIntervalSinceReferenceDate

        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        let cap = pixelBuffer
        let t   = timestampSec

        inferenceQueue.async { [weak self] in
            defer { CVPixelBufferUnlockBaseAddress(cap, .readOnly) }
            guard let self else { return }
            guard self.isTracking else { return }   // only analyze while tracking
            self.runPoseDetection(pixelBuffer: cap, timestamp: t)
        }
    }

    // MARK: – Vision body-pose detection ───────────────────────────────────────

    private func runPoseDetection(pixelBuffer: CVPixelBuffer, timestamp: Double) {
        totalFramesAnalyzed += 1

        if totalFramesAnalyzed <= 3 {
            let w = CVPixelBufferGetWidth(pixelBuffer)
            let h = CVPixelBufferGetHeight(pixelBuffer)
            NSLog("[GymCamera] pixel buffer: %d×%d (%@)", w, h, h > w ? "portrait ✓" : "landscape — check orientation")
        }

        let request = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
        do {
            try handler.perform([request])
        } catch {
            NSLog("[GymCamera] pose error: %@", error.localizedDescription)
            return
        }

        guard let results = request.results as? [VNHumanBodyPoseObservation], !results.isEmpty else {
            personDetected = false
            squatAnalyzer.notePersonMissing()
            maybeEmitDebugStats()
            return
        }

        personDetected = true
        let pose = results.max(by: { $0.confidence < $1.confidence }) ?? results[0]

        if let rep = squatAnalyzer.ingest(pose: pose, timestamp: timestamp) {
            emitRepEvent(rep)
        }
        maybeEmitDebugStats()
    }

    // MARK: – Rep event ────────────────────────────────────────────────────────

    private func emitRepEvent(_ rep: SquatAnalyzer.RepResult) {
        NSLog("[GymCamera] REP %@ — %d good / %d total (depth %.0f°)",
              rep.good ? "GOOD ✓" : "SHALLOW ✗",
              squatAnalyzer.goodReps, squatAnalyzer.reps, rep.depthAngle)
        sendEvent("onRepDetected", [
            "good":       rep.good,
            "reason":     rep.reason,
            "depthAngle": rep.depthAngle,
            "reps":       squatAnalyzer.reps,
            "goodReps":   squatAnalyzer.goodReps,
            "timestamp":  Date().timeIntervalSince1970 * 1000.0,
        ])
    }

    // MARK: – Debug stats ──────────────────────────────────────────────────────

    private func maybeEmitDebugStats() {
        let now = Date().timeIntervalSinceReferenceDate
        guard now - lastDebugStatsTime >= debugStatsThrottle else { return }
        lastDebugStatsTime = now

        sendEvent("onDebugStats", [
            "personDetected":      personDetected,
            "kneeAngle":           squatAnalyzer.lastKneeAngle,
            "phase":               squatAnalyzer.state,
            "reps":                squatAnalyzer.reps,
            "goodReps":            squatAnalyzer.goodReps,
            "totalFramesReceived": totalFramesReceived,
            "totalFramesAnalyzed": totalFramesAnalyzed,
        ])
    }
}