import ExpoModulesCore
import AVFoundation
import Vision
import CoreMedia
import CoreVideo
import UIKit

// ─── Notification ─────────────────────────────────────────────────────────────

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

// ─── SquatAnalyzer ─────────────────────────────────────────────────────────────
//
// Expert 3-phase state machine with ready gate and back-lean form check.
//
// READY GATE
//   Rep counting is suppressed until the person has been detected standing stably
//   (knee angle ≥ topThreshold) for a continuous readyStandingDuration seconds.
//   Walking into frame, partial visibility, or mid-movement during setup cannot
//   trigger reps. If the person leaves frame for > inactivityTimeout, the gate
//   resets and they must re-stabilise before counting resumes.
//
// PHASE MACHINE  (only runs when isReady == true)
//   TOP:          knee angle > topThreshold (~160°)
//   INTERMEDIATE: knee angle in (bottomThreshold … intermediateEntryAngle) (100°–150°)
//   BOTTOM:       knee angle < bottomThreshold (~100°)
//
//   Rep is counted on any INTERMEDIATE entry + return to TOP:
//     • BOTTOM reached + back lean OK  → good=true  "good depth"
//     • BOTTOM reached + back lean bad → good=false "chest up — keep your back straight"
//     • BOTTOM not reached             → good=false "too shallow — go deeper"
//       (if also bad lean → lean cue takes priority over depth cue)
//
// BACK LEAN CHECK
//   Computed as the angle between the shoulder→hip torso line and vertical.
//   0° = perfectly upright; ~30-45° is normal squat forward lean; >backLeanThreshold
//   is flagged. Max back angle is tracked from INTERMEDIATE entry to rep completion.
//   NSLog prints back angle per rep for on-device threshold tuning.
//
// NOTE: All angle/time thresholds are heuristic starting points requiring on-device
//       calibration — camera height, angle, and individual body proportions all affect
//       the measured values.

final class SquatAnalyzer {

    // MARK: – Tuning constants

    static let jointConfidenceMin: Float     = 0.30
    /// Knee angle (°) above which the person is in the TOP phase (standing).
    static let topThreshold: Double          = 160.0
    /// Knee angle (°) below which INTERMEDIATE entry is registered (descent start).
    static let intermediateEntryAngle: Double = 150.0
    /// Knee angle (°) below which the person is in the BOTTOM phase (good depth).
    static let bottomThreshold: Double       = 100.0
    /// Seconds without a valid pose while mid-cycle before the cycle is reset.
    static let inactivityTimeout: Double     = 2.5
    /// Continuous seconds in standing position required before reps are counted.
    static let readyStandingDuration: Double = 1.5
    /// Torso-vertical angle (°) above which a rep is flagged as excessive back lean.
    /// ~30-45° is normal squat lean; 50° is conservative — tune down if too many false flags.
    static let backLeanThreshold: Double     = 50.0

    // MARK: – Public read-only state

    private(set) var reps: Int          = 0
    private(set) var goodReps: Int      = 0
    private(set) var lastKneeAngle: Double = 180.0
    private(set) var lastBackAngle: Double = 0.0
    private(set) var isReady: Bool      = false
    private(set) var state: String      = "Get into frame"

    struct RepResult {
        let good: Bool
        let reason: String
        let depthAngle: Double   // min knee angle reached this rep
        let backAngle:  Double   // max torso-vertical angle reached this rep
    }

    // MARK: – Private

    private enum Phase { case top, intermediate, bottom }
    private var phase: Phase = .top

    private var enteredIntermediate  = false
    private var reachedBottom        = false
    private var minAngleThisRep: Double  = 180.0
    private var maxBackAngleThisRep: Double = 0.0

    private var lastPoseTimestamp: Double  = 0.0
    private var stableStandingStart: Double? = nil

    // MARK: – Session control

    func reset() {
        reps                  = 0
        goodReps              = 0
        lastKneeAngle         = 180.0
        lastBackAngle         = 0.0
        isReady               = false
        stableStandingStart   = nil
        state                 = "Get into frame"
        phase                 = .top
        lastPoseTimestamp     = 0.0
        resetCycle()
    }

