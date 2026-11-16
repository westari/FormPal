/**
 * components/DoneHost.tsx
 *
 * THE done screen, for everything that finishes (workout, form check, logged session, created workout, weight): Ari's design
 * assets/app screens/greatjobanimation.html used as it is. A transparent web view above the whole app (and the tab bar): a wash sweeps over the
 * screen that was just on screen, then the check frame, the title, one real line of information and Continue. Mounted once in app/_layout.tsx;
 * anything calls showDone(...) (lib/doneStore.ts). The words come from lib/doneInfo.ts.
 *
 * A success haptic plays when the title appears. Continue runs the caller's onContinue and fades the screen away over the new screen.
 * (It replaces components/DoneScreen.tsx and components/SavedCheck.tsx, which nothing uses any more.)
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useDone, hideDone } from '../lib/doneStore';
import { DONE_BEFORE_JS, doneAfterJs } from '../lib/doneAnimationPage';
import { hapticSuccess } from '../lib/haptics';

const DONE_HTML = require('../assets/app screens/greatjobanimation.html');
export const DONE_HAPTIC_MS = 1950;     // when the title has appeared (the design's title starts at 1830ms and takes 700ms)
export const DONE_FADE_MS = 240;
export const DONE_FAILSAFE_MS = 6500;   // if the page never answers, the flow continues anyway

function DoneView({ title, subtitle, onContinue }: { title: string; subtitle: string; onContinue: () => void }) {
  const fade = useRef(new Animated.Value(1)).current;
  const left = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const after = useMemo(() => doneAfterJs(title, subtitle), [title, subtitle]);
  const leave = () => {
    if (left.current) return; left.current = true;
    timers.current.forEach(clearTimeout);
    onContinue();
    Animated.timing(fade, { toValue: 0, duration: DONE_FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => hideDone());
  };
  useEffect(() => {
    const t = setTimeout(() => { if (__DEV__) console.log('[DONE] the page never answered: continuing anyway'); leave(); }, DONE_FAILSAFE_MS);
    timers.current.push(t);
    return () => { timers.current.forEach(clearTimeout); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 1000 }]} pointerEvents="auto" testID="done-screen">
      <WebView
        source={DONE_HTML}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        opaque={false}
        injectedJavaScriptBeforeContentLoaded={DONE_BEFORE_JS}
        injectedJavaScript={after}
        onMessage={(e) => {
          const m = e.nativeEvent.data;
          if (m === 'doneShown') {
            if (__DEV__) console.log('[DONE] shown: "' + title + '" | ' + subtitle);
            timers.current.push(setTimeout(() => hapticSuccess(), DONE_HAPTIC_MS));
          } else if (m === 'doneContinue') leave();
        }}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        cacheEnabled
      />
    </Animated.View>
  );
}

export default function DoneHost() {
  const p = useDone((s) => s.payload);
  if (!p) return null;
  return <DoneView key={p.nonce} title={p.title} subtitle={p.subtitle} onContinue={p.onContinue} />;
}
