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
// 3-phase state machine (TOP → INTERMEDIATE → BOTTOM → count on ascent).
//
// Tuning changes from on-device testing:
//
// FIX 1 — RELIABLE COUNTING (err toward counting, not dropping)
//   • readyStandingDuration: 1.0 s (was 1.5 s) — gate opens sooner
//   • maxHipYVariance: 0.002 (was 0.0006) — standing still no longer blocked
//     by normal micro-movement
//   • topExitThreshold: 160° (was 165°) — no hysteresis gap; returning to
//     standing reliably completes the rep
//   • minRepInterval: 0.5 s (was 0.8 s) — allows normal-paced squats
//
// FIX 2 — ONLY RELIABLE FORM CUES
//   • DISABLED "KEEP HEELS DOWN" — ankle keypoints too low-confidence
//   • DISABLED "WEIGHT ON HEELS" — knee-over-toes fires on good-form squats
//   • KEPT "GO DEEPER" (knee never reached bottomThreshold)
//   • KEPT "CHEST UP" with conservative backLeanThreshold: 60° (was 50°)
//     so normal forward lean in a squat is NOT flagged; only extreme cases.
//
// Camera angle check (Fix 4) kept as a passive warning; never blocks counting.
//
// NOTE: All thresholds are heuristic starting points — tune via NSLog output.

final class SquatAnalyzer {

    // MARK: – Tuning constants

    static let jointConfidenceMin: Float      = 0.30
    /// Knee angle (°) above which standing is confirmed (ready gate + ankle baseline).
    static let topThreshold: Double           = 160.0
    /// Knee angle (°) above which a rep completes. Same as topThreshold — no hysteresis.
    static let topExitThreshold: Double       = 160.0  // loosened from 165
    /// Knee angle (°) below which descent (INTERMEDIATE entry) is registered.
    static let intermediateEntryAngle: Double = 150.0
    /// Knee angle (°) below which good depth is reached.
    static let bottomThreshold: Double        = 100.0
    /// Seconds absent mid-cycle before cycle + ready-gate are reset.
    static let inactivityTimeout: Double      = 2.5
    /// Continuous seconds of hip-stable standing required before counting starts.
    static let readyStandingDuration: Double  = 1.0    // loosened from 1.5
    /// Torso-vertical angle (°) flagged as excessive lean. Conservative — only catches
    /// clearly bad form, not the natural lean every squat has.
    static let backLeanThreshold: Double      = 60.0   // loosened from 50
    /// Minimum seconds between counted reps. Allows normal-paced squats.
    static let minRepInterval: Double         = 0.5    // loosened from 0.8
    /// Max hip-Y variance (Vision units) while accumulating stable-standing time.
    /// Walking produces far higher variance.
    static let maxHipYVariance: Double        = 0.002  // loosened from 0.0006
    /// Number of recent hip-Y samples used (~1 s at 10 fps).
    static let hipYBufferSize: Int            = 10
    /// Nose-shoulder-midpoint X offset below which a bad camera angle is warned.
    static let minSideViewOffset: Double      = 0.04

    // MARK: – Public read-only state

    private(set) var reps:          Int    = 0
    private(set) var goodReps:      Int    = 0
    private(set) var lastKneeAngle: Double = 180.0
    private(set) var lastBackAngle: Double = 0.0
    private(set) var isReady:       Bool   = false
    private(set) var cameraAngleOk: Bool   = true
    private(set) var state:         String = "Get into frame"

    struct RepResult {
        let good:       Bool
        let reason:     String   // "nice" | "GO DEEPER" | "CHEST UP"
        let depthAngle: Double   // min knee angle reached (°)
        let backAngle:  Double   // max torso-vertical angle (°)
    }

    // MARK: – Private phase machine

    private enum Phase { case top, intermediate, bottom }
    private var phase: Phase = .top

    private var enteredIntermediate: Bool   = false
    private var reachedBottom:       Bool   = false
    private var minAngleThisRep:     Double = 180.0
    private var maxBackAngleThisRep: Double = 0.0

    private var lastPoseTimestamp:   Double  = 0.0
    private var lastRepTimestamp:    Double  = 0.0
    private var stableStandingStart: Double? = nil

    // Rolling hip-Y samples for walking-detection during ready gate
    private var hipYBuffer: [Double] = []

    // MARK: – Session control

    func reset() {
        reps                = 0
        goodReps            = 0
        lastKneeAngle       = 180.0
        lastBackAngle       = 0.0
        isReady             = false
        cameraAngleOk       = true
        stableStandingStart = nil
        state               = "Get into frame"
        phase               = .top
        lastPoseTimestamp   = 0.0
        lastRepTimestamp    = 0.0
        hipYBuffer.removeAll()
        resetCycle()
    }

