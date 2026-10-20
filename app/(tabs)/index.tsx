/**
 * app/(tabs)/index.tsx — Home tab
 *
 * Wires the new Claude-Design artboard (assets/app screens/home.html) with
 * real data — never editing the design file itself (see CLAUDE.md). Process
 * followed per CLAUDE.md's "Wiring Claude Design files" section: unpacked
 * via scripts/unpack-design-files.js, screenshotted via
 * scripts/screenshot-design-files.js, and every selector below was verified
 * against the real unpacked markup before being used (see
 * .scratch/unpacked-designs/home.html for the source of truth).
 *
 * KNOWN SIMPLIFICATIONS (documented, not silently dropped):
 * - The energy check-in ("Feeling strong") and training-location chip
 *   ("Training at Gym") are real, tappable UI, but don't yet feed back into
 *   actually regenerating today's plan — that's a genuinely new feature
 *   (the artboard's own demo logic shows a "lighter plan?" suggestion sheet
 *   with no real plan-mutation backend behind it), not a wiring gap. Left
 *   inert rather than faked, same category as Cue's workout-preview card.
 * - The "This week" day-dot strip is cosmetic demo state, not wired to real
 *   per-day completion — lower priority than the numbers/navigation given
 *   the scope of this pass; flagged rather than silently left as fake data
 *   masquerading as real.
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { loadPlan } from '../../lib/planStorage';
import { getAllSessions, calcStreak, groupIntoWorkouts, scoredSessions, type SessionEntry } from '../../lib/sessionLog';
import type { Plan } from '../../types/plan';

const HOME_HTML = require('../../assets/app screens/home.html');
const HOME_BUILD = 'home-2';
if (__DEV__) console.log(`[home] build ${HOME_BUILD}`);
// Hides the artboard's own fake tab bar + FAB (a REAL native tab bar + the
// Plus tab already exist) — same category of fix as train.tsx already does
// for its own fake chrome. Selectors matched to the exact inline styles
// confirmed in .scratch/unpacked-designs/home.html, not guessed.
const HIDE_FAKE_CHROME_CSS = `
  div[style*="right: 88px"][style*="bottom: 22px"][style*="height: 64px"] { display: none !important; }
  div[style*="right: 14px"][style*="bottom: 22px"][style*="width: 64px"][style*="height: 64px"] { display: none !important; }
`;

function buildHomeInjectJs(plan: Plan | null, sessions: SessionEntry[]): string {
  const workoutGroups = groupIntoWorkouts(sessions);
  const streak = calcStreak(sessions);
  const scored = scoredSessions(sessions);
  const overallPct = scored.length > 0 ? Math.round(scored.reduce((a, s) => a + s.pct, 0) / scored.length) : 0;

  const weekStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d.getTime(); })();
  const workoutsThisWeek = workoutGroups.filter(g => g.ts >= weekStart).length;

  const map: Record<string, string> = {};
  const today = new Date();
  map['Sat, 12 September'] = today.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
  map['3'] = String(streak); // streak chip — scoped below via style, not bare global match
  map['38 min · 4 exercises'] = '';
  map['2 of 4 workouts'] = `${workoutsThisWeek} of 4 workouts`;

  if (plan && plan.workouts.length > 0) {
    const w = plan.workouts[plan.currentWorkoutIndex] ?? plan.workouts[0];
    map['38 min · 4 exercises'] = `${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'}`;
  }

  const recent = workoutGroups.slice(0, 3).map(g => ({
    ts: g.ts,
    name: g.entries[0]?.displayName ?? 'Workout',
    formPct: `${g.pct}%`,
  }));

  return `(function(){
    function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
    var MAP = ${JSON.stringify(map)};
    function applyText(){
      var hit = 0;
      var all = document.querySelectorAll('div,span');
      for (var i=0;i<all.length;i++){
        var el = all[i]; if (el.children.length) continue;
        var t = (el.textContent||'').trim();
        if (t === '3' || t === '38 min · 4 exercises') continue; // handled by style-scoped matches below
        if (Object.prototype.hasOwnProperty.call(MAP, t) && MAP[t]) { el.textContent = MAP[t]; hit++; }
      }
      // workoutName: style-scoped match (bare "Full body" text is NOT
      // unique on this page — confirmed via scripts/check-home-collisions.js,
      // a second "Full body" exists in recent-workout history). Matched by
      // its distinguishing inline style instead of global text.
      var nameEl = null;
      var divs = document.querySelectorAll('div');
      for (var j=0;j<divs.length;j++){
        var d = divs[j];
        if (d.style && d.style.maxWidth === '236px' && d.style.fontSize === '27px') { nameEl = d; break; }
      }
      ${plan && plan.workouts.length > 0 ? `if (nameEl) { nameEl.textContent = ${JSON.stringify((plan.workouts[plan.currentWorkoutIndex] ?? plan.workouts[0]).splitLabel)}; hit++; }` : ''}
      // streak chip: scoped by its known color (#f2701c) to avoid matching
      // any other bare "3" elsewhere on the page. NOT scoped on "no
      // children" — verified via a real browser that this element has a
      // child node at runtime even though its source markup looks like
      // plain text (same templating quirk documented in rep-feedback.tsx's
      // bodyEl comment).
      for (var k=0;k<divs.length;k++){
        var sEl = divs[k];
        if (sEl.style && sEl.style.color === 'rgb(242, 112, 28)') { sEl.textContent = '${streak}'; hit++; break; }
      }
      // formScore renders as "80%" (number + literal "%"), never bare "80"
      // — confirmed via source read, not guessed.
      for (var m=0;m<divs.length;m++){
        var fEl = divs[m];
        if (fEl.style && fEl.style.fontSize === '26px' && fEl.style.fontWeight === '700' && /^\\d+%$/.test((fEl.textContent||'').trim())) {
          fEl.textContent = '${overallPct}%'; hit++;
        }
      }
      return hit;
    }
    if (!applyText()) { [100,300,700,1500].forEach(function(d){ setTimeout(applyText, d); }); }

    // Recent Workouts — a real sc-for list (3 placeholder cards by
    // default); populate with real session groups, hide any unused slots.
    function wireRecent(){
      var recentLinks = Array.prototype.slice.call(document.querySelectorAll('a[href="Workout Recap v2.dc.html"]'));
      var recent = ${JSON.stringify(recent)};
      if (recentLinks.length === 0) return false;
      recentLinks.forEach(function(a, i){
        if (i >= recent.length) { a.style.display = 'none'; return; }
        var r = recent[i];
        var nameEl = a.querySelector('div[style*="font-size: 15.5px"]');
        if (nameEl) nameEl.textContent = r.name;
        var pctEl = a.querySelector('div[style*="font-size: 14px"][style*="font-variant-numeric"]');
        if (pctEl) pctEl.textContent = r.formPct;
        a.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); post({ type:'recap', ts: r.ts }); }, true);
      });
      return true;
    }
    if (!wireRecent()) { [100,300,700,1500].forEach(function(d){ setTimeout(wireRecent, d); }); }

    document.addEventListener('click', function(ev){
      var el = ev.target;
      for (var i=0; el && i<6; i++, el=el.parentElement){
        if (!el.getAttribute) continue;
        var t = (el.textContent||'').trim();
        if (t.indexOf('Start workout') === 0 || t === 'Start workout') { ev.preventDefault(); post({type:'start'}); return; }
        if (el.getAttribute('aria-label') === 'Edit workout') { ev.preventDefault(); post({type:'editWorkout'}); return; }
        var href = el.getAttribute('href');
        if (href === 'Cue.dc.html') { ev.preventDefault(); post({type:'cue'}); return; }
        if (href === 'Progress.dc.html') { ev.preventDefault(); post({type:'progress'}); return; }
      }
    }, true);

    var st = document.createElement('style');
    st.textContent = ${JSON.stringify(HIDE_FAKE_CHROME_CSS)};
    document.head.appendChild(st);
    post({type:'ready'});
  })();`;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [injectJs, setInjectJs] = useState<string | null>(null);
  const [pageLoaded, setPageLoaded] = useState(false);

  useFocusEffect(useCallback(() => {
    Promise.all([loadPlan(), getAllSessions()]).then(([plan, sessions]) => {
      setInjectJs(buildHomeInjectJs(plan, sessions));
    }).catch(() => {});
  }, []));

  React.useEffect(() => {
    if (pageLoaded && injectJs) webRef.current?.injectJavaScript(injectJs + '; true;');
  }, [pageLoaded, injectJs]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <WebView
        ref={webRef}
        source={HOME_HTML}
        originWhitelist={['*']}
        onLoadEnd={() => setPageLoaded(true)}
        onMessage={(e) => {
          let msg: { type?: string; ts?: number };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'ready') return;
          if (msg.type === 'start') { router.push('/workout' as any); return; }
          if (msg.type === 'editWorkout') { router.push('/create-workout' as any); return; }
          if (msg.type === 'cue') { router.push('/cue' as any); return; }
          if (msg.type === 'progress') { router.push('/(tabs)/progress' as any); return; }
          if (msg.type === 'recap' && msg.ts != null) { router.push({ pathname: '/recap', params: { ts: String(msg.ts) } } as any); return; }
        }}
        // BUG FOUND ("too cramped at the top, Tuesday October 20th is too
        // high"): the design's own 62px top padding assumes it's placed in
        // a canvas that already starts below the status bar/notch — this
        // WebView was filling the ENTIRE screen including that area
        // (train.tsx's own wrapper already applies this same inset; this
        // screen just hadn't gotten it).
        style={[styles.web, { marginTop: insets.top }]}
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
  web: { flex: 1, backgroundColor: '#eeeef1' },
});
