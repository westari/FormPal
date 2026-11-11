/**
 * app/streak-screen.tsx
 *
 * Shown after every completed workout — wires the real streak.html artboard
 * with the user's actual current streak (lib/sessionLog.ts's calcStreak()),
 * via DOM text-injection (never editing the design file — see CLAUDE.md).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { CONSOLE_FORWARD_JS, DC_VIEWPORT_JS, dcScaleFitJs } from '../lib/dcWebviewHelpers';
import { NO_ZOOM_JS } from '../lib/noZoom';
import { decideProgressPhotoVariant } from '../lib/postWorkoutFlow';
import { getAllSessions } from '../lib/sessionLog';
import { streakInfo, streakPageJs, type StreakInfo } from '../lib/streakInfo';

const STREAK_HTML = require('../assets/app screens/streak.html');

function streakInject(info: StreakInfo): string {
  return dcScaleFitJs('#ffffff') + streakPageJs(info) + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  document.addEventListener('click', function(e){
    var el = e.target;
    for(var i=0; el && i<5; i++, el=el.parentElement){
      var t=(el.textContent||'').trim();
      if(t === 'Continue'){ post('advance'); return; }
    }
  }, true);
  post('ready');
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
  const webRef = useRef<WebView>(null);

  const advance = async () => {
    // opened by tapping the streak pill on a tab: just go back (no progress-photo prompt, that is for finishing a workout)
    if (params.from === 'tab') { router.back(); return; }
    const variant = await decideProgressPhotoVariant();
    if (variant) {
      router.replace({ pathname: '/progress-photo-screen', params: { variant, dest } } as any);
    } else {
      router.replace(dest as any);
    }
  };

  if (!info) return <View style={styles.flex} />;
  return (
    <View style={styles.flex}>
      <WebView
        ref={webRef}
        source={STREAK_HTML}
        originWhitelist={['*']}
        style={[styles.web, { opacity: ready ? 1 : 0 }]}
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS + NO_ZOOM_JS}
        injectedJavaScript={CONSOLE_FORWARD_JS + streakInject(info)}
        onMessage={(e) => {
          const m = e.nativeEvent.data;
          if (m === 'ready') { setReady(true); return; }
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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1, backgroundColor: '#ffffff' },
});
