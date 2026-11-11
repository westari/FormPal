/**
 * components/DesignScreen.tsx
 *
 * Full-screen host for one of Ari's real design files (lib/designScreens.ts): a WebView that stays invisible until the page
 * says it is ready (laid out, filled with real data, still), hands the page its data on request, and forwards the page's own
 * messages (back, save, ...) to the screen that owns it. The design file itself is never edited.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useRevealFade } from '../lib/useRevealFade';
import { hapticKind } from '../lib/haptics';

export interface DesignMessage { type: string; [k: string]: any }

export default function DesignScreen({
  source, beforeJs, dataJs, onMessage, webRef, name,
}: {
  source: any;
  beforeJs: string;
  /** the page's data, pushed as soon as it asks (and again whenever this string changes) */
  dataJs: string | null;
  onMessage: (m: DesignMessage) => void;
  webRef?: React.RefObject<WebView | null>;
  name: string;
}) {
  const inner = useRef<WebView>(null);
  const ref = (webRef ?? inner) as React.RefObject<WebView | null>;
  const { fade, onReady, onLoadStart, onLoadEnd } = useRevealFade(m => { if (__DEV__) console.log(`[${name}]`, m); });
  const dataRef = useRef<string | null>(dataJs);
  dataRef.current = dataJs;

  const push = useCallback(() => { if (dataRef.current) ref.current?.injectJavaScript(dataRef.current); }, [ref]);
  useEffect(() => { push(); }, [dataJs, push]);

  const handle = useCallback((raw: string) => {
    let msg: DesignMessage;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'ready') { onReady(); return; }
    if (msg.type === 'needData') { push(); return; }
    if (msg.type === 'pageConsole') { if (__DEV__) console.log(`[${name}-page]`, msg.msg); return; }
    if (msg.type === 'logicReady') return;
    if (msg.type === 'haptic') { hapticKind(msg.kind); return; }
    onMessage(msg);
  }, [onMessage, onReady, push, name]);

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <WebView
          ref={ref}
          source={source}
          originWhitelist={['*']}
          injectedJavaScriptBeforeContentLoaded={beforeJs}
          onMessage={(e) => handle(e.nativeEvent.data)}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          style={s.web}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          keyboardDisplayRequiresUserAction={false}
        />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eeeef1' },
  web:  { flex: 1, backgroundColor: '#eeeef1' },
});
