// ShotDetectorFrameProcessor — DEPRECATED AND REMOVED
//
// VisionCamera frame processors crashed on Expo SDK 54 + New Architecture.
// Even a no-op worklet crashed at the worklet runtime initialization level.
//
// Replaced by: modules/athlt-camera/
//   ATHLTCameraModule owns the camera via AVCaptureSession directly and runs
//   CoreML inference on a serial DispatchQueue. No worklets, no JSI bridging.
//
// See: cv/CRASH-RESOLUTION.md and cv/NATIVE-CAMERA-ARCHITECTURE.md
