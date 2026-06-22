/**
 * athlt-camera — JS bridge for the (gutted) ATHLTCamera native module.
 *
 * Now drives Vision body-pose squat detection. Hoop/ball/make-miss + CoreML model
 * are gone. loadModel/isModelLoaded are kept as JS no-ops so any copied screen that
 * still calls them keeps working — there is no model to load anymore.
 */

import { requireNativeModule, EventEmitter, requireNativeViewManager } from 'expo-modules-core';
import React from 'react';
import type { ViewStyle } from 'react-native';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Emitted once per completed rep. */
export interface RepEvent {
  good: boolean;        // true = good depth, false = too shallow
  reason: string;       // "good depth" | "too shallow — go deeper"
  depthAngle: number;   // min knee angle reached this rep (deg)
  reps: number;         // total reps this session
  goodReps: number;     // good reps this session
  timestamp: number;    // ms
}

/** Emitted ~once per second while tracking. */
export interface DebugStatsEvent {
  personDetected: boolean;
  kneeAngle: number;          // latest averaged knee angle (deg)
  phase: string;             // human-readable state ("standing (knee 172°)", etc.)
  reps: number;
  goodReps: number;
  totalFramesReceived: number; // 0 = camera delegate not firing
  totalFramesAnalyzed: number; // 0 + received>0 = analysis gate blocking
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

// ─── Native View ──────────────────────────────────────────────────────────────

export interface ATHLTCameraViewProps {
  style?: ViewStyle;
}

export function ATHLTCameraView(props: ATHLTCameraViewProps): React.ReactElement | null {
  if (!NativeViewManager) return null;
  return React.createElement(NativeViewManager, props);
}