    func notePersonMissing(timestamp: Double) {
        state = "no person / legs not fully visible"
        stableStandingStart = nil   // interrupt any in-progress ready accumulation
        guard lastPoseTimestamp > 0 else { return }
        let elapsed = timestamp - lastPoseTimestamp
        guard elapsed > Self.inactivityTimeout else { return }

        if enteredIntermediate {
            NSLog("[SquatAnalyzer] INACTIVITY RESET — mid-cycle after %.1fs", elapsed)
        }
        if isReady {
            NSLog("[SquatAnalyzer] READY RESET — person absent %.1fs", elapsed)
            isReady = false
        }
        resetCycle()
        phase = .top
    }

    // MARK: – Ingestion — returns a RepResult on the frame a rep completes, nil otherwise.

    func ingest(pose: VNHumanBodyPoseObservation, timestamp: Double) -> RepResult? {
        lastPoseTimestamp = timestamp

        // ── Knee angle: average both sides when available ─────────────────────
        var kneeAngles: [Double] = []
        if let h = point(pose, .leftHip),  let k = point(pose, .leftKnee),
           let a = point(pose, .leftAnkle)  { kneeAngles.append(angleAt(b: k, a: h, c: a)) }
        if let h = point(pose, .rightHip), let k = point(pose, .rightKnee),
           let a = point(pose, .rightAnkle) { kneeAngles.append(angleAt(b: k, a: h, c: a)) }

        guard !kneeAngles.isEmpty else {
            state = "no person / legs not fully visible"
            return nil
        }

        let kneeAngle = kneeAngles.reduce(0, +) / Double(kneeAngles.count)
        lastKneeAngle = kneeAngle

        // ── Back/torso angle ──────────────────────────────────────────────────
        if let ba = torsoAngle(pose: pose) {
            lastBackAngle = ba
            // Only accumulate during active squat cycle (after descent begins)
            if enteredIntermediate && ba > maxBackAngleThisRep { maxBackAngleThisRep = ba }
        }

        // ── Ready gate ────────────────────────────────────────────────────────
        if !isReady {
            if kneeAngle >= Self.topThreshold {
                if stableStandingStart == nil { stableStandingStart = timestamp }
                let elapsed = timestamp - (stableStandingStart ?? timestamp)
                state = String(format: "Stand still… %.0f°  (%.1f s)", kneeAngle, elapsed)
                if elapsed >= Self.readyStandingDuration {
                    isReady = true
                    stableStandingStart = nil
                    NSLog("[SquatAnalyzer] → READY after %.1f s stable standing", elapsed)
                }
            } else {
                stableStandingStart = nil
                state = String(format: "Get into frame (knee %.0f°)", kneeAngle)
            }
            return nil  // no rep counting until ready
        }

        // ── Min knee angle (only while cycling) ──────────────────────────────
        if kneeAngle < minAngleThisRep { minAngleThisRep = kneeAngle }

        // ── 3-phase state machine ─────────────────────────────────────────────
        switch phase {

        case .top:
            state = String(format: "TOP (knee %.0f°)", kneeAngle)
            if kneeAngle < Self.intermediateEntryAngle {
                phase = .intermediate
                enteredIntermediate = true
                NSLog("[SquatAnalyzer] → INTERMEDIATE (%.0f°)", kneeAngle)
            }

        case .intermediate:
            state = String(format: "INTERMEDIATE (%.0f°, min %.0f°)", kneeAngle, minAngleThisRep)
            if kneeAngle < Self.bottomThreshold {
                phase = .bottom
                reachedBottom = true
                NSLog("[SquatAnalyzer] → BOTTOM (%.0f°)", kneeAngle)
            } else if kneeAngle > Self.topThreshold {
                return evaluateAndReset()
            }

        case .bottom:
            state = String(format: "BOTTOM (knee %.0f°)", kneeAngle)
            if kneeAngle > Self.bottomThreshold {
                phase = .intermediate
            }
            if kneeAngle > Self.topThreshold {
                return evaluateAndReset()
            }
        }

        return nil
    }

    // MARK: – Helpers

    private var phaseLabel: String {
        switch phase { case .top: return "top"; case .intermediate: return "intermediate"; case .bottom: return "bottom" }
    }

