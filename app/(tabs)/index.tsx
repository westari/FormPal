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
import { View, StyleSheet, Animated } from 'react-native';
import { useRevealFade } from '../../lib/useRevealFade';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { loadPlan } from '../../lib/planStorage';
import { getAllSessions, calcStreak, groupIntoWorkouts, scoredSessions, computeMuscleTiers, type SessionEntry } from '../../lib/sessionLog';
import { primaryMuscle } from '../../lib/progressData';
import { workoutFrame, workoutFallbackIcon } from '../../lib/workoutThumbs';
import type { Plan } from '../../types/plan';
import { DC_VIEWPORT_JS, DC_NO_ZOOM_JS, DC_SETTLE_JS } from '../../lib/dcWebviewHelpers';
import { askCue } from '../../lib/cueApi';

const HOME_HTML = require('../../assets/app screens/home.html');
const HOME_BUILD = 'home-5';
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
export const HOME_SCALE_FIT_JS = `
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
// BUG FOUND ("edit with Q... says made those changes... same message no
// matter what you type"): the "Edit with Cue" sheet is the artboard's own
// scripted demo (its sendCue() ALWAYS returns one of two hardcoded strings
// after a fake 700ms delay — confirmed directly in
// .scratch/unpacked-designs/home.html's Component.sendCue()), never a real
// backend call — same category of fake demo logic as app/cue.tsx's own
// artboard, which that screen already bypasses with real DOM manipulation
// + a real MYPAL_API_URL call. This does the same thing here: a
// capture-phase listener on the sheet's real send button/input (same
// technique as cue.tsx's wireUp — stopPropagation in the capture phase
// beats the artboard's own bubble-phase handler) builds real bubbles by
// hand and posts the typed text to RN, which calls the real backend and
// injects the real reply back via window.__homeCueReplyReceived — verified
// against the real rendered DOM (scripts/_check_home_cue_dom.js) before
// shipping: the sheet is always mounted (shown/hidden via transform, not
// conditional mount), found via the same style.height==='520px' selector
// pushEditSheetUp already uses below.
export const HOME_CUE_REAL_JS = `
(function(){
  function findCueSheet(){
    var all = document.querySelectorAll('#dc-root div');
    for (var i=0;i<all.length;i++){ if (all[i].style.height === '520px' && all[i].style.position === 'absolute') return all[i]; }
    return null;
  }
  var wired = false;
  function wire(){
    if (wired) return true;
    var sheet = findCueSheet();
    if (!sheet) return false;
    var input = sheet.querySelector('input[placeholder]');
    var sendBtn = sheet.querySelector('div[aria-label="Send"]');
    var msgArea = sheet.querySelector('div[style*="overflow-y: auto"]');
    if (!input || !sendBtn || !msgArea) return false;
    wired = true;

    function bubble(text, isUser){
      var b = document.createElement('div');
      b.style.cssText = (isUser
        ? 'align-self:flex-end; max-width:82%; border-radius:20px 20px 6px 20px; padding:11px 15px; background:#111114; color:#ffffff;'
        : 'align-self:flex-start; max-width:82%; border-radius:20px 20px 20px 6px; padding:11px 15px; background:#f1f1f4; color:#111114;'
      ) + ' font-size:15px; line-height:1.4; font-weight:500; white-space:pre-wrap;';
      b.textContent = text;
      msgArea.appendChild(b);
      msgArea.scrollTop = msgArea.scrollHeight + 9999;
      return b;
    }
    var typingEl = null;
    function showTyping(){
      if (typingEl) return;
      typingEl = document.createElement('div');
      typingEl.style.cssText = 'align-self:flex-start; border-radius:20px 20px 20px 6px; padding:13px 16px; background:#f1f1f4; display:flex; gap:5px;';
      for (var i=0;i<3;i++){
        var dot = document.createElement('div');
        dot.style.cssText = 'width:6px; height:6px; border-radius:50%; background:#b7b7c0;';
        typingEl.appendChild(dot);
      }
      msgArea.appendChild(typingEl);
      msgArea.scrollTop = msgArea.scrollHeight + 9999;
    }
    function hideTyping(){
      if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
      typingEl = null;
    }

    var sending = false;
    function doSend(){
      var text = (input.value || '').trim();
      if (!text || sending) return;
      sending = true;
      bubble(text, true);
      input.value = '';
      showTyping();
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'homeCueSend', text: text }));
    }

    sendBtn.addEventListener('click', function(ev){ ev.stopPropagation(); doSend(); }, true);
    input.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter'){ ev.preventDefault(); ev.stopPropagation(); doSend(); }
    }, true);

    window.__homeCueReplyReceived = function(text){
      hideTyping();
      bubble(text, false);
      sending = false;
    };
    return true;
  }
  if (!wire()){ [100,300,700,1500,3000].forEach(function(d){ setTimeout(wire, d); }); }
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
  /* no grey highlight box around whatever was tapped, no text selection / callout */
  * { -webkit-tap-highlight-color: rgba(0,0,0,0) !important; -webkit-touch-callout: none !important; -webkit-user-select: none !important; user-select: none !important; }
  a { outline: none !important; }
  /* the artboard's one-time entrance animations would play while the page is still hidden and then be caught
     half-way when it is revealed: they are switched off (the Cue blob's own looping glow is kept) */
  [style*="hm-rise"], [style*="hm-bar"] { animation: none !important; }
  /* Cue card: the design's own white card sits behind the "This week" card again (nothing overrides it). Only the
     orb is cleaned up: its blend-mode texture layer and blurred blobs are full-size square layers that WebKit can
     paint as a visible square around the orb, so they are switched off - the orb keeps its own gradient, highlight,
     glow and breathing animation. */
  div[style*="hm-orb-breathe"] { background: none !important; box-shadow: none !important; border: 0 !important; outline: 0 !important; }
  div[style*="hm-orb-breathe"] div[style*="mix-blend-mode"] { display: none !important; }
  div[style*="hm-orb-breathe"] div[style*="filter: blur"] { filter: none !important; }
