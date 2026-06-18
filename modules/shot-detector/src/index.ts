import { requireOptionalNativeModule } from 'expo-modules-core';
import type { ModelLoadResult, Detection, FrameProcessorResult, FrameProcessorArgs } from './ShotDetector.types';

// ---- Native Module (loadModel) ----

const ShotDetectorNative = requireOptionalNativeModule<{
  loadModel(): Promise<ModelLoadResult>;
}>('ShotDetector');

/**
 * Load the CoreML model into memory. Call once before starting a CV session.
 * Returns { loaded: false, error: '...' } gracefully when native module is absent
 * (Expo Go, web, simulator without the dev client build).
 */
export async function loadModel(): Promise<ModelLoadResult> {
  if (!ShotDetectorNative) {
    return {
      loaded: false,
      modelName: 'stub',
      error: 'Native module not compiled in. Use EAS dev client build.',
    };
  }
  try {
    return await ShotDetectorNative.loadModel();
  } catch (e: any) {
    return { loaded: false, modelName: 'unknown', error: e?.message ?? String(e) };
  }
}

// ---- Frame Processor Plugin (detectShots) ----
//
// VisionCamera 4.x: VisionCameraProxy.initFrameProcessorPlugin returns a
// FrameProcessorPlugin object. Call it via plugin.call(frame, options).
// Must be initialized outside the worklet (module scope), then captured.

let _plugin: any = null;

try {
  const VC = require('react-native-vision-camera');
  if (VC?.VisionCameraProxy?.initFrameProcessorPlugin) {
    _plugin = VC.VisionCameraProxy.initFrameProcessorPlugin('detectShots', {});
  }
} catch {
  // VisionCamera not installed — fine, guarded below
}

/**
 * VisionCamera 4.x frame processor plugin.
 *
 * Call inside useFrameProcessor:
 *   const frameProcessor = useFrameProcessor((frame) => {
 *     'worklet';
 *     const result = detectShots(frame, { minConfidence: 0.35 });
 *     onResult(result.detections, result.timestampMs);
 *   }, []);
 */
export function detectShots(frame: any, args?: FrameProcessorArgs): FrameProcessorResult {
  'worklet';
  if (_plugin == null) {
    return { detections: [], timestampMs: 0, frameWidth: 0, frameHeight: 0 };
  }
  return _plugin.call(frame, args ?? {}) as FrameProcessorResult;
}

export type { ModelLoadResult, Detection, FrameProcessorResult, FrameProcessorArgs };
export type { DetectionClassName, BBox, InferenceResult } from './ShotDetector.types';
