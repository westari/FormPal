import Foundation
import MediaPipeTasksVision

// ─── Feature flag ─────────────────────────────────────────────────────────────
//
// Set ENABLE_BLAZEPOSE = false to fully skip BlazePose.
// Apple Vision remains the sole engine; nothing else changes.

let ENABLE_BLAZEPOSE = true

// ─── MediaPipe BlazePose landmark indices (33-point model) ────────────────────

private enum BPIdx {
    static let leftShoulder  = 11
    static let rightShoulder = 12
    static let leftElbow     = 13
    static let rightElbow    = 14
    static let leftWrist     = 15
    static let rightWrist    = 16
    static let leftHip       = 23
    static let rightHip      = 24
    static let leftKnee      = 25
    static let rightKnee     = 26
    static let leftAnkle     = 27
    static let rightAnkle    = 28
}

// ─── Result ──────────────────────────────────────────────────────────────────

struct BlazePoseResult {
    let primaryAngle3D: Double?   // joint angle from world landmarks (degrees); nil if unavailable
    let jointDebug:     String    // compact joint summary for onDebugLog
    let inferenceMs:    Double
}

// ─── Engine ──────────────────────────────────────────────────────────────────
//
// Wraps MediaPipe PoseLandmarker (image mode).
// Call setup() once (async — downloads the model on first launch).
// Then call detect(pixelBuffer:exerciseId:) per-frame on any queue.
// Returns nil until ready; Apple Vision is unaffected if it never becomes ready.

final class BlazePoseEngine {

    private var landmarker: PoseLandmarker?
    private(set) var isReady = false

    // Lite model (~5 MB) — adequate for debug comparison.
    private static let modelDownloadURL = URL(string:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/" +
        "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task")!

    private static var cachedModelPath: String? = nil

    // ── One-time setup ────────────────────────────────────────────────────────

    func setup() async {
        guard ENABLE_BLAZEPOSE else { return }
        guard let path = await BlazePoseEngine.ensureModel() else {
            NSLog("[BlazePose] model unavailable — disabled for this session")
            return
        }

        // Build options outside the do block — none of these assignments throw.
        // Fix: BaseOptions is an ObjC class; use default init() then set modelAssetPath.
        let base = BaseOptions()
        base.modelAssetPath = path

        let options = PoseLandmarkerOptions()
        options.baseOptions                = base
        options.runningMode                = .image
        options.numPoses                   = 1
        options.minPoseDetectionConfidence = 0.5
        options.minPosePresenceConfidence  = 0.5
        options.minTrackingConfidence      = 0.5

        // Only the throwing initializer lives in do/catch so the catch is reachable.
        do {
            landmarker = try PoseLandmarker(options: options)
            isReady    = true
            NSLog("[BlazePose] ready — %@", path)
        } catch {
            NSLog("[BlazePose] init error: %@", error.localizedDescription)
        }
    }

    // ── Per-frame detection ───────────────────────────────────────────────────
    //
    // pixelBuffer must be locked (readOnly) by the caller.
    // Returns nil if not ready or on inference error — never throws to caller.

    func detect(pixelBuffer: CVPixelBuffer, exerciseId: String) -> BlazePoseResult? {
        guard ENABLE_BLAZEPOSE, isReady, let lm = landmarker else { return nil }
        let t0 = CACurrentMediaTime()
        do {
            // Fix: MPImage(pixelBuffer:orientation:) — orientation is required, no default.
            let mpImage = try MPImage(pixelBuffer: pixelBuffer, orientation: .up)
            let result  = try lm.detect(image: mpImage)
            let elapsed = (CACurrentMediaTime() - t0) * 1000.0

            guard let worldLMs = result.poseWorldLandmarks.first,
                  worldLMs.count > BPIdx.rightAnkle else {
                return BlazePoseResult(primaryAngle3D: nil,
                                       jointDebug: "no pose", inferenceMs: elapsed)
            }
            let angle  = primaryAngle(worldLMs: worldLMs, exerciseId: exerciseId)
            let joints = jointDebugString(worldLMs: worldLMs, exerciseId: exerciseId)
            return BlazePoseResult(primaryAngle3D: angle, jointDebug: joints, inferenceMs: elapsed)
        } catch {
            NSLog("[BlazePose] detect: %@", error.localizedDescription)
            return nil
        }
    }

    // ── 3D angle from world landmarks ─────────────────────────────────────────

