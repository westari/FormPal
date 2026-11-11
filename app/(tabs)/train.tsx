/**
 * app/(tabs)/train.tsx — Train tab
 *
 * Renders assets/app screens/traintab.html (the new Train design: calendar strip, seven day cards, Quick Start,
 * My Workouts, Practice Exercises, Edit / Edit-with-Cue sheets) full-bleed in a WebView, exactly as the file looks.
 * The design file is never edited. What this screen adds on top of it:
 *
 *  - REAL DATA through the design's own logic (lib/dcLogicPatch.ts): the seven day cards, the calendar strip, the
 *    streak, the Edit sheet's exercise rows and the Practice Exercises list come from the real plan and session
 *    log (lib/trainData.ts). Today's card is the plan's current workout; finished days show what was done.
 *  - REAL CHROME instead of the mock's: the design's fake tab bar and "+" button are hidden (the app has a real
 *    native tab bar and Plus tab); the header is pushed below the real status bar / notch; the two sheets are lifted
 *    above the real tab bar and are completely hidden while closed.
 *  - Navigation: every button goes to the real screen (Start workout, View recap, Create workout, Log a session,
 *    My Workouts, Check form). Nothing on the page can navigate the web view away.
 *  - The Edit-with-Cue / Summarize-with-Cue chat is wired to the real Cue backend (same code as the Home tab).
 *  - No zoom, no text selection / tap highlight, the shared Cue orb look.
 *
 * Kept from before, on purpose: the page stays hidden until it is laid out, filled with real data and still (so
 * nothing flashes or jumps); the design's one-time entrance animations are switched off (they would be caught
 * half-way when the page is revealed); iOS can kill a WKWebView's content process, so a killed / unresponsive web
 * view is reloaded. Removed: everything written for the old design (hiding its colour blobs, the shield swap, the
 * 472x1024 frame scaling, the status-bar spacer, the plan view and the four practice cards).
 *
 * The page fingerprint: this screen logs [TRAIN] lines with the md5 of the HTML file it loaded and what the loaded
 * page actually contains, so a phone log proves which design file is running.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { createTabLag } from '../../lib/tabLag';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as Haptics from '../../lib/haptics';
import { DC_VIEWPORT_JS, DC_NO_ZOOM_JS, CONSOLE_FORWARD_JS, DC_SETTLE_JS } from '../../lib/dcWebviewHelpers';
import { dcLogicPatchJs, athltSetDataJs } from '../../lib/dcLogicPatch';
import { CUE_ORB_CSS, CUE_ORB_JS } from '../../lib/cueOrb';
import { EDIT_BRIDGE_JS } from '../../lib/editSheetBridge';
import { saveWorkoutEdit } from '../../lib/planEditSave';
import { HOME_CUE_REAL_JS } from './index';
import { loadPlan } from '../../lib/planStorage';
import { getAllSessions } from '../../lib/sessionLog';
import { askCue } from '../../lib/cueApi';
import { buildTrainData, type TrainData } from '../../lib/trainData';
import { ADD_PICKER_JS } from '../../lib/addExercisePicker';
import { HAPTIC_PAGE_JS, hapticKind } from '../../lib/haptics';
import { extractTrainImages } from '../../lib/trainTemplate';
import { tabBarCover } from '../../lib/tabBarMetrics';

const TRAIN_HTML = require('../../assets/app screens/traintab.html');
const TRAIN_BUILD = 'train-4';
if (__DEV__) console.log(`[train] build ${TRAIN_BUILD}`);
// Every step of the tab's life is logged with the [TRAIN] prefix (dev builds only; the dev log server forwards
// console.log to logs/latest.log): mounted, which HTML file loaded, data loaded, data pushed, page ready,
// revealed, load start/end, any error, a killed web view process.
const tlog = (...a: unknown[]) => { if (__DEV__) console.log('[TRAIN]', ...a); };

// ── The design's own logic, fed real data ────────────────────────────────────────────────────────────────────────
// Written against the NEW file (.scratch/unpacked-designs/traintab.html): `DAYS`, `CAL`, `MOVES` and `LIB` are the
// class fields its renderVals() reads, `days[i].href / restHref` are the day cards' button targets. The design
// keeps TODAY in slot 5 (and its own scroll code centres slot 5), so lib/trainData.ts builds a rolling week.
export const TRAIN_LOGIC_EXT = `function (Orig) {
  return class extends Orig {
    // Tapping a day: the browser's own smooth scroll (runs on the compositor), instead of the design's script that
    // wrote scrollLeft on every frame (a layout pass per frame on the phone). Same destination, same card centred.
    goTo(i) {
      var el = this.rail, kid = el && el.children[i];
      if (!kid) return;
      var to = kid.offsetLeft - (el.clientWidth - kid.offsetWidth) / 2;
      var self = this;
      this.sliding = true;
      this.setState({ dayIdx: i });
      clearTimeout(this._slideT);
      try { el.scrollTo({ left: to, behavior: 'smooth' }); } catch (e) { el.scrollLeft = to; }
      this._slideT = setTimeout(function () { self.sliding = false; }, 600);
    }
    renderVals() {
      var d = window.__athltData;
      if (d) { this.DAYS = d.days; this.CAL = d.cal; this.MOVES = d.moves; this.LIB = d.lib; this.EXTRA = d.extra; }
      var v = super.renderVals();
      if (!d) return v;
      var self = this;
      // Practice Exercises search: real catalogue exercises only. Names that START with what you typed come first, then
      // names that merely contain it (each group A-Z). The design's own filter also matched muscle names and its list.
      var q = (this.state.query || '').trim();
      var saved = this.state.saved || {};
      var rows = q ? window.__trRank(d.lib, q, 12) : [];
      v.library = rows.map(function (x, i) {
        return {
          name: x[0], muscle: x[1], line: i === 0 ? 'none' : '1px solid rgba(17,17,20,0.07)',
          fill: saved[x[0]] ? '#ffffff' : 'none', chip: saved[x[0]] ? '#ff4d6d' : '#c3c3cc',
          toggle: function () { self.setState(function (st) { var o = {}; for (var k in (st.saved || {})) o[k] = st.saved[k]; o[x[0]] = !o[x[0]]; return { saved: o }; }); }
        };
      });
      v.noResults = !!q && rows.length === 0;
      // The Edit sheet's "Add exercise" used to add the next item of a fixed list. It now asks WHICH exercise (a picker
      // with search over the real catalogue) and adds only what is picked.
      window.__trSelf = this;
      v.addMove = function () { if (window.__trOpenPicker) window.__trOpenPicker(); };
      if (window.__editBridge) window.__editBridge(this); // an Edit-sheet change is saved to the plan when the sheet closes
      v.streak = String(d.streak);
      v.noWorkouts = d.myWorkouts.length === 0;
      v.hasWorkouts = !v.noWorkouts;
      v.days = v.days.map(function (c, i) {
        var x = d.days[i];
        if (x) {
          c.href = x.href; c.restHref = x.restHref;
          // the Edit sheet opens on THIS card's own exercises (two cards can share a name)
          var open = c.edit;
          c.edit = function (e) { open(e); self.setState({ editList: x.rows.map(function (r) { return r.slice(); }) }); };
        }
        return c;
      });
      return v;
    }
  };
}`;

// Hides the design's fake tab bar and "+" (the app has the real ones), no tap highlight / selection, the one-time
// entrance animations off, the shared Cue orb look, and nothing painted until the page says it is ready.
const TRAIN_CSS = `
  div[style*="right: 88px"][style*="bottom: 22px"][style*="height: 64px"] { display: none !important; }
  div[style*="right: 14px"][style*="bottom: 22px"][style*="width: 64px"][style*="height: 64px"] { display: none !important; }
  * { -webkit-tap-highlight-color: rgba(0,0,0,0) !important; -webkit-touch-callout: none !important; -webkit-user-select: none !important; user-select: none !important; }
  input { -webkit-user-select: text !important; user-select: text !important; font-size: 16px !important; }
  a { outline: none !important; }
  /* a button with nothing to do (tomorrow's rest card, "Train anyway") is hidden until it has somewhere to go */
  a[href="tr:none"] { display: none !important; }
  [style*="hm-rise"], [style*="hm-bar"] { animation: none !important; }
  /* smooth day jumps: every card on its own layer (nothing repaints while they slide), no paint-heavy transition on the calendar */
  div[data-scroll] > div { will-change: transform; transform: translateZ(0); }
  div[style*="height: 76px"] { transition: none !important; }
  /* the streak pill is a button */
  [data-train-streak] { cursor: pointer; }
  ${CUE_ORB_CSS}
  html:not([data-pready]) body { visibility: hidden !important; }
