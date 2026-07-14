import ExpoModulesCore
import AVFoundation
import Vision
@preconcurrency import CoreMedia
@preconcurrency import CoreVideo
import UIKit
// ─── Notification ─────────────────────────────────────────────────────────────

extension Notification.Name {
    static let athltSessionChanged        = Notification.Name("com.athlt.camera.sessionChanged")
    static let athltPoseUpdated           = Notification.Name("com.athlt.camera.poseUpdated")
    static let athltPoseCleared           = Notification.Name("com.athlt.camera.poseCleared")
    static let athltSkeletonVisibilityChanged = Notification.Name("com.athlt.camera.skeletonVisibility")
}

// ─── Sendable wrapper for a locked CVPixelBuffer ──────────────────────────────
//
// CVPixelBuffer / CVImageBuffer is a C reference type with no Sendable conformance.
// @preconcurrency import CoreVideo cannot help because there is nothing to retroact.
// We wrap it manually and assert @unchecked Sendable — safe here because:
//   • CVPixelBufferLockBaseAddress is called BEFORE the wrapper is created.
//   • CVPixelBufferUnlockBaseAddress is called inside the async consumer via defer.
//   • The lock/unlock pair brackets the entire dispatch; no other thread touches the
//     buffer between those two calls.

private struct LockedPixelBuffer: @unchecked Sendable {
    let buffer: CVPixelBuffer
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

    // MARK: – Analysis (config-driven; swap definition via setExercise to change exercise)
    private var currentExercise = "squat"
    private var engine: ExerciseEngine = ExerciseEngine(definition: ExerciseRegistry.squat)
    private var personDetected  = false

    // MARK: – Latest debug values (cached for 1-second throttled emission)
    private var lastDebugAngle:    Double           = 180.0
    private var lastDebugFormVals: [String: Double] = [:]
    private var lastDebugReady:    Bool             = false
    private var lastOutOfPlaneCue: String?          = nil

    // MARK: – BlazePose (parallel 3D engine, guarded by ENABLE_BLAZEPOSE)
    private var blazePoseEngine      = BlazePoseEngine()
    private var lastBlazePoseResult: BlazePoseResult? = nil
    private var lastVisionMs:        Double            = 0

    // MARK: – Skeleton overlay
    private var isSkeletonVisible = true

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

        Events("onRepDetected", "onError", "onCameraState", "onDebugStats", "onSetupStatus", "onCalibrationStatus", "onDebugLog")

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
                self.movieDelegate   = nil
                ATHLTSessionHolder.shared.set(nil)

