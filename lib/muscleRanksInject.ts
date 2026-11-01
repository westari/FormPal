/**
 * lib/muscleRanksInject.ts
 *
 * Page-side code for the after-workout muscle page (assets/app screens/
 * muscleranks.html, shown by app/recap.tsx). Same technique as the Progress
 * tab (lib/dcLogicPatch.ts + lib/progressInject.ts): the design's own logic
 * class is subclassed so ITS render runs on real values from the very first
 * paint, and a persistent DOM pass handles the few static pieces. The design
 * file itself is never edited.
 *
 *  - MUSCLE_RANKS_LOGIC_EXT feeds real rank / progress / muscle rows / note.
 *  - MUSCLE_RANKS_DOM_JS swaps the reference-placeholder body image for the
 *    real body map, sets the real rank emblem + tier colours, wires
 *    back / Done / share, scales the canvas, and posts 'ready' only once the
 *    page is in its FINAL layout (so nothing visibly shifts after reveal).
 *
 * Written as plain ES5-ish strings with String.raw. NEVER put a backtick or a
 * dollar-brace in the page code.
 */
import { CONSOLE_FORWARD_JS, DC_VIEWPORT_JS } from './dcWebviewHelpers';
import { dcLogicPatchJs, athltSetDataJs } from './dcLogicPatch';
import type { MuscleRanksPayload } from './muscleRanksData';

export const MUSCLE_RANKS_LOGIC_EXT = String.raw`function (Orig) {
  function D() { return window.__athltData || null; }
  // The design's row template builds its inline style from a STRING and cannot
  // carry a data: URI (the ';' in 'data:image/png;base64' gets read as the end
  // of the declaration), so the real icon art goes in as a blob: URL — the same
  // kind of URL the design uses for its own images.
  var blobs = {};
  function blobUrl(dataUri) {
    if (!dataUri) return null;
    if (blobs[dataUri]) return blobs[dataUri];
    try {
      var bin = atob(dataUri.split(',')[1]);
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      blobs[dataUri] = URL.createObjectURL(new Blob([u8], { type: 'image/png' }));
      return blobs[dataUri];
    } catch (e) { return null; }
  }
  return class extends Orig {
    renderVals() {
      var v = super.renderVals();
      var d = D();
      if (!d) return v;
      var R = d.rank;
      v.palNote = d.note;
      v.rankName = R.label;
      v.nextRank = R.next;
      v.gained = R.gained;
      v.afterLabel = R.pct + '%';
      // Final value from the first paint: the design animates this bar from the
      // "before" value after 700ms, which is a visible layout change.
      v.rankFill = R.pct + '%';
      var n = d.hits.length;
      v.hits = d.hits.map(function (h, i) {
        var u = blobUrl(h.icon);
        return {
          name: h.name, gain: h.gain,
          icon: u ? 'url(' + u + ')' : 'none',
          delay: '0ms',
          chipL: n === 1 ? '90px' : (i === 0 ? '14px' : 'auto'),
          chipR: n === 1 ? '90px' : (i === 0 ? 'auto' : '14px')
        };
      });
      return v;
    }
  };
}`;