    private func primaryAngle(worldLMs: [Landmark], exerciseId: String) -> Double? {
        let triple: (Int, Int, Int)?
        switch exerciseId {
        case "curl", "shoulderPress":
            // Fix: Landmark.visibility is NSNumber? (ObjC bridge). Use .floatValue to get Float.
            let lv = worldLMs[BPIdx.leftElbow].visibility?.floatValue  ?? 0
            let rv = worldLMs[BPIdx.rightElbow].visibility?.floatValue ?? 0
            if lv >= rv {
                triple = (BPIdx.leftShoulder,  BPIdx.leftElbow,  BPIdx.leftWrist)
            } else {
                triple = (BPIdx.rightShoulder, BPIdx.rightElbow, BPIdx.rightWrist)
            }
        case "squat", "lunge":
            let lv = worldLMs[BPIdx.leftKnee].visibility?.floatValue  ?? 0
            let rv = worldLMs[BPIdx.rightKnee].visibility?.floatValue ?? 0
            if lv >= rv {
                triple = (BPIdx.leftHip,  BPIdx.leftKnee,  BPIdx.leftAnkle)
            } else {
                triple = (BPIdx.rightHip, BPIdx.rightKnee, BPIdx.rightAnkle)
            }
        default:
            return nil
        }
        guard let (a, pivot, c) = triple else { return nil }
        return angle3D(lms: worldLMs, a: a, pivot: pivot, c: c)
    }

    // Angle at `pivot` formed by joints `a`–`pivot`–`c` using 3D world coords.
    private func angle3D(lms: [Landmark], a: Int, pivot: Int, c: Int) -> Double? {
        guard lms.count > max(a, pivot, c) else { return nil }
        let pA = lms[a]; let pB = lms[pivot]; let pC = lms[c]
        let ax = Double(pA.x - pB.x), ay = Double(pA.y - pB.y), az = Double(pA.z - pB.z)
        let cx = Double(pC.x - pB.x), cy = Double(pC.y - pB.y), cz = Double(pC.z - pB.z)
        let lenA = (ax*ax + ay*ay + az*az).squareRoot()
        let lenC = (cx*cx + cy*cy + cz*cz).squareRoot()
        guard lenA > 1e-5, lenC > 1e-5 else { return nil }
        let dot = (ax*cx + ay*cy + az*cz) / (lenA * lenC)
        return acos(max(-1.0, min(1.0, dot))) * 180.0 / .pi
    }

    // Compact joint debug string: z-value and visibility for the joints that matter.
    private func jointDebugString(worldLMs: [Landmark], exerciseId: String) -> String {
        var indices: [(name: String, idx: Int)] = []
        switch exerciseId {
        case "curl":
            indices = [("lElb", BPIdx.leftElbow),  ("lWri", BPIdx.leftWrist),
                       ("rElb", BPIdx.rightElbow), ("rWri", BPIdx.rightWrist)]
        case "shoulderPress":
            indices = [("lElb", BPIdx.leftElbow), ("rElb", BPIdx.rightElbow),
                       ("lWri", BPIdx.leftWrist), ("rWri", BPIdx.rightWrist)]
        case "squat", "lunge":
            indices = [("lKne", BPIdx.leftKnee),  ("lAnk", BPIdx.leftAnkle),
                       ("rKne", BPIdx.rightKnee), ("rAnk", BPIdx.rightAnkle)]
        default:
            indices = [("lElb", BPIdx.leftElbow), ("lSho", BPIdx.leftShoulder)]
        }
        return indices.compactMap { (name, idx) -> String? in
            guard idx < worldLMs.count else { return nil }
            let lm  = worldLMs[idx]
            // Fix: visibility is NSNumber?, not Float? — extract floatValue for formatting.
            let vis = lm.visibility.map { String(format: "%.2f", $0.floatValue) } ?? "?"
            return "\(name)(z=\(String(format: "%+.2f", lm.z)) v=\(vis))"
        }.joined(separator: " ")
    }

    // ── Model download / local cache ──────────────────────────────────────────

    private static func ensureModel() async -> String? {
        if let cached = cachedModelPath { return cached }

        guard let docsDir = try? FileManager.default.url(
            for: .documentDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        ) else { return nil }

        let localURL = docsDir.appendingPathComponent("pose_landmarker_lite.task")

        if FileManager.default.fileExists(atPath: localURL.path) {
            NSLog("[BlazePose] model found in cache")
            cachedModelPath = localURL.path
            return localURL.path
        }

        NSLog("[BlazePose] downloading model — first reps will show BP-3D=not_ready")
        do {
            let (data, _) = try await URLSession.shared.data(from: modelDownloadURL)
            try data.write(to: localURL)
            NSLog("[BlazePose] model downloaded (%d KB)", data.count / 1024)
            cachedModelPath = localURL.path
            return localURL.path
        } catch {
            NSLog("[BlazePose] download failed: %@", error.localizedDescription)
            return nil
        }
    }
}
