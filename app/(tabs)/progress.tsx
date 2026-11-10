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
import { View, StyleSheet, Modal, Pressable, Image, Animated } from 'react-native';
import { useRevealFade } from '../../lib/useRevealFade';
import { createTabLag } from '../../lib/tabLag';
import { tabBarCover } from '../../lib/tabBarMetrics';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { CONSOLE_FORWARD_JS, DC_VIEWPORT_JS, DC_NO_ZOOM_JS, DC_SETTLE_JS } from '../../lib/dcWebviewHelpers';
import { dcLogicPatchJs, athltSetDataJs } from '../../lib/dcLogicPatch';
import { PROGRESS_LOGIC_EXT, PROGRESS_DOM_JS } from '../../lib/progressInject';
import { getAllSessions, computeMuscleTiers, TIER_ORDER } from '../../lib/sessionLog';
import { getWeightLog, logWeight } from '../../lib/weightLog';
import { buildProgressData, type ProgressData } from '../../lib/progressData';
import { tierDataUri } from '../../lib/rankImages';
import { muscleIconUri } from '../../lib/muscleIcons';
import { workoutFrame, workoutFallbackIcon } from '../../lib/workoutThumbs';
import { openRecap } from '../../lib/openRecap';
import { listProgressPhotos, addProgressPhoto, type PhotoPose } from '../../lib/progressPhotos';
import { uploadProgressPhotoToCloud } from '../../lib/formpalSync';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, Share } from 'react-native';
import type { Muscle } from '../../constants/exercises';
import type { Tier } from '../../lib/sessionLog';

const PROGRESS_HTML = require('../../assets/app screens/progress.html');
const PROGRESS_BUILD = 'progress-3';
if (__DEV__) console.log(`[progress] build ${PROGRESS_BUILD}`);

const PROGRESS_BEFORE = DC_VIEWPORT_JS + DC_NO_ZOOM_JS + CONSOLE_FORWARD_JS + DC_SETTLE_JS + dcLogicPatchJs(PROGRESS_LOGIC_EXT) + PROGRESS_DOM_JS;

