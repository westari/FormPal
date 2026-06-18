/**
 * Types shared between the native module, frame processor plugin, and JS algorithm layer.
 * These mirror the CoreML VNRecognizedObjectObservation output format.
 */

/** Class IDs returned by the trained YOLOv11n model. */
export type DetectionClassName =
  | 'ball'
  | 'ball_in_basket'
  | 'player'
  | 'basket'
  | 'player_shooting'
  | 'unknown';

/** Bounding box in normalized coordinates (0..1), origin top-left. */
export interface BBox {
  /** Left edge, 0..1 */
  x: number;
  /** Top edge, 0..1 */
  y: number;
  /** Width, 0..1 */
  width: number;
  /** Height, 0..1 */
  height: number;
}

/** A single object detection returned by the native inference module. */
export interface Detection {
  /** Class name string from the model labels */
  className: DetectionClassName;
  /** Detection confidence, 0..1 */
  confidence: number;
  /** Bounding box in normalized frame coordinates */
  bbox: BBox;
}

/** Return shape from the native runInferenceBytesSync method. */
export type InferenceResult = Detection[];

/** Arguments passed to the detectShots frame processor plugin. */
export interface FrameProcessorArgs {
  /** Confidence threshold — detections below this are dropped. Default 0.35 */
  minConfidence?: number;
}

/** Result from the detectShots frame processor, returned to JS worklet. */
export interface FrameProcessorResult {
  detections: Detection[];
  /** Timestamp from CMSampleBuffer, in milliseconds */
  timestampMs: number;
  /** Frame dimensions */
  frameWidth: number;
  frameHeight: number;
}

/** Summary of model load state, returned by loadModel(). */
export interface ModelLoadResult {
  loaded: boolean;
  modelName: string;
  error?: string;
}