    private func evaluateAndReset() -> RepResult? {
        defer { resetCycle(); phase = .top }

        guard enteredIntermediate else {
            NSLog("[SquatAnalyzer] REJECT — noise, never entered INTERMEDIATE (min=%.0f°)", minAngleThisRep)
            return nil
        }

        reps += 1
        let badDepth = !reachedBottom
        let badLean  = maxBackAngleThisRep > Self.backLeanThreshold
        let good     = !badDepth && !badLean
        if good { goodReps += 1 }

        // Lean takes priority over depth as a coaching cue
        let reason: String
        switch (badDepth, badLean) {
        case (_, true):   reason = "chest up — keep your back straight"
        case (true, _):   reason = "too shallow — go deeper"
        default:          reason = "good depth"
        }

        NSLog("[SquatAnalyzer] REP %-6@ depth=%.0f° backAngle=%.0f° lean=%-3@ (%d good / %d total)",
              good ? "GOOD" : "BAD", minAngleThisRep, maxBackAngleThisRep,
              badLean ? "YES" : "NO", goodReps, reps)

        return RepResult(
            good:       good,
            reason:     reason,
            depthAngle: minAngleThisRep,
            backAngle:  maxBackAngleThisRep
        )
    }

    private func resetCycle() {
        enteredIntermediate  = false
        reachedBottom        = false
        minAngleThisRep      = 180.0
        maxBackAngleThisRep  = 0.0
    }

    // ── Torso/back angle helpers ──────────────────────────────────────────────

    /// Angle (°) between the torso line (hip → shoulder) and vertical.
    /// Returns nil when neither shoulder+hip pair is visible.
    /// 0° = perfectly upright, ~30-45° = normal squat lean, > backLeanThreshold = flag.
    private func torsoAngle(pose: VNHumanBodyPoseObservation) -> Double? {
        var angles: [Double] = []
        if let s = point(pose, .leftShoulder),  let h = point(pose, .leftHip)  { angles.append(verticalAngle(from: h, to: s)) }
        if let s = point(pose, .rightShoulder), let h = point(pose, .rightHip) { angles.append(verticalAngle(from: h, to: s)) }
        guard !angles.isEmpty else { return nil }
        return angles.reduce(0, +) / Double(angles.count)
    }

    /// Angle (°) between the vector (bottom → top) and straight vertical.
    /// Uses atan2 for numerical stability. Ignores lean direction (abs of horizontal).
    private func verticalAngle(from bottom: CGPoint, to top: CGPoint) -> Double {
        let dx = abs(Double(top.x - bottom.x))
        let dy = Double(top.y - bottom.y)       // positive = top is above bottom (Vision y-up)
        return atan2(dx, max(dy, 0.001)) * 180.0 / .pi
    }

    private func point(_ pose: VNHumanBodyPoseObservation,
                       _ joint: VNHumanBodyPoseObservation.JointName) -> CGPoint? {
        guard let p = try? pose.recognizedPoint(joint),
              p.confidence >= Self.jointConfidenceMin else { return nil }
        return p.location
    }

    /// Angle in degrees at vertex b, formed by rays b→a and b→c.
    private func angleAt(b: CGPoint, a: CGPoint, c: CGPoint) -> Double {
        let v1x = Double(a.x - b.x), v1y = Double(a.y - b.y)
        let v2x = Double(c.x - b.x), v2y = Double(c.y - b.y)
        let dot = v1x * v2x + v1y * v2y
        let m1  = (v1x * v1x + v1y * v1y).squareRoot()
        let m2  = (v2x * v2x + v2y * v2y).squareRoot()
        guard m1 > 1e-6, m2 > 1e-6 else { return 180.0 }
        return acos(max(-1.0, min(1.0, dot / (m1 * m2)))) * 180.0 / .pi
    }
}

// ─── Video frame capture delegate ─────────────────────────────────────────────

private final class ATHLTCaptureDelegate: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    weak var module: ATHLTCameraModule?
    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        module?.handleSampleBuffer(sampleBuffer)
    }
}

// ─── Movie recording delegate ──────────────────────────────────────────────────

private final class ATHLTMovieDelegate: NSObject, AVCaptureFileOutputRecordingDelegate {
    weak var module: ATHLTCameraModule?
    func fileOutput(_ output: AVCaptureFileOutput,
                    didFinishRecordingTo outputFileURL: URL,
                    from connections: [AVCaptureConnection],
                    error: Error?) {
        module?.handleMovieFinished(url: outputFileURL, error: error)
    }
}

// ─── Main Expo Module ──────────────────────────────────────────────────────────

public class ATHLTCameraModule: Module {

