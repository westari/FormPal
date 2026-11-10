/**
 * lib/designScreens.ts
 *
 * Wires Ari's real design files into the app, used AS-IS (never edited):
 *   assets/app screens/createworkout.html   -> app/create-workout.tsx
 *   assets/app screens/myworkouts.html      -> app/my-workouts.tsx
 *   assets/app screens/logsessionv2.html    -> app/log-session.tsx
 *
 * Same technique as the Progress tab (lib/dcLogicPatch.ts): the design's own logic class is subclassed at runtime so its
 * own state machine, search, steppers, calendar and "Cue" sheet keep running, fed with REAL data (the app's exercise
 * catalog, the saved plan) instead of the demo lists. A small persistent DOM pass (DS_BASE_JS) handles only what the
 * design leaves to the host: fit-to-screen, no page navigation, 16px inputs (no iOS zoom), and the ready signal.
 *
 * Verified against the unpacked real files (scripts/test-design-screens.js): every selector and message below is
 * exercised in a real browser against the real files.
 *
 * Page code is plain ES5-ish strings in String.raw. NEVER put a backtick or a dollar-brace inside them.
 */
import { CONSOLE_FORWARD_JS, DC_VIEWPORT_JS, DC_SETTLE_JS } from './dcWebviewHelpers';
import { dcLogicPatchJs, athltSetDataJs } from './dcLogicPatch';
import { NO_ZOOM_JS } from './noZoom';

// ─── shared page-side base ──────────────────────────────────────────────────────
// Hooks: a screen pushes functions into window.__dsHooks; each runs on every DOM change (idempotent) and may return false
// while its own pieces are not in place yet (the page is then not "ready").
export const DS_BASE_JS = String.raw`
(function () {
  if (window.__dsInstalled) return;
  window.__dsInstalled = true;
  window.__dsHooks = window.__dsHooks || [];
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  window.__dsPost = post;
  var CSS = ''
    + 'html{background:#f4f4f6!important;overflow:hidden!important;}'
    + 'body{margin:0!important;padding:0!important;background:#f4f4f6!important;overflow:hidden!important;}'
    + '#dc-root{position:relative!important;margin:0 auto!important;width:390px!important;transform-origin:top center!important;}'
    + '#dc-root *{animation:none!important;-webkit-animation:none!important;}'
    + '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:rgba(0,0,0,0)!important;}'
    + 'input{-webkit-user-select:text!important;user-select:text!important;}'
    + 'html:not([data-pready]) body{visibility:hidden!important;}';
  function ensureCss() {
    if (document.getElementById('__ds_css')) return;
    var host = document.head || document.documentElement; if (!host) return;
    var s = document.createElement('style'); s.id = '__ds_css'; s.textContent = CSS; host.appendChild(s);
  }
  var lastS = -1;
  function fit() {
    var root = document.getElementById('dc-root'), vh = window.innerHeight;
    if (!root || !vh) return false;
    var S = vh / 844;
    if (Math.abs(S - lastS) >= 0.002 || !root.style.transform) { lastS = S; root.style.setProperty('transform', 'scale(' + S + ')', 'important'); }
    document.body.style.setProperty('height', vh + 'px', 'important');
    document.documentElement.style.setProperty('height', vh + 'px', 'important');
    window.__fpFitted = true; window.__dcCanvasScale = S;
    return true;
  }
  // every link in these designs points at a sibling prototype page ("Train.dc.html"); none of them may ever be followed
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    ev.preventDefault(); ev.stopPropagation();
    var href = a.getAttribute('href') || '', label = (a.getAttribute('aria-label') || '').toLowerCase(), text = (a.textContent || '').trim();
    if (a.getAttribute('aria-label') === 'Back') { post({ type: 'back' }); return; }
    if (window.__dsLink) window.__dsLink({ href: href, text: text, label: label });
  }, true);

  var reported = false, deb;
  function pageIsReal(r) {
    var root = document.getElementById('dc-root');
    if (!(r && window.__athltLogicReady && root)) return false;
    if ((root.textContent || '').indexOf('{{') >= 0) return false;
    return !window.__dcSettle || window.__dcSettle(160);
  }
  function setReady(on) {
    var h = document.documentElement; if (!h) return;
    if (on) { if (!h.hasAttribute('data-pready')) h.setAttribute('data-pready', '1'); }
    else if (h.hasAttribute('data-pready')) h.removeAttribute('data-pready');
  }
  function apply() {
    ensureCss();
    var okFit = fit(), root = document.getElementById('dc-root'), allOk = okFit;
    // an input under 16px makes iOS zoom the page when it is focused: only those are raised (the 24px title input keeps its size)
    var inputs = document.querySelectorAll('input');
    for (var k = 0; k < inputs.length; k++) { if (parseFloat(getComputedStyle(inputs[k]).fontSize) < 16) inputs[k].style.setProperty('font-size', '16px', 'important'); }
    if (root) for (var i = 0; i < window.__dsHooks.length; i++) { try { if (window.__dsHooks[i](root) === false) allOk = false; } catch (e) {} }
    return allOk;
  }
  window.__athltBump = function () { schedule(); };
  function tick() {
    var ok = apply();
    var ready = reported || pageIsReal(ok);
    setReady(ready);
    if (!reported && ready) { reported = true; post({ type: 'ready' }); }
    if (!window.__athltData && Date.now() - (window.__dsLastAsk || 0) > 700) { window.__dsLastAsk = Date.now(); post({ type: 'needData' }); }
    if (!ready) { clearTimeout(deb); deb = setTimeout(tick, 90); }
  }
  function schedule() { ensureCss(); clearTimeout(deb); deb = setTimeout(tick, 40); }
  try { new MutationObserver(schedule).observe(document, { childList: true, subtree: true }); } catch (e) {}
  window.addEventListener('resize', schedule);
  setInterval(tick, 500);
  tick();
})();
true;`;

