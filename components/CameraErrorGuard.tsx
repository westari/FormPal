/**
 * components/CameraErrorGuard.tsx
 *
 * A camera screen must never leave the user stuck on an error page. Two layers:
 *   1. useCameraErrorGuard(): while the screen is open, any uncaught JS error (a tap handler, a timer, a native event) is caught,
 *      logged, and the screen closes back to where the user came from. Without it a throw in a press handler shows the red
 *      "Uncaught Error" page, and Back reopens it.
 *   2. ErrorBoundary: expo-router renders this instead of the error page when the screen itself throws while rendering.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

function leave(router: ReturnType<typeof useRouter>) {
  try {
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
  } catch {
    try { router.replace('/' as any); } catch { /* nothing left to try */ }
  }
}

/** Install while a camera screen is mounted. Restores the previous handler on unmount. */
const defaultLog = (line: string) => { console.log(line); };
export function useCameraErrorGuard(log: (line: string) => void = defaultLog) {
  const router = useRouter();
  useEffect(() => {
    const EU: any = (global as any).ErrorUtils;
    if (!EU || typeof EU.setGlobalHandler !== 'function' || typeof EU.getGlobalHandler !== 'function') return;
    const previous = EU.getGlobalHandler();
    let handled = false;
    EU.setGlobalHandler((error: any, isFatal?: boolean) => {
      try { log(`[ERROR-GUARD] ${String(error?.message ?? error).slice(0, 200)} (fatal=${!!isFatal}) - leaving the camera screen`); } catch { /* ignore */ }
      if (!handled) { handled = true; leave(router); }
    });
    return () => { try { EU.setGlobalHandler(previous); } catch { /* ignore */ } };
  }, [router, log]);
}

/** expo-router renders this when the screen throws while rendering: go back at once. */
export function ErrorBoundary(_props: { error: Error; retry: () => Promise<void> }) {
  const router = useRouter();
  useEffect(() => { leave(router); }, [router]);
  return (
    <View style={s.wrap}>
      <Text style={s.t}>Going back...</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  t: { color: '#fff', fontSize: 16 },
});
