/**
 * athlt-camera — JS bridge for the ATHLTCamera native module.
 *
 * Drives Vision body-pose exercise detection with a two-phase design:
 *   SETUP phase: one-time joint-visibility calibration (~2s hold).
 *   ACTIVE phase: pure rep counting with zero framing interference.
 */

import { requireNativeModule, EventEmitter, requireNativeViewManager } from 'expo-modules-core';
import React from 'react';
import type { ViewStyle } from 'react-native';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Emitted once per completed rep. */
export interface RepEvent {
  good: boolean;        // true = clean rep; false = form issue detected
  reason: string;       // 2-3 word cue: "GOOD" | "GO DEEPER" | "CHEST UP" | ...
  depthAngle: number;   // squat: min knee angle (deg) | curl: min elbow angle (deg)
  backAngle:  number;   // squat: max torso-vertical angle (deg) | curl: extension angle at top (deg)
  reps: number;         // total reps this session
  goodReps: number;     // good reps this session
  timestamp: number;    // ms
}

/** Emitted ~once per second while tracking. */
export interface DebugStatsEvent {
  personDetected: boolean;
  kneeAngle: number;           // latest primary angle (deg)
  backAngle: number;           // latest torso-vertical angle (deg)
  ready: boolean;              // true once person held start position for ~1s
  phase: string;               // human-readable analyzer state
  reps: number;
  goodReps: number;
  totalFramesReceived: number;
  totalFramesAnalyzed: number;
  outOfPlaneCue: string;       // "" = in-plane; non-empty = live foreshortening hint
}

/** Emitted every frame during the SETUP phase (calibration). */
export interface SetupStatusEvent {
  allJointsVisible: boolean;
  holdProgress:     number;   // 0.0 to 1.0 during the 2s hold
  passed:           boolean;  // true once calibration is complete (fired once)
  hint:             string;   // "" when joints visible; guidance text when not
}

/** Emitted during the CALIBRATION phase (if exercise has calibration configured). */
export interface CalibrationStatusEvent {
  repsCompleted: number;   // how many calibration reps done so far
  repsNeeded:    number;   // total needed (e.g. 2)
  passed:        boolean;  // true once calibration completes
}

export interface CameraStateEvent {
  running: boolean;
  position: 'front' | 'back';
}

export interface StartSessionResult {
  success: boolean;
  error?: string;
}

export interface SessionStats {
  reps: number;
  goodReps: number;
  videoUri: string | null;
}

// ─── Native module resolution ─────────────────────────────────────────────────

let ATHLTCameraNative: Record<string, any> | null = null;
let nativeEmitter: any = null;
let NativeViewManager: any = null;

try {
  ATHLTCameraNative = requireNativeModule('ATHLTCamera');
  nativeEmitter     = new EventEmitter(ATHLTCameraNative as any);
} catch {
  // Module not linked — Expo Go or wrong build.
}

try {
  NativeViewManager = requireNativeViewManager('ATHLTCamera_ATHLTCameraView');
} catch {
  // View manager not available.
}

export const isNativeModuleLinked = () => ATHLTCameraNative !== null;

// ─── Session lifecycle ─────────────────────────────────────────────────────────

export async function startSession(): Promise<StartSessionResult> {
  if (!ATHLTCameraNative) return { success: false, error: 'ATHLTCamera native module not linked. Run a dev build.' };
  return ATHLTCameraNative.startSession();
}

export async function stopSession(): Promise<{ success: boolean }> {
  if (!ATHLTCameraNative) return { success: false };
  return ATHLTCameraNative.stopSession();
}

// ─── Model (no-ops — Vision body pose needs no model) ───────────────────────────

export async function loadModel(): Promise<{ loaded: boolean }> {
  return { loaded: true };
}

export function isModelLoaded(): boolean {
  return true;
}

// ─── Exercise type ────────────────────────────────────────────────────────────