`;

export const TRAIN_WEB_INJECT = `
(function () {
  if (window.__trainInstalled) return;
  window.__trainInstalled = true;
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  function D() { return window.__athltData || null; }
  var CSS = ${JSON.stringify(TRAIN_CSS)};
  function ensureCss() {
    if (document.getElementById('__train_css')) return;
    var host = document.head || document.documentElement;
    if (!host) return;
    var s = document.createElement('style'); s.id = '__train_css'; s.textContent = CSS; host.appendChild(s);
  }

  // The design is a fixed 390x844 canvas (no id): scaled to the real screen height, like the Home tab.
  function canvas() {
    var all = document.querySelectorAll('div');
    for (var i = 0; i < all.length; i++) if (all[i].style.width === '390px' && all[i].style.height === '844px') return all[i];
    return null;
  }
  function fit() {
    var root = canvas();
    // The iOS keyboard shrinks the web view; the canvas must not follow it (that rescaled the whole screen smaller when
    // the search box was tapped). Until the page is ready the scale follows the real height; once it is ready the height
    // is locked, and only a taller one (never the keyboard's shorter one) changes it.
    var vh = window.innerHeight || 0;
    if (window.__trLock) vh = Math.max(window.__trLock, vh);
    if (!root || !vh) return false;
    var S = vh / 844;
    window.__dcCanvasScale = S;
    root.style.setProperty('position', 'relative', 'important');
    root.style.setProperty('margin', '0 auto', 'important');
    root.style.setProperty('transform-origin', 'top center', 'important');
    root.style.setProperty('transform', 'scale(' + S + ')', 'important');
    document.documentElement.style.setProperty('margin', '0', 'important');
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('margin', '0', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('height', vh + 'px', 'important');
    return true;
  }

  // The design's header starts 62px down (its fake status bar). Pushed down by the real top inset so it clears the
  // notch, exactly as the Home tab does, so the two tabs' titles sit at the same height.
  function header() {
    var d = D(), S = window.__dcCanvasScale;
    if (!d || !S) return false;
    var h = document.querySelector('[data-train-header]');
    if (!h) {
      var all = document.querySelectorAll('div');
      for (var i = 0; i < all.length; i++) if (all[i].style.paddingTop === '62px') { h = all[i]; break; }
      if (!h) return false;
      h.setAttribute('data-train-header', '1');
    }
    h.style.setProperty('padding-top', (62 + d.insets.top / S) + 'px', 'important');
    return true;
  }

  // The Edit and Edit-with-Cue sheets sit 8px above the canvas bottom, under the real tab bar: lifted above it. A
  // closed sheet is parked at translateY(110%), which no longer clears the screen once lifted, so a closed sheet is
  // fully hidden (not visible, no taps) and shown again the moment it starts to open.
  function hideWhenClosed(el) {
    if (!el || el.__hideWired) return;
    el.__hideWired = true;
    var timer = null;
    function closed() { var t = el.style.transform || ''; return t.indexOf('translateY(1') === 0 && t.indexOf('%') > 0; }
    function sync(first) {
      if (closed()) {
        if (first) { el.style.setProperty('visibility', 'hidden', 'important'); el.style.setProperty('pointer-events', 'none', 'important'); return; }
        if (!timer && el.style.visibility !== 'hidden') timer = setTimeout(function () { timer = null; if (closed()) { el.style.setProperty('visibility', 'hidden', 'important'); el.style.setProperty('pointer-events', 'none', 'important'); } }, 520);
      } else {
        if (timer) { clearTimeout(timer); timer = null; }
        el.style.removeProperty('visibility'); el.style.removeProperty('pointer-events');
      }
    }
    sync(true);
    try { new MutationObserver(function () { sync(false); }).observe(el, { attributes: true, attributeFilter: ['style'] }); } catch (e) {}
  }
  function sheets() {
    var d = D(), S = window.__dcCanvasScale;
    if (!d || !S) return false;
    var divs = document.querySelectorAll('div'), edit = null, cue = null;
    for (var i = 0; i < divs.length; i++) {
      if (!edit && divs[i].style.maxHeight === '620px') edit = divs[i];
      if (!cue && divs[i].style.height === '520px' && divs[i].style.position === 'absolute') cue = divs[i];
    }
    if (!edit || !cue) return false;
    var extra = (d.insets.tabCover != null ? d.insets.tabCover : d.insets.bottom + 49) / S; // the floating tab bar
    edit.style.setProperty('bottom', (8 + extra) + 'px', 'important');
    cue.style.setProperty('bottom', (8 + extra) + 'px', 'important');
    hideWhenClosed(edit); hideWhenClosed(cue);
    return true;
  }

  // The seven day cards (a horizontal rail); the design centres Today (slot 5) itself once they are laid out.
  function rail() {
    var all = document.querySelectorAll('div[data-scroll]');
    for (var i = 0; i < all.length; i++) if (all[i].style.overflowX === 'auto' && all[i].children.length === 7 && all[i].style.scrollSnapType) return all[i];
    return null;
  }

  // BUG FOUND (no flame, no card picture): the design ships its images as data: URIs inside inline styles, and its runtime
  // cuts a style at the ';' in "data:image/webp;base64,..." - so the browser is left with url("data:image/webp") and
  // paints nothing (the bare design file has the same hole). The full images are still in the page's template text, so
  // they are read from there and put back as blob: URLs (a blob URL has no ';').
  var blobs = {}, tpl = null, T0 = Date.now();
  function blobOf(uri) {
    if (blobs[uri]) return blobs[uri];
    try {
      var bin = atob(uri.slice(uri.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      blobs[uri] = URL.createObjectURL(new Blob([u8], { type: uri.slice(5, uri.indexOf(';')) }));
    } catch (e) { blobs[uri] = null; }
    return blobs[uri];
  }
  // The markup (with the full images) lives in the file's <script type="__bundler/template"> tag until the design's
  // runtime unpacks it. It is read at DOMContentLoaded (before the runtime runs); if that was missed, the page fetches
  // its own file and reads it from there.
  function setTemplateText(raw) {
    if (!raw || window.__trTplText) return;
    var t = raw;
    try { var j = JSON.parse(raw); if (typeof j === 'string') t = j; } catch (e) {}
    window.__trTplText = t;
  }
  function grabTemplate() {
    if (window.__trTplText) return;
    var el = document.querySelector('script[type="__bundler/template"]');
    if (el && el.textContent) setTemplateText(el.textContent);
  }
  function fetchTemplate() {
    if (window.__trTplFetching) return;
    window.__trTplFetching = true;
    try {
      fetch(location.href).then(function (r) { return r.text(); }).then(function (h) {
        var i = h.indexOf('<script type="__bundler/template"'); if (i < 0) return;
        var s0 = h.indexOf('>', i) + 1, e0 = h.indexOf('</script>', s0);
        setTemplateText(h.slice(s0, e0));
      }).catch(function () {});
    } catch (e) {}
  }
  try { document.addEventListener('DOMContentLoaded', grabTemplate, true); } catch (e) {}
  grabTemplate();
  function template() {
    if (tpl) return tpl;
    // the app reads the images from the HTML file it is loading and hands them over (window.__trImgs): the most reliable source
    if (window.__trImgs && (window.__trImgs.flame || (window.__trImgs.photos || []).length)) { tpl = window.__trImgs; return tpl; }
    grabTemplate();
    var t = window.__trTplText;
    if (!t) { if (Date.now() - T0 > 2500) fetchTemplate(); return null; }
    var URI = '(data:image/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+)';
    var flame = new RegExp('aria-label="Streak"[^>]*?url[(]' + URI + '[)]').exec(t);
    var photos = [], re = /style="([^"]*rotate[(]6deg[)][^"]*)"/g, m;
    while ((m = re.exec(t))) { var u = new RegExp('url[(]' + URI + '[)]').exec(m[1]); if (u) photos.push(u[1]); }
    if (!flame && !photos.length) return null;
    tpl = { flame: flame ? flame[1] : null, photos: photos };
    return tpl;
  }
  function images() {
    var T = template();
    if (!T) return false;
    var ok = true;
    if (T.flame) {
      var f = blobOf(T.flame), masks = document.querySelectorAll('div[role="img"][aria-label="Streak"]');
      for (var i = 0; i < masks.length; i++) {
        var el = masks[i];
        if (f && el.style.getPropertyValue('-webkit-mask-image').indexOf('blob:') < 0) {
          el.style.setProperty('-webkit-mask-image', 'url(' + f + ')', 'important'); el.style.setProperty('mask-image', 'url(' + f + ')', 'important');
          el.style.setProperty('-webkit-mask-size', 'contain', 'important'); el.style.setProperty('mask-size', 'contain', 'important');
          el.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important'); el.style.setProperty('mask-repeat', 'no-repeat', 'important');
          el.style.setProperty('-webkit-mask-position', 'center', 'important'); el.style.setProperty('mask-position', 'center', 'important');
        }
      }
      // the header pill (flame + "N Day Streak") is a button
      if (masks.length && masks[0].parentElement && !masks[0].parentElement.hasAttribute('data-train-streak')) masks[0].parentElement.setAttribute('data-train-streak', '1');
      if (!masks.length || !f) ok = false;
    }
    var rail0 = rail(), mine = document.querySelectorAll('a[href^="Workout Preview"]');
    var pics = document.querySelectorAll('div[style*="rotate(6deg)"]');
    for (var k = 0; k < pics.length; k++) {
      var uri = null, host = pics[k];
      if (rail0 && rail0.contains(host)) uri = T.photos[0];
      else for (var a = 0; a < mine.length; a++) if (mine[a].contains(host)) uri = T.photos[1 + a] || T.photos[0];
      var b = uri ? blobOf(uri) : null;
      if (!b) continue;
      if (host.style.getPropertyValue('background-image').indexOf('blob:') < 0) {
        host.style.setProperty('background-image', 'url(' + b + ')', 'important');
        host.style.setProperty('background-size', 'auto 118%', 'important');
        host.style.setProperty('background-position', 'center 18%', 'important');
        host.style.setProperty('background-repeat', 'no-repeat', 'important');
      }
    }
    return ok;
  }

  // one search rule + the Add exercise picker (shared with Home): lib/addExercisePicker.ts
  ${ADD_PICKER_JS}
  ${HAPTIC_PAGE_JS}

  // My Workouts: the design's three example cards show the real first three plan workouts.
  function myWorkouts() {
    var d = D();
    if (!d) return false;
    var cards = document.querySelectorAll('a[href^="Workout Preview.dc.html"]');
    for (var i = 0; i < cards.length; i++) {
      var w = d.myWorkouts[i];
      if (!w) { cards[i].style.setProperty('display', 'none', 'important'); continue; }
      cards[i].style.removeProperty('display');
      var n = cards[i].querySelector('div[style*="font-size: 16px"]'), m = cards[i].querySelector('div[style*="font-size: 13px"]');
      if (n && n.textContent !== w.name) n.textContent = w.name;
      if (m && m.textContent !== w.meta) m.textContent = w.meta;
    }
    return d.myWorkouts.length === 0 || cards.length > 0;
  }

  // Every button goes to the real screen; nothing can navigate the web view away.
  function exerciseIdFor(btn) {
    var ids = (D() || {}).libIds || {};
    var el = btn;
    for (var up = 0; el && up < 6; up++, el = el.parentElement) {
      var kids = el.querySelectorAll ? el.querySelectorAll('div') : [];
      for (var k = 0; k < kids.length; k++) {
        var t = (kids[k].textContent || '').trim(); // (the name is wrapped in a span by the design's runtime)
        if (ids[t]) return ids[t];
      }
    }
    return null;
  }
  // (haptics: one click listener for the whole page, lib/haptics.ts HAPTIC_PAGE_JS, installed with the page)
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    for (var i = 0; el && i < 8; i++, el = el.parentElement) {
      if (!el.getAttribute) continue;
      if (el.getAttribute('aria-label') === 'Edit workout') {
        // which plan workout this Edit sheet is for (saved to the plan when the sheet closes)
        var r = rail(), d0 = D(), idx = -1;
        for (var c = 0; r && c < r.children.length; c++) if (r.children[c].contains(el)) idx = c;
        window.__editWid = (d0 && idx >= 0 && d0.days[idx]) ? (d0.days[idx].wid || null) : null;
        return; // the design's own handler opens the sheet
      }
      if (el.hasAttribute('data-train-streak')) { ev.preventDefault(); ev.stopPropagation(); post({ type: 'nav', to: 'streak' }); return; }
      if (el.getAttribute('aria-label') === 'Check form') {
        ev.preventDefault(); ev.stopPropagation();
        var id = exerciseIdFor(el);
        if (id) post({ type: 'practice', id: id });
        return;
      }
      if (el.tagName === 'A') {
        var h = el.getAttribute('href') || '';
        if (h === '#') return; // the design's own handler (Edit, Edit / Summarize with Cue) runs
        ev.preventDefault(); ev.stopPropagation();
        if (h.indexOf('tr:') === 0) post({ type: 'nav', to: h.slice(3) });
        else if (h.indexOf('Create Workout') === 0) post({ type: 'nav', to: 'create' });
        else if (h.indexOf('Log Session') === 0) post({ type: 'nav', to: 'log' });
        else if (h.indexOf('My Workouts') === 0 || h.indexOf('Workout Preview') === 0) post({ type: 'nav', to: 'myworkouts' });
        return;
      }
    }
  }, true);

  // What this page actually is (logged by the app): proves which design file is on screen.
  function fingerprint() {
    var txt = (document.body && document.body.innerText) || '';
    var r = rail();
    function has(s) { return txt.indexOf(s) >= 0 ? 1 : 0; }
    return 'cards=' + (r ? r.children.length : 0)
      + ' quickStart=' + has('Quick Start') + ' myWorkouts=' + has('My Workouts') + ' practice=' + has('Practice Exercises')
      + ' oldHero=' + (document.querySelectorAll('[data-glass]').length ? 1 : 0)
      + ' title=' + ((document.querySelector('[data-train-header] div') || {}).textContent || '').trim();
  }

  var reported = false, diagSent = false, lastAsk = 0, deb, done = { fit: false, header: false, sheets: false, my: false, img: false };
  function setPageReady(on) {
    var h = document.documentElement;
    if (!h) return;
    if (on) { if (!h.hasAttribute('data-pready')) h.setAttribute('data-pready', '1'); }
    else if (h.hasAttribute('data-pready')) h.removeAttribute('data-pready');
  }
  function tick() {
    ensureCss();
    done.fit = fit();
    done.header = header();
    done.sheets = sheets();
    done.my = myWorkouts();
    // The pictures must never hold the whole tab back (that left the tab blank on first open): they are waited for
    // for 1.5s at most, then the tab shows and they fill in as soon as they can.
    done.img = images() || (Date.now() - T0 > 1500);
    // Native's first push can land before this document exists (and be lost): the page asks until it has data.
    if (!D() && Date.now() - lastAsk > 700) { lastAsk = Date.now(); post({ type: 'needData' }); }
    var r = rail();
    // The design centres Today itself, but only while its own animation-frame retries last (about 2s); if the page was
    // not on screen yet they run out and the strip stays at the left edge. Done here too, the same way.
    if (!reported && r && r.scrollLeft === 0 && r.children[5] && r.children[5].offsetWidth > 0 && r.clientWidth > 0) {
      r.scrollLeft = r.children[5].offsetLeft - (r.clientWidth - r.children[5].offsetWidth) / 2;
    }
    if (!reported && !diagSent && Date.now() - T0 > 3000) {
      diagSent = true;
      post({ type: 'notReady', parts: { fit: done.fit, header: done.header, sheets: done.sheets, my: done.my, img: done.img, data: !!D(), logic: !!window.__athltLogicReady, rail: !!r, left: r ? Math.round(r.scrollLeft) : -1, w: window.innerWidth, h: window.innerHeight } });
    }
    var parts = done.fit && done.header && done.sheets && done.my && done.img && !!D() && !!window.__athltLogicReady && !!r;
    var real = reported || !!window.__trainForce || (parts && (!window.__dcSettle || window.__dcSettle(200)));
    setPageReady(real);
    if (!reported && real) { reported = true; window.__trLock = window.innerHeight; post({ type: 'ready' }); post({ type: 'fingerprint', fp: fingerprint() }); }
    if (parts && !real) { clearTimeout(deb); deb = setTimeout(tick, 90); }
  }
  function schedule() { ensureCss(); clearTimeout(deb); deb = setTimeout(tick, 60); }
  try { new MutationObserver(schedule).observe(document, { childList: true, subtree: true }); } catch (e) {}
  window.addEventListener('resize', schedule);
  window.__trainTick = tick;
  setInterval(tick, 400);
  tick();
})();
true;
`;

export const TRAIN_BEFORE = DC_VIEWPORT_JS + DC_NO_ZOOM_JS + CONSOLE_FORWARD_JS + DC_SETTLE_JS + CUE_ORB_JS + EDIT_BRIDGE_JS
  + dcLogicPatchJs(TRAIN_LOGIC_EXT) + TRAIN_WEB_INJECT + HOME_CUE_REAL_JS;

// FNV-1a over the file text: a second, independent fingerprint next to the asset's md5.
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export default function TrainScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [revealed, setRevealed] = useState(false);
  const revealedRef = useRef(false);
  revealedRef.current = revealed;
  const trainLag = useRef(createTabLag('train')).current;
  const dataJsRef = useRef<string | null>(null);
  const streakRef = useRef(0);
  const imgsJsRef = useRef<string | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pongAt = useRef(0);
  const loads = useRef(0);
  const loading = useRef(false);

  // Show only once the page says it's genuinely laid out, filled and still. iOS does not start loading a tab's web
  // view until the tab is first shown, so the last-resort timer only starts when the page has actually loaded; the
  // page also hides its own content until it is ready, so even an early reveal can never show a half-built page.
  const armReveal = useCallback(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => {
      tlog('revealed by the 2.5s safety net after load (page never said ready)');
      webRef.current?.injectJavaScript("window.__trainForce=1; try{window.__trainTick&&window.__trainTick()}catch(e){} true;");
      setRevealed(true);
    }, 2500);
  }, []);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(fade, { toValue: revealed ? 1 : 0, duration: revealed ? 180 : 0, easing: Easing.out(Easing.quad), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [revealed, fade]);
  useEffect(() => {
    tlog('mounted', TRAIN_BUILD);
    // Which HTML file is this build loading? md5 of the bundled file (from the asset registry) + a hash of its text.
    (async () => {
      try {
        const asset = Asset.fromModule(TRAIN_HTML);
        tlog('html file: name', asset.name + '.' + asset.type, '| md5', asset.hash ? String(asset.hash).slice(0, 8) : 'n/a', '| uri', String(asset.uri).split('/').slice(-2).join('/'));
        await asset.downloadAsync();
        const res = await fetch(asset.localUri ?? asset.uri);
        const text = await res.text();
        const imgs = extractTrainImages(text);
        if (imgs) { imgsJsRef.current = `window.__trImgs = ${JSON.stringify(imgs)}; true;`; webRef.current?.injectJavaScript(imgsJsRef.current); }
        tlog('html images:', imgs ? `flame ${imgs.flame ? 'ok' : 'MISSING'}, ${imgs.photos.length} photos` : 'NOT FOUND in the file');
        tlog('html file: size', text.length, 'chars | fnv', fnv(text));
      } catch (e) { tlog('html fingerprint failed:', e && (e as Error).message ? (e as Error).message : String(e)); }
    })();
    return () => { tlog('unmounted'); if (revealTimer.current) clearTimeout(revealTimer.current); };
  }, []);

  const reloadPage = useCallback((why: string) => {
    tlog('reloading web view:', why);
    setRevealed(false);
    webRef.current?.reload();
  }, []);

  // Load the real plan + session log and hand the page its data (on focus, and again after an Edit-sheet save).
  const pushData = useCallback(async () => {
    const [plan, sessions] = await Promise.all([loadPlan(), getAllSessions()]);
    tlog('data loaded: plan', plan ? plan.workouts.length + ' workouts' : 'none', '| sessions', sessions.length);
    const ins = { top: insets.top, bottom: insets.bottom, tabCover: tabBarCover(insets.bottom) };
    let td: TrainData;
    try { td = buildTrainData(plan, sessions, ins); }
    catch (e) {
      // a stored plan in an unexpected shape must never leave the tab blank: log it and show the empty state
      tlog('ERROR building train data:', e && (e as Error).stack ? (e as Error).stack : String(e));
      td = buildTrainData(null, sessions, ins);
    }
    dataJsRef.current = athltSetDataJs(td);
    streakRef.current = td.streak;
    webRef.current?.injectJavaScript(dataJsRef.current);
    tlog('data pushed to page; today =', td.days[5]?.name, '| streak', td.streak, '| my workouts', td.myWorkouts.length);
  }, [insets.top, insets.bottom]);

  useFocusEffect(useCallback(() => {
    tlog('focused; insets', insets.top, insets.bottom);
    trainLag.revisit(revealedRef.current);
    let alive = true;
    pushData().catch((e) => { tlog('ERROR loading data:', e && (e as Error).message ? (e as Error).message : String(e)); });
    // Liveness ping: a web view whose content process was killed never answers and stays blank white. Only pinged
    // when a page has finished loading and none is loading now. Any message from the page counts as an answer.
    const before = pongAt.current;
    if (loads.current > 0 && !loading.current) webRef.current?.injectJavaScript("try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'pong'}))}catch(e){} true;");
    const t = setTimeout(() => { if (alive && pongAt.current === before && loads.current > 0 && !loading.current) reloadPage('no answer to the focus ping'); }, 1800);
    return () => { alive = false; clearTimeout(t); };
  }, [insets.top, insets.bottom, reloadPage, pushData]));

  const handleCueSend = useCallback(async (text: string) => {
    const r = await askCue(text, []);
    webRef.current?.injectJavaScript(`window.__homeCueReplyReceived && window.__homeCueReplyReceived(${JSON.stringify(r.text)}); true;`);
  }, []);

  // An Edit-sheet change (made when the sheet closed): saved to the real plan, then the page gets fresh data, so the
  // card's minutes / exercise count and every other screen show it.
  const persistEdit = useCallback(async (wid: string, rows: [string, string][]) => {
    try {
      const saved = await saveWorkoutEdit(wid, rows);
      tlog('Edit sheet closed: workout', wid, '|', rows.length, 'exercises |', saved ? 'saved to the plan' : 'no change to save');
      if (saved) await pushData();
    } catch (e) { tlog('ERROR saving the edit:', e && (e as Error).message ? (e as Error).message : String(e)); }
  }, [pushData]);

  function onMsg(raw: string) {
    pongAt.current = Date.now();
    let m: { type?: string; to?: string; id?: string; fp?: string; text?: string; level?: string; msg?: string; wid?: string; rows?: [string, string][] };
    try { m = JSON.parse(raw); } catch { return; }
    switch (m.type) {
      case 'pong': return;
      case 'haptic': hapticKind((m as any).kind); return;
      case 'ready': tlog('page ready (layout + data + logic all in place, page still)'); if (revealTimer.current) clearTimeout(revealTimer.current); setRevealed(true); return;
      case 'fingerprint': tlog('page fingerprint:', m.fp); return;
      case 'notReady': tlog('page NOT ready after 3s, parts:', JSON.stringify((m as any).parts)); return;
      case 'needData': tlog('page asked for data;', dataJsRef.current ? 'sending' : 'not loaded yet'); if (imgsJsRef.current) webRef.current?.injectJavaScript(imgsJsRef.current); if (dataJsRef.current) webRef.current?.injectJavaScript(dataJsRef.current); return;
      case 'logicReady': return;
      case 'pageConsole': if (m.level === 'error' || m.level === 'warn') tlog('page ' + m.level + ':', m.msg); return;
      case 'homeCueSend': if (m.text) void handleCueSend(m.text); return;
      case 'saveEdit':
        if (m.wid && m.rows) void persistEdit(m.wid, m.rows);
        return;
      case 'practice':
        if (m.id) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push(`/formcheck?exercise=${m.id}` as any); }
        return;
      case 'nav': {
        const to = m.to ?? '';
        if (to === 'none') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (to === 'start') router.push('/workout' as any);
        else if (to === 'create') router.push('/create-workout' as any);
        else if (to === 'log') router.push('/log-session' as any);
        else if (to === 'myworkouts') router.push('/my-workouts' as any);
        else if (to === 'streak') router.push({ pathname: '/streak-screen', params: { count: String(streakRef.current), from: 'tab', dest: '/(tabs)/train' } } as any);
        else if (to.startsWith('preview:')) router.push({ pathname: '/workout', params: { id: to.slice('preview:'.length), preview: '1' } } as any);
        else if (to.startsWith('recap:')) router.push({ pathname: '/recap', params: { ts: to.slice('recap:'.length) } } as any);
        return;
      }
    }
  }

  return (
    <View style={s.root} onLayout={(e) => tlog('rendered; container', Math.round(e.nativeEvent.layout.width) + 'x' + Math.round(e.nativeEvent.layout.height))}>
      <StatusBar style="dark" />
      <Animated.View style={{ flex: 1, opacity: fade }}>
      <WebView
        ref={webRef}
        source={TRAIN_HTML as any}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={TRAIN_BEFORE}
        onMessage={(e) => onMsg(e.nativeEvent.data)}
        onLoadStart={() => { tlog('web view load start'); loading.current = true; setRevealed(false); }}
        onLoadEnd={() => { loading.current = false; loads.current += 1; tlog('web view load end #' + loads.current); armReveal(); }}
        onError={(e) => tlog('web view ERROR:', e.nativeEvent.description)}
        onHttpError={(e) => tlog('web view HTTP ERROR:', e.nativeEvent.statusCode, e.nativeEvent.url)}
        onContentProcessDidTerminate={() => reloadPage('iOS killed the web view process')}
        style={s.web}
        scrollEnabled
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eeeef1' },
  web:  { flex: 1, backgroundColor: '#eeeef1' },
});
