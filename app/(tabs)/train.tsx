/**
 * app/(tabs)/train.tsx — Train tab
 *
 * Renders assets/app screens/traintab.html in a WebView. The mockup's own
 * fake chrome (status bar, bottom nav, home indicator, blur-blob backdrop) is
 * hidden by injected CSS; the real AppBackground shows through the
 * transparent WebView, and the real tab bar sits below.
 *
 * ROBUSTNESS (the "Train tab doesn't work on my phone" fix): the design ships
 * as a self-extracting bundle that REPLACES the whole <html> element some
 * time after the page's `load` event — on a phone that can be several
 * seconds. The old version injected its CSS/scale once at `load` and stopped
 * watching after 2s, so a slow unpack lost the CSS + scale for good (fake
 * status bar, unscaled page, wrong layout). Now everything is installed in
 * injectedJavaScriptBeforeContentLoaded with a observer that never stops
 * (re-applies after the swap, and after every remount), the WebView stays
 * hidden until the page reports it's really ready, and the plan view's
 * exercise list is real data via lib/dcLogicPatch.ts instead of the mockup's
 * hard-coded "Incline press / Cable fly / ..." demo list.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import AppBackground from '../../components/AppBackground';
import { DC_VIEWPORT_JS } from '../../lib/dcWebviewHelpers';
import { dcLogicPatchJs, athltSetDataJs } from '../../lib/dcLogicPatch';
import { loadPlan } from '../../lib/planStorage';
import { getAllSessions, computeMuscleTiers } from '../../lib/sessionLog';
import { computeOverallStanding } from '../../components/MuscleTierMap';
import { tierDataUri } from '../../lib/rankImages';
import { exerciseMode } from '../../constants/exerciseDefinitions';
import type { Plan } from '../../types/plan';

const TRAIN_HTML = require('../../assets/app screens/traintab.html');
const TRAIN_BUILD = 'train-2';
if (__DEV__) console.log(`[train] build ${TRAIN_BUILD}`);

// Practice-card label → CV exercise id.
const PRACTICE_MAP: Record<string, string> = {
  'push-ups': 'pushup',
  'squats':   'squat',
  'pull-ups': 'pullup',
  'lunges':   'lunge',
};

// Subclass of the design's own logic: the plan view's exercise list is real.
// (Verified: `workout` is the only data-driven list in this design — the hero
// and the 4 practice cards are static markup, handled by the text map below.)
const TRAIN_LOGIC_EXT = `function (Orig) {
  return class extends Orig {
    renderVals() {
      var v = super.renderVals();
      var D = window.__athltData;
      if (D && D.workout) v.workout = D.workout;
      return v;
    }
  };
}`;

const TRAIN_WEB_INJECT = `
(function () {
  if (window.__trainInstalled) return;
  window.__trainInstalled = true;
  function post(m) { try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
  function btnFor(el) {
    for (var i = 0; el && i < 7; i++, el = el.parentElement) {
      if (!el.getAttribute) continue;
      if (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON') return el;
    }
    return null;
  }
  document.addEventListener('pointerdown', function (e) { if (btnFor(e.target)) post('__tap'); }, true);
  document.addEventListener('click', function (e) {
    var b = btnFor(e.target);
    if (!b) return;
    var t = (b.textContent || '').replace(/\\s+/g, ' ').trim();
    // Plan-view CTA
    if (/^Begin first exercise/i.test(t)) return post('begin');
    // A practice card: it carries an exercise name in its text. (The hero
    // "Start" and the plan back-arrow are the mockup's own view switch — they
    // match nothing here, so the mockup's handler runs untouched.)
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
    var host = document.head || document.documentElement;
    if (!host) return; // before-content-loaded: the document may not exist yet
    var s = document.createElement('style');
    s.id = '__rn_css';
    s.textContent = CSS;
    host.appendChild(s);
  }
  function fit() {
    ensure();
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return false;
    var S = Math.min(vw / 472, vh / 1024);
    var b = document.body;
    if (!b) return false;
    if (b.__rnFit !== S) {
      b.__rnFit = S;
      b.style.setProperty('width', '472px', 'important');
      b.style.setProperty('height', '1024px', 'important');
      b.style.setProperty('position', 'absolute', 'important');
      b.style.setProperty('top', '0', 'important');
      b.style.setProperty('left', Math.round((vw - 472 * S) / 2) + 'px', 'important');
      b.style.setProperty('transform', 'scale(' + S + ')', 'important');
      b.style.setProperty('transform-origin', 'top left', 'important');
    }
    return true;
  }

  // Exact-text replace of the mockup's hard-coded demo strings. Idempotent and
  // re-run on every DOM change, because a view switch remounts the static
  // markup with its demo text again.
  function applyMap() {
    var D = window.__athltData;
    if (!D || !D.map) return 0;
    var MAP = D.map, hit = 0;
    var all = document.querySelectorAll('div');
    for (var i = 0; i < all.length; i++) {
      var el = all[i]; if (el.children.length) continue;
      var t = (el.textContent || '').trim();
      if (Object.prototype.hasOwnProperty.call(MAP, t) && el.textContent !== MAP[t]) { el.textContent = MAP[t]; hit++; t = MAP[t]; }
      // The score pill's colour is part of the demo too (amber on a card that now says "New", etc).
      var m = /^(\\d+) form$/.exec(t);
      if (m) el.style.setProperty('color', +m[1] >= 85 ? '#0A9D5A' : '#C08A21');
      else if (t === 'New') el.style.setProperty('color', 'rgba(26,26,28,0.5)');
    }
    // Hero shield: the mockup ships a silver one for everyone — swap in the user's real rank art
    // (faded when they have no rank yet; hidden rather than wrong if the art couldn't load).
    var sh = document.querySelector('img[data-shield]');
    if (sh && D.shield) {
      if (D.shield.src) {
        if (sh.__shieldSrc !== D.shield.src) { sh.__shieldSrc = D.shield.src; sh.setAttribute('src', D.shield.src); }
        sh.setAttribute('alt', D.shield.alt || '');
        // filter, not opacity: the mockup's own entrance animation owns opacity (fill-mode both) and would override it
        sh.style.setProperty('filter', D.shield.ranked ? '' : 'opacity(0.4)');
        sh.style.setProperty('visibility', 'visible');
      } else {
        sh.style.setProperty('visibility', 'hidden');
      }
    } else if (sh) {
      sh.style.setProperty('visibility', 'hidden'); // no data yet: never flash the silver demo shield
    }
    return hit;
  }

  var reported = false, lastAsk = 0;
  function tick() {
    var ok = fit();
    applyMap();
    // Native's first push can land before this document exists (and be lost) —
    // so the page asks until it has data.
    if (!window.__athltData && Date.now() - lastAsk > 700) { lastAsk = Date.now(); post('need-data'); }
    // Ready = real layout exists, the logic swap + data landed, and the hero is mounted.
    if (!reported && ok && window.__athltData && window.__athltLogicReady && document.querySelector('[data-glass="hero"]')) {
      reported = true;
      post('ready');
    }
  }
  var deb;
  function schedule() { clearTimeout(deb); deb = setTimeout(tick, 60); }
  try { new MutationObserver(schedule).observe(document, { childList: true, subtree: true }); } catch (e) {}
  window.addEventListener('resize', schedule);
  window.__trainTick = tick;
  setInterval(tick, 400);
  tick();
})();
true;
`;

// The train bridge posts plain strings ('__tap', 'begin', 'practice:x',
// 'ready'); dcLogicPatch posts JSON status — both arrive in onMsg.
const TRAIN_BEFORE = DC_VIEWPORT_JS + dcLogicPatchJs(TRAIN_LOGIC_EXT) + TRAIN_WEB_INJECT;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 24 * 60 * 60 * 1000;

function timeAgoLabel(ts: number | null): string {
  if (ts == null) return 'Never checked';
  const days = Math.floor((Date.now() - ts) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

interface TrainData {
  map: Record<string, string>;
  workout: { n: string; name: string; sets: string; tag: string; tagColor: string }[];
  shield: { src: string | null; alt: string; ranked: boolean };
}

// Real default text confirmed by reading the unpacked file
// (.scratch/unpacked-designs/traintab.html), never guessed. The 4 "Practice
// your form" cards are fixed static markup, so real data goes into those 4 slots.
function buildTrainData(
  plan: Plan | null,
  sessions: { exerciseId: string; pct: number; ts: number; formChecked?: boolean }[],
  shield: TrainData['shield'],
): TrainData {
  const map: Record<string, string> = {};
  const today = new Date();
  const workout: TrainData['workout'] = [];

  const w = plan && plan.workouts.length > 0 ? (plan.workouts[plan.currentWorkoutIndex] ?? plan.workouts[0]) : null;
  if (plan && w) {
    const totalSets = w.exercises.reduce((a, e) => a + e.targetSets, 0);
    const mins = Math.max(10, Math.round(w.exercises.reduce((a, e) => a + e.targetSets * (e.restSeconds + 40), 0) / 60));
    map['Sunday · Day 12'] = `${WEEKDAYS[today.getDay()]} · Day ${plan.currentWorkoutIndex + 1}`;
    map['Session 2 of 3'] = `Session ${plan.currentWorkoutIndex + 1} of ${plan.workouts.length}`;
    map['Upper body'] = w.splitLabel;
    map['5 lifts · 18 sets'] = `${w.exercises.length} lift${w.exercises.length === 1 ? '' : 's'} · ${totalSets} sets`;
    map['Upper body · Push'] = w.splitLabel;
    map['5 exercises · 18 sets · 32 min'] = `${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'} · ${totalSets} sets · ${mins} min`;
    w.exercises.forEach((e, i) => {
      const fc = exerciseMode(e.exerciseId) === 'formCheck';
      workout.push({
        n: String(i + 1),
        name: e.displayName,
        sets: `${e.targetSets} × ${e.targetReps}`,
        tag: fc ? 'Form check' : '',
        tagColor: '#007AFF',
      });
    });
  } else {
    // No plan yet — empty state instead of the mockup's fake "Upper body".
    map['Sunday · Day 12'] = WEEKDAYS[today.getDay()];
    map['Session 2 of 3'] = '';
    map['Upper body'] = 'No plan yet';
    map['5 lifts · 18 sets'] = 'Build a plan to get started';
    map['Upper body · Push'] = '';
    map['5 exercises · 18 sets · 32 min'] = '';
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
      if (c.demoScore !== 'New') map[c.demoScore] = 'New';
    }
  }
  return { map, workout, shield };
}

export default function TrainScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const webRef = useRef<WebView>(null);
  const [revealed, setRevealed] = useState(false);
  const dataJsRef = useRef<string | null>(null);

  // Show only once the page says it's genuinely laid out + wired (or after a
  // 7s safety net so a missing signal can never leave a blank tab).
  useEffect(() => {
    if (!revealed) return;
    const a = Animated.timing(fade, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 7000);
    return () => clearTimeout(t);
  }, []);

  useFocusEffect(useCallback(() => {
    Promise.all([loadPlan(), getAllSessions()]).then(async ([plan, sessions]) => {
      const standing = computeOverallStanding(computeMuscleTiers(sessions));
      const tier = standing?.tier ?? null;
      const src = await tierDataUri(tier ?? 'bronze');
      const label = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Unranked';
      dataJsRef.current = athltSetDataJs(buildTrainData(plan, sessions, { src, alt: label, ranked: !!tier }));
      webRef.current?.injectJavaScript(dataJsRef.current);
    }).catch(() => {});
  }, []));

  function onMsg(raw: string) {
    if (raw === '__tap') { Haptics.selectionAsync(); return; }
    if (raw === 'ready') { setRevealed(true); return; }
    if (raw === 'need-data') { if (dataJsRef.current) webRef.current?.injectJavaScript(dataJsRef.current); return; }
    if (raw.startsWith('{')) return; // lib/dcLogicPatch's own JSON status posts
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (raw === 'begin') { router.push('/workout' as any); return; }
    if (raw.startsWith('practice:')) {
      const id = PRACTICE_MAP[raw.slice('practice:'.length)];
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
          injectedJavaScriptBeforeContentLoaded={TRAIN_BEFORE}
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