// Extending this list is the only TS change needed when adding a new exercise —
// the engine, definitions, and registry are all on the Swift side.
export type ExerciseType =
  | 'squat' | 'curl' | 'pushup' | 'lunge' | 'shoulderPress' | 'jumpingJack'
  // Curl-family variants
  | 'hammerCurl' | 'concentrationCurl' | 'preacherCurl' | 'reverseCurl' | 'cableCurl'
  // Squat-family variants
  | 'gobletSquat' | 'airSquat' | 'frontSquat' | 'backSquat' | 'sumoSquat'
  // Push-up-family variants
  | 'kneePushup' | 'inclinePushup' | 'widePushup' | 'diamondPushup' | 'declinePushup'
  // Shoulder-press-family variants
  | 'overheadPress' | 'arnoldPress' | 'dumbbellShoulderPress' | 'machineShoulderPress'
  // Lunge-family variants
  | 'splitSquat' | 'reverseLunge' | 'stepUp' | 'bulgarianSplitSquat'
  // Push-up-family addition
  | 'closegripPushup'
  // Tricep-family variants
  | 'tricepPushdown' | 'overheadTricepExtension' | 'skullcrusher'
  // Row family — bent-over sub-family (hinged torso)
  | 'bentOverRow' | 'barbellRow' | 'singleArmRow' | 'invertedRow' | 'tBarRow'
  // Row family — seated sub-family (upright torso; different sub-template)
  | 'seatedCableRow' | 'machineRow'
  // Hip-hinge family (hip-dominant, minimal knee bend — opposite emphasis of squat)
  | 'romanianDeadlift' | 'deadlift' | 'goodMorning' | 'kettlebellSwing' | 'singleLegRDL'
  // Shoulder/arm isolation raise family (front-facing lateral, side-facing front raise)
  | 'lateralRaise' | 'frontRaise'
  // Lat pulldown (vertical pull, elbow-angle metric — front-facing, seated)
  | 'latPulldown'
  // Chest press (dumbbell/bench press, side camera, elbow-angle metric)
  | 'chestPress'
  // Barbell Bench Press — same elbow-angle metric/code path as chestPress,
  // scoped to a barbell-specific catalog entry (see its own registration in
  // constants/exerciseDefinitions.ts for the full trackability writeup)
  | 'barbellBenchPress'
  // Standing glute kickback (hip extension, side camera, shoulder-hip-knee angle metric)
  | 'standingGluteKickback'
  // Face pull (rear delt/upper back pull, front camera, elbow-angle metric)
  | 'facePull'
  // Cable pull-through (hinge family, side camera, torso-angle metric) —
  // added in place of hip thrust, see its registration in
  // constants/exerciseDefinitions.ts for the trackability reasoning
  | 'cablePullThrough';

export async function setExercise(type: ExerciseType): Promise<void> {
  if (!ATHLTCameraNative) return;
  return ATHLTCameraNative.setExercise(type);
}

// Passes the exercise standard (from constants/exerciseStandards.ts) to the
// native engine as a JSON string. Must be called after setExercise() — the
// setExercise call resets the engine baseline; this sets the standard floor on top.
// Pass null for exercises that have no defined standard (Layer 2 will be inactive).
export async function setExerciseStandard(standard: Record<string, unknown> | null): Promise<void> {
  if (!ATHLTCameraNative) return;
  return ATHLTCameraNative.setExerciseStandard(standard !== null ? JSON.stringify(standard) : null);
}

// Passes the full exercise definition (from constants/exerciseDefinitions.ts) to
// the native engine as a JSON string. Replaces the Swift-registry definition that
// setExercise() loaded — after this call, thresholds, cues, and form checks are
// driven entirely from JS (no EAS rebuild needed for future edits to those values).
// Call order: setExercise → setExerciseDefinition → setExerciseStandard.
// Pass null for exercises not yet in EXERCISE_DEFINITIONS; Swift fallback stays active.
export async function setExerciseDefinition(definition: Record<string, unknown> | null): Promise<void> {
  if (!ATHLTCameraNative) return;
  return ATHLTCameraNative.setExerciseDefinition(definition !== null ? JSON.stringify(definition) : null);
}

// ─── Skeleton overlay ─────────────────────────────────────────────────────────

export async function setSkeletonVisible(enabled: boolean): Promise<void> {
  if (!ATHLTCameraNative) return;
  return ATHLTCameraNative.setSkeletonVisible(enabled);
}

// ─── Mode control ─────────────────────────────────────────────────────────────

export async function setMode(mode: 'tracking' | 'idle'): Promise<void> {
  if (!ATHLTCameraNative) return;
  return ATHLTCameraNative.setMode(mode);
}

// ─── Camera flip ──────────────────────────────────────────────────────────────

