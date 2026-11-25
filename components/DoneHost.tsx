/**
 * components/DoneHost.tsx
 *
 * THE done screen, for everything that finishes (workout, form check, logged session, created workout, weight): Ari's design
 * assets/app screens/greatjobanimation.html used as it is. A transparent web view above the whole app (and the tab bar): a wash sweeps over the
 * screen that was just on screen, then the check frame, the title, one real line of information and Continue. Mounted once in app/_layout.tsx;
 * anything calls showDone(...) (lib/doneStore.ts). The words come from lib/doneInfo.ts.
 *
 * ROUND 7:
 *  - It shows AT ONCE when Finish / Submit is pressed. A spare web view is loaded and fitted (paused, invisible) a moment after the app starts, and
 *    a fresh spare is made after each use, so showDone only sets the words and plays: no loading, no wait, nothing of the old screen in between.
 *  - It NEVER continues by itself. It stays until Continue is tapped (the design's own button). The only timer is a safety net for a page that
 *    never loads at all (so the app can never be stuck under an invisible layer); it is cancelled the moment the page is shown.
 *  - The success haptic plays when the title appears. Continue runs the caller's onContinue and fades the screen away over the new screen.
 * (It replaces components/DoneScreen.tsx and components/SavedCheck.tsx, which nothing uses any more.)
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useDone, hideDone, type DonePayload } from '../lib/doneStore';
import { DONE_BEFORE_JS, DONE_PREP_JS, doneStartJs, doneLineJs } from '../lib/doneAnimationPage';
import { hapticSuccess, hapticMain } from '../lib/haptics';

const DONE_HTML = require('../assets/app screens/greatjobanimation.html');
export const DONE_HAPTIC_MS = 1950;      // when the title has appeared (the design's title starts at 1830ms and takes 700ms)
export const DONE_FADE_MS = 240;
export const DONE_COVERED_MS = 1300;   // after the page says it is shown, the wash has covered the screen under it: payload.onCovered runs then
export const DONE_SPARE_AFTER_MS = 2500; // the first spare is made this long after the app starts (not during launch)
export const DONE_NEVER_LOADED_MS = 5000; // safety net only: a page that never says it is shown within this long after it was asked to play

type Live = DonePayload & { nonce: number };

function DoneView({ payload, onSpent }: { payload: Live | null; onSpent: () => void }) {
  const webRef = useRef<WebView>(null);
  const fade = useRef(new Animated.Value(0)).current;      // the whole layer: invisible until it is used
  const [live, setLive] = useState(false);
  const readyRef = useRef(false);
  const startedFor = useRef<number | null>(null);
  const shownRef = useRef(false);
  const left = useRef(false);
  const coveredRef = useRef(false);
  const payloadRef = useRef<Live | null>(payload);
  payloadRef.current = payload;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const leave = () => {
    if (left.current) return; left.current = true;
    timers.current.forEach(clearTimeout);
    payloadRef.current?.onContinue();   // (a caller that already left in onCovered makes this a no-op)
    Animated.timing(fade, { toValue: 0, duration: DONE_FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => { hideDone(); onSpent(); });
  };
  const play = (p: Live) => {
    if (startedFor.current === p.nonce || !readyRef.current) return;
    startedFor.current = p.nonce;
    const sub = p.subtitle;
    if (typeof sub === 'string') webRef.current?.injectJavaScript(doneStartJs(p.title, sub));
    else {
      // the line is still being worked out: the screen starts now, the line fills in when it is ready
      webRef.current?.injectJavaScript(doneStartJs(p.title, '', true));
      sub.then((t) => t || '', () => '').then((t) => { if (!left.current) webRef.current?.injectJavaScript(doneLineJs(t)); });
    }
    timers.current.push(setTimeout(() => { if (!shownRef.current) { if (__DEV__) console.log('[DONE] the page never answered: continuing anyway'); leave(); } }, DONE_NEVER_LOADED_MS));
  };
  // asked for: the layer is shown at once (it is see-through until the wash) and the spare plays
  useEffect(() => {
    if (!payload) return;
    fade.setValue(1); setLive(true);
    play(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.nonce]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 1000 }]} pointerEvents={live ? 'auto' : 'none'} testID="done-screen">
      <WebView
        ref={webRef}
        source={DONE_HTML}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        {...({ opaque: false } as object)}
        injectedJavaScriptBeforeContentLoaded={DONE_BEFORE_JS}
        injectedJavaScript={DONE_PREP_JS}
        onMessage={(e) => {
          const m = e.nativeEvent.data;
          if (m === 'doneReady') {
            readyRef.current = true;
            if (__DEV__) console.log('[DONE] spare page loaded and ready');
            if (payloadRef.current) play(payloadRef.current);
          } else if (m === 'doneShown') {
            shownRef.current = true;
            timers.current.forEach(clearTimeout); timers.current = [];   // shown: no timer can ever continue it for the user
            const p = payloadRef.current;
            if (__DEV__) console.log('[DONE] shown: "' + (p ? p.title : '') + '" | ' + (p ? (typeof p.subtitle === 'string' ? p.subtitle : '(the line fills in when it is ready)') : ''));
            timers.current.push(setTimeout(() => hapticSuccess(), DONE_HAPTIC_MS));
            timers.current.push(setTimeout(() => { if (coveredRef.current) return; coveredRef.current = true; if (__DEV__) console.log('[DONE] covering the screen under it: the caller may leave behind it now'); try { payloadRef.current?.onCovered?.(); } catch { /* the caller's problem, never the done screen's */ } }, DONE_COVERED_MS));
          } else if (m === 'doneContinue') {
            if (shownRef.current) { hapticMain(); leave(); }   // (round 10) a tap on Continue buzzes, like every main button in the app
          }
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
  const [gen, setGen] = useState(0);          // each spare serves ONE done screen; a fresh one is made after it
  const [armed, setArmed] = useState(false);  // the first spare is made a moment after launch
  useEffect(() => { const t = setTimeout(() => setArmed(true), DONE_SPARE_AFTER_MS); return () => clearTimeout(t); }, []);
  useEffect(() => { if (p) setArmed(true); }, [p]);
  if (!armed) return null;
  return <DoneView key={gen} payload={p} onSpent={() => setGen((g) => g + 1)} />;
}
