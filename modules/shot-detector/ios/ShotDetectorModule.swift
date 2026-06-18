import ExpoModulesCore
import CoreML
import Vision

// MARK: - Errors

enum ShotDetectorError: Error, LocalizedError {
  case modelNotFound(String)
  case modelNotLoaded
  case compilationFailed(String)
  case inferenceFailed(String)

  var errorDescription: String? {
    switch self {
    case .modelNotFound(let name):
      return "CoreML model '\(name)' not found in app bundle. Run EAS build with the CoreML config plugin."
    case .modelNotLoaded:
      return "Model not loaded. Call loadModel() before running inference."
    case .compilationFailed(let detail):
      return "Model compilation failed: \(detail)"
    case .inferenceFailed(let detail):
      return "Inference failed: \(detail)"
    }
  }
}

// MARK: - Shared Inference Pipeline

public final class ShotDetectorPipeline {
  public static let shared = ShotDetectorPipeline()

  private var coreMLModel: VNCoreMLModel?
  private(set) var isLoaded = false
  private(set) var modelName = ""

  // Serial queue — VNCoreMLModel / VNRequest are NOT thread-safe.
  private let inferenceQueue = DispatchQueue(
    label: "com.athlt.shotdetector.inference",
    qos: .userInteractive
  )

  private init() {
    NSLog("[ShotDetector] pipeline singleton created")
  }

  // MARK: loadModel

  func loadModel(named resourceName: String = "best", extension ext: String = "mlpackage") throws -> String {
    NSLog("[ShotDetector] loadModel — searching for %@.mlmodelc", resourceName)

    guard let modelURL = Bundle.main.url(forResource: resourceName, withExtension: "mlmodelc")
                      ?? Bundle.main.url(forResource: resourceName, withExtension: ext) else {
      let bundleContents = (Bundle.main.urls(forResourcesWithExtension: "mlmodelc", subdirectory: nil) ?? [])
        .map { $0.lastPathComponent }.joined(separator: ", ")
      NSLog("[ShotDetector] ERROR: model not found. mlmodelc files in bundle: [%@]", bundleContents)
      throw ShotDetectorError.modelNotFound("\(resourceName).mlmodelc")
    }

    NSLog("[ShotDetector] model URL: %@", modelURL.path)

    let config = MLModelConfiguration()
    config.computeUnits = .all

    let mlModel: MLModel
    do {
      mlModel = try MLModel(contentsOf: modelURL, configuration: config)
      NSLog("[ShotDetector] MLModel loaded OK")
    } catch {
      NSLog("[ShotDetector] MLModel load FAILED: %@", error.localizedDescription)
      throw ShotDetectorError.compilationFailed(error.localizedDescription)
    }

    do {
      coreMLModel = try VNCoreMLModel(for: mlModel)
      NSLog("[ShotDetector] VNCoreMLModel wrapped OK")
    } catch {
      NSLog("[ShotDetector] VNCoreMLModel wrap FAILED: %@", error.localizedDescription)
      throw ShotDetectorError.compilationFailed(error.localizedDescription)
    }

    isLoaded = true
    modelName = "\(resourceName).\(ext)"
    NSLog("[ShotDetector] model ready — modelName: %@", modelName)
    return modelName
  }

  // MARK: runInference

  /// Run inference on a CVPixelBuffer.
  ///
  /// NEVER throws. Any error at any step returns an empty array and logs the
  /// failure. This guarantees the frame processor plugin never crashes the app.
  ///
  /// Orientation: .up — used for landscape-locked sessions where the camera
  /// buffer is already in the native landscape orientation.
  func runInference(on pixelBuffer: CVPixelBuffer, minConfidence: Float = 0.35) -> [[String: Any]] {
    guard isLoaded, coreMLModel != nil else {
      return []
    }

    var result: [[String: Any]] = []

    inferenceQueue.sync {
      // Additional guard inside the queue in case model was unloaded concurrently
      guard let model = coreMLModel else {
        NSLog("[ShotDetector] coreMLModel nil inside sync — skip")
        return
      }

      let fmt = CVPixelBufferGetPixelFormatType(pixelBuffer)
      let w   = CVPixelBufferGetWidth(pixelBuffer)
      let h   = CVPixelBufferGetHeight(pixelBuffer)
      NSLog("[ShotDetector] inference — format: %u, size: %dx%d", fmt, w, h)

      let request = VNCoreMLRequest(model: model)
      request.imageCropAndScaleOption = .scaleFit

      // Use .up for landscape mode (phone is held horizontally).
      // The camera buffer in landscape is already in the correct orientation.
      // Change to .right if the phone is held portrait during testing.
      let handler = VNImageRequestHandler(
        cvPixelBuffer: pixelBuffer,
        orientation: .up,
        options: [:]
      )

      do {
        try handler.perform([request])
      } catch {
        NSLog("[ShotDetector] handler.perform error: %@", error.localizedDescription)
        return
      }

      // ---- Detect output format ----
      //
      // YOLOv11/v8 models exported WITH --nms produce [VNRecognizedObjectObservation].
      // Models exported WITHOUT --nms produce [VNCoreMLFeatureValueObservation] (raw
      // tensors). We handle both cases below.

      guard let rawResults = request.results, !rawResults.isEmpty else {
        NSLog("[ShotDetector] perform returned nil or empty results")
        return
      }

      NSLog("[ShotDetector] result type: %@, count: %d",
            String(describing: type(of: rawResults[0])), rawResults.count)

      if let objectObs = rawResults as? [VNRecognizedObjectObservation] {
        // ---- Standard detection output ----
        result = objectObs.compactMap { obs -> [String: Any]? in
          guard let label = obs.labels.first, label.confidence >= minConfidence else {
            return nil
          }
          let bb = obs.boundingBox
          return [
            "className":  label.identifier,
            "confidence": Double(label.confidence),
            "bbox": [
              "x":      Double(bb.origin.x),
              "y":      Double(1.0 - bb.origin.y - bb.size.height),
              "width":  Double(bb.size.width),
              "height": Double(bb.size.height),
            ]
          ]
        }
        NSLog("[ShotDetector] parsed %d detections (conf >= %.2f)", result.count, minConfidence)

      } else if let featureObs = rawResults as? [VNCoreMLFeatureValueObservation] {
        // ---- Raw tensor output (model exported without NMS) ----
        //
        // The model needs to be re-exported with:
        //   yolo export model=best.pt format=coreml nms=True
        //
        // Returning empty detections for now — app stays running.
        NSLog("[ShotDetector] model outputs raw feature values (%d features) — NMS not baked in.",
              featureObs.count)
        NSLog("[ShotDetector] Re-export with: yolo export model=best.pt format=coreml nms=True")
        result = []

      } else {
        // ---- Unknown output type ----
        NSLog("[ShotDetector] unrecognized output type: %@",
              String(describing: type(of: rawResults[0])))
        result = []
      }
    }

    return result
  }
}

// MARK: - Expo Module

public class ShotDetectorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ShotDetector")

    AsyncFunction("loadModel") { () -> [String: Any] in
      do {
        let name = try ShotDetectorPipeline.shared.loadModel()
        return ["loaded": true, "modelName": name]
      } catch {
        NSLog("[ShotDetector] loadModel JS call failed: %@", error.localizedDescription)
        return ["loaded": false, "modelName": "", "error": error.localizedDescription]
      }
    }

    Function("isLoaded") { () -> Bool in
      return ShotDetectorPipeline.shared.isLoaded
    }

    Function("getModelName") { () -> String in
      return ShotDetectorPipeline.shared.modelName
    }
  }
}