// ─── exercise-catalog helpers shared by Create workout and Log a session (page side) ────────────────────────────────
// The designs keep a list of NAMES (LIB), a table of bodyweight names (BODYWEIGHT) and their own defaults. Real data
// replaces them on every render, before the design's own renderVals runs.
const CATALOG_PAGE = String.raw`
  function D() { return window.__athltData || null; }
  function useCatalog(self) {
    var d = D(); if (!d) return false;
    if (self.__dsCat !== d.catalog) {
      self.__dsCat = d.catalog;
      self.LIB = d.catalog.map(function (c) { return c.name; });
      self.BODYWEIGHT = {}; self.__dsDef = {};
      d.catalog.forEach(function (c) { if (c.bodyweight) self.BODYWEIGHT[c.name] = 1; self.__dsDef[c.name] = c; });
    }
    return true;
  }
  function defaultsFor(self, n) {
    var c = (self.__dsDef || {})[n] || { sets: 3, reps: 10 };
    return self.BODYWEIGHT[n] ? { sets: c.sets, reps: c.reps } : { sets: c.sets, reps: c.reps, load: 45 };
  }
  // The design's Cue box ("3 sets of 10 squats at 135") is a local text parser over its LIB; it works on the real catalog
  // as is, except its alias table names demo exercises. Aliases are matched against the real names instead.
  function parseCueReal(self, text) {
    var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z]/g, ''); };
    var lib = self.LIB.map(function (n) { return { n: n, k: norm(n) }; }).sort(function (a, b) { return b.k.length - a.k.length; });
    var find = function (frag) { for (var i = 0; i < lib.length; i++) if (lib[i].k.indexOf(frag) >= 0) return lib[i].n; return null; };
    var alias = { pushups: 'pushup', pullups: 'pullup', squats: 'squat', bench: 'benchpress', rows: 'row', lunges: 'lunge', curls: 'curl', deadlifts: 'deadlift', rdl: 'romaniandeadlift', ohp: 'overheadpress', dip: 'dip' };
    var out = [];
    String(text || '').split(/,|;|\n|\band\b/i).forEach(function (chunk) {
      var c = chunk.trim(); if (!c) return;
      var w = norm(c), hit = null;
      for (var i = 0; i < lib.length; i++) { if (w.indexOf(lib[i].k) >= 0) { hit = lib[i].n; break; } }
      if (!hit) { for (var k in alias) { if (w.indexOf(k) >= 0) { hit = find(alias[k]); if (hit) break; } } }
      if (!hit) return;
      var sets = 3, reps = 10, load = null, sx = c.match(/(\d+)\s*[x×]\s*(\d+)/i);
      if (sx) { sets = +sx[1]; reps = +sx[2]; }
      else {
        var ms = c.match(/(\d+)\s*sets?/i); if (ms) sets = +ms[1];
        var mr = c.match(/(\d+)\s*reps?/i) || c.match(/sets?\s*of\s*(\d+)/i); if (mr) reps = +mr[1];
      }
      var ml = c.match(/(?:at|@)\s*(\d+)/i) || c.match(/(\d+)\s*(?:lbs?|pounds|kg)/i);
      if (ml) load = +ml[1];
      out.push({ n: hit, sets: Math.min(10, Math.max(1, sets)), reps: Math.min(99, Math.max(1, reps)), load: load });
    });
    return out;
  }
`;