export async function flipCamera(): Promise<{ position: 'front' | 'back' }> {
  if (!ATHLTCameraNative) return { position: 'back' };
  return ATHLTCameraNative.flipCamera();
}

// ─── Diagnostic mode ──────────────────────────────────────────────────────────

export async function setDiagnosticMode(enabled: boolean): Promise<void> {
  if (!ATHLTCameraNative) return;
  return ATHLTCameraNative.setDiagnosticMode(enabled);
}

// ─── Tracking ─────────────────────────────────────────────────────────────────

export async function startTracking(): Promise<void> {
  if (!ATHLTCameraNative) return;
  return ATHLTCameraNative.startTracking();
}

export async function stopTracking(): Promise<SessionStats> {
  if (!ATHLTCameraNative) return { reps: 0, goodReps: 0, videoUri: null };
  return ATHLTCameraNative.stopTracking();
}

// ─── Video-file analysis (Phase 2) ─────────────────────────────────────────────
// Runs an already-recorded video through the exact same pose/rep/form pipeline
// live camera frames use — see analyzeVideoFile's own doc comment in
// ATHLTCameraModule.swift for the full reasoning. `definition` should be the
// exercise's entry from constants/exerciseDefinitions.ts's EXERCISE_DEFINITIONS
// (optionally with a calibration override applied via lib/calibration/store's
// applyOverride, same as formcheck.tsx does for live sessions) — pass null only
// for an exercise genuinely not yet in that catalog, which falls back to the
// Swift-side ExerciseRegistry (squat, curl, pushup, lunge, jumpingJack,
// shoulderPress). Must not be called while a live camera session is active
// (native side guards this — resolves success:false with an explanation
// instead of racing the shared engine).
export async function analyzeVideoFile(
  uri: string,
  exerciseId: string,
  definition: Record<string, unknown> | null = null
): Promise<{ success: boolean; frames?: number; reps?: number; goodReps?: number; error?: string }> {
  if (!ATHLTCameraNative) return { success: false, error: 'native module not available' };
  return ATHLTCameraNative.analyzeVideoFile(
    uri,
    exerciseId,
    definition !== null ? JSON.stringify(definition) : null
  );
}

// ─── Events ───────────────────────────────────────────────────────────────────

type EventSubscription = { remove: () => void };

export function addRepListener(
  callback: (rep: RepEvent) => void
): EventSubscription {
  if (!nativeEmitter) return { remove: () => {} };
  return nativeEmitter.addListener('onRepDetected', callback);
}

export function addDebugStatsListener(
  callback: (event: DebugStatsEvent) => void
): EventSubscription {
  if (!nativeEmitter) return { remove: () => {} };
  return nativeEmitter.addListener('onDebugStats', callback);
}

export function addCameraStateListener(
  callback: (event: CameraStateEvent) => void
): EventSubscription {
  if (!nativeEmitter) return { remove: () => {} };
  return nativeEmitter.addListener('onCameraState', callback);
}

export function addErrorListener(
  callback: (err: { message: string }) => void
): EventSubscription {
  if (!nativeEmitter) return { remove: () => {} };
  return nativeEmitter.addListener('onError', callback);
}

export function addSetupStatusListener(
  callback: (event: SetupStatusEvent) => void
): EventSubscription {
  if (!nativeEmitter) return { remove: () => {} };
  return nativeEmitter.addListener('onSetupStatus', callback);
}

export function addCalibrationStatusListener(
  callback: (event: CalibrationStatusEvent) => void
): EventSubscription {
  if (!nativeEmitter) return { remove: () => {} };
  return nativeEmitter.addListener('onCalibrationStatus', callback);
}

/** Emitted after each rep (form + planarity values) and after calibration. */
export interface DebugLogEvent {
  message: string;
}

export function addDebugLogListener(
  callback: (event: DebugLogEvent) => void
): EventSubscription {
  if (!nativeEmitter) return { remove: () => {} };
  return nativeEmitter.addListener('onDebugLog', callback);
}

// ─── Native View ──────────────────────────────────────────────────────────────

export interface ATHLTCameraViewProps {
  style?: ViewStyle;
}

export function ATHLTCameraView(props: ATHLTCameraViewProps): React.ReactElement | null {
  if (!NativeViewManager) return null;
  return React.createElement(NativeViewManager, props);
}
