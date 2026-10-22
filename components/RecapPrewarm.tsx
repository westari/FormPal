/**
 * components/RecapPrewarm.tsx
 *
 * Mounted once at the app root (app/_layout.tsx), for the whole app
 * lifetime, never unmounted — an attempt at the workout-complete-card
 * delay ("still 3 seconds late, millionth time"). Root cause (confirmed
 * this session): the delay is entirely the workoutrecap.html bundle's own
 * unpack cost AFTER recap.tsx's WebView mounts, not anything in the
 * save/stop sequence before navigation.
 *
 * LOW CONFIDENCE, DEVICE-ONLY VERIFIABLE: this loads the exact same
 * workoutrecap.html once, hidden, as early as possible, hoping
 * WKWebView/JavaScriptCore caches something from running this bundle's
 * own large inline unpack script once. Apple does NOT document reliable
 * bytecode caching for inline <script> blocks the way it does for
 * externally cached files loaded over a real URL — this may do nothing.
 * If a real device test shows no improvement, the actual fix is bigger:
 * making recap.tsx's summary view reuse ONE persistent WebView instance
 * across the whole app instead of mounting a fresh one per session (every
 * WebView instance pays its own unpack cost independently — there is no
 * shortcut around that except literal instance reuse). That's a much
 * larger, riskier change to recap.tsx's existing view-switching logic
 * (summary/allsets/ranks share one WebView today) — worth attempting only
 * after confirming this cheap, safe version isn't enough.
 */
import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const RECAP_HTML = require('../assets/app screens/workoutrecap.html');

export default function RecapPrewarm() {
  const webRef = useRef<WebView>(null);
  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webRef}
        source={RECAP_HTML}
        originWhitelist={['*']}
        style={styles.hidden}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, top: -9999, left: -9999 },
});