                // Drain inferenceQueue SYNCHRONOUSLY so the engine is fully reset
                // before the promise resolves. Prevents the second startSession()
                // from racing against leftover frame tasks or a stale engine state
                // (the async version let the promise resolve before engine.reset()
                // ran, so the next startSession's inferenceQueue.sync could block
                // waiting for those tasks — causing the observed freeze).
                self.inferenceQueue.sync {
                    self.isTracking            = false
                    self.currentMode           = "idle"
                    self.frameCounter          = 0
                    self.totalFramesReceived   = 0
                    self.totalFramesAnalyzed   = 0
                    self.personDetected        = false
                    self.lastDebugStatsTime    = 0.0
                    // If stopTracking() was never called (e.g. back button during
                    // tracking), resolve its dangling promise now so nothing leaks.
                    if let p = self.pendingStopPromise {
                        p.resolve(["reps":     self.engine.totalReps,
                                   "goodReps": self.engine.goodReps,
                                   "videoUri": NSNull()])
                        self.pendingStopPromise = nil
                    }
                    self.engine.reset()
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

        AsyncFunction("setSkeletonVisible") { (enabled: Bool, promise: Promise) in
            self.inferenceQueue.async {
                self.isSkeletonVisible = enabled
                DispatchQueue.main.async {
                    if !enabled {
                        NotificationCenter.default.post(name: .athltPoseCleared, object: nil)
                    }
                    NotificationCenter.default.post(
                        name: .athltSkeletonVisibilityChanged,
                        object: nil,
                        userInfo: ["visible": enabled]
                    )
                }
                promise.resolve()
            }
        }

        AsyncFunction("setExercise") { (exerciseType: String, promise: Promise) in
            self.inferenceQueue.async {
                guard let def = ExerciseRegistry.definition(for: exerciseType) else {
                    NSLog("[GymCamera] unknown exercise '%@' — ignoring", exerciseType)
                    promise.resolve()
                    return
                }
                self.currentExercise = exerciseType
                self.engine          = ExerciseEngine(definition: def)
                self.wireEngineCallbacks()
                NSLog("[GymCamera] exercise → %@ (%@)", exerciseType, def.displayName)
                promise.resolve()
            }
        }

        AsyncFunction("startTracking") { (promise: Promise) in
            self.inferenceQueue.async {
                // resetForTracking: resets rep counters but preserves isSetupComplete
                // so calibration is not re-run after the user already passed it.
                self.engine.resetForTracking()
                self.isTracking          = true
                self.currentMode         = "tracking"
                self.totalFramesAnalyzed = 0
                self.lastDebugStatsTime  = 0.0
                self.personDetected      = false
                NSLog("[GymCamera] tracking started (%@)", self.currentExercise)

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
                    NSLog("[GymCamera] tracking stopped — %d good / %d reps (no recording)",
                          self.engine.goodReps, self.engine.totalReps)
                    promise.resolve(["reps":     self.engine.totalReps,
                                     "goodReps": self.engine.goodReps,
                                     "videoUri": NSNull()])
                }
            }
        }
    }

    // MARK: – Engine callback wiring ──────────────────────────────────────────

    private func wireEngineCallbacks() {
        engine.onRepDetected = { [weak self] result in
            guard let self else { return }
            let secondaryAngle = result.formValues["back_lean"]
                              ?? result.formValues["full_extension"]
                              ?? 0.0
            NSLog("[GymCamera] REP %@ — %d good / %d total (peak %.0f° secondary %.0f°)",
                  result.good ? "GOOD ✓" : "BAD ✗",
                  result.goodReps, result.totalReps,
                  result.primaryAngle, secondaryAngle)
            self.sendEvent("onRepDetected", [
                "good":       result.good,
                "reason":     result.cue,
                "depthAngle": result.primaryAngle,
                "backAngle":  secondaryAngle,
                "reps":       result.totalReps,
                "goodReps":   result.goodReps,
                "timestamp":  Date().timeIntervalSince1970 * 1000.0,
            ])
            // Per-rep debug log — emitted as onDebugLog so JS/Metro can display it on Windows.
            let formEntries = result.formValues.sorted(by: { $0.key < $1.key })
                .map { "\($0.key)=\(String(format: "%.3f", $0.value))" }
                .joined(separator: "  ")
            let repLog =
                "[REP #\(result.totalReps)] \(result.good ? "GOOD ✓" : "BAD ✗")" +
                "  peak=\(String(format: "%.1f", result.primaryAngle))°\n" +
                "  \(formEntries.isEmpty ? "(no form checks)" : formEntries)\n" +
                "  \(result.planarityLog)\n" +
                "  cue=\(result.cue)"
            self.sendEvent("onDebugLog", ["message": repLog])

            // Three-way comparison: Apple Vision 2D | foreshortening gate | BlazePose 3D
            let av2D    = String(format: "%.1f", result.primaryAngle)
            let gated   = result.planarityPassed
                ? "boneGated=\(av2D)°"
                : "boneGated=n/a(foreshort)"
            let bpPart: String
            let bpTail: String
            if let bp = self.lastBlazePoseResult {
                let a3D  = bp.primaryAngle3D.map { String(format: "%.1f", $0) + "°" } ?? "n/a"
                bpPart   = "blazePose3D=\(a3D)"
                bpTail   = "| \(bp.jointDebug) | AV=\(String(format: "%.0f", self.lastVisionMs))ms BP=\(String(format: "%.0f", bp.inferenceMs))ms"
            } else {
                bpPart   = "blazePose3D=not_ready"
                bpTail   = "| AV=\(String(format: "%.0f", self.lastVisionMs))ms BP=—"
            }
            let compareLine = "[COMPARE] \(self.currentExercise) rep#\(result.totalReps)" +
                "  2D=\(av2D)°  \(gated)  \(bpPart)  \(bpTail)"
            self.sendEvent("onDebugLog", ["message": compareLine])
        }

        engine.onDebugStats = { [weak self] stats in
            guard let self else { return }
            self.lastDebugAngle    = stats.primaryAngle
            self.lastDebugFormVals = stats.formMetrics
            self.lastDebugReady    = stats.isReady
            self.lastOutOfPlaneCue = stats.outOfPlaneCue
        }

        engine.onSetupUpdate = { [weak self] status in
            guard let self else { return }
            self.sendEvent("onSetupStatus", [
                "allJointsVisible": status.allJointsVisible,
                "holdProgress":     status.holdProgress,
                "passed":           status.passed,
                "hint":             status.hint,
            ])
        }

        engine.onCalibrationUpdate = { [weak self] status in
            guard let self else { return }
            self.sendEvent("onCalibrationStatus", [
                "repsCompleted": status.repsCompleted,
                "repsNeeded":    status.repsNeeded,
                "passed":        status.passed,
            ])
            if status.passed, !self.engine.calibratedSegmentRefs.isEmpty {
                let segLog = self.engine.calibratedSegmentRefs.sorted { $0.key < $1.key }
                    .map { "\($0.key)=\(String(format: "%.3f", $0.value))" }
                    .joined(separator: "  ")
                self.sendEvent("onDebugLog", ["message": "[CALIB DONE] Planarity refs: \(segLog)"])
            }
        }
    }

    // MARK: – Recording callback ───────────────────────────────────────────────

    func handleMovieFinished(url: URL, error: Error?) {
        inferenceQueue.async { [weak self] in
            guard let self else { return }
            var dict: [String: Any] = [
                "reps":     self.engine.totalReps,
                "goodReps": self.engine.goodReps,
            ]
            if let err = error as NSError?,
               !(err.domain == AVFoundationErrorDomain &&
                 err.code   == AVError.Code.operationInterrupted.rawValue) {
                NSLog("[GymCamera] recording error: %@", err.localizedDescription)
                dict["videoUri"] = NSNull()
            } else {
                NSLog("[GymCamera] recording saved: %@", url.lastPathComponent)
                dict["videoUri"] = url.absoluteString
            }
            NSLog("[GymCamera] tracking stopped — %d good / %d reps",
                  self.engine.goodReps, self.engine.totalReps)
            self.pendingStopPromise?.resolve(dict)
            self.pendingStopPromise = nil
        }
    }

    // MARK: – startSession ─────────────────────────────────────────────────────

    private func doStartSession(promise: Promise) {
        // Guard: tear down any stale session before creating a new one.
        // Normally stopSession() handles this, but defensive in case of fast
        // re-navigation or an unexpected code path.
        if captureSession != nil {
            NSLog("[GymCamera] startSession: found active session — stopping first")
            videoOutput?.setSampleBufferDelegate(nil, queue: nil)
            captureSession?.stopRunning()
            captureSession  = nil
            videoOutput     = nil
            movieOutput     = nil
            captureDelegate = nil
            movieDelegate   = nil
            ATHLTSessionHolder.shared.set(nil)
            inferenceQueue.sync { self.engine.reset() }
        }

        inferenceQueue.sync { wireEngineCallbacks() }
        Task { [weak self] in await self?.blazePoseEngine.setup() }

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
    //
    // Guard is `captureSession != nil` (not `isTracking`) so that pose detection
    // runs during the SETUP phase — before the user presses Start. The engine
    // handles SETUP vs ACTIVE internally; both paths go through engine.ingest().

    func handleSampleBuffer(_ buffer: CMSampleBuffer) {
        totalFramesReceived += 1
        frameCounter += 1
        guard frameCounter % frameSkip == 0 else { return }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(buffer) else { return }

        let ts = CMSampleBufferGetPresentationTimeStamp(buffer)
        let t: Double = ts.timescale > 0
            ? Double(ts.value) / Double(ts.timescale)
            : CACurrentMediaTime()

        // Lock before handing off to inferenceQueue; unlock inside the async block.
        // LockedPixelBuffer: @unchecked Sendable wraps the non-Sendable CVPixelBuffer —
        // safe because the lock/unlock pair brackets the entire dispatch lifetime.
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        let locked = LockedPixelBuffer(buffer: pixelBuffer)

        inferenceQueue.async { [weak self] in
            defer { CVPixelBufferUnlockBaseAddress(locked.buffer, .readOnly) }
            guard let self, self.captureSession != nil else { return }
            self.runPoseDetection(pixelBuffer: locked.buffer, timestamp: t)
        }
    }

    // MARK: – Vision body-pose ─────────────────────────────────────────────────
    //
    // Both monitoring and tracking modes call engine.ingest().
    // The engine internally handles SETUP vs ACTIVE:
    //   - SETUP (isSetupComplete = false): runs calibration check, emits onSetupStatus
    //   - ACTIVE (isSetupComplete = true): runs rep counting, emits onRepDetected

    private func runPoseDetection(pixelBuffer: CVPixelBuffer, timestamp: Double) {
        totalFramesAnalyzed += 1

        if totalFramesAnalyzed <= 3 {
            let w = CVPixelBufferGetWidth(pixelBuffer); let h = CVPixelBufferGetHeight(pixelBuffer)
            NSLog("[GymCamera] pixel buffer %d×%d (%@)", w, h, h > w ? "portrait ✓" : "landscape — check orientation")
        }

        let request = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
        let avT0 = CACurrentMediaTime()
        do { try handler.perform([request]) } catch {
            NSLog("[GymCamera] pose error: %@", error.localizedDescription); return
        }
        lastVisionMs = (CACurrentMediaTime() - avT0) * 1000.0

        if ENABLE_BLAZEPOSE {
            lastBlazePoseResult = blazePoseEngine.detect(pixelBuffer: pixelBuffer,
                                                         exerciseId: currentExercise)
        }

        let date = Date(timeIntervalSince1970: timestamp > 0 ? timestamp : CACurrentMediaTime())

        guard let results = request.results as? [VNHumanBodyPoseObservation], !results.isEmpty else {
            personDetected = false
            engine.notePersonMissing(timestamp: date)
            maybeEmitDebugStats()
            if isSkeletonVisible {
                ATHLTPoseBuffer.shared.clear()
                DispatchQueue.main.async {
                    NotificationCenter.default.post(name: .athltPoseCleared, object: nil)
                }
            }
            return
        }

        personDetected = true
        let obs  = results.max(by: { $0.confidence < $1.confidence }) ?? results[0]
        let pose = extractPose(obs)

        engine.ingest(pose: pose, timestamp: date)
        maybeEmitDebugStats()

        if isSkeletonVisible {
            ATHLTPoseBuffer.shared.post(PoseFrame(
                pose:        pose,
                videoWidth:  CGFloat(CVPixelBufferGetWidth(pixelBuffer)),
                videoHeight: CGFloat(CVPixelBufferGetHeight(pixelBuffer)),
                isMirrored:  currentPosition == .front
            ))
        }
    }

    // ─── Convert Vision observation to Pose dictionary ────────────────────────

    private func extractPose(_ obs: VNHumanBodyPoseObservation) -> Pose {
        var pose = Pose()
        for joint in Joint.allCases {
            guard let p = try? obs.recognizedPoint(joint.visionName), p.confidence > 0 else { continue }
            pose[joint] = PosePoint(x: p.location.x, y: p.location.y, confidence: p.confidence)
        }
        return pose
    }

    // MARK: – Debug stats (throttled to ~1 fps) ───────────────────────────────

    private func maybeEmitDebugStats() {
        let now = Date().timeIntervalSinceReferenceDate
        guard now - lastDebugStatsTime >= debugStatsThrottle else { return }
        lastDebugStatsTime = now

        sendEvent("onDebugStats", [
            "personDetected":      personDetected,
            "kneeAngle":           lastDebugAngle,
            "backAngle":           lastDebugFormVals["back_lean"] ?? 0.0,
            "outOfPlaneCue":       lastOutOfPlaneCue ?? "",
            "ready":               lastDebugReady,
            "phase":               lastDebugReady ? "active" : "waiting",
            "reps":                engine.totalReps,
            "goodReps":            engine.goodReps,
            "totalFramesReceived": totalFramesReceived,
            "totalFramesAnalyzed": totalFramesAnalyzed,
        ])
    }
}