    // MARK: – Session infrastructure
    private let sessionQueue   = DispatchQueue(label: "com.athlt.camera.session",   qos: .userInteractive)
    private let inferenceQueue = DispatchQueue(label: "com.athlt.camera.inference", qos: .userInteractive)

    private var captureSession:  AVCaptureSession?
    private var videoOutput:     AVCaptureVideoDataOutput?
    private var movieOutput:     AVCaptureMovieFileOutput?
    private var captureDelegate: ATHLTCaptureDelegate?
    private var movieDelegate:   ATHLTMovieDelegate?

    // MARK: – Camera position
    private var currentPosition: AVCaptureDevice.Position = .back

    // MARK: – Mode
    private var currentMode: String = "idle"
    private var isTracking  = false

    // MARK: – Frame throttle (~10 fps from 30 fps input)
    private var frameCounter = 0
    private let frameSkip    = 3

    // MARK: – Analysis
    private let squatAnalyzer = SquatAnalyzer()
    private var personDetected = false

    // MARK: – Diagnostics
    private var diagnosticMode          = false
    private var totalFramesReceived: Int = 0
    private var totalFramesAnalyzed: Int = 0
    private var lastDebugStatsTime: Double = 0.0
    private let debugStatsThrottle: Double = 1.0

    // MARK: – Recording / stopTracking handshake
    private var pendingStopPromise: Promise?

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
                if let mov = self.movieOutput, mov.isRecording { mov.stopRecording() }

                self.videoOutput?.setSampleBufferDelegate(nil, queue: nil)
                self.captureSession?.stopRunning()
                self.captureSession  = nil
                self.videoOutput     = nil
                self.movieOutput     = nil
                self.captureDelegate = nil
                ATHLTSessionHolder.shared.set(nil)

