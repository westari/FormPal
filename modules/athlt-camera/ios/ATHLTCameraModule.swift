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

    // Set only while doAnalyzeVideoFile's loop is running (nil during a live
    // session) — the video file's own internal presentation timestamp for
    // the frame currently being processed. onRepDetected reads this so a
    // rep's reported time is the VIDEO's clock, not wall-clock time on the
    // JS side (see onRepDetected below for why those two diverge).
    private var currentVideoTimeSec: Double? = nil

    // MARK: – Latest debug values (cached for 1-second throttled emission)
    private var lastDebugAngle:    Double           = 180.0
    private var lastDebugFormVals: [String: Double] = [:]
    private var lastDebugReady:    Bool             = false
    private var lastOutOfPlaneCue: String?          = nil

    // MARK: – BlazePose (parallel 3D engine, guarded by ENABLE_BLAZEPOSE)
    private var blazePoseEngine      = BlazePoseEngine()
    private var lastBlazePoseResult: BlazePoseResult? = nil
    private var lastVisionMs:        Double            = 0

    // MARK: – Universal quality engine (isolated add-on — no exercise defs needed)
    private var universalEngine = UniversalQualityEngine()
    private var currentDef: ExerciseDefinition = ExerciseRegistry.squat

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
                    self.universalEngine.reset()
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
                self.currentDef = def
                self.universalEngine.reset()
                let relevantJoints = Array(Set(def.repMetric.referencedJoints()))
                self.universalEngine.setRelevantJoints(relevantJoints)
                NSLog("[GymCamera] exercise → %@ (%@)", exerciseType, def.displayName)
                promise.resolve()
            }
        }

        // Receives the exercise standard as a JSON string from JS.
        // Passing a string (not a dict) avoids Expo Modules NSNumber/Bool bridging edge
        // cases — JSONSerialization gives clean Swift types for all fields.
        // Called by the JS setExercise wrapper immediately after setExercise().
        AsyncFunction("setExerciseStandard") { (standardJson: String?, promise: Promise) in
            self.inferenceQueue.async {
                guard let jsonStr = standardJson,
                      let data    = jsonStr.data(using: .utf8),
                      let raw     = try? JSONSerialization.jsonObject(with: data),
                      let dict    = raw as? [String: Any] else {
                    // nil JSON = exercise has no standard — Layer 2 inactive.
                    self.universalEngine.setStandard(nil)
                    promise.resolve()
                    return
                }

                func fail(_ reason: String) {
                    self.sendEvent("onDebugLog", ["message":
                        "[STD-LOAD] ERROR: \(reason) — engine running WITHOUT standard"])
                    self.universalEngine.setStandard(nil)
                }

                guard let exerciseId    = dict["exerciseId"]            as? String,
                      let peakAngleMax  = dict["standardPeakAngleMax"]  as? Double,
                      let startAngleMin = dict["standardStartAngleMin"] as? Double,
                      let romCue        = dict["romCue"]                as? String,
                      let extendCue     = dict["extendCue"]             as? String,
                      let reviewed      = dict["reviewed"]              as? Bool else {
                    fail("missing required fields (exerciseId / standardPeakAngleMax / standardStartAngleMin / romCue / extendCue / reviewed)")
                    promise.resolve()
                    return
                }

                var checks: [JointAngleCheck] = []
                if let rawChecks = dict["staticChecks"] as? [[String: Any]] {
                    for (idx, rawCheck) in rawChecks.enumerated() {
                        guard let description = rawCheck["description"] as? String,
                              let aStr        = rawCheck["a"]           as? String,
                              let bStr        = rawCheck["b"]           as? String,
                              let cStr        = rawCheck["c"]           as? String,
                              let maxRange    = rawCheck["maxRangeDeg"] as? Double,
                              let cue         = rawCheck["cue"]         as? String else {
                            self.sendEvent("onDebugLog", ["message":
                                "[STD-LOAD] ERROR: staticChecks[\(idx)] missing field — check skipped"])
                            continue
                        }
                        guard let a = Joint(string: aStr),
                              let b = Joint(string: bStr),
                              let c = Joint(string: cStr) else {
                            self.sendEvent("onDebugLog", ["message":
                                "[STD-LOAD] ERROR: staticChecks[\(idx)] unknown joint (a='\(aStr)' b='\(bStr)' c='\(cStr)') — check skipped"])
                            continue
                        }
                        checks.append(JointAngleCheck(description: description,
                                                      a: a, b: b, c: c,
                                                      maxRangeDeg: maxRange, cue: cue))
                    }
                }

                let tempoMin  = dict["tempoMinSec"]  as? Double ?? 1.5
                let tempoMax  = dict["tempoMaxSec"]  as? Double ?? 5.0
                let topFaults = dict["topFaults"]    as? [String] ?? []
                let jerkSpikeMultiple = dict["jerkSpikeMultiple"] as? Double ?? 2.0

                let standard = ExerciseStandard(
                    exerciseId:            exerciseId,
                    reviewed:              reviewed,
                    standardPeakAngleMax:  peakAngleMax,
                    standardStartAngleMin: startAngleMin,
                    romCue:                romCue,
                    extendCue:             extendCue,
                    staticChecks:          checks,
                    tempoMinSec:           tempoMin,
                    tempoMaxSec:           tempoMax,
                    topFaults:             topFaults,
                    jerkSpikeMultiple:     jerkSpikeMultiple
                )

                self.sendEvent("onDebugLog", ["message":
                    "[STD-LOAD] received standard for '\(exerciseId)': " +
                    "peak=\(String(format: "%.1f", peakAngleMax)) " +
                    "start=\(String(format: "%.1f", startAngleMin)) " +
                    "minRange=\(String(format: "%.1f", startAngleMin - peakAngleMax)) " +
                    "staticChecks=\(checks.count) reviewed=\(reviewed)"])

                self.universalEngine.setStandard(standard)
                promise.resolve()
            }
        }

        // Receives the full exercise definition as a JSON string from JS.
        // Replaces the Swift-registry definition that setExercise() loaded, so JS
        // owns the exercise config. Falls back silently if the JSON is nil or fails
        // to parse — the Swift registry definition from setExercise() remains active.
        // Must be called on the same inferenceQueue as setExercise(); the serial
        // queue guarantees execution order even when both calls are fire-and-forget.
        AsyncFunction("setExerciseDefinition") { (defJson: String?, promise: Promise) in
            self.inferenceQueue.async {
                guard let jsonStr = defJson,
                      let data    = jsonStr.data(using: .utf8),
                      let raw     = try? JSONSerialization.jsonObject(with: data),
                      let dict    = raw as? [String: Any] else {
                    // nil = exercise not yet in JS definitions; Swift registry stays active.
                    promise.resolve()
                    return
                }

                guard let (def, summary) = ExerciseDefinition.parse(from: dict) else {
                    let exerciseId = dict["id"] as? String ?? "?"
                    self.sendEvent("onDebugLog", ["message":
                        "[DEF-LOAD] ERROR: failed to parse '\(exerciseId)' definition — falling back to Swift registry"])
                    promise.resolve()
                    return
                }

                self.engine = ExerciseEngine(definition: def)
                self.wireEngineCallbacks()
                self.currentDef = def
                // ROOT CAUSE of "[COMPARE] lines all say squat" on lat pulldown:
                // currentExercise was only ever set by setExercise() (the native-
                // registry path) — any exercise loaded via THIS function (the
                // JSON path, used for anything not in ExerciseRegistry.swift,
                // e.g. lat pulldown) never updated it, so it stayed at whatever
                // the last native-registry exercise was (or its "squat" default).
                // Purely a stale LABEL bug — engine/repMetric above already use
                // the correct JSON-loaded def regardless — but it also fed a
                // wrong exerciseId into blazePoseEngine's parallel comparison
                // pass, so fixing it here too.
                self.currentExercise = def.id
                let relevantJoints = Array(Set(def.repMetric.referencedJoints()))
                self.universalEngine.setRelevantJoints(relevantJoints)

                self.sendEvent("onDebugLog", ["message":
                    "[DEF-LOAD] loaded '\(def.id)' from JSON: \(summary) source=JSON"])
                promise.resolve()
            }
        }

        AsyncFunction("startTracking") { (promise: Promise) in
            self.inferenceQueue.async {
                // resetForTracking: resets rep counters but preserves isSetupComplete
                // so calibration is not re-run after the user already passed it.
                self.engine.resetForTracking()
                self.universalEngine.reset()
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

        // MARK: – analyzeVideoFile (Phase 2: JS-definition-driven) ───────────────
        //
        // Runs an already-recorded video through the EXACT SAME
        // runPoseDetection → engine.ingest path live camera frames use — see
        // doAnalyzeVideoFile below for the full reasoning (pacing, orientation,
        // why no engine changes were needed). PHASE 2: `definitionJson`, when
        // provided, is parsed with the EXACT SAME ExerciseDefinition.parse(from:)
        // the live setExerciseDefinition path already uses — any exercise in
        // constants/exerciseDefinitions.ts works here now, with its real tuned
        // JS thresholds, not just the 6 hardcoded in ExerciseRegistry. Passing
        // nil falls back to ExerciseRegistry (matching Phase 1 behavior) for
        // exercises not yet in the JS catalog. This also closes the native-drift
        // hole: video analysis now reads the SAME source of truth as live
        // camera, so a JS threshold fix reaches both paths on the next reload,
        // not just live.
        // orientationOverride — dev-only escape hatch for testing which
        // CGImagePropertyOrientation actually matches live capture for a
        // given exercise's camera setup, WITHOUT a native rebuild per guess.
        // nil (the normal/default case) uses doAnalyzeVideoFile's own
        // forced-.right default. Pass "up"/"down"/"left"/"right" from JS
        // (see analyze-video.tsx's dev orientation picker) to try the other
        // 3 cases — this native plumbing is the one-time rebuild; every
        // orientation guess after that is JS-only/reload-only.
        AsyncFunction("analyzeVideoFile") { (uri: String, exerciseId: String, definitionJson: String?, orientationOverride: String?, promise: Promise) in
            self.inferenceQueue.async {
                guard self.captureSession == nil else {
                    promise.resolve(["success": false,
                        "error": "A live camera session is active — stop it before analyzing a video file (both paths share the same engine/inferenceQueue)."])
                    return
                }

                var def: ExerciseDefinition? = nil
                var defSource = "registry"
                if let jsonStr = definitionJson,
                   let data    = jsonStr.data(using: .utf8),
                   let raw     = try? JSONSerialization.jsonObject(with: data),
                   let dict    = raw as? [String: Any] {
                    if let (parsed, summary) = ExerciseDefinition.parse(from: dict) {
                        def = parsed
                        defSource = "JSON"
                        self.sendEvent("onDebugLog", ["message": "[DEF-LOAD] video analysis loaded '\(parsed.id)' from JSON: \(summary)"])
                    } else {
                        self.sendEvent("onDebugLog", ["message":
                            "[DEF-LOAD] ERROR: failed to parse '\(exerciseId)' definition for video analysis — falling back to Swift registry"])
                    }
                }
                if def == nil { def = ExerciseRegistry.definition(for: exerciseId) }

                guard let resolvedDef = def else {
                    promise.resolve(["success": false,
                        "error": "Unknown exercise '\(exerciseId)' — not in constants/exerciseDefinitions.ts (no definitionJson provided/parseable) and not in the Swift registry."])
                    return
                }
                self.currentExercise = resolvedDef.id
                self.engine          = ExerciseEngine(definition: resolvedDef)
                self.wireEngineCallbacks()
                self.currentDef      = resolvedDef
                self.universalEngine.reset()
                let relevantJoints = Array(Set(resolvedDef.repMetric.referencedJoints()))
                self.universalEngine.setRelevantJoints(relevantJoints)
                self.universalEngine.log = { [weak self] msg in
                    self?.sendEvent("onDebugLog", ["message": msg])
                }
                NSLog("[GymCamera] analyzeVideoFile: '%@' resolved from %@ (%@)",
                      resolvedDef.id, defSource, resolvedDef.displayName)
                self.doAnalyzeVideoFile(uri: uri, orientationOverride: orientationOverride, promise: promise)
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
                // Only non-nil during video-file analysis (see
                // currentVideoTimeSec's own comment) — the video's own
                // internal clock for this rep, not wall-clock time. JS uses
                // this instead of approximating with Date.now() deltas,
                // which drift from the video's actual timeline by however
                // long native setup (asset/reader open, first-frame decode)
                // took before the analysis loop started.
                "videoTimeSec": (self.currentVideoTimeSec as Any?) ?? NSNull(),
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

        // Universal quality engine — called from INSIDE ExerciseEngine.completeRep(),
        // before the good/bad verdict is finalized (see checkSwingOverride's doc
        // comment on ExerciseEngine). This is now the ONLY call site for
        // universalEngine.onRepCompleted — it used to also be called a second
        // time here in onRepDetected, AFTER the verdict was already sent to JS,
        // which is exactly why the swinging signal it computes could never
        // affect what the user saw. One call site now, with its return value
        // wired to actually change the verdict when it fires.
        engine.checkSwingOverride = { [weak self] peakValue, repNumber, repEndTime in
            guard let self else { return nil }
            return self.universalEngine.onRepCompleted(
                repNumber:  repNumber,
                peakValue:  peakValue,
                repEndTime: repEndTime
            )
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

        engine.onDebugLog = { [weak self] msg in
            self?.sendEvent("onDebugLog", ["message": msg])
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
            inferenceQueue.sync { self.engine.reset(); self.universalEngine.reset() }
        }

        inferenceQueue.sync {
            wireEngineCallbacks()
            self.universalEngine.log = { [weak self] msg in
                self?.sendEvent("onDebugLog", ["message": msg])
            }
        }
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
        // ROOT CAUSE of Phase 1's "reps=0, orientation defaulted to .up"
        // report: this exact same orientation/mirroring setup was only ever
        // applied to dataOutput's connection (the live-frame path) — the
        // MOVIE output's own connection was never configured at all, left at
        // whatever AVFoundation's unconfigured default is. That's why a
        // recorded file's preferredTransform didn't match any of
        // doAnalyzeVideoFile's three explicit orientation cases and fell
        // through to the default (.up, rawValue 1 — see that function's own
        // comment on why the ORIGINAL debug log's "0=up 1=down..." legend
        // was simply wrong, not just the orientation itself): the live path
        // and the recording path were never actually symmetric. Matching
        // the recording connection to the live one now so every future
        // recording's on-disk transform means the same thing this app's own
        // playback/re-analysis code already assumes.
        if let movieConn = movieOut.connection(with: .video) {
            if movieConn.isVideoOrientationSupported { movieConn.videoOrientation = .portrait }
            if movieConn.isVideoMirroringSupported   { movieConn.isVideoMirrored  = (position == .front) }
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
        // Same fix as configureSession — keep the recording connection's
        // orientation/mirroring symmetric with the live one after a flip too.
        if let movieConn = movieOutput?.connection(with: .video) {
            if movieConn.isVideoOrientationSupported { movieConn.videoOrientation = .portrait }
            if movieConn.isVideoMirroringSupported   { movieConn.isVideoMirrored  = (newPos == .front) }
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

    // `orientation` defaults to .up so the live call site (which relies on the
    // capture connection's videoOrientation=.portrait already pre-rotating the
    // buffer — see configureSession) is completely unchanged. Video-file
    // analysis is the only caller that ever passes something else — see
    // doAnalyzeVideoFile below for why a file needs this explicitly computed
    // instead of assumed.
    //
    // `onPoseDetected` — nil for the live call site (zero behavior change),
    // set only by doAnalyzeVideoFile so it can log raw joint positions/
    // confidence without duplicating any detection logic to get at them.
    // Called with personFound=false (pose=nil) on a no-detection frame too,
    // so a video-file run can tell "Vision found nobody at all" apart from
    // "found somebody, but the joints don't look like a real pose" (e.g. a
    // rotated frame reading as thin/malformed) — exactly the ask: "see if
    // the pose is being detected but rotated vs. not detected at all."
    private func runPoseDetection(pixelBuffer: CVPixelBuffer, timestamp: Double,
                                   orientation: CGImagePropertyOrientation = .up,
                                   onPoseDetected: ((Pose?) -> Void)? = nil) {
        totalFramesAnalyzed += 1

        if totalFramesAnalyzed <= 3 {
            let w = CVPixelBufferGetWidth(pixelBuffer); let h = CVPixelBufferGetHeight(pixelBuffer)
            // NOTE for video-file analysis: this check is meaningless there —
            // it looks at the RAW pixel buffer's storage dimensions, which for
            // a portrait-recorded file are typically landscape BY DESIGN
            // (rotation lives in the track's preferredTransform, applied via
            // the `orientation` param above, not by changing the buffer's
            // actual storage layout). Seeing "landscape — check orientation"
            // during a video-file run is expected, not a signal something's
            // wrong — doAnalyzeVideoFile logs the resolved orientation
            // separately, that's the value to actually check.
            NSLog("[GymCamera] pixel buffer %d×%d (%@)", w, h, h > w ? "portrait ✓" : "landscape — check orientation")
        }

        let request = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
        let avT0 = CACurrentMediaTime()
        do { try handler.perform([request]) } catch {
            NSLog("[GymCamera] pose error: %@", error.localizedDescription); return
        }
        lastVisionMs = (CACurrentMediaTime() - avT0) * 1000.0

        if ENABLE_BLAZEPOSE {
            lastBlazePoseResult = blazePoseEngine.detect(pixelBuffer: pixelBuffer,
                                                         exerciseId: currentExercise)
        }

        // Was Date(timeIntervalSince1970: timestamp>0 ? timestamp : CACurrentMediaTime()) —
        // mixed timebases with no shared epoch, AND a per-frame discontinuity: `timestamp`
        // is the video's own presentation time for video-file analysis (starts at 0.0) or
        // camera uptime for live capture, but presentation time == 0.0 on a video's very
        // first frame makes `timestamp > 0` FALSE, so THAT ONE frame fell through to
        // CACurrentMediaTime() (device uptime, ~10^5-10^6 seconds) while every later frame
        // used the small `timestamp` value directly. If SETUP's hold timer captured its
        // `start` on that first frame (see runSetupCheck's setupPhaseState = .holding),
        // every later frame's `elapsed = timestamp.timeIntervalSince(start)` computed a
        // huge NEGATIVE duration and the 2-second hold could never complete — SETUP stuck
        // forever, exactly matching a video with confident tracking but zero settle/rep
        // activity. Real wall-clock Date() has no epoch mismatch and, for video-file
        // analysis specifically, still advances in step with real elapsed time because
        // doAnalyzeVideoFile's own pacing loop (see its PACING comment) sleeps to keep
        // wall-clock elapsed in sync with the video's presentation-time elapsed — same
        // reasoning already applied to universalEngine.ingestFrame below, now applied to
        // engine.ingest()/notePersonMissing() too.
        let date = Date()

        guard let results = request.results as? [VNHumanBodyPoseObservation], !results.isEmpty else {
            personDetected = false
            engine.notePersonMissing(timestamp: date)
            maybeEmitDebugStats()
            onPoseDetected?(nil)
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
        onPoseDetected?(pose)

        engine.ingest(pose: pose, timestamp: date)
        if let univMetric = currentDef.repMetric.measure(pose: pose) {
            // Must pass Date() (wallclock), NOT `date` (camera CMTime timebase).
            // `date` = Date(timeIntervalSince1970: cameraUptime) ≈ Jan 1970.
            // onRepCompleted filters with Date() ≈ 2026 — mismatched epochs = 0 frames.
            universalEngine.ingestFrame(metricValue: univMetric, pose: pose, timestamp: Date())
        }
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

    // MARK: – Video-file analysis (Phase 1) ────────────────────────────────────
    //
    // Reads an already-recorded video via AVAssetReader and feeds it through
    // the EXACT SAME runPoseDetection → engine.ingest path live camera frames
    // use (called above from handleSampleBuffer's inferenceQueue.async block;
    // called here from the analyzeVideoFile AsyncFunction, already on
    // inferenceQueue by the time this runs). Same VNDetectHumanBodyPoseRequest,
    // same ExerciseEngine, same wireEngineCallbacks() event wiring — a file and
    // a live frame look identical to everything downstream of this function.
    //
    // ENGINE STATE — investigated, not assumed: ExerciseEngine's SETUP phase
    // (see the class's own header comment) only requires required-joints
    // visibility held for ~2 seconds, and calibration (where configured) now
    // rides along on real counted reps rather than consuming a block of
    // uncounted ones first — so a fresh engine fed a normal recording reaches
    // ACTIVE and starts counting within the first couple of video-seconds on
    // its own, no special-casing needed. The one honest caveat: if the
    // person's first real rep happens inside that opening ~2s SETUP window,
    // it won't count — the same way it wouldn't during a live session's own
    // setup phase. Not a bug in this function, just worth knowing before
    // comparing rep counts on a very tightly-trimmed clip.
    //
    // PACING — the real reason this exists as a loop with Thread.sleep rather
    // than draining copyNextSampleBuffer() as fast as possible: UniversalQualityEngine
    // buffers frames by real Date() and filters its swing-detection window by
    // real elapsed seconds (see ingestFrame/onRepCompleted in
    // UniversalQualityEngine.swift) — a documented, already-once-buggy
    // real-wall-clock dependency (see runPoseDetection's own comment on the
    // `date` vs Date() split above). Reading frames as fast as the disk allows
    // would compress an 8-second rep into a fraction of a real second,
    // collapsing that window and silently breaking swing detection again, for
    // a different reason than the epoch-mismatch bug already fixed once.
    // Sleeping to keep wall-clock elapsed in step with the video's own
    // presentation-time elapsed keeps every real-time assumption downstream
    // intact, at the cost of a file taking roughly its own real length to
    // analyze — still far faster than physically performing the exercise.
    private func doAnalyzeVideoFile(uri: String, orientationOverride: String? = nil, promise: Promise) {
        let url: URL
        if let parsed = URL(string: uri), parsed.scheme != nil {
            url = parsed
        } else {
            url = URL(fileURLWithPath: uri)
        }

        let asset = AVURLAsset(url: url)
        guard let track = asset.tracks(withMediaType: .video).first else {
            promise.resolve(["success": false, "error": "No video track found at \(url.lastPathComponent)"])
            return
        }

        // ORIENTATION — AVAssetReader delivers RAW sensor-storage pixel data;
        // unlike live capture (whose connection-level videoOrientation=
        // .portrait makes AVCaptureVideoDataOutput deliver already-rotated
        // buffers — see configureSession), a file's rotation lives separately
        // in the track's preferredTransform, which AVAssetReader does NOT
        // apply on its own. Decomposed below into the matching
        // CGImagePropertyOrientation so Vision reads each frame the right way
        // up — the same correction the capture connection does implicitly
        // for the live path.
        //
        // FIRST BUG FOUND HERE (not the mapping itself): the debug log used
        // to print "orientation=\(orientation.rawValue) (0=up 1=down 2=left
        // 3=right)" — a fabricated legend that was never checked against the
        // real enum. CGImagePropertyOrientation's actual raw values (ImageIO)
        // are up=1, upMirrored=2, down=3, downMirrored=4, leftMirrored=5,
        // right=6, rightMirrored=7, left=8 — nothing like a 0-3 sequence. A
        // logged "orientation=1" therefore meant .up (the switch below's
        // DEFAULT fallback case), not "down" as previously annotated — i.e.
        // the transform never matched any of the three explicit cases at
        // all, not "matched the wrong one." Logging the orientation's real
        // NAME plus the raw transform components below so this can't be
        // misread again.
        let transform        = track.preferredTransform
        let fileOrientation  = Self.orientation(from: transform)
        // LIVE-VS-VIDEO MISMATCH FIX (root cause traced this round, not
        // guessed): live capture NEVER uses the file's/track's real
        // orientation at all — configureSession hardcodes
        // dataOutput's connection to videoOrientation=.portrait
        // UNCONDITIONALLY, regardless of how the phone is actually being
        // held. For a landscape-propped pushup setup (this file's exercise
        // definitions are explicitly built around "the phone is rotated 90°
        // on its side" — see PUSHUP's repMetric comment), that hardcoded
        // forcing takes the sensor's native landscape buffer and rotates it
        // 90° into a portrait-shaped buffer BEFORE Vision ever sees it —
        // i.e. Vision always sees the same fixed rotation, never the true
        // physical orientation.
        // A video recorded by THIS app's own in-app camera already matches
        // that assumption (the movieConn.videoOrientation=.portrait fix a
        // few lines up in configureSession keeps recordings self-consistent
        // with live). But this app's video-upload flow
        // (analyze-video.tsx → ImagePicker.launchImageLibraryAsync) pulls
        // from the Photos library — almost certainly recorded by the stock
        // Camera app, which writes a preferredTransform reflecting the
        // phone's TRUE physical orientation, not live's hardcoded one. For
        // the identical physical landscape pushup setup, decomposing that
        // real transform (→ .up/.down, "already landscape, no rotation
        // needed") and handing Vision the RAW landscape buffer as-is is a
        // full 90° off from what live hands Vision for the same footage —
        // same downstream engine, differently-rotated input.
        // FIX: stop trusting the file's own transform to pick Vision's
        // orientation. Use the SAME orientation forcing live effectively
        // applies instead — CGImagePropertyOrientation.right (90° CW),
        // which is exactly what a rear-camera recording forced into
        // .portrait decomposes to (see the .right case's own comment below,
        // and the movieConn fix above that relies on this same mapping).
        // .right is a first attempt, not device-confirmed — orientationOverride
        // (from analyzeVideoFile's JS caller) lets the other 3 cases be tried
        // from a JS-only control (see analyze-video.tsx), no rebuild needed
        // once THIS plumbing has shipped once.
        // An explicit orientationOverride from JS forces that rotation and
        // SKIPS the probe (for A/B testing a specific case). With no override —
        // the normal path — probeOrientation() runs Vision under all four
        // rotations on a sample of frames and picks the one that actually
        // yields an upright, high-confidence body. That replaces the old
        // hardcoded ".right guess + rebuild per attempt" loop entirely.
        let orientation: CGImagePropertyOrientation
        let overrideNote: String
        switch orientationOverride {
        case "up":    orientation = .up;    overrideNote = "explicit override='up' — probe skipped"
        case "down":  orientation = .down;  overrideNote = "explicit override='down' — probe skipped"
        case "left":  orientation = .left;  overrideNote = "explicit override='left' — probe skipped"
        case "right": orientation = .right; overrideNote = "explicit override='right' — probe skipped"
        default:
            if let probed = probeOrientation(asset: asset, track: track) {
                orientation  = probed
                overrideNote = "auto-selected by [ORIENT-TEST] probe"
            } else {
                orientation  = .right
                overrideNote = "probe inconclusive — using static default .right"
            }
        }
        sendEvent("onDebugLog", ["message":
            "[VIDEO-ANALYZE] preferredTransform a=\(transform.a) b=\(transform.b) " +
            "c=\(transform.c) d=\(transform.d) tx=\(transform.tx) ty=\(transform.ty) " +
            "→ file's own orientation=.\(Self.orientationName(fileOrientation)) (rawValue=\(fileOrientation.rawValue)), " +
            "FORCED to .\(Self.orientationName(orientation)) (\(overrideNote))"])

        guard let reader = try? AVAssetReader(asset: asset) else {
            promise.resolve(["success": false, "error": "Could not create AVAssetReader for \(url.lastPathComponent)"])
            return
        }
        let outputSettings: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        ]
        let trackOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        trackOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(trackOutput) else {
            promise.resolve(["success": false, "error": "Could not add track output"])
            return
        }
        reader.add(trackOutput)
        guard reader.startReading() else {
            promise.resolve(["success": false,
                "error": "AVAssetReader failed to start: \(reader.error?.localizedDescription ?? "unknown")"])
            return
        }

        sendEvent("onDebugLog", ["message":
            "[VIDEO-ANALYZE] starting '\(url.lastPathComponent)' as '\(currentExercise)'"])

        var frameCount        = 0
        var firstVideoTime: Double?
        let wallClockStart = CACurrentMediaTime()
        // Throttled joint dump — every ~15th analyzed frame (roughly once a
        // second at this app's ~10fps analysis rate, see frameSkip), not
        // every frame, so the log stays readable over a multi-second clip.
        // This is what actually answers "detected but rotated vs. not
        // detected at all": nose/shoulder/hip/ankle y-order for an upright
        // person should read nose < shoulder < hip < ankle (Vision's y
        // increases downward in image space); a 90°-rotated frame instead
        // clusters them at similar y with spread-out x, or Vision simply
        // finds nobody.
        var poseLogCounter = 0

        while reader.status == .reading {
            guard let sampleBuffer = trackOutput.copyNextSampleBuffer() else { break }
            guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { continue }

            let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            let videoTime: Double = pts.timescale > 0 ? Double(pts.value) / Double(pts.timescale) : 0
            if firstVideoTime == nil { firstVideoTime = videoTime }
            let videoElapsed = videoTime - (firstVideoTime ?? 0)
            // Relative to the first frame (i.e. starts at 0), matching how
            // the JS side's player.currentTime reads during playback.
            currentVideoTimeSec = videoElapsed

            // Real-time pacing — see the block comment above. Sleeps only when
            // reading has gotten AHEAD of real elapsed time; never sleeps
            // negative, so a slow device that's already behind just proceeds
            // at its own best pace instead of trying to catch up abruptly.
            let wallElapsed = CACurrentMediaTime() - wallClockStart
            let toSleep = videoElapsed - wallElapsed
            if toSleep > 0 { Thread.sleep(forTimeInterval: toSleep) }

            frameCount += 1
            poseLogCounter += 1
            let shouldLogPose = poseLogCounter % 15 == 0
            CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
            runPoseDetection(pixelBuffer: pixelBuffer, timestamp: videoTime, orientation: orientation,
                onPoseDetected: { [weak self] pose in
                    guard shouldLogPose, let self else { return }
                    guard let pose else {
                        self.sendEvent("onDebugLog", ["message":
                            "[VIDEO-POSE] frame \(frameCount) t=\(String(format: "%.2f", videoTime))s — no person detected"])
                        return
                    }
                    let jointStr = Joint.allCases.compactMap { j -> String? in
                        guard let p = pose[j] else { return nil }
                        return "\(j)=(\(String(format: "%.2f", p.x)),\(String(format: "%.2f", p.y)),c=\(String(format: "%.2f", p.confidence)))"
                    }.joined(separator: " ")
                    self.sendEvent("onDebugLog", ["message":
                        "[VIDEO-POSE] frame \(frameCount) t=\(String(format: "%.2f", videoTime))s — \(jointStr)"])
                })
            CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
        }

        let finalStatus = reader.status
        let success     = finalStatus == .completed
        sendEvent("onDebugLog", ["message":
            "[VIDEO-ANALYZE] done — \(frameCount) frames processed, reader.status=\(finalStatus.rawValue) " +
            "(1=reading 2=completed 3=failed 4=cancelled), reps=\(engine.totalReps) good=\(engine.goodReps)"])
        // Back to nil so a live session started afterward doesn't inherit a
        // stale video timestamp.
        currentVideoTimeSec = nil

        promise.resolve([
            "success":  success,
            "frames":   frameCount,
            "reps":     engine.totalReps,
            "goodReps": engine.goodReps,
            "error":    success ? NSNull() : (reader.error?.localizedDescription ?? "reader ended with status \(finalStatus.rawValue)") as Any,
        ])
    }

    // ─── Orientation probe — stops the guessing ───────────────────────────────
    //
    // The video path is byte-for-byte the same as live downstream of
    // runPoseDetection (same VNDetectHumanBodyPoseRequest, same ExerciseEngine,
    // same JS definition + calibration). Its ONE real difference is which
    // CGImagePropertyOrientation Vision reads each frame at: live's capture
    // connection pre-rotates every buffer to .portrait, a file read via
    // AVAssetReader is handed raw sensor-storage pixels and the rotation lives
    // only in preferredTransform, which stock-Camera clips don't decompose
    // cleanly. Pick that wrong and Vision sees a sideways body — every rep
    // then misses the thresholds.
    //
    // Rather than hardcode a guess and rebuild per attempt, this samples up to
    // maxSamples frames spread across the clip and runs pose detection on each
    // under ALL FOUR rotations, scoring:
    //   • poses   — frames where Vision returned any body observation
    //   • conf    — mean confidence of the best observation per frame
    //   • upright — frames whose nose/shoulder/hip/ankle fall in a strictly
    //               monotonic vertical order (either sign — we don't assume
    //               Vision's y direction). A rotated body scrambles this even
    //               when a weak observation still comes back, so it's the
    //               decisive score; conf then poses break ties.
    // Emits one [ORIENT-TEST] line and returns the winner, or nil if none
    // clears a floor (caller then falls back to the static default, and says
    // so in the log).
    private func probeOrientation(asset: AVURLAsset, track: AVAssetTrack,
                                  maxSamples: Int = 30, sampleEveryNth: Int = 6)
        -> CGImagePropertyOrientation? {

        let candidates: [CGImagePropertyOrientation] = [.up, .right, .down, .left]
        var poseCount    = [Int](repeating: 0, count: candidates.count)
        var confSum      = [Double](repeating: 0, count: candidates.count)
        var uprightCount = [Int](repeating: 0, count: candidates.count)

        guard let reader = try? AVAssetReader(asset: asset) else { return nil }
        let outputSettings: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        ]
        let out = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        out.alwaysCopiesSampleData = false
        guard reader.canAdd(out) else { return nil }
        reader.add(out)
        guard reader.startReading() else { return nil }

        var frameIdx = 0
        var sampled  = 0
        while reader.status == .reading, sampled < maxSamples {
            guard let sb = out.copyNextSampleBuffer() else { break }
            let thisIdx = frameIdx
            frameIdx += 1
            guard thisIdx % sampleEveryNth == 0 else { continue }
            guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
            sampled += 1
            CVPixelBufferLockBaseAddress(pb, .readOnly)
            for (i, o) in candidates.enumerated() {
                let request = VNDetectHumanBodyPoseRequest()
                let handler = VNImageRequestHandler(cvPixelBuffer: pb, orientation: o, options: [:])
                guard (try? handler.perform([request])) != nil,
                      let results = request.results as? [VNHumanBodyPoseObservation],
                      let obs = results.max(by: { $0.confidence < $1.confidence })
                else { continue }
                poseCount[i] += 1
                confSum[i]   += Double(obs.confidence)
                if isUprightPose(extractPose(obs)) { uprightCount[i] += 1 }
            }
            CVPixelBufferUnlockBaseAddress(pb, .readOnly)
        }
        reader.cancelReading()

        func avgConf(_ i: Int) -> Double { poseCount[i] > 0 ? confSum[i] / Double(poseCount[i]) : 0 }

        let table = candidates.enumerated().map { i, o in
            ".\(Self.orientationName(o)): \(poseCount[i])/\(sampled) poses, avg conf " +
            "\(String(format: "%.2f", avgConf(i))), upright \(uprightCount[i])/\(max(poseCount[i], 1))"
        }.joined(separator: " | ")
        sendEvent("onDebugLog", ["message": "[ORIENT-TEST] probed \(sampled) frames | \(table)"])

        guard sampled > 0 else { return nil }

        // Winner: most upright frames, then highest mean confidence, then most poses.
        var best = 0
        for i in 1..<candidates.count {
            if uprightCount[i] != uprightCount[best] {
                if uprightCount[i] > uprightCount[best] { best = i }
            } else if avgConf(i) != avgConf(best) {
                if avgConf(i) > avgConf(best) { best = i }
            } else if poseCount[i] > poseCount[best] {
                best = i
            }
        }

        // Require the winner to actually look like a real upright body on at
        // least a third of sampled frames — otherwise the clip itself is the
        // problem (nobody in frame, extreme angle), not the orientation.
        guard uprightCount[best] * 3 >= sampled else {
            sendEvent("onDebugLog", ["message":
                "[ORIENT-TEST] inconclusive — best .\(Self.orientationName(candidates[best])) had only " +
                "\(uprightCount[best])/\(sampled) upright frames; falling back to the static default"])
            return nil
        }
        sendEvent("onDebugLog", ["message":
            "[ORIENT-TEST] winner = .\(Self.orientationName(candidates[best]))"])
        return candidates[best]
    }

    // Strictly monotonic vertical order of nose → shoulder → hip → ankle, in
    // EITHER direction (we don't assume Vision's y sign). Uses whichever side's
    // joint is present. True for an upright body, false for a sideways/rotated
    // one — see probeOrientation.
    private func isUprightPose(_ pose: Pose) -> Bool {
        func firstY(_ a: Joint, _ b: Joint) -> Double? {
            if let p = pose[a] { return Double(p.y) }
            if let p = pose[b] { return Double(p.y) }
            return nil
        }
        guard let nose = pose[.nose].map({ Double($0.y) }),
              let sh   = firstY(.leftShoulder, .rightShoulder),
              let hip  = firstY(.leftHip, .rightHip),
              let ank  = firstY(.leftAnkle, .rightAnkle)
        else { return false }
        let seq  = [nose, sh, hip, ank]
        let inc  = zip(seq, seq.dropFirst()).allSatisfy { $0 < $1 }
        let dec  = zip(seq, seq.dropFirst()).allSatisfy { $0 > $1 }
        return inc || dec
    }

    // Standard AVAssetTrack.preferredTransform → CGImagePropertyOrientation
    // decomposition (the four values a phone-recorded video's transform
    // actually takes — arbitrary/skewed transforms aren't handled, matching
    // the well-known limitation of this exact technique everywhere it's
    // used). Not device-verified yet — the FIRST real test is what confirms
    // this mapping is right for this app's own recordings; if pose detection
    // comes back empty/garbage on a file that tracked fine live, check this
    // mapping first, before suspecting anything else.
    private static func orientation(from transform: CGAffineTransform) -> CGImagePropertyOrientation {
        switch (transform.a, transform.b, transform.c, transform.d) {
        case (0, 1, -1, 0):  return .right  // 90° CW  — typical portrait recording
        case (0, -1, 1, 0):  return .left   // 90° CCW — portrait, opposite winding
        case (-1, 0, 0, -1): return .down   // 180°    — upside-down landscape
        default:             return .up     // identity — landscape, right-side up
        }
    }

    // Human-readable name for logging — see doAnalyzeVideoFile's comment on
    // why printing the raw enum value alone (or worse, a hand-written and
    // WRONG numeric legend) is exactly how this got misdiagnosed once already.
    private static func orientationName(_ o: CGImagePropertyOrientation) -> String {
        switch o {
        case .up:            return "up"
        case .upMirrored:    return "upMirrored"
        case .down:          return "down"
        case .downMirrored:  return "downMirrored"
        case .leftMirrored:  return "leftMirrored"
        case .right:         return "right"
        case .rightMirrored: return "rightMirrored"
        case .left:          return "left"
        @unknown default:    return "unknown(\(o.rawValue))"
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
            // Gentle "losing track of you" coaching that keeps running (looser)
            // DURING reps — see ExerciseEngine.activeTrackingCue.
            "trackingCue":         engine.activeTrackingCue ?? "",
            "ready":               lastDebugReady,
            "phase":               lastDebugReady ? "active" : "waiting",
            "reps":                engine.totalReps,
            "goodReps":            engine.goodReps,
            "totalFramesReceived": totalFramesReceived,
            "totalFramesAnalyzed": totalFramesAnalyzed,
        ])
    }
}
