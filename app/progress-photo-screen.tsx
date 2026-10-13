/**
 * app/progress-photo-screen.tsx
 *
 * Progress photo prompt — wires the real progressphoto.html artboard for
 * both variants (first-time / recurring). The artboard's own default
 * (no-props) render state IS the correct "first" copy already (its
 * `daysSince ?? 0` default produces exactly "Start your photo streak" /
 * "First photo" / etc.) — only the 'recurring' variant needs real text
 * injected in place of that default. Photos go to the private
 * 'progress-photos' Supabase Storage bucket (see supabase_schema.sql),
 * never public.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { CONSOLE_FORWARD_JS, DC_VIEWPORT_JS, dcScaleFitJs } from '../lib/dcWebviewHelpers';
import { uploadProgressPhotoToCloud } from '../lib/formpalSync';
import { daysSinceLastPrompt } from '../lib/postWorkoutFlow';

const PROGRESS_PHOTO_HTML = require('../assets/app screens/progressphoto.html');

function progressPhotoInject(variant: 'first' | 'recurring', daysSince: number): string {
  const MAP: Record<string, string> =
    variant === 'recurring'
      ? {
          'Start your photo streak': 'Want to take a progress photo?',
          'First photo': `${daysSince} day${daysSince === 1 ? '' : 's'} ago`,
          'Seeing your progress makes it easier to keep showing up.':
            `Your last one was ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`,
        }
      : {};
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
  if(Object.keys(MAP).length && !apply()){ [100,300,700].forEach(function(d){ setTimeout(apply,d); }); }

  document.addEventListener('click', function(e){
    var el = e.target;
    for(var i=0; el && i<5; i++, el=el.parentElement){
      var t=(el.textContent||'').trim();
      if(t === 'Take photo'){ post('takePhoto'); return; }
      if(t === 'Skip'){ post('skip'); return; }
    }
  }, true);
  post('ready');
})();
`;
}

export default function ProgressPhotoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ variant?: string; dest?: string }>();
  const variant: 'first' | 'recurring' = params.variant === 'recurring' ? 'recurring' : 'first';
  const dest = params.dest ?? '/(tabs)/';
  const [ready, setReady] = useState(false);
  // null = still loading (only matters for 'recurring' — see below). The
  // WebView isn't mounted until this resolves: injectedJavaScript only runs
  // against the page's INITIAL load, so the real daysSince value has to be
  // known before first mount, not pushed in after the fact.
  const [daysSince, setDaysSince] = useState<number | null>(variant === 'recurring' ? null : 0);

  React.useEffect(() => {
    if (variant === 'recurring') daysSinceLastPrompt().then(setDaysSince);
  }, [variant]);

  const finish = () => router.replace(dest as any);

  if (daysSince === null) return <View style={styles.flex} />;

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera access needed', 'Allow camera access in Settings to take a progress photo.'); finish(); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]?.uri) { finish(); return; }
    const { error } = await uploadProgressPhotoToCloud(result.assets[0].uri, variant);
    if (error) Alert.alert("Couldn't save photo", 'Check your connection and try again from Settings later.');
    finish();
  };

  return (
    <View style={styles.flex}>
      <WebView
        source={PROGRESS_PHOTO_HTML}
        originWhitelist={['*']}
        style={[styles.web, { opacity: ready ? 1 : 0 }]}
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
        injectedJavaScript={CONSOLE_FORWARD_JS + progressPhotoInject(variant, daysSince)}
        onMessage={(e) => {
          const m = e.nativeEvent.data;
          if (m === 'ready') { setReady(true); return; }
          if (m === 'takePhoto') { void takePhoto(); return; }
          if (m === 'skip') { finish(); }
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