                self.inferenceQueue.async {
                    self.isTracking  = false
                    self.currentMode = "idle"
                    if let p = self.pendingStopPromise {
                        let r = self.squatAnalyzer.reps; let gr = self.squatAnalyzer.goodReps
                        p.resolve(["reps": r, "goodReps": gr, "videoUri": NSNull()])
                        self.pendingStopPromise = nil
                    }
                    self.squatAnalyzer.reset()
                }
                NSLog("[GymCamera] session stopped")
                promise.resolve(["success": true])
            }
        }

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

                self.sessionQueue.async {
                    guard let movieOut = self.movieOutput,
                          let movieDel = self.movieDelegate else {
                        NSLog("[GymCamera] movie output not available — no recording")
                        return
                    }
                    if movieOut.isRecording { movieOut.stopRecording() }
                    let tmp = FileManager.default.temporaryDirectory
                        .appendingPathComponent("athlt_\(Int(Date().timeIntervalSince1970)).mov")
                    movieOut.startRecording(to: tmp, recordingDelegate: movieDel)
                    NSLog("[GymCamera] recording → %@", tmp.lastPathComponent)
                }
                promise.resolve()
            }
        }

        AsyncFunction("stopTracking") { (promise: Promise) in
            self.inferenceQueue.async {
                self.isTracking  = false
                self.currentMode = "idle"

                if let movieOut = self.movieOutput, movieOut.isRecording {
                    self.pendingStopPromise = promise
                    self.sessionQueue.async { movieOut.stopRecording() }
                } else {
                    let r = self.squatAnalyzer.reps; let gr = self.squatAnalyzer.goodReps
                    NSLog("[GymCamera] tracking stopped — %d good / %d reps (no recording)", gr, r)
                    promise.resolve(["reps": r, "goodReps": gr, "videoUri": NSNull()])
                }
            }
        }
    }

    // MARK: – Recording callback ───────────────────────────────────────────────

    func handleMovieFinished(url: URL, error: Error?) {
        inferenceQueue.async { [weak self] in
            guard let self else { return }
            let r = self.squatAnalyzer.reps; let gr = self.squatAnalyzer.goodReps
            var dict: [String: Any] = ["reps": r, "goodReps": gr]

            if let err = error as NSError?,
               !(err.domain == AVFoundationErrorDomain &&
                 err.code   == AVError.Code.operationInterrupted.rawValue) {
                NSLog("[GymCamera] recording error: %@", err.localizedDescription)
                dict["videoUri"] = NSNull()
            } else {
                NSLog("[GymCamera] recording saved: %@", url.lastPathComponent)
                dict["videoUri"] = url.absoluteString
            }

            NSLog("[GymCamera] tracking stopped — %d good / %d reps", gr, r)
            self.pendingStopPromise?.resolve(dict)
            self.pendingStopPromise = nil
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
                if granted {
                    self.sessionQueue.async { self.configureSession(position: self.currentPosition, promise: promise) }
                } else {
                    promise.resolve(["success": false, "error": "Camera permission denied"])
                }
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

        let dataOutput = AVCaptureVideoDataOutput()
        dataOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        dataOutput.alwaysDiscardsLateVideoFrames = true

        let dataDelegate = ATHLTCaptureDelegate()
        dataDelegate.module = self
        captureDelegate = dataDelegate
        dataOutput.setSampleBufferDelegate(dataDelegate, queue: sessionQueue)

        guard session.canAddOutput(dataOutput) else {
            promise.resolve(["success": false, "error": "Cannot add video output"])
            return
        }
        session.addOutput(dataOutput)

        let movieOut = AVCaptureMovieFileOutput()
        let movieDel = ATHLTMovieDelegate()
        movieDel.module = self
        if session.canAddOutput(movieOut) {
            session.addOutput(movieOut)
            NSLog("[GymCamera] movie recording output added")
        } else {
            NSLog("[GymCamera] WARNING: could not add movie output — recording disabled")
        }
        movieOutput   = movieOut
        movieDelegate = movieDel

        if let conn = dataOutput.connection(with: .video) {
            if conn.isVideoOrientationSupported { conn.videoOrientation = .portrait }
            if conn.isVideoMirroringSupported   { conn.isVideoMirrored  = (position == .front) }
        }

        session.commitConfiguration()
        captureSession = session
        videoOutput    = dataOutput
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
        NSLog("[GymCamera] camera → %@", posStr)
        promise.resolve(["position": posStr])
    }

    // MARK: – Frame handling ───────────────────────────────────────────────────

    func handleSampleBuffer(_ buffer: CMSampleBuffer) {
        totalFramesReceived += 1
        frameCounter += 1
        guard frameCounter % frameSkip == 0 else { return }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(buffer) else { return }

        let ts = CMSampleBufferGetPresentationTimeStamp(buffer)
        let timestamp: Double = ts.timescale > 0
            ? Double(ts.value) / Double(ts.timescale)
            : CACurrentMediaTime()

        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        let cap = pixelBuffer
        let t   = timestamp

        inferenceQueue.async { [weak self] in
            defer { CVPixelBufferUnlockBaseAddress(cap, .readOnly) }
            guard let self, self.isTracking else { return }
            self.runPoseDetection(pixelBuffer: cap, timestamp: t)
        }
    }

    // MARK: – Vision body-pose ─────────────────────────────────────────────────

    private func runPoseDetection(pixelBuffer: CVPixelBuffer, timestamp: Double) {
        totalFramesAnalyzed += 1

        if totalFramesAnalyzed <= 3 {
            let w = CVPixelBufferGetWidth(pixelBuffer); let h = CVPixelBufferGetHeight(pixelBuffer)
            NSLog("[GymCamera] pixel buffer %d×%d (%@)", w, h, h > w ? "portrait ✓" : "landscape — check orientation")
        }

        let request = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
        do { try handler.perform([request]) } catch {
            NSLog("[GymCamera] pose error: %@", error.localizedDescription); return
        }

        guard let results = request.results as? [VNHumanBodyPoseObservation], !results.isEmpty else {
            personDetected = false
            squatAnalyzer.notePersonMissing(timestamp: timestamp)
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
        NSLog("[GymCamera] REP %@ — %d good / %d total (depth %.0f° back %.0f°)",
              rep.good ? "GOOD ✓" : "BAD ✗", squatAnalyzer.goodReps, squatAnalyzer.reps,
              rep.depthAngle, rep.backAngle)
        sendEvent("onRepDetected", [
            "good":       rep.good,
            "reason":     rep.reason,
            "depthAngle": rep.depthAngle,
            "backAngle":  rep.backAngle,
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
            "backAngle":           squatAnalyzer.lastBackAngle,
            "ready":               squatAnalyzer.isReady,
            "phase":               squatAnalyzer.state,
            "reps":                squatAnalyzer.reps,
            "goodReps":            squatAnalyzer.goodReps,
            "totalFramesReceived": totalFramesReceived,
            "totalFramesAnalyzed": totalFramesAnalyzed,
        ])
    }
}
