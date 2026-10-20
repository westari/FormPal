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
import { DC_VIEWPORT_JS } from '../../lib/dcWebviewHelpers';

const HOME_HTML = require('../../assets/app screens/home.html');
const HOME_BUILD = 'home-3';
if (__DEV__) console.log(`[home] build ${HOME_BUILD}`);

// BUG FOUND (root cause of "glitches at start / white screen", "white
// space fix got undone", "edit sheet still hidden under tab bar" — all
// three traced back to this ONE thing): unlike recap.tsx/rep-feedback.tsx/
// onboarding.tsx's artboards, home.html's canvas has no #dc-root id at all
// — it's a plain div hardcoded to EXACTLY width:390px/height:844px, with
// NO scaling logic of its own. Confirmed directly: even given a 926px-tall
// viewport, it stayed locked at 844px, leaving the real remainder of the
// screen showing whatever's behind the WebView. Every fix in this file
// that reads window.__dcCanvasScale (header padding, edit-sheet position)
// was silently failing this whole time because nothing was ever setting
// it — dcScaleFitJs (which does) assumes #dc-root and was never actually
// wired in for this file. train.tsx already solved this exact problem for
// its own non-#dc-root 472x1024 canvas; this follows the same approach,
// adapted for home.html's 390x844 one.
const HOME_SCALE_FIT_JS = `
(function(){
  function fit(){
    var root = null;
    var all = document.querySelectorAll('div');
    for (var i=0;i<all.length;i++){ if (all[i].style.width === '390px' && all[i].style.height === '844px'){ root = all[i]; break; } }
    if(!root) return;
    var vh = window.innerHeight;
    if(!vh) return;
    var S = vh / 844;
    window.__dcCanvasScale = S;
    root.style.setProperty('position','relative','important');
    root.style.setProperty('margin','0 auto','important');
    root.style.setProperty('transform-origin','top center','important');
    root.style.setProperty('transform','scale(' + S + ')','important');
    document.documentElement.style.setProperty('margin','0','important');
    document.documentElement.style.setProperty('overflow','hidden','important');
    document.body.style.setProperty('margin','0','important');
    document.body.style.setProperty('overflow','hidden','important');
    document.body.style.setProperty('height', vh + 'px','important');
  }
  fit();
  window.addEventListener('resize', fit);
  [0,100,300,600,1000].forEach(function(d){ setTimeout(fit, d); });
})();
true;
`;
// Hides the artboard's own fake tab bar + FAB (a REAL native tab bar + the
// Plus tab already exist) — same category of fix as train.tsx already does
// for its own fake chrome. Selectors matched to the exact inline styles
// confirmed in .scratch/unpacked-designs/home.html, not guessed.
const HIDE_FAKE_CHROME_CSS = `
  div[style*="right: 88px"][style*="bottom: 22px"][style*="height: 64px"] { display: none !important; }
  div[style*="right: 14px"][style*="bottom: 22px"][style*="width: 64px"][style*="height: 64px"] { display: none !important; }
`;

