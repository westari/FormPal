/**
 * lib/allSetsInject.ts
 *
 * Page-side code for the All sets artboard (assets/app screens/
 * allsetsfullworkout.html), run in a warm WebView (components/WarmSurfaces.tsx).
 * Same technique as the Progress tab / muscle page: the design's own logic
 * class is subclassed (lib/dcLogicPatch.ts) so ITS tiles, filter chips, saved
 * bookmarks and layout run on REAL data, and a DOM pass handles the rest. The
 * design file itself is never edited.
 *
 * What was wrong before: the artboard is a prototype. Its tiles were fake
 * (Squats/Push-ups/Rows/Lunges), and tapping a tile did
 * window.location.href = "Workout Recap v2.dc.html?set=N" — a page that does
 * not exist, which left the WebView on a blank "root" page with no way back.
 * Now: tiles are the real exercises, tapping the video tile opens its rep
 * feedback (tiles with no video are not buttons), the filter chips filter the
 * real tiles, the bookmark saves them, Recap and Done both go back, and the two
 * controls with no real function (search, sort) are hidden. Every link on the
 * page is intercepted, so it can never navigate away.
 *
 * Written as plain ES5-ish strings with String.raw. NEVER put a backtick or a
 * dollar-brace in the page code.
 */
import { dcScaleFitJs } from './recapInject';
import { dcLogicPatchJs, athltSetDataJs } from './dcLogicPatch';

export interface AllSetsPayload {
  tiles: { title: string; meta: string; ex: string; hasVideo: boolean }[];
  /** index of the tile that has a video (its frame is drawn natively behind it), or null */
  videoIdx: number | null;
}

export const ALLSETS_LOGIC_EXT = String.raw`function (Orig) {
  function D() { return window.__athltData || null; }
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  return class extends Orig {
    renderVals() {
      var d = D();
      if (!d) return super.renderVals();
      var self = this, st = this.state;
      var filter = st.filter || 'All', saved = st.saved || {};
      var names = ['All'];
      d.tiles.forEach(function (t) { if (names.indexOf(t.ex) === -1) names.push(t.ex); });
      var tiles = [];
      d.tiles.forEach(function (t, i) {
        var keep = filter === 'Saved' ? !!saved[i] : (filter === 'All' || t.ex === filter);
        if (!keep) return;
        tiles.push({
          title: t.title, meta: t.meta, delay: '0ms',
          saveFill: saved[i] ? '#ffffff' : 'none',
          toggleSave: function (e) {
            e.stopPropagation();
            self.setState(function (s) { var n = {}; for (var k in (s.saved || {})) n[k] = s.saved[k]; n[i] = !n[i]; return { saved: n }; });
          },
          open: function () { if (t.hasVideo) post({ type: 'openSet', index: i }); }
        });
      });
      return {
        chips: names.map(function (n) {
          return { label: n, bg: filter === n ? '#111114' : '#f2f2f5', ink: filter === n ? '#ffffff' : '#111114',
            pick: function () { self.setState({ filter: n }); } };
        }),
        savedBg: filter === 'Saved' ? '#111114' : '#f2f2f5',
        savedInk: filter === 'Saved' ? '#ffffff' : '#111114',
        pickSaved: function () { self.setState(function (s) { return { filter: s.filter === 'Saved' ? 'All' : 'Saved' }; }); },
        heading: filter,
        tiles: tiles
      };
    }
  };
}`;

export const ALLSETS_DOM_JS = String.raw`
(function () {
  if (window.__asDomInstalled) return;
  window.__asDomInstalled = true;
  function D() { return window.__athltData || null; }
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }

  // Nothing on this page may ever navigate the WebView: every link either goes
  // back to the recap or does nothing.
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    ev.preventDefault(); ev.stopPropagation();
    post({ type: 'closeAllSets' });
  }, true);

  var lastTile = '';
  var reported = false;
  function apply() {
    var root = document.getElementById('dc-root');
    var d = D();
    if (!root || !d) return;
    // transparent page: the native side draws a white base (and the video frame
    // behind the video tile) underneath
    var screen = root.querySelector('[data-screen-label]');
    if (screen) screen.style.setProperty('background', 'transparent', 'important');
    // the design's play button on every tile: gone (it sat off-centre over the video frame and looked wrong;
    // the whole tile is the button)
    var plays = root.querySelectorAll('svg path[d="M7 4.6v14.8L19 12z"]');
    for (var pi = 0; pi < plays.length; pi++) {
      var pc = plays[pi].ownerSVGElement && plays[pi].ownerSVGElement.parentElement;
      if (pc) pc.style.setProperty('display', 'none', 'important');
    }
    // search + sort have no real function: hide them (layout kept)
    var svgs = root.querySelectorAll('svg');
    for (var i = 0; i < svgs.length; i++) {
      var s = svgs[i];
      var isSearch = !!s.querySelector('path[d="M10.7 10.7 14 14"]');
      var isSort = !!s.querySelector('path[d^="M5 6.4h6"]');
      if (isSearch || isSort) { var b = s.parentElement; if (b) b.style.setProperty('visibility', 'hidden', 'important'); }
    }
    // tiles: the real ones are in; tiles with no video are not buttons
    var grid = root.querySelector('div[style*="grid-template-columns"]');
    var scroller = grid && grid.parentElement;
    var tileEls = grid ? Array.prototype.slice.call(grid.children) : [];
    var videoTitle = d.videoIdx != null && d.tiles[d.videoIdx] ? d.tiles[d.videoIdx].title : null;
    var videoTile = null;
    tileEls.forEach(function (el) {
      var has = false;
      d.tiles.forEach(function (t) { if (t.hasVideo && (el.textContent || '').indexOf(t.title) >= 0) has = true; });
      el.style.setProperty('cursor', has ? 'pointer' : 'default');
      if (videoTitle && (el.textContent || '').indexOf(videoTitle) >= 0) videoTile = el;
    });
    if (videoTile) {
      videoTile.style.setProperty('background', 'transparent', 'important');
      var r = videoTile.getBoundingClientRect();
      var vr = scroller.getBoundingClientRect();
      var m = { type: 'tileRect', l: r.left, t: r.top, w: r.width, h: r.height, vt: vr.top, vb: vr.bottom };
      var j = JSON.stringify(m);
      if (j !== lastTile) { lastTile = j; post(m); }
    } else if (lastTile !== 'none') { lastTile = 'none'; post({ type: 'tileRect', none: true }); }
    // ready = real tiles rendered + chips present, canvas fitted
    var wantTiles = d.tiles.length;
    if (!reported && window.__fpFitted && tileEls.length === wantTiles && (root.innerText || '').indexOf('All') >= 0) {
      reported = true;
      post({ type: 'ready' });
    }
  }
  var deb;
  function schedule() { clearTimeout(deb); deb = setTimeout(apply, 0); }
  try { new MutationObserver(schedule).observe(document, { childList: true, subtree: true }); } catch (e) {}
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  setInterval(apply, 500);
  apply();
})();
true;
`;

/** Scaffold only (no data yet): scale-to-fit + the logic patch + the DOM pass. */
export function allSetsBaseJs(): string {
  return dcScaleFitJs('transparent') + dcLogicPatchJs(ALLSETS_LOGIC_EXT) + ALLSETS_DOM_JS;
}

/** The data half: real tiles, pushed once into the already-rendered page. */
export function allSetsDataJs(payload: AllSetsPayload): string {
  return athltSetDataJs(payload);
}