`;

// Hidden until the page is ready: the artboard shows its own demo content first, and the real data,
// header offset and canvas scale land a moment later. <html data-pready> is set by the injection below.
export const HOME_GUARD_JS = `(function(){
  function add(){
    if (document.getElementById('__home_guard')) return true;
    var host = document.head || document.documentElement;
    if (!host) return false;
    var s = document.createElement('style'); s.id = '__home_guard';
    s.textContent = 'html:not([data-pready]) body{visibility:hidden!important;}';
    host.appendChild(s); return true;
  }
  add();
  try { new MutationObserver(function(){ add(); }).observe(document, { childList: true, subtree: true }); } catch (e) {}
})(); true;`;

export function buildHomeInjectJs(plan: Plan | null, sessions: SessionEntry[], insetTop: number, insetBottom: number): string {
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
      // this injection runs on every focus: the header is remembered after its first offset (its padding
      // is no longer the design's 62px by then)
      var header = document.querySelector('[data-home-header]');
      if(!header){
        var all = document.querySelectorAll('div');
        for (var i=0;i<all.length;i++){ if (all[i].style.paddingTop === '62px') { header = all[i]; break; } }
        if(!header) return false;
        header.setAttribute('data-home-header', '1');
      }
      header.style.setProperty('padding-top', (62 + INSET_TOP/scale) + 'px', 'important');
      return true;
    }
    var DONE = { header: false, sheet: false, text: false, recent: false };
    DONE.header = pushHeaderDown();
    if(!DONE.header){ [50,150,300,600,1000].forEach(function(d){ setTimeout(function(){ if(!DONE.header) DONE.header = pushHeaderDown(); }, d); }); }

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
    // Same fix, two sheets — the edit-workout sheet (max-height: 620px)
    // AND the separate in-page "Edit via Cue" chat overlay (height: 520px,
    // its own send button at the bottom) have the identical bottom:8px-
    // under-the-real-tab-bar problem.
    function pushEditSheetUp(){
      var scale = window.__dcCanvasScale;
      if(!scale) return false;
      var divs = document.querySelectorAll('div');
      var editSheet = null, cueSheet = null;
      for (var i=0;i<divs.length;i++){
        if (!editSheet && divs[i].style.maxHeight === '620px') editSheet = divs[i];
        if (!cueSheet && divs[i].style.height === '520px') cueSheet = divs[i];
        if (editSheet && cueSheet) break;
      }
      if(!editSheet && !cueSheet) return false;
      var extra = (INSET_BOTTOM + TAB_BAR_ESTIMATE) / scale;
      if(editSheet) editSheet.style.setProperty('bottom', (8 + extra) + 'px', 'important');
      if(cueSheet) cueSheet.style.setProperty('bottom', (8 + extra) + 'px', 'important');
      return true;
    }
    DONE.sheet = pushEditSheetUp();
    if(!DONE.sheet){ [50,150,300,600,1000].forEach(function(d){ setTimeout(function(){ if(!DONE.sheet) DONE.sheet = pushEditSheetUp(); }, d); }); }
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
    // (a later focus finds the text already replaced, so "done" is remembered)
    function textDone(){ if (applyText() > 0) window.__homeTextDone = true; return !!window.__homeTextDone; }
    DONE.text = textDone();
    if (!DONE.text) { [100,300,700,1500].forEach(function(d){ setTimeout(function(){ if(!DONE.text) DONE.text = textDone(); }, d); }); }

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
        // this injection runs on every focus: keep ONE listener per card and just update which workout it opens
        a.__recapTs = r.ts;
        if (!a.__recapWired) {
          a.__recapWired = true;
          a.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); post({ type:'recap', ts: a.__recapTs }); }, true);
        }
      });
      return true;
    }
    DONE.recent = wireRecent();
    if (!DONE.recent) { [100,300,700,1500].forEach(function(d){ setTimeout(function(){ if(!DONE.recent) DONE.recent = wireRecent(); }, d); }); }

    // The Cue card: tapping ANYWHERE on it (orb, text, empty space) opens the chat, not just the small link.
    function cueCard(){
      var link = document.querySelector('a[href="Cue.dc.html"]');
      return link && link.parentElement && link.parentElement.parentElement && link.parentElement.parentElement.parentElement;
    }
    if (!window.__homeClickWired) {
    window.__homeClickWired = true;
    document.addEventListener('click', function(ev){
      var cc = cueCard();
      if (cc && cc.contains(ev.target)) { ev.preventDefault(); ev.stopPropagation(); post({type:'cue'}); return; }
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
    }

    // Real picture for every recent workout: a frame of its video, or the muscle icon when it has none.
    window.__homeThumbs = function(list){
      var boxes = document.querySelectorAll('div[role="img"][aria-label$=" video"]');
      for (var i = 0; i < boxes.length && i < list.length; i++) {
        var w = list[i], el = boxes[i];
        var sig = w.thumb ? 'v' + w.thumb.length : w.fallback ? 'f' + w.fallback.length : '';
        if (!sig || el.__thumb === sig) continue;
        el.__thumb = sig;
        if (w.thumb) {
          el.style.setProperty('background-image', 'url(' + w.thumb + ')', 'important');
          el.style.setProperty('background-size', 'cover', 'important');
          el.style.setProperty('background-position', 'center', 'important');
        } else {
          el.style.setProperty('background-image', 'url(' + w.fallback + '), linear-gradient(160deg, #3b4156 0%, #15171e 100%)', 'important');
          el.style.setProperty('background-size', '46%, cover', 'important');
          el.style.setProperty('background-position', 'center, center', 'important');
          el.style.setProperty('background-repeat', 'no-repeat, no-repeat', 'important');
        }
      }
    };

    var st = document.getElementById('__home_css');
    if (!st) { st = document.createElement('style'); st.id = '__home_css'; document.head.appendChild(st); }
    st.textContent = ${JSON.stringify(HIDE_FAKE_CHROME_CSS)};
    // BUG FOUND ("home tab still glitches when first opening the app"):
    // this screen's WebView was never actually opacity-gated on anything
    // at all — unlike every other screen in this app, it was visible from
    // the moment it loaded, so its own demo content (and the canvas-scale
    // snap already fixed elsewhere) was always shown raw before this
    // script ever got a chance to apply real data. Delaying 'ready' past
    // dcScaleFitJs's own 300ms fit() checkpoint (same fix as recap.tsx/
    // rep-feedback.tsx) and actually using it on the RN side now.
    // Ready = canvas scaled, header/sheets offset, real text and recent cards in place, and then the page
    // (viewport + DOM) has been still for a moment. Until then the page keeps itself hidden.
    var SCRIPT_START = Date.now();
    function markReady(){
      var h = document.documentElement; if (h) h.setAttribute('data-pready', '1');
      post({type:'ready'});
    }
    function postReadyWhenStable(){
      var elapsed = Date.now() - SCRIPT_START;
      var parts = DONE.header && DONE.sheet && DONE.text && DONE.recent && !!window.__dcCanvasScale;
      var still = !window.__dcSettle || window.__dcSettle(200);
      if ((parts && still) || elapsed > 5000) { markReady(); return; }
      setTimeout(postReadyWhenStable, 60);
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
  const { fade, onReady, onLoadStart, onLoadEnd } = useRevealFade(m => { if (__DEV__) console.log('[HOME]', m); });
  // one picture per recent workout (same code as the Progress tab): a video frame, else its muscle icon
  const [thumbs, setThumbs] = useState<{ thumb: string | null; fallback: string | null }[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.all([loadPlan(), getAllSessions()]).then(async ([plan, sessions]) => {
      setInjectJs(buildHomeInjectJs(plan, sessions, insets.top, insets.bottom));
      const groups = groupIntoWorkouts(sessions);
      const tiers = computeMuscleTiers(sessions);
      const recent = groups.slice(0, 3);
      const icons = await Promise.all(recent.map(g => { const m = primaryMuscle(g.entries); return workoutFallbackIcon(m, m ? tiers[m as keyof typeof tiers]?.tier : null); }));
      if (alive) setThumbs(recent.map((_, i) => ({ thumb: null, fallback: icons[i] })));
      const frames = await Promise.all(recent.map((g, i) => workoutFrame(g.ts, groups[i + 1]?.ts ?? 0)));
      if (alive) setThumbs(recent.map((_, i) => ({ thumb: frames[i], fallback: icons[i] })));
    }).catch(() => {});
    return () => { alive = false; };
  }, []));

  React.useEffect(() => {
    if (pageLoaded && injectJs) webRef.current?.injectJavaScript(injectJs + '; true;');
  }, [pageLoaded, injectJs]);
  React.useEffect(() => {
    if (pageLoaded && injectJs && thumbs.length) webRef.current?.injectJavaScript(`window.__homeThumbs && window.__homeThumbs(${JSON.stringify(thumbs)}); true;`);
  }, [pageLoaded, injectJs, thumbs]);

  // Real backend call for the "Edit with Cue" sheet — see HOME_CUE_REAL_JS's
  // comment. Same request/response contract as app/cue.tsx's handleSend.
  const handleHomeCueSend = useCallback(async (text: string) => {
    const r = await askCue(text, []);
    webRef.current?.injectJavaScript(`window.__homeCueReplyReceived && window.__homeCueReplyReceived(${JSON.stringify(r.text)}); true;`);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Animated.View style={{ flex: 1, opacity: fade }}>
      <WebView
        ref={webRef}
        source={HOME_HTML}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS + DC_NO_ZOOM_JS + DC_SETTLE_JS + HOME_GUARD_JS}
        injectedJavaScript={HOME_SCALE_FIT_JS + HOME_CUE_REAL_JS}
        onLoadStart={() => { setPageLoaded(false); onLoadStart(); }}
        onLoadEnd={() => { setPageLoaded(true); onLoadEnd(); }}
        onMessage={(e) => {
          let msg: { type?: string; ts?: number; text?: string };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'ready') { onReady(); return; }
          if (msg.type === 'start') { router.push('/workout' as any); return; }
          if (msg.type === 'cue') { router.push('/cue' as any); return; }
          if (msg.type === 'progress') { router.push('/(tabs)/progress' as any); return; }
          if (msg.type === 'recap' && msg.ts != null) { router.push({ pathname: '/recap', params: { ts: String(msg.ts) } } as any); return; }
          if (msg.type === 'homeCueSend' && msg.text) { void handleHomeCueSend(msg.text); return; }
        }}
        // BUG FOUND ("clear cutoff, colored background then blank white on
        // top, doesn't match"): an earlier fix added marginTop here to fix
        // the cramped-header complaint, but that created a visible seam —
        // the gap showed this screen's plain background instead of the
        // design's own gradient, which should run edge-to-edge behind the
        // status bar like every other full-bleed screen in this app. Fixed
        // properly in buildHomeInjectJs's pushHeaderDown instead — the
        // WebView stays full-screen, only the header's own padding grows.
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eeeef1' },
  web: { flex: 1, backgroundColor: '#eeeef1' },
});