export const MUSCLE_RANKS_DOM_JS = String.raw`
(function () {
  if (window.__mrDomInstalled) return;
  window.__mrDomInstalled = true;
  function D() { return window.__athltData || null; }
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }

  var BG = '#f2f2f5';
  var CSS = ''
    + 'html{background:' + BG + '!important;overflow:hidden!important;}'
    + 'body{margin:0!important;padding:0!important;background:' + BG + '!important;overflow:hidden!important;}'
    + '#dc-root{position:relative!important;margin:0 auto!important;width:390px!important;transform-origin:top center!important;}'
    + '#dc-root *{animation:none!important;-webkit-animation:none!important;transition:none!important;-webkit-transition:none!important;}'
    + '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}'
    // the reference-placeholder body image never shows, not even for a frame
    + 'img[alt="Muscles worked this session"]{visibility:hidden;}';

  function ensureCss() {
    if (document.getElementById('__mr_css')) return;
    var host = document.head || document.documentElement;
    if (!host) return;
    var s = document.createElement('style');
    s.id = '__mr_css';
    s.textContent = CSS;
    host.appendChild(s);
  }
  var lastS = -1;
  function fit() {
    var root = document.getElementById('dc-root');
    var vh = window.innerHeight;
    if (!root || !vh) return false;
    var S = vh / 844;
    if (Math.abs(S - lastS) >= 0.002 || !root.style.transform) {
      lastS = S;
      root.style.setProperty('transform', 'scale(' + S + ')', 'important');
    }
    document.body.style.setProperty('height', vh + 'px', 'important');
    document.documentElement.style.setProperty('height', vh + 'px', 'important');
    window.__fpFitted = true;
    return true;
  }
  function hideStatusBar(root) {
    var all = root.querySelectorAll('div');
    for (var i = 0; i < all.length; i++) {
      var el = all[i]; if (el.children.length) continue;
      if ((el.textContent || '').trim() === '9:41') {
        var row = el.parentElement;
        if (row) { row.style.setProperty('display', 'none', 'important'); return true; }
      }
    }
    return false;
  }
  function grad(hi, lo) {
    return 'linear-gradient(90deg, ' + hi + ' 0%, ' + lo + ' 100%)';
  }
  function leafWithText(root, txt) {
    var all = root.querySelectorAll('div,span');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length === 0 && (el.textContent || '').trim() === txt) return el;
    }
    return null;
  }

  var wired = { back: false, done: false, share: false };
  function wire(root) {
    if (!wired.back) {
      var backLink = root.querySelector('a[href="Workout Recap.dc.html"]');
      if (backLink) { backLink.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); post({ type: 'closeRanks' }); }, true); wired.back = true; }
    }
    if (!wired.done) {
      var done = leafWithText(root, 'Done');
      if (done) { done.addEventListener('click', function (ev) { ev.stopPropagation(); post({ type: 'doneRanks' }); }, true); wired.done = true; }
    }
    if (!wired.share) {
      var sp = root.querySelector('div svg path[d^="M8 10V2.5"]');
      var sb = sp && sp.closest('div');
      if (sb) { sb.addEventListener('click', function (ev) { ev.stopPropagation(); post({ type: 'shareVideo' }); }, true); wired.share = true; }
    }
  }

  var reported = false;
  function apply() {
    ensureCss();
    var fitted = fit();
    var root = document.getElementById('dc-root');
    var d = D();
    if (!root || !d) return;
    hideStatusBar(root);
    wire(root);
    var R = d.rank;

    // Real body map in place of the reference placeholder.
    var img = root.querySelector('img[alt="Muscles worked this session"]');
    var imgOk = false;
    if (img) {
      if (img.getAttribute('src') !== d.bodyMap) img.setAttribute('src', d.bodyMap);
      imgOk = img.complete && img.naturalWidth > 0;
      if (imgOk) img.style.setProperty('visibility', 'visible', 'important');
      else if (!img.__mrLoad) { img.__mrLoad = true; img.addEventListener('load', schedule); }
    }

    // Real tier emblem (header 22px + rank row 42px).
    var imgs = root.querySelectorAll('div[role="img"]');
    for (var i = 0; i < imgs.length; i++) {
      var w = imgs[i].style.width;
      if (w !== '22px' && w !== '42px') continue;
      if (R.emblem && imgs[i].__emb !== R.emblem) { imgs[i].__emb = R.emblem; imgs[i].style.setProperty('background-image', 'url(' + R.emblem + ')', 'important'); }
      imgs[i].style.setProperty('opacity', R.has ? '1' : '0.35');
    }

    // Tier colours (the design is hard-coded bronze; keep it exactly as
    // designed for bronze, recolour for every other tier).
    if (R.has && R.ink && R.tier !== 'bronze') {
      var all = root.querySelectorAll('div,span');
      for (var a = 0; a < all.length; a++) {
        var el = all[a], st = el.style;
        if (st.color === 'rgb(153, 110, 60)') st.setProperty('color', R.ink, 'important');
        if (st.background && st.background.indexOf('rgb(153, 110, 60)') >= 0 && el.children.length === 0 && st.width === '5px') st.setProperty('background', R.ink, 'important');
        var bi = st.backgroundImage || st.background || '';
        if (bi.indexOf('linear-gradient(90deg') >= 0 && bi.indexOf('153, 110, 60') >= 0) st.setProperty('background', grad(R.hi, R.lo), 'important');
      }
      var paths = root.querySelectorAll('svg path[stroke="#996e3c"]');
      for (var p = 0; p < paths.length; p++) paths[p].setAttribute('stroke', R.ink);
    }

    // Single worked muscle: centre its chip.
    var chips = [];
    var divs = root.querySelectorAll('div');
    for (var c = 0; c < divs.length; c++) {
      var ds = divs[c].style;
      if (ds.position === 'absolute' && ds.top === '284px') chips.push(divs[c]);
    }
    if (d.hits.length === 1 && chips[0]) chips[0].style.setProperty('justify-content', 'center', 'important');
    // Two rows with long names ("Hamstrings +30%" + "Rear Delts +30%") are wider
    // than the card: tighten them step by step until they sit side by side.
    var chipsFit = true;
    if (chips.length === 2) {
      var level = 0;
      var overlaps = function () {
        var a = chips[0].getBoundingClientRect(), b = chips[1].getBoundingClientRect();
        return a.right + 6 > b.left;
      };
      var compact = function (lv) {
        for (var k = 0; k < 2; k++) {
          var ch = chips[k];
          ch.style.setProperty('gap', lv >= 1 ? '5px' : '7px', 'important');
          ch.style.setProperty('padding', lv >= 1 ? '5px 10px 5px 7px' : '5px 14px 5px 9px', 'important');
          var kids = ch.children;
          for (var q = 0; q < kids.length; q++) {
            if (q === 0) { kids[q].style.setProperty('width', lv >= 3 ? '18px' : '24px', 'important'); }
            else kids[q].style.setProperty('font-size', lv >= 2 ? '12px' : '13.5px', 'important');
          }
        }
      };
      compact(0);
      while (overlaps() && level < 3) { level++; compact(level); }
      chipsFit = !overlaps();
    }

    // Final layout = real text in, real image decoded, scaled. Only then reveal.
    var headerOk = !!leafWithText(root, R.pct + '%') && !!leafWithText(root, R.label);
    if (!reported && fitted && window.__athltLogicReady && imgOk && headerOk && chips.length === d.hits.length && chipsFit) {
      reported = true;
      post({ type: 'ready' });
    }
  }

  var deb;
  function schedule() { clearTimeout(deb); deb = setTimeout(apply, 0); }
  // Observe the DOCUMENT: the bundle swaps the whole <html> element after this
  // script runs, so an observer on body/#dc-root would be left watching a
  // detached tree.
  try { new MutationObserver(schedule).observe(document, { childList: true, subtree: true }); } catch (e) {}
  window.addEventListener('resize', schedule);
  [100, 300, 700, 1500, 3000].forEach(function (t) { setTimeout(apply, t); });
  apply();
})();
true;
`;

/**
 * Everything the WebView needs, as ONE injectedJavaScriptBeforeContentLoaded
 * string — the real data is in the page before the artboard renders its first
 * frame, so there is no "default content, then real content" step to see.
 */
export function muscleRanksBeforeJs(payload: MuscleRanksPayload): string {
  return DC_VIEWPORT_JS + CONSOLE_FORWARD_JS + dcLogicPatchJs(MUSCLE_RANKS_LOGIC_EXT)
    + athltSetDataJs(payload) + MUSCLE_RANKS_DOM_JS;
}

/** Scaffold only (no data yet) — loaded by a warm WebView before the page is needed; the data follows via athltSetDataJs(payload). */
export function muscleRanksBaseJs(): string {
  return DC_VIEWPORT_JS + CONSOLE_FORWARD_JS + dcLogicPatchJs(MUSCLE_RANKS_LOGIC_EXT) + MUSCLE_RANKS_DOM_JS;
}