function buildHomeInjectJs(plan: Plan | null, sessions: SessionEntry[], insetTop: number, insetBottom: number): string {
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
    // BUG FOUND ("clear cutoff — colored background then blank white on
    // top, doesn't match"): an RN-level marginTop on the WebView created a
    // gap ABOVE the canvas showing the screen's plain background color,
    // which doesn't match the design's own gradient — a visible seam. The
    // design's gradient should run edge-to-edge behind the status bar/
    // notch like the rest of this app's full-bleed screens; only the
    // actual CONTENT needs pushing down to clear it, via extra padding on
    // the header itself, not an external native gap.
    var INSET_TOP = ${insetTop};
    function pushHeaderDown(){
      var scale = window.__dcCanvasScale;
      if(!scale) return false;
      var all = document.querySelectorAll('div');
      var header = null;
      for (var i=0;i<all.length;i++){ if (all[i].style.paddingTop === '62px') { header = all[i]; break; } }
      if(!header) return false;
      header.style.setProperty('padding-top', (62 + INSET_TOP/scale) + 'px', 'important');
      return true;
    }
    if(!pushHeaderDown()){ [50,150,300,600,1000].forEach(function(d){ setTimeout(pushHeaderDown, d); }); }

    // BUG FOUND ("edit sheet gets put behind the tab bar, bottom cut off,
    // Done button covered"): this app's tab bar is a REAL NATIVE one
    // (expo-router's NativeTabs, a translucent overlay per standard iOS
    // tab bar behavior) — it physically sits on top of the bottom slice of
    // this screen's content, not excluded from it the way a plain View
    // layout would. The edit sheet's own "bottom: 8px" (relative to this
    // 844-unit canvas) lands underneath that real tab bar. insets.bottom
    // (home-indicator safe area) alone isn't enough — ~49px is the
    // standard iOS tab bar's own height on top of that, which safe-area
    // insets don't include since it's a navigation chrome element, not a
    // system inset.
    var INSET_BOTTOM = ${insetBottom};
    var TAB_BAR_ESTIMATE = 49;
    function pushEditSheetUp(){
      var scale = window.__dcCanvasScale;
      if(!scale) return false;
      var divs = document.querySelectorAll('div');
      var sheet = null;
      for (var i=0;i<divs.length;i++){ if (divs[i].style.maxHeight === '620px') { sheet = divs[i]; break; } }
      if(!sheet) return false;
      var extra = (INSET_BOTTOM + TAB_BAR_ESTIMATE) / scale;
      sheet.style.setProperty('bottom', (8 + extra) + 'px', 'important');
      return true;
    }
    if(!pushEditSheetUp()){ [50,150,300,600,1000].forEach(function(d){ setTimeout(pushEditSheetUp, d); }); }
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
        // Explicit ask: the edit (pencil) button should open the design's
        // OWN built-in edit-workout sheet (openEdit/closeEdit/addMove/
        // editToCue — a real bottom sheet with its own Done button), not
        // navigate to a separate native screen. This used to intercept
        // that click and redirect to /create-workout, which both fought
        // the artboard's own handler (both fired off the same click) and
        // wasn't what was wanted anyway — removed, so sc-camel-on-click's
        // own openEdit runs uninterrupted, same as goPlan/goHome elsewhere.
        var href = el.getAttribute('href');
        if (href === 'Cue.dc.html') { ev.preventDefault(); post({type:'cue'}); return; }
        if (href === 'Progress.dc.html') { ev.preventDefault(); post({type:'progress'}); return; }
      }
    }, true);

    var st = document.createElement('style');
    st.textContent = ${JSON.stringify(HIDE_FAKE_CHROME_CSS)};
    document.head.appendChild(st);
    // BUG FOUND ("home tab still glitches when first opening the app"):
    // this screen's WebView was never actually opacity-gated on anything
    // at all — unlike every other screen in this app, it was visible from
    // the moment it loaded, so its own demo content (and the canvas-scale
    // snap already fixed elsewhere) was always shown raw before this
    // script ever got a chance to apply real data. Delaying 'ready' past
    // dcScaleFitJs's own 300ms fit() checkpoint (same fix as recap.tsx/
    // rep-feedback.tsx) and actually using it on the RN side now.
    var SCRIPT_START = Date.now();
    function postReadyWhenStable(){
      var elapsed = Date.now() - SCRIPT_START;
      if(elapsed < 350){ setTimeout(postReadyWhenStable, 350 - elapsed); return; }
      post({type:'ready'});
    }
    postReadyWhenStable();
  })();`;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [injectJs, setInjectJs] = useState<string | null>(null);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [ready, setReady] = useState(false);

  useFocusEffect(useCallback(() => {
    Promise.all([loadPlan(), getAllSessions()]).then(([plan, sessions]) => {
      setInjectJs(buildHomeInjectJs(plan, sessions, insets.top, insets.bottom));
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
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
        injectedJavaScript={HOME_SCALE_FIT_JS}
        onLoadEnd={() => setPageLoaded(true)}
        onMessage={(e) => {
          let msg: { type?: string; ts?: number };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'ready') { setReady(true); return; }
          if (msg.type === 'start') { router.push('/workout' as any); return; }
          if (msg.type === 'cue') { router.push('/cue' as any); return; }
          if (msg.type === 'progress') { router.push('/(tabs)/progress' as any); return; }
          if (msg.type === 'recap' && msg.ts != null) { router.push({ pathname: '/recap', params: { ts: String(msg.ts) } } as any); return; }
        }}
        // BUG FOUND ("clear cutoff, colored background then blank white on
        // top, doesn't match"): an earlier fix added marginTop here to fix
        // the cramped-header complaint, but that created a visible seam —
        // the gap showed this screen's plain background instead of the
        // design's own gradient, which should run edge-to-edge behind the
        // status bar like every other full-bleed screen in this app. Fixed
        // properly in buildHomeInjectJs's pushHeaderDown instead — the
        // WebView stays full-screen, only the header's own padding grows.
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
  web: { flex: 1, backgroundColor: '#eeeef1' },
});