// ─── Create workout ─────────────────────────────────────────────────────────────
export const CREATE_WORKOUT_LOGIC_EXT = String.raw`function (Orig) {
${CATALOG_PAGE}
  return class extends Orig {
    parseCue(text) { return useCatalog(this) ? parseCueReal(this, text) : []; }
    toggle(n) {
      useCatalog(this);
      var self = this;
      this.setState(function (s) {
        var data = Object.assign({}, s.data), order = s.order.slice();
        if (data[n]) { delete data[n]; order = order.filter(function (x) { return x !== n; }); }
        else { data[n] = defaultsFor(self, n); order.push(n); }
        return { data: data, order: order, query: '' };
      });
    }
    renderVals() {
      if (!useCatalog(this)) return super.renderVals();
      // the design starts with a demo "Squat / Push-up" workout: a new workout starts empty
      if (!this.__dsInit) { this.__dsInit = true; this.state = Object.assign({}, this.state, { order: [], data: {}, name: '' }); }
      var v = super.renderVals(), s = this.state;
      window.__athltCurrent = { name: s.name || '', items: s.order.map(function (n) { var x = s.data[n]; return { n: n, sets: x.sets, reps: x.reps, load: x.load == null ? null : x.load }; }) };
      return v;
    }
  };
}`;

export const CREATE_WORKOUT_DOM_JS = String.raw`
(function () {
  window.__dsHooks.push(function (root) {
    window.__dsLink = function (l) {
      if (/^save workout$/i.test(l.text)) { var c = window.__athltCurrent; if (c && c.name.trim() && c.items.length) window.__dsPost({ type: 'save', name: c.name.trim(), items: c.items }); return; }
      if (/Train\.dc\.html/.test(l.href)) window.__dsPost({ type: 'back' });
    };
    return !!root.querySelector('input[placeholder="Name your workout"]');
  });
})();
true;`;

// ─── Log a session ──────────────────────────────────────────────────────────────
export const LOG_SESSION_LOGIC_EXT = String.raw`function (Orig) {
${CATALOG_PAGE}
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return class extends Orig {
    parseCue(text) { return useCatalog(this) ? parseCueReal(this, text) : []; }
    renderVals() {
      if (!useCatalog(this)) return super.renderVals();
      var d = D(), self = this;
      // the design is frozen on a demo date ("Sep 12", Squat / Push-up already logged): real today, nothing logged yet
      if (!this.__dsInit) { this.__dsInit = true; this.state = Object.assign({}, this.state, { picked: {}, sel: d.today.d }); }
      var v = super.renderVals(), s = this.state, t = d.today;
      var first = new Date(t.y, t.m, 1).getDay(), dim = new Date(t.y, t.m + 1, 0).getDate();
      var dayName = function (n) { return n === t.d ? 'Today' : n === t.d - 1 ? 'Yesterday' : WD[new Date(t.y, t.m, n).getDay()] + ', ' + MON[t.m] + ' ' + n; };
      v.day = dayName(s.sel);
      v.cells = Array.from({ length: 42 }, function (_, i) {
        var n = i - first + 1;
        if (n < 1 || n > dim) return { n: '', bg: 'transparent', fg: 'transparent', ring: 'none', weight: 500, cursor: 'default', pick: function () {} };
        var on = n === s.sel, today = n === t.d, future = n > t.d;
        return { n: n, bg: on ? '#111114' : 'transparent', fg: on ? '#ffffff' : future ? '#c4c4ca' : '#111114',
          ring: !on && today ? 'inset 0 0 0 1.5px #111114' : 'none', weight: on || today ? 700 : 500, cursor: future ? 'default' : 'pointer',
          pick: future ? function () {} : function () { self.setState({ sel: n, calOpen: false }); } };
      });
      v.jumpToday = function () { self.setState({ sel: t.d, calOpen: false }); };
      // searching toggles with the real catalog's defaults (the design's own toggle hard-codes 3 x 10 @ 45)
      v.results = v.results.map(function (r) {
        return Object.assign({}, r, { toggle: function () { self.setState(function (st) {
          var p = Object.assign({}, st.picked);
          if (p[r.name]) delete p[r.name]; else p[r.name] = defaultsFor(self, r.name);
          return { picked: p, query: '' };
        }); } });
      });
      window.__athltCurrent = { dayNum: s.sel, year: t.y, month: t.m, items: Object.keys(s.picked).map(function (n) { var x = s.picked[n]; return { n: n, sets: x.sets, reps: x.reps, load: x.load == null ? null : x.load }; }) };
      return v;
    }
  };
}`;

