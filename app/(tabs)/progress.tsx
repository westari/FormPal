/**
 * app/(tabs)/progress.tsx — Progress tab
 *
 * Renders the real Claude-Design artboard (assets/app screens/progress.html)
 * wired with real data. The design file itself is never edited (CLAUDE.md):
 * its own logic class is subclassed at runtime (lib/dcLogicPatch.ts +
 * lib/progressInject.ts) so its own chart / list / weigh-in-sheet machinery
 * runs on real values, and a persistent DOM pass handles the static bits.
 *
 * EVERY card in the design is wired: Your Rank (+ muscle map inside the card,
 * arrow opens the Muscle Map page), Weight Progress (real chart + instant
 * logging), Progress Photos (opens the real photo screen), Form Score,
 * Personal Bests, Past Workouts (open the real recap). Cards with no data yet
 * show an empty state — never the artboard's demo numbers.
 *
 * Built after the same process as Train (see app/(tabs)/train.tsx): installed
 * before the bundle unpacks, never stops watching, hidden until the page says
 * it's genuinely ready.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { CONSOLE_FORWARD_JS, DC_VIEWPORT_JS } from '../../lib/dcWebviewHelpers';
import { dcLogicPatchJs, athltSetDataJs } from '../../lib/dcLogicPatch';
import { PROGRESS_LOGIC_EXT, PROGRESS_DOM_JS } from '../../lib/progressInject';
import { getAllSessions, computeMuscleTiers, TIER_ORDER } from '../../lib/sessionLog';
import { getWeightLog, logWeight } from '../../lib/weightLog';
import { buildProgressData, type ProgressData } from '../../lib/progressData';
import { tierDataUri } from '../../lib/rankImages';
import { muscleIconUri } from '../../lib/muscleIcons';
import { getSessionThumbnail } from '../../lib/sessionVideo';
import { listProgressPhotos, addProgressPhoto, type PhotoPose } from '../../lib/progressPhotos';
import { uploadProgressPhotoToCloud } from '../../lib/formpalSync';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from 'react-native';
import type { Muscle } from '../../constants/exercises';
import type { Tier } from '../../lib/sessionLog';

const PROGRESS_HTML = require('../../assets/app screens/progress.html');
const PROGRESS_BUILD = 'progress-3';
if (__DEV__) console.log(`[progress] build ${PROGRESS_BUILD}`);

const PROGRESS_BEFORE = DC_VIEWPORT_JS + CONSOLE_FORWARD_JS + dcLogicPatchJs(PROGRESS_LOGIC_EXT) + PROGRESS_DOM_JS;

export default function ProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const dataRef = useRef<ProgressData | null>(null);

  const push = useCallback(() => {
    if (dataRef.current) webRef.current?.injectJavaScript(athltSetDataJs(dataRef.current));
  }, []);

  // Safety net so a missing ready signal can never leave a blank tab.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 7000);
    return () => clearTimeout(t);
  }, []);

  const load = useCallback(async () => {
    const [sessions, weights, photos] = await Promise.all([getAllSessions(), getWeightLog(), listProgressPhotos()]);
    const tiers = computeMuscleTiers(sessions);
    const data = buildProgressData(sessions, tiers, weights, Date.now(), { insets: { top: insets.top, bottom: insets.bottom }, photos });
    // Keep art we already fetched so a refresh never blanks it.
    const prev = dataRef.current;
    if (prev) {
      data.rank.emblem = prev.rank.tier === data.rank.tier ? prev.rank.emblem : null;
      data.ladder.forEach((l, i) => { l.img = prev.ladder[i]?.img ?? null; });
      data.muscles.forEach((m) => { const pm = prev.muscles.find(x => x.key === m.key); if (pm && pm.tier === m.tier) m.icon = pm.icon; });
      data.workouts.forEach((w) => { w.thumb = prev.workouts.find(x => x.ts === w.ts)?.thumb ?? null; });
    }
    dataRef.current = data;
    push();
    // Heavier art arrives in follow-up pushes: rank emblem, muscle icons, ladder, video frames.
    const cur = await tierDataUri(data.rank.tier ?? 'bronze');
    if (dataRef.current === data && cur) { data.rank.emblem = cur; push(); }
    const icons = await Promise.all(data.muscles.map(m => muscleIconUri(m.key as Muscle, (m.tier ?? 'silver') as Tier)));
    if (dataRef.current === data) { data.muscles.forEach((m, i) => { m.icon = icons[i]; }); push(); }
    const imgs = await Promise.all(TIER_ORDER.map(t => tierDataUri(t)));
    if (dataRef.current === data) { data.ladder.forEach((l, i) => { l.img = imgs[i]; }); push(); }
    const frames = await Promise.all(data.workouts.slice(0, 8).map(async (w) => {
      const uri = (await getSessionThumbnail(w.ts, 1000)) ?? (await getSessionThumbnail(w.ts, 0));
      if (!uri) return null;
      try { return `data:image/jpeg;base64,${await new File(uri).base64()}`; } catch { return null; }
    }));
    if (dataRef.current === data) { frames.forEach((f, i) => { if (f) data.workouts[i].thumb = f; }); push(); }
  }, [push, insets.top, insets.bottom]);

  // Take a photo, save it ON THE DEVICE (never fails just because the network or sign-in does),
  // then try the cloud copy quietly in the background.
  const addPhoto = useCallback(async (pose: PhotoPose) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Camera access needed', 'Allow camera access in Settings to take a progress photo.'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const uri = result.assets[0].uri;
      await addProgressPhoto(uri, pose);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void uploadProgressPhotoToCloud(uri, 'recurring').catch(() => {});
      await load();
      webRef.current?.injectJavaScript(`window.__athltToast && window.__athltToast('Photo saved'); true;`);
    } catch (e) {
      Alert.alert("Couldn't save photo", 'Something went wrong saving the photo to your phone. Please try again.');
    }
  }, [load]);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const onMessage = useCallback((raw: string) => {
    let msg: { type?: string; dateKey?: string; weightLb?: number; ts?: number; msg?: string; pose?: string };
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'ready': setReady(true); break;
      case 'pageConsole': if (__DEV__) console.log('[progress-page]', msg.msg); break;
      case 'needData': push(); break;
      case 'logWeight': {
        // The page already updated its own chart + closed the sheet instantly;
        // this just persists it, then re-syncs from storage.
        if (!msg.dateKey || !msg.weightLb) break;
        const [y, m, d] = msg.dateKey.split('-').map(Number);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        logWeight(msg.weightLb, new Date(y, m - 1, d)).then(() => load()).catch(() => {});
        break;
      }
      case 'openWorkout':
        if (msg.ts != null) router.push({ pathname: '/recap', params: { ts: String(msg.ts) } } as any);
        break;
      case 'addPhoto': void addPhoto((msg.pose as PhotoPose) || 'front'); break;
    }
  }, [push, load, router, addPhoto]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <WebView
        ref={webRef}
        source={PROGRESS_HTML}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={PROGRESS_BEFORE}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={[styles.web, { opacity: ready ? 1 : 0 }]}
        scrollEnabled
        bounces={false}
        overScrollMode="never"
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eeeef1' },
  web:  { flex: 1, backgroundColor: '#eeeef1' },
});
