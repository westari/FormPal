/**
 * app/streak-screen.tsx
 *
 * Shown after every completed workout — wires the real streak.html artboard
 * with the user's actual current streak (lib/sessionLog.ts's calcStreak()),
 * via DOM text-injection (never editing the design file — see CLAUDE.md).
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { CONSOLE_FORWARD_JS, DC_VIEWPORT_JS, dcScaleFitJs } from '../lib/dcWebviewHelpers';
import { decideProgressPhotoVariant } from '../lib/postWorkoutFlow';

const STREAK_HTML = require('../assets/app screens/streak.html');

function streakInject(count: number): string {
  const MAP: Record<string, string> = {
    'Day 1 streak!': `Day ${count} streak!`,
  };
  return dcScaleFitJs('#ffffff') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  var MAP = ${JSON.stringify(MAP)};
  function apply(){
    var hit=0;
    var all=document.querySelectorAll('#dc-root div,#dc-root span');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(Object.prototype.hasOwnProperty.call(MAP,t)){ el.textContent = MAP[t]; hit++; }
    }
    return hit;
  }
  if(!apply()){ [100,300,700].forEach(function(d){ setTimeout(apply,d); }); }

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
  const params = useLocalSearchParams<{ count?: string; dest?: string }>();
  const count = parseInt(params.count ?? '1', 10) || 1;
  const dest = params.dest ?? '/(tabs)/';
  const [ready, setReady] = useState(false);
  const webRef = useRef<WebView>(null);

  const advance = async () => {
    const variant = await decideProgressPhotoVariant();
    if (variant) {
      router.replace({ pathname: '/progress-photo-screen', params: { variant, dest } } as any);
    } else {
      router.replace(dest as any);
    }
  };

  return (
    <View style={styles.flex}>
      <WebView
        ref={webRef}
        source={STREAK_HTML}
        originWhitelist={['*']}
        style={[styles.web, { opacity: ready ? 1 : 0 }]}
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
        injectedJavaScript={CONSOLE_FORWARD_JS + streakInject(count)}
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