export default function ProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const { fade, onReady, onLoadStart, onLoadEnd } = useRevealFade(m => { if (__DEV__) console.log('[PROGRESS]', m); });
  const dataRef = useRef<ProgressData | null>(null);
  const lag = useRef(createTabLag('progress')).current;
  const artReady = useRef(false);   // the rank emblem + muscle icons are in the data (the first picture needs them)
  const inflight = useRef<Promise<void> | null>(null);
  const firstShown = useRef(true);
  const photosRef = useRef<{ id: string; uri: string }[]>([]);
  const [viewing, setViewing] = useState<string | null>(null); // file uri of the photo shown full screen

  const push = useCallback(() => {
    if (dataRef.current) webRef.current?.injectJavaScript(athltSetDataJs(dataRef.current));
  }, []);

  const load = useCallback(async () => {
    const [sessions, weights, photos] = await Promise.all([getAllSessions(), getWeightLog(), listProgressPhotos()]);
    photosRef.current = photos.map(p => ({ id: p.id, uri: p.uri }));
    const tiers = computeMuscleTiers(sessions);
    const data = buildProgressData(sessions, tiers, weights, Date.now(), { insets: { top: insets.top, bottom: insets.bottom, tabCover: tabBarCover(insets.bottom) }, photos });
    // Keep art we already fetched so a refresh never blanks it.
    const prev = dataRef.current;
    if (prev) {
      data.rank.emblem = prev.rank.tier === data.rank.tier ? prev.rank.emblem : null;
      data.ladder.forEach((l, i) => { l.img = prev.ladder[i]?.img ?? null; });
      data.muscles.forEach((m) => { const pm = prev.muscles.find(x => x.key === m.key); if (pm && pm.tier === m.tier) m.icon = pm.icon; });
      data.workouts.forEach((w) => { const pw = prev.workouts.find(x => x.ts === w.ts); w.thumb = pw?.thumb ?? null; w.fallback = pw?.fallback ?? null; });
    }
    dataRef.current = data;
    // First open: the rank emblem and muscle icons are part of the first picture, so they are fetched
    // BEFORE the first push (the page only reveals itself once it has been filled), instead of popping
    // in a moment after the page is already showing. Refreshes reuse the art fetched earlier.
    const [cur, icons] = await Promise.all([
      prev && data.rank.emblem ? Promise.resolve(data.rank.emblem) : tierDataUri(data.rank.tier ?? 'bronze'),
      Promise.all(data.muscles.map(m => (prev && m.icon ? Promise.resolve(m.icon) : muscleIconUri(m.key as Muscle, (m.tier ?? 'silver') as Tier)))),
    ]);
    if (dataRef.current !== data) return;
    if (cur) data.rank.emblem = cur;
    data.muscles.forEach((m, i) => { m.icon = icons[i]; });
    artReady.current = true;
    lag.mark('dataReady');
    push();
    // Below-the-fold art arrives afterwards: ladder, video frames.
    const imgs = await Promise.all(TIER_ORDER.map(t => tierDataUri(t)));
    if (dataRef.current === data) { data.ladder.forEach((l, i) => { l.img = imgs[i]; }); push(); }
    // Every past workout gets a picture. A workout with no saved video (or one whose clip is gone)
    // falls back to the icon of the muscle it worked most, so no card is ever a black box.
    const wIcons = await Promise.all(data.workouts.map(w => workoutFallbackIcon(w.muscle, tiers[w.muscle as Muscle]?.tier)));
    if (dataRef.current === data) { data.workouts.forEach((w, i) => { if (wIcons[i]) w.fallback = wIcons[i]; }); push(); }
    // each workout owns the videos logged since the previous (older) workout ended
    const prevTsOf = (w: { ts: number }) => { const i = data.workouts.findIndex(x => x.ts === w.ts); return data.workouts[i + 1]?.ts ?? 0; };
    const frameOf = (w: { ts: number }) => workoutFrame(w.ts, prevTsOf(w));
    // the carousel's 8 first, then the rest of the list
    for (const [from, to] of [[0, 8], [8, data.workouts.length]]) {
      const frames = await Promise.all(data.workouts.slice(from, to).map(frameOf));
      if (dataRef.current !== data) break;
      frames.forEach((f, i) => { if (f) data.workouts[from + i].thumb = f; });
      push();
    }
  }, [push, lag, insets.top, insets.bottom]);

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

  // Prepared when the screen MOUNTS (app launch): the data AND the art it needs (rank emblem, muscle icons, which are file
  // reads) are ready before the tab is ever opened, so the first open only hands the page what is already there. Two
  // loads never run at once: a focus while one is running just waits for it.
  const prefetch = useCallback(() => {
    if (!inflight.current) inflight.current = load().catch(() => {}).finally(() => { inflight.current = null; });
    return inflight.current;
  }, [load]);
  useEffect(() => { lag.mark('mount'); void prefetch(); }, [prefetch, lag]);
  useFocusEffect(useCallback(() => {
    lag.mark('shown');
    if (firstShown.current) { firstShown.current = false; if (dataRef.current && artReady.current) push(); }
    void prefetch();
  }, [prefetch, push, lag]));

  const onMessage = useCallback((raw: string) => {
    let msg: { type?: string; dateKey?: string; weightLb?: number; ts?: number; msg?: string; pose?: string };
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'ready': lag.mark('ready'); onReady(); break;
      case 'pageConsole': if (__DEV__) console.log('[progress-page]', msg.msg); break;
      // (the first picture needs the art: until it is in, load() pushes the moment it is, so no half-filled first paint)
      case 'needData': lag.mark('asked'); if (artReady.current) { lag.mark('pushed'); push(); } break;
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
        if (msg.ts != null) openRecap(router, msg.ts);
        break;
      case 'share': {
        const r = dataRef.current?.rank;
        const message = r?.has
          ? `I'm ${r.label} on FormPal${r.streak > 0 ? ` with a ${r.streak}-day streak` : ''}. Form-checked reps, ranked by muscle.`
          : "I'm training with FormPal: form-checked reps, ranked by muscle.";
        Share.share({ message }).catch(() => {});
        break;
      }
      case 'viewPhoto': { const hit = photosRef.current.find(p => p.id === (msg as any).id); if (hit) setViewing(hit.uri); break; }
      case 'addPhoto': void addPhoto((msg.pose as PhotoPose) || 'front'); break;
    }
  }, [push, load, router, addPhoto, lag]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Animated.View style={{ flex: 1, opacity: fade }}>
      <WebView
        ref={webRef}
        source={PROGRESS_HTML}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={PROGRESS_BEFORE}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        onLoadStart={() => { lag.mark('loadStart'); onLoadStart(); }}
        onLoadEnd={() => { lag.mark('loadEnd'); onLoadEnd(); }}
        style={styles.web}
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
      </Animated.View>
      <Modal visible={viewing != null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)}>
          {viewing ? <Image source={{ uri: viewing }} style={styles.viewerImg} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eeeef1' },
  web:  { flex: 1, backgroundColor: '#eeeef1' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '100%' },
});
