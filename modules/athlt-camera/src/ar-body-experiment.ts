/**
 * ar-body-experiment — JS bridge for the ARBodyExperiment native module.
 *
 * Events from the view arrive as the `onDebugLog` callback PROP (not via an
 * EventEmitter), because they are declared inside the View() block in Swift.
 * Pass onDebugLog as a prop to <ARBodyExperimentView>.
 */

import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import React from 'react';
import type { ViewStyle } from 'react-native';

let ARBodyExperimentNative: Record<string, any> | null = null;
let NativeViewManager: any = null;

try {
  ARBodyExperimentNative = requireNativeModule('ARBodyExperiment');
} catch {
  // Not linked — dev build required
}

try {
  NativeViewManager = requireNativeViewManager('ARBodyExperiment_ARBodyExperimentView');
} catch {
  // View manager not available
}

export const isARModuleLinked = () => ARBodyExperimentNative !== null;

/** Call to emit a [AR-MARK] snapshot on the next body-anchor update. */
export function mark(): void {
  if (!ARBodyExperimentNative) return;
  ARBodyExperimentNative.mark();
}

export interface ARBodyExperimentViewProps {
  style?: ViewStyle;
  /** Fires ~3× per second with debug data, and immediately on each mark(). */
  onDebugLog?: (event: { message: string }) => void;
}

export function ARBodyExperimentView(
  props: ARBodyExperimentViewProps,
): React.ReactElement | null {
  if (!NativeViewManager) return null;
  return React.createElement(NativeViewManager, props);
}
