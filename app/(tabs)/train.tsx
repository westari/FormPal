/**
 * app/(tabs)/train.tsx — Train tab
 *
 * Renders assets/traintab.html VERBATIM in a WebView (same approach as the
 * onboarding screens). The mockup's own fake chrome — status bar, bottom
 * nav, home indicator, blur-blob backdrop — is hidden by injected CSS; the
 * real AppBackground shows through the transparent WebView, and the real tab
 * bar sits below. Taps on the practice cards and the plan CTA are bridged
 * back out to the app's navigation.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import AppBackground from '../../components/AppBackground';
import { loadPlan } from '../../lib/planStorage';
import { getAllSessions } from '../../lib/sessionLog';
import type { Plan } from '../../types/plan';

const TRAIN_HTML = require('../../assets/app screens/traintab.html');

// Practice-card label → CV exercise id.
const PRACTICE_MAP: Record<string, string> = {
  'push-ups': 'pushup',
  'squats':   'squat',
  'pull-ups': 'pullup',
  'lunges':   'lunge',
};

const TRAIN_WEB_INJECT = `
(function () {
  function post(m) { try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
  function btnFor(el) {
    for (var i = 0; el && i < 7; i++, el = el.parentElement) {
      if (!el.getAttribute) continue;
      if (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON') return el;
    }
    return null;
  }
  document.addEventListener('pointerdown', function (e) { if (btnFor(e.target)) post('__tap'); }, true);
  document.addEventListener('touchstart', function (e) { if (btnFor(e.target)) post('__tap'); }, true);
  document.addEventListener('click', function (e) {
    var b = btnFor(e.target);
    if (!b) return;
    var oc = b.getAttribute('sc-camel-on-click') || '';
    // Hero "Start" (goPlan) and the plan-view back arrow (goHome) are the
    // mockup's own internal view switch — let its handler run, don't leave.
    if (/goPlan|goHome/.test(oc)) return;
    var t = (b.textContent || '').replace(/\\s+/g, ' ').trim();
    // Plan-view CTA
    if (/^Begin first exercise/i.test(t)) return post('begin');
    // A practice card: it carries an exercise name in its text
    if (b.getAttribute('data-glass') === 'panel') {
      var name = t.toLowerCase();
      var keys = ['push-ups','pull-ups','squats','lunges'];
      for (var i = 0; i < keys.length; i++) {
        if (name.indexOf(keys[i]) >= 0) return post('practice:' + keys[i]);
      }
    }
  }, true);

  var CARD = 'div[style*="width: 472px"][style*="height: 1024px"]';
  var WRAP = 'div[style*="min-height: 100vh"][style*="padding: 40px 24px"]';
  var CSS = ''
    + 'html{margin:0!important;padding:0!important;background:transparent!important;overflow:hidden!important;height:100%!important;width:100%!important;}'
    + 'body{margin:0!important;padding:0!important;background:transparent!important;overflow:hidden!important;}'
    + WRAP + '{min-height:1024px!important;height:1024px!important;padding:0!important;display:block!important;background:transparent!important;overflow:hidden!important;}'
    + CARD + '{width:472px!important;height:1024px!important;border-radius:0!important;box-shadow:none!important;margin:0!important;background:transparent!important;}'
    // fake iOS status bar
    + 'div[style*="padding: 22px 34px 0"]{display:none!important;}'
    // fake bottom nav row + home indicator (whole block)
    + 'div[style*="padding: 14px 30px 0"]{display:none!important;}'
    // the mockup's own animated blur-blob backdrop — AppBackground replaces it
    + 'div[style*="filter: blur(52px)"]{display:none!important;}'
    + 'svg{will-change:transform;}';

  function ensure() {
    if (document.getElementById('__rn_css')) return;
    var s = document.createElement('style');
    s.id = '__rn_css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function fit() {
    ensure();
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return;
    var S = Math.min(vw / 472, vh / 1024);
    var b = document.body;
    if (!b || b.__rnFit === S) return;
    b.__rnFit = S;
    b.style.setProperty('width', '472px', 'important');
    b.style.setProperty('height', '1024px', 'important');
    b.style.setProperty('position', 'absolute', 'important');
    b.style.setProperty('top', '0', 'important');
    b.style.setProperty('left', Math.round((vw - 472 * S) / 2) + 'px', 'important');
    b.style.setProperty('transform', 'scale(' + S + ')', 'important');
    b.style.setProperty('transform-origin', 'top left', 'important');
  }
  fit();
  var deb;
  var obs = new MutationObserver(function () { clearTimeout(deb); deb = setTimeout(fit, 120); });
  obs.observe(document, { childList: true, subtree: true });
  window.addEventListener('resize', fit);
  [30, 120, 320, 700, 1400].forEach(function (d) { setTimeout(fit, d); });
  setTimeout(function () { obs.disconnect(); }, 2000);
  true;
})();
`;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 24 * 60 * 60 * 1000;

function timeAgoLabel(ts: number | null): string {
  if (ts == null) return 'Never checked';
  const days = Math.floor((Date.now() - ts) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

// Builds the exact-text-replace MAP for traintab.html's hardcoded demo
// strings — real default text confirmed by reading the unpacked file
// (.scratch/unpacked-designs/traintab.html), never guessed. The 4
// "Practice your form" cards are fixed static markup (not a data-driven
// list in the design), so real data goes into those exact 4 slots.
function buildTrainDataJs(plan: Plan | null, sessions: { exerciseId: string; pct: number; ts: number; formChecked?: boolean }[]): string {
  const map: Record<string, string> = {};

  if (plan && plan.workouts.length > 0) {
    const w = plan.workouts[plan.currentWorkoutIndex] ?? plan.workouts[0];
    const today = new Date();
    map['Sunday · Day 12'] = `${WEEKDAYS[today.getDay()]} · Day ${plan.currentWorkoutIndex + 1}`;
    map['Session 2 of 3'] = `Session ${plan.currentWorkoutIndex + 1} of ${plan.workouts.length}`;
    map['Upper body'] = w.splitLabel;
    const totalSets = w.exercises.reduce((a, e) => a + e.targetSets, 0);
    map['5 lifts · 18 sets'] = `${w.exercises.length} lift${w.exercises.length === 1 ? '' : 's'} · ${totalSets} sets`;
  }

  const byExercise: Record<string, { pct: number; ts: number }[]> = {};
  for (const s of sessions) {
    if (s.formChecked === false) continue;
    (byExercise[s.exerciseId] ??= []).push({ pct: s.pct, ts: s.ts });
  }
  const cards: { demoScore: string; demoWhen: string; exerciseId: string }[] = [
    { demoScore: '94 form', demoWhen: '2 days ago', exerciseId: 'pushup' },
    { demoScore: '81 form', demoWhen: 'Yesterday', exerciseId: 'squat' },
    { demoScore: 'New', demoWhen: 'Never checked', exerciseId: 'pullup' },
    { demoScore: '88 form', demoWhen: '5 days ago', exerciseId: 'lunge' },
  ];
  for (const c of cards) {
    const hist = byExercise[c.exerciseId];
    if (hist && hist.length > 0) {
      hist.sort((a, b) => b.ts - a.ts);
      const avgPct = Math.round(hist.reduce((a, h) => a + h.pct, 0) / hist.length);
      map[c.demoScore] = `${avgPct} form`;
      map[c.demoWhen] = timeAgoLabel(hist[0].ts);
    } else {
      map[c.demoWhen] = 'Never checked';
      // demoScore ('New'/'81 form' etc.) stays — "New" is already correct
      // for a never-done exercise; the two cards whose demo score isn't
      // literally "New" would otherwise keep a fabricated number, so map
      // those down to "New" too when there's no real data.
      if (c.demoScore !== 'New') map[c.demoScore] = 'New';
    }
  }

  return `(function(){
    var MAP = ${JSON.stringify(map)};
    function apply(){
      var hit = 0;
      var all = document.querySelectorAll('div');
      for (var i=0;i<all.length;i++){
        var el = all[i]; if (el.children.length) continue;
        var t = (el.textContent||'').trim();
        if (Object.prototype.hasOwnProperty.call(MAP, t)) { el.textContent = MAP[t]; hit++; }
      }
      return hit;
    }
    if (!apply()) { [100,300,700,1500].forEach(function(d){ setTimeout(apply, d); }); }
  })();`;
}

export default function TrainScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const [dataJs, setDataJs] = useState('');
  const [pageLoaded, setPageLoaded] = useState(false);
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    const a = Animated.timing(fade, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => {
    Promise.all([loadPlan(), getAllSessions()]).then(([plan, sessions]) => {
      setDataJs(buildTrainDataJs(plan, sessions));
    }).catch(() => {});
  }, []));

  // injectedJavaScript only runs on the page's initial load — dataJs
  // arrives later (async storage reads), so it's pushed in imperatively
  // once BOTH the page has loaded and the real data is ready, whichever
  // comes last.
  useEffect(() => {
    if (pageLoaded && dataJs) webRef.current?.injectJavaScript(dataJs + '; true;');
  }, [pageLoaded, dataJs]);

  function onMsg(m: string) {
    if (m === '__tap') { Haptics.selectionAsync(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (m === 'begin') { router.push('/workout' as any); return; }
    if (m.startsWith('practice:')) {
      const id = PRACTICE_MAP[m.slice('practice:'.length)];
      if (id) router.push(`/formcheck?exercise=${id}` as any);
    }
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <AppBackground />
      <Animated.View style={{ flex: 1, marginTop: insets.top, opacity: fade }}>
        <WebView
          ref={webRef}
          source={TRAIN_HTML as any}
          originWhitelist={['*']}
          injectedJavaScript={TRAIN_WEB_INJECT}
          onLoadEnd={() => setPageLoaded(true)}
          onMessage={(e) => onMsg(e.nativeEvent.data)}
          style={s.web}
          opaque={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          androidLayerType="hardware"
          setSupportMultipleWindows={false}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
        />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF1F8' },
  web:  { flex: 1, backgroundColor: 'transparent' },
});
