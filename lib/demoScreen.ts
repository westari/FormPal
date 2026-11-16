/**
 * lib/demoScreen.ts
 *
 * The exercise demo screen ("watch the exercise", assets/app screens/demovideo.html, shown before an exercise in app/workout/run.tsx).
 *
 * It used to glitch and lag when it opened: the design's default text ("Push-ups", "3 sets · 12 reps", its three default instructions) was
 * painted first and replaced by hand a moment later, and a MutationObserver re-scanned every div on the page after every change (the design
 * re-draws 4 times a second). Now the real data goes in through the design's own logic (lib/dcLogicPatch.ts: the page's logic class is
 * swapped for a subclass fed from window.__athltData, set BEFORE the page's first draw), nothing is painted until that data is in, the
 * page's entrance animations are off, and the three buttons use ONE delegated click listener (no observer, no scanning).
 *
 * Steps are TIMED: every instruction has a start time (lib/demoVideos.ts), and the lit step is the last one whose start has passed, so a
 * real video can drive them later. Tapping a step jumps to its start time.
 */
import { dcLogicPatchJs } from './dcLogicPatch';
import { DC_VIEWPORT_JS } from './dcWebviewHelpers';
import { NO_ZOOM_JS } from './noZoom';
import { demoTimeline, type DemoTimeline } from './demoVideos';

export interface DemoData {
  exercise: string;
  meta: string;
  position: string;
  steps: { text: string; start: number }[];
  length: number;
  timed: boolean;
  skipPref: boolean;
}

export function demoData(o: { exerciseId: string; exName: string; sets: number; reps: number; stepIndex: number; stepTotal: number; cues: string[]; skipPref: boolean }, timeline?: DemoTimeline): DemoData {
  const tl = timeline ?? demoTimeline(o.exerciseId, o.cues);
  return {
    exercise: o.exName,
    meta: `${o.sets} set${o.sets === 1 ? '' : 's'} · ${o.reps} rep${o.reps === 1 ? '' : 's'}`,
    position: `${o.stepIndex} of ${o.stepTotal}`,
    steps: tl.steps, length: tl.length, timed: tl.timed, skipPref: o.skipPref,
  };
}

/** The design's logic with real data: the exercise, its numbers, the timed steps; the lit step follows the start times. */
export const DEMO_LOGIC_EXT = String.raw`function (Orig) {
  return class extends Orig {
    stepAt(t) {
      var d = window.__athltData, st = d.steps, k = 0;
      for (var i = 0; i < st.length; i++) { if (st[i].start <= t + 0.001) k = i; }
      return k;
    }
    renderVals() {
      var d = window.__athltData;
      if (!d) return super.renderVals();
      this.LEN = d.length;
      window.__demoSelf = this;
      // The demo must start at 0 only when it is really on screen. The design starts its clock the moment it is drawn, so while it sat under the
      // music screen it ran to about 16 of 18 seconds. It is held at 0, paused, until the app says it is visible (window.__demoStart).
      if (!this.__demoInit) { this.__demoInit = true; this.state = Object.assign({}, this.state, { hide: !!d.skipPref, t: 0, playing: !!window.__demoGo }); }
      var v = super.renderVals(), self = this, t = this.state.t, step = this.stepAt(t), st = d.steps;
      v.exercise = d.exercise; v.meta = d.meta; v.position = d.position;
      v.steps = st.map(function (s, i) {
        return { n: i + 1, text: s.text, op: i === step ? 1 : 0.45, dotBg: i === step ? '#111114' : '#f4f4f6', dotColor: i === step ? '#ffffff' : '#111114',
          pick: function () { self.setState({ t: s.start }); } };
      });
      v.prev = function () { self.setState({ t: st[Math.max(0, step - 1)].start }); };
      v.next = function () { self.setState({ t: st[Math.min(st.length - 1, step + 1)].start }); };
      window.__demoStep = step; window.__demoT = t;
      return v;
    }
  };
}`;

/** Page side: layout fixes, one delegated click listener for the three buttons, and the reveal once the real data is drawn. */
export const DEMO_PAGE_JS = String.raw`
(function(){
  if (window.__demoPage) return; window.__demoPage = true;
  function post(m){ try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
  // the app calls this when the demo becomes visible: the clock starts at 0 now
  window.__demoStart = function(){ window.__demoGo = true; var s = window.__demoSelf; if (s) s.setState({ t: 0, playing: true }); };
  // nothing is painted until the real data is in; the design's entrance animations (and its drifting colour blobs) are off
  var css = 'html:not([data-demo-ready]) body{visibility:hidden!important;} #dc-root *{animation:none!important;-webkit-animation:none!important;} #dc-root div[style*="height: 346px"][style*="z-index: 4"]{left:0!important;right:0!important;bottom:0!important;height:auto!important;border-radius:36px 36px 0 0!important;}';
  function addCss(){
    if (document.getElementById('__demo_css')) return;
    var host = document.head || document.documentElement; if (!host) return; // the page may not have a root yet: the observer below tries again
    var st = document.createElement('style'); st.id = '__demo_css'; st.textContent = css; host.appendChild(st);
  }
  addCss();
  try { new MutationObserver(addCss).observe(document, { childList: true }); } catch (e) {}
  document.addEventListener('click', function(ev){
    var t = ev.target; if (!t || !t.closest) return;
    if (t.closest('a[aria-label="Close"]')) { ev.preventDefault(); post('__tap'); post('demoBack'); return; }
    if (t.closest('a[href="In Workout.dc.html"]')) { ev.preventDefault(); post('__tap'); post('demoReady'); return; }
    var row = t.closest('div');
    for (var i = 0; row && i < 4; i++, row = row.parentElement) {
      if ((row.textContent || '').trim() === "Don't show this demo again") { post('__tap'); post('demoTogglePref'); return; }
    }
  }, true);
  // revealed when the logic has drawn the real data AND the page is scaled to the screen (two frames later), at the latest after 1.5s
  var shown = false;
  function show(){ if (shown) return; shown = true; document.documentElement.setAttribute('data-demo-ready', '1'); post('demoShown'); }
  (function wait(n){ var r = document.getElementById('dc-root'); if (window.__athltLogicReady && r && r.style.transform) { requestAnimationFrame(function(){ requestAnimationFrame(show); }); } else if (n > 60) show(); else setTimeout(function(){ wait(n + 1); }, 25); })(0);
})(); true;
`;

/** Everything injected BEFORE the page loads: viewport, no-zoom, the logic swap, the data, the page fixes. */
export function demoBeforeJs(data: DemoData, startNow = true): string {
  return DC_VIEWPORT_JS + NO_ZOOM_JS + dcLogicPatchJs(DEMO_LOGIC_EXT) + `\nwindow.__athltData = ${JSON.stringify(data)}; window.__demoGo = ${startNow ? 'true' : 'false'}; true;\n` + DEMO_PAGE_JS;
}
