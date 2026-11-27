/**
 * app/streak-screen.tsx
 *
 * Shown after every completed workout — wires the real streak.html artboard
 * with the user's actual current streak (lib/sessionLog.ts's calcStreak()),
 * via DOM text-injection (never editing the design file — see CLAUDE.md).
 */
import { leaveToTabs } from '../lib/leaveToTabs';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { CONSOLE_FORWARD_JS, DC_VIEWPORT_JS, dcScaleFitJs } from '../lib/dcWebviewHelpers';
import { NO_ZOOM_JS } from '../lib/noZoom';
import { hapticSuccess } from '../lib/haptics';
import { decideProgressPhotoVariant } from '../lib/postWorkoutFlow';
import { getAllSessions } from '../lib/sessionLog';
import { streakInfo, streakPageJs, type StreakInfo } from '../lib/streakInfo';

const STREAK_HTML = require('../assets/app screens/streak.html');

// Round 12 (opening was laggy): the page starts loading the moment the screen mounts, IN PARALLEL with reading the saved sessions (it used
// to wait for the sessions first, then start the WebView from nothing). The streak itself is handed in by injectJavaScript as soon as both
// the page and the numbers are there; the page is still only revealed once it shows the real streak (window.__streakApplied).
function streakInject(): string {
  return dcScaleFitJs('#ffffff') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  document.addEventListener('click', function(e){
    var el = e.target;
    for(var i=0; el && i<5; i++, el=el.parentElement){
      var t=(el.textContent||'').trim();
      if(t === 'Continue'){ post('advance'); return; }
    }
  }, true);
  // revealed only once the page shows the real streak (never the design's own Day 1 first): wait for it, 4s at most
  (function wait(n){ if (window.__streakApplied || n > 150) post('ready'); else setTimeout(function(){ wait(n + 1); }, 30); })(0);
})();
`;
}

export default function StreakScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ count?: string; dest?: string; from?: string }>();
  const passed = params.from === 'tab' ? 0 : parseInt(params.count ?? '0', 10) || 0;
  const [info, setInfo] = useState<StreakInfo | null>(null);
  // the REAL streak, from the saved sessions (the number, today's state, the week row and the words all come from it)
  useEffect(() => { let on = true; getAllSessions().then(all => { if (on) setInfo(streakInfo(all, Date.now(), passed)); }).catch(() => { if (on) setInfo(streakInfo([], Date.now(), passed)); }); return () => { on = false; }; }, [passed]);
  const dest = params.dest ?? '/(tabs)/';
  const [ready, setReady] = useState(false);
  // every page load (a packed design file can report more than one while it unpacks) gets the streak once, as soon as the numbers are known
  const [loads, setLoads] = useState(0);
  const webRef = useRef<WebView>(null);
  const sentFor = useRef(0);
  useEffect(() => {
    if (!info || !loads || sentFor.current === loads) return;
    sentFor.current = loads;
    webRef.current?.injectJavaScript(streakPageJs(info));
  }, [info, loads]);
  // the page is revealed with a short even fade (it used to pop from nothing to everything in one frame)
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (ready) Animated.timing(fade, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(); }, [ready, fade]);

  const advance = async () => {
    // opened by tapping the streak pill on a tab: just go back (no progress-photo prompt, that is for finishing a workout)
    if (params.from === 'tab') { router.back(); return; }
    const variant = await decideProgressPhotoVariant();
    if (variant) {
      router.replace({ pathname: '/progress-photo-screen', params: { variant, dest } } as any);
    } else {
      leaveToTabs(router, dest);
    }
  };

  return (
    <View style={styles.flex}>
      <Animated.View style={{ flex: 1, opacity: fade }}>
      <WebView
        ref={webRef}
        source={STREAK_HTML}
        originWhitelist={['*']}
        style={styles.web}
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS + NO_ZOOM_JS}
        injectedJavaScript={CONSOLE_FORWARD_JS + streakInject()}
        onLoadEnd={() => setLoads((n) => n + 1)}
        onMessage={(e) => {
          const m = e.nativeEvent.data;
          // (round 13) the page comes alive as it is revealed: flame ignites, the number counts up, the streak days fill in (lib/streakInfo.ts __skPlay)
          if (m === 'ready') { setReady(true); webRef.current?.injectJavaScript('window.__skPlay && window.__skPlay(); true;'); return; }
          if (m === 'haptic') { hapticSuccess(); return; }
          if (m === 'advance') { void advance(); }
        }}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        bounces={false}
        overScrollMode="never"
        cacheEnabled={false}
        scrollEnabled={false}
      />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1, backgroundColor: '#ffffff' },
});
