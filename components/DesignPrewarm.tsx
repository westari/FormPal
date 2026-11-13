/**
 * components/DesignPrewarm.tsx
 *
 * Create workout / My workouts / Log a session each open a fresh WebView, and the first one of a session pays for starting
 * the web engine and reading the big design file, which showed as a long blank screen. This mounts each of them once,
 * one at a time, invisible and 1px big, a few seconds after the app starts, then removes it. The web engine process and the
 * file cache stay warm, so the real screen opens fast. Nothing visible, no data, no navigation.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLaunchSettled } from '../lib/launchGate';

const FILES = [
  require('../assets/app screens/createworkout.html'),
  require('../assets/app screens/myworkouts.html'),
  require('../assets/app screens/logsessionv2.html'),
];
const START_DELAY_MS = 2500; // after the launch gate opens (the four tabs load first: lib/launchGate.ts)
const EACH_MS = 1800;

export default function DesignPrewarm() {
  const [i, setI] = useState(-1);
  const settled = useLaunchSettled();
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(() => setI(0), START_DELAY_MS);
    return () => clearTimeout(t);
  }, [settled]);
  useEffect(() => {
    if (i < 0 || i >= FILES.length) return;
    const t = setTimeout(() => setI(i + 1), EACH_MS);
    return () => clearTimeout(t);
  }, [i]);
  if (i < 0 || i >= FILES.length) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 }}>
      <WebView
        key={i}
        source={FILES[i]}
        originWhitelist={['*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        style={{ width: 1, height: 1 }}
      />
    </View>
  );
}