export const LOG_SESSION_DOM_JS = String.raw`
(function () {
  window.__dsHooks.push(function (root) {
    window.__dsLink = function (l) {
      if (/^save session$/i.test(l.text)) { var c = window.__athltCurrent; if (c && c.items.length) window.__dsPost({ type: 'save', dayNum: c.dayNum, year: c.year, month: c.month, items: c.items }); return; }
      if (/Train\.dc\.html/.test(l.href)) window.__dsPost({ type: 'back' });
    };
    return !!root.querySelector('input[placeholder="Search exercises"]');
  });
  // after a successful save the app plays the design's own result: the page shows a short "Saved" toast, then native moves on
  window.__dsSaved = function () {
    var n = document.getElementById('__ds_toast'); if (n) n.remove();
    var t = document.createElement('div'); t.id = '__ds_toast';
    t.style.cssText = 'position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:99;padding:9px 16px;border-radius:999px;background:#111114;color:#fff;font-size:14px;font-weight:700;font-family:inherit;pointer-events:none;';
    t.textContent = 'Session logged'; document.body.appendChild(t);
  };
})();
true;`;

// ─── My workouts ────────────────────────────────────────────────────────────────
export const MY_WORKOUTS_LOGIC_EXT = String.raw`function (Orig) {
  function D() { return window.__athltData || null; }
  var THEMES = [
    { c: '#8b5cf6', a: 'rgba(196,178,255,0.5)', b: 'rgba(255,214,232,0.42)' },
    { c: '#22a85a', a: 'rgba(170,232,196,0.5)', b: 'rgba(206,228,255,0.42)' },
    { c: '#f08a24', a: 'rgba(255,206,160,0.55)', b: 'rgba(255,226,214,0.42)' },
    { c: '#3b7bea', a: 'rgba(178,204,255,0.5)', b: 'rgba(220,214,255,0.42)' },
    { c: '#e2558a', a: 'rgba(255,190,214,0.5)', b: 'rgba(255,226,200,0.42)' }
  ];
  return class extends Orig {
    renderVals() {
      var d = D();
      if (!d) return super.renderVals();
      if (!this.__dsInit) {
        this.__dsInit = true;
        var saved = {}; (d.saved || []).forEach(function (id) { saved[id] = true; });
        this.state = Object.assign({}, this.state, { saved: saved });
      }
      var v = super.renderVals(), s = this.state, self = this;
      var q = s.query.trim().toLowerCase();
      v.list = d.workouts
        .filter(function (w) { return s.tab === 'All' || s.saved[w.id]; })
        .filter(function (w) { return !q || w.name.toLowerCase().indexOf(q) >= 0 || w.moves.toLowerCase().indexOf(q) >= 0; })
        .map(function (w) {
          var th = THEMES[w.theme % THEMES.length];
          return { name: w.name, meta: w.meta, moves: w.moves, c: th.c, href: '#open-' + w.id,
            bg: 'radial-gradient(80% 70% at 100% 0%, ' + th.a + ' 0%, rgba(255,255,255,0) 70%), radial-gradient(70% 60% at 0% 100%, ' + th.b + ' 0%, rgba(255,255,255,0) 70%), #ffffff',
            fill: s.saved[w.id] ? th.c : '#ffffff',
            toggle: function () {
              var nxt = Object.assign({}, self.state.saved); nxt[w.id] = !nxt[w.id];
              self.setState({ saved: nxt });
              if (window.__dsPost) window.__dsPost({ type: 'saved', ids: Object.keys(nxt).filter(function (k) { return nxt[k]; }) });
            } };
        });
      v.none = d.workouts.length === 0;
      v.empty = d.workouts.length > 0 && v.list.length === 0;
      return v;
    }
  };
}`;