    func notePersonMissing(timestamp: Double) {
        state           = "no person / legs not fully visible"
        cameraAngleOk   = true
        stableStandingStart = nil
        hipYBuffer.removeAll()

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

    // MARK: – Ingestion

    func ingest(pose: VNHumanBodyPoseObservation, timestamp: Double) -> RepResult? {
        lastPoseTimestamp = timestamp

        // ── Knee angle ────────────────────────────────────────────────────────
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
            if enteredIntermediate && ba > maxBackAngleThisRep { maxBackAngleThisRep = ba }
        }

        // ── Camera angle (passive warning, never blocks counting) ─────────────
        cameraAngleOk = isSideView(pose: pose)

        // ── Hip Y buffer — detect walking vs standing still ───────────────────
        if let lh = point(pose, .leftHip), let rh = point(pose, .rightHip) {
            let midHipY = (Double(lh.y) + Double(rh.y)) / 2.0
            hipYBuffer.append(midHipY)
            if hipYBuffer.count > Self.hipYBufferSize { hipYBuffer.removeFirst() }
        }
        var hipStable = false
        if hipYBuffer.count >= 5 {
            let mean = hipYBuffer.reduce(0, +) / Double(hipYBuffer.count)
            let variance = hipYBuffer.map { ($0 - mean) * ($0 - mean) }.reduce(0, +)
                           / Double(hipYBuffer.count)
            hipStable = variance < Self.maxHipYVariance
        }

        // ── Ready gate ────────────────────────────────────────────────────────
        if !isReady {
            if kneeAngle >= Self.topThreshold && hipStable {
                if stableStandingStart == nil { stableStandingStart = timestamp }
                let elapsed = timestamp - (stableStandingStart ?? timestamp)
                state = String(format: "Hold still… (%.1f s)", elapsed)
                if elapsed >= Self.readyStandingDuration {
                    isReady = true
                    stableStandingStart = nil
                    NSLog("[SquatAnalyzer] → READY after %.1fs stable standing (knee %.0f°)",
                          elapsed, kneeAngle)
                }
            } else {
                stableStandingStart = nil
                state = kneeAngle < Self.topThreshold
                    ? String(format: "Stand tall (knee %.0f°)", kneeAngle)
                    : "Hold still — don't move"
            }
            return nil
        }

        // ── Min knee angle ────────────────────────────────────────────────────
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
            } else if kneeAngle >= Self.topExitThreshold {
                return evaluateAndReset()
            }

        case .bottom:
            state = String(format: "BOTTOM (knee %.0f°)", kneeAngle)
            if kneeAngle > Self.bottomThreshold { phase = .intermediate }
            if kneeAngle >= Self.topExitThreshold {
                return evaluateAndReset()
            }
        }

        return nil
    }

    // MARK: – Evaluate rep & reset cycle

    private func evaluateAndReset() -> RepResult? {
        defer { resetCycle(); phase = .top }

        guard enteredIntermediate else {
            NSLog("[SquatAnalyzer] REJECT — noise, never entered INTERMEDIATE (min=%.0f°)",
                  minAngleThisRep)
            return nil
        }

        // Debounce
        let timeSinceLast = lastRepTimestamp > 0
            ? lastPoseTimestamp - lastRepTimestamp
            : Double.infinity
        if timeSinceLast < Self.minRepInterval {
            NSLog("[SquatAnalyzer] DEBOUNCE — %.2fs since last rep, skipping", timeSinceLast)
            return nil
        }
        lastRepTimestamp = lastPoseTimestamp

        reps += 1

        // Only two reliable cues: depth and lean
        let badDepth = !reachedBottom
        let badLean  = maxBackAngleThisRep > Self.backLeanThreshold

        let good:   Bool
        let reason: String
        if badDepth {
            good = false; reason = "GO DEEPER"
        } else if badLean {
            good = false; reason = "CHEST UP"
        } else {
            good = true;  reason = "nice"
        }
        if good { goodReps += 1 }

        NSLog("[SquatAnalyzer] REP %-5@ depth=%.0f°(bot:%@) back=%.0f°(lean:%@) → \"%@\" (%d good/%d total)",
              good ? "GOOD" : "BAD",
              minAngleThisRep,    reachedBottom              ? "Y" : "N",
              maxBackAngleThisRep, badLean                   ? "Y" : "N",
              reason, goodReps, reps)

        return RepResult(good: good, reason: reason,
                         depthAngle: minAngleThisRep, backAngle: maxBackAngleThisRep)
    }

    private func resetCycle() {
        enteredIntermediate = false
        reachedBottom       = false
        minAngleThisRep     = 180.0
        maxBackAngleThisRep = 0.0
    }

    // MARK: – Camera angle check (passive warning only)

    private func isSideView(pose: VNHumanBodyPoseObservation) -> Bool {
        guard let nose = point(pose, .nose),
              let ls   = point(pose, .leftShoulder),
              let rs   = point(pose, .rightShoulder) else { return true }
        let midX = (Double(ls.x) + Double(rs.x)) / 2.0
        return abs(Double(nose.x) - midX) >= Self.minSideViewOffset
    }

    // MARK: – Geometry helpers

    private func torsoAngle(pose: VNHumanBodyPoseObservation) -> Double? {
        var angles: [Double] = []
        if let s = point(pose, .leftShoulder),  let h = point(pose, .leftHip)  { angles.append(verticalAngle(from: h, to: s)) }
        if let s = point(pose, .rightShoulder), let h = point(pose, .rightHip) { angles.append(verticalAngle(from: h, to: s)) }
        guard !angles.isEmpty else { return nil }
        return angles.reduce(0, +) / Double(angles.count)
    }

    private func verticalAngle(from bottom: CGPoint, to top: CGPoint) -> Double {
        let dx = abs(Double(top.x - bottom.x))
        let dy = Double(top.y - bottom.y)
        return atan2(dx, max(dy, 0.001)) * 180.0 / .pi
    }

    private func point(_ pose: VNHumanBodyPoseObservation,
                       _ joint: VNHumanBodyPoseObservation.JointName) -> CGPoint? {
        guard let p = try? pose.recognizedPoint(joint),
              p.confidence >= Self.jointConfidenceMin else { return nil }
        return p.location
    }

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
            "cameraAngleOk":       squatAnalyzer.cameraAngleOk,
            "phase":               squatAnalyzer.state,
            "reps":                squatAnalyzer.reps,
            "goodReps":            squatAnalyzer.goodReps,
            "totalFramesReceived": totalFramesReceived,
            "totalFramesAnalyzed": totalFramesAnalyzed,
        ])
    }
}
