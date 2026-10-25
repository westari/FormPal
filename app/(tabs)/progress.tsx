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

const PROGRESS_HTML = require('../../assets/app screens/progress.html');
const PROGRESS_BUILD = 'progress-2';
if (__DEV__) console.log(`[progress] build ${PROGRESS_BUILD}`);

const PROGRESS_BEFORE = DC_VIEWPORT_JS + CONSOLE_FORWARD_JS + dcLogicPatchJs(PROGRESS_LOGIC_EXT) + PROGRESS_DOM_JS;

export default function ProgressScreen() {
  const router = useRouter();
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
    const [sessions, weights] = await Promise.all([getAllSessions(), getWeightLog()]);
    const data = buildProgressData(sessions, computeMuscleTiers(sessions), weights);
    // Keep any emblem art we already fetched so a refresh never blanks it.
    const prev = dataRef.current;
    if (prev) {
      data.rank.emblem = prev.rank.tier === data.rank.tier ? prev.rank.emblem : null;
      data.ladder.forEach((l, i) => { l.img = prev.ladder[i]?.img ?? null; });
    }
    dataRef.current = data;
    push();
    // Emblem for the rank card first (small), then the ladder art.
    const cur = await tierDataUri(data.rank.tier ?? 'bronze');
    if (dataRef.current === data && cur) { data.rank.emblem = cur; push(); }
    const imgs = await Promise.all(TIER_ORDER.map(t => tierDataUri(t)));
    if (dataRef.current === data) { data.ladder.forEach((l, i) => { l.img = imgs[i]; }); push(); }
  }, [push]);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const onMessage = useCallback((raw: string) => {
    let msg: { type?: string; dateKey?: string; weightLb?: number; ts?: number; msg?: string };
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
      case 'photos':
        router.push({ pathname: '/progress-photo-screen', params: { variant: 'first', dest: '/(tabs)/progress' } } as any);
        break;
    }
  }, [push, load, router]);

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