export const MY_WORKOUTS_DOM_JS = String.raw`
(function () {
  window.__dsHooks.push(function (root) {
    window.__dsLink = function (l) {
      var m = /^#open-(.+)$/.exec(l.href);
      if (m) { window.__dsPost({ type: 'openWorkout', id: m[1] }); return; }
      if (/Create Workout/i.test(l.href)) { window.__dsPost({ type: 'create' }); return; }
      if (/Train\.dc\.html/.test(l.href)) window.__dsPost({ type: 'back' });
    };
    return !!root.querySelector('input[placeholder="Search your workouts"]');
  });
})();
true;`;

// ─── before-content-loaded bundles ──────────────────────────────────────────────
const COMMON = DC_VIEWPORT_JS + NO_ZOOM_JS + CONSOLE_FORWARD_JS + DC_SETTLE_JS;
export const createWorkoutBeforeJs = () => COMMON + dcLogicPatchJs(CREATE_WORKOUT_LOGIC_EXT) + DS_BASE_JS + CREATE_WORKOUT_DOM_JS;
export const logSessionBeforeJs   = () => COMMON + dcLogicPatchJs(LOG_SESSION_LOGIC_EXT) + DS_BASE_JS + LOG_SESSION_DOM_JS;
export const myWorkoutsBeforeJs   = () => COMMON + dcLogicPatchJs(MY_WORKOUTS_LOGIC_EXT) + DS_BASE_JS + MY_WORKOUTS_DOM_JS;
export { athltSetDataJs };

// ─── data builders (pure) ───────────────────────────────────────────────────────
export interface CatalogItem { name: string; id: string; bodyweight: boolean; sets: number; reps: number }

export function buildCatalog(defs: readonly { id: string; displayName: string; equipment: unknown[]; defaultSets: number; defaultReps: number }[]): CatalogItem[] {
  return defs.map(d => ({ id: d.id, name: d.displayName, bodyweight: d.equipment.length === 0, sets: d.defaultSets, reps: d.defaultReps }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface PageItem { n: string; sets: number; reps: number; load: number | null }

/** Create workout: what the page sends on Save -> the plan Workout (the next session in the plan). */
export function workoutFromPage(
  payload: { name: string; items: PageItem[] }, catalog: CatalogItem[], planLength: number, now: number,
) {
  const byName = new Map(catalog.map(c => [c.name, c]));
  const exercises = payload.items.filter(i => byName.has(i.n)).map(i => {
    const c = byName.get(i.n)!;
    return { exerciseId: c.id, displayName: c.name, targetSets: i.sets, targetReps: i.reps, restSeconds: 60, currentVariationId: c.id };
  });
  return {
    id: `custom-${now}`, sessionNumber: planLength + 1, splitLabel: payload.name.trim(),
    rationale: 'Custom workout you built yourself.', exercises, completed: false,
  };
}

/** Log a session: the page's Save -> the session-log entries (manual: no camera, no form judged) and the timestamp. */
export function entriesFromPage(
  payload: { dayNum: number; year: number; month: number; items: PageItem[] }, catalog: CatalogItem[], now: Date,
) {
  const isToday = payload.year === now.getFullYear() && payload.month === now.getMonth() && payload.dayNum === now.getDate();
  const ts = isToday ? now.getTime() : new Date(payload.year, payload.month, payload.dayNum, 12, 0, 0, 0).getTime();
  const byName = new Map(catalog.map(c => [c.name, c]));
  const entries = payload.items.filter(i => byName.has(i.n)).map(i => {
    const c = byName.get(i.n)!;
    return { ts, exerciseId: c.id, displayName: c.name, reps: i.sets * i.reps, goodReps: 0, pct: 0, formChecked: false };
  });
  return { ts, entries };
}

/** My workouts: the plan's workouts as the page's cards. */
export function myWorkoutsData(
  workouts: { id: string; splitLabel: string; exercises: { displayName: string; targetSets: number }[] }[], savedIds: string[],
) {
  return {
    workouts: workouts.map((w, i) => {
      const sets = w.exercises.reduce((a, e) => a + e.targetSets, 0);
      const mins = Math.max(5, Math.round(sets * 2.5));
      return { id: w.id, name: w.splitLabel, meta: `${mins} min`, moves: w.exercises.map(e => e.displayName).join(', '), theme: i };
    }),
    saved: savedIds.filter(id => workouts.some(w => w.id === id)),
  };
}

export function logSessionData(catalog: CatalogItem[], now: Date) {
  return { catalog, today: { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() } };
}
export function createWorkoutData(catalog: CatalogItem[]) { return { catalog }; }
