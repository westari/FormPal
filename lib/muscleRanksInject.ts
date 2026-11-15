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
      // The design's "+{{ gained }}% today" now reads "Overall +X%": X is the sum of the muscle rows below it
      // (the text around it is set by the DOM pass below); a top-ranked user has no %.
      v.gained = R.atTop ? '' : R.gained;
      v.afterLabel = R.pctLabel;
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
          // 3 or more rows are placed by the DOM pass (packed into centred rows), so they start at the card's left edge
          chipL: n >= 3 ? '0px' : n === 1 ? '90px' : (i === 0 ? '14px' : 'auto'),
          chipR: n >= 3 ? 'auto' : n === 1 ? '90px' : (i === 0 ? 'auto' : '14px')
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
    // Today's progress uses the app's normal Liquid Glass back button (drawn by the app above the page): the design's own white one is hidden
    + 'a[href="Workout Recap.dc.html"]{visibility:hidden!important;}'
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
      var wantSrc = window.__mrBodySrc || d.bodyMap;
      if (img.getAttribute('src') !== wantSrc) img.setAttribute('src', wantSrc);
      imgOk = img.complete && img.naturalWidth > 0;
      if (imgOk && !window.__mrLogged) { window.__mrLogged = true; try { console.log('[ranks] body map shown, outline layers=' + (decodeURIComponent(img.getAttribute('src')).match(/fill="none" stroke="#454B5C" stroke-width="6"/g) || []).length + ' natural=' + img.naturalWidth + 'x' + img.naturalHeight + ' drawn=' + Math.round(img.getBoundingClientRect().width) + 'x' + Math.round(img.getBoundingClientRect().height)); } catch (e) {} }
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
      if (ds.position === 'absolute' && (ds.top === '284px' || divs[c].hasAttribute('data-mr-chip'))) chips.push(divs[c]);
    }
    if (d.hits.length === 1 && chips[0]) chips[0].style.setProperty('justify-content', 'center', 'important');
    // Two rows with long names ("Hamstrings +30%" + "Rear Delts +30%") are wider
    // than the card: tighten them step by step until they sit side by side.
    var chipsFit = true;
    if (chips.length === 2 && !window.__mrPack) {
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
      if (!chipsFit) { window.__mrPack = true; chipsFit = true; } // two long rows that cannot share a line even fully compacted: stack them in rows instead
    }

    // Three or more muscles: compact chips packed into centred rows at the bottom of the card, and the body map
    // shrinks just enough to leave room, so the card never grows. (One or two muscles keep the design's own layout.)
    function packChips() {
      var card = chips[0].parentElement, cardW = card.clientWidth || 346, cardH = card.clientHeight || 360;
      var GAP = 6, PAD = 12;
      for (var m1 = 0; m1 < chips.length; m1++) {
        var ch1 = chips[m1];
        ch1.setAttribute('data-mr-chip', '1');
        ch1.style.setProperty('right', 'auto', 'important');
        ch1.style.setProperty('gap', '5px', 'important');
        ch1.style.setProperty('padding', '3px 10px 3px 6px', 'important');
        var k1 = ch1.children;
        k1[0].style.setProperty('width', '18px', 'important'); k1[0].style.setProperty('height', '21px', 'important');
        for (var q1 = 1; q1 < k1.length; q1++) k1[q1].style.setProperty('font-size', '12px', 'important');
      }
      var rows = [[]], rowW = [0];
      for (var m2 = 0; m2 < chips.length; m2++) {
        var w2 = chips[m2].offsetWidth, last = rows.length - 1;
        var need = rows[last].length ? rowW[last] + GAP + w2 : w2;
        if (rows[last].length && need > cardW - 2 * PAD) { rows.push([]); rowW.push(0); last++; need = w2; }
        rows[last].push(m2); rowW[last] = need;
      }
      var chH = chips[0].offsetHeight, block = rows.length * chH + (rows.length - 1) * GAP;
      var top0 = cardH - 16 - block;
      for (var r2 = 0; r2 < rows.length; r2++) {
        var x = (cardW - rowW[r2]) / 2;
        for (var c2 = 0; c2 < rows[r2].length; c2++) {
          var chip = chips[rows[r2][c2]];
          chip.style.setProperty('left', x.toFixed(1) + 'px', 'important');
          chip.style.setProperty('top', (top0 + r2 * (chH + GAP)).toFixed(1) + 'px', 'important');
          x += chip.offsetWidth + GAP;
        }
      }
      // body map: keeps its 40px top, shrinks (never grows past the design's 218px) to end 8px above the first row
      if (img) img.style.setProperty('height', Math.max(110, Math.min(218, top0 - 28 - 40)) + 'px', 'important');
      window.__mrRows = rows.length;
    }
    if (chips.length >= 3 || (chips.length === 2 && window.__mrPack)) packChips();

    // The design says "+x% today" (as the text "+", a span holding x, then "% today"). The header number is how far
    // the OVERALL rank % went up this workout, so the trailing text becomes "% to Gold" (the rank being worked
    // toward). Only that one text node is changed, so the design's own re-render never loses a node it owns.
    // A top-ranked user just sees "+x%".
    // The design's right-hand text ("+", a span with the number, "% today") becomes one line: "Overall +X%", X being the sum of
    // the muscle row percentages shown on this page, so the rows and the overall always add up.
    var lead = R.atTop ? 'Top rank reached' : '+';
    var tail = R.atTop ? '' : '% today';
    var gainDone = false, gdivs = root.querySelectorAll('div');
    for (var g = 0; g < gdivs.length; g++) {
      var gd = gdivs[g];
      if (gd.children.length !== 1 || (gd.textContent || '').length > 60) continue;
      var nodes = gd.childNodes;
      if (nodes.length !== 3 || nodes[0].nodeType !== 3 || nodes[2].nodeType !== 3) continue;
      var mine = gd.hasAttribute('data-mr-overall');
      if (!mine && !(nodes[0].nodeValue === '+' && /^%( today| to .+)?$/.test(nodes[2].nodeValue))) continue;
      gd.setAttribute('data-mr-overall', '1');
      if (nodes[0].nodeValue !== lead) nodes[0].nodeValue = lead;
      if (nodes[2].nodeValue !== tail) nodes[2].nodeValue = tail;
      gd.style.setProperty('white-space', 'nowrap', 'important');
      // the design's own row: "Bronze -> Silver" on the left, "Overall +X%" on the far right of the SAME row
      gd.style.setProperty('text-align', 'right', 'important');
      gd.style.setProperty('line-height', '1.25', 'important');
      gainDone = (gd.textContent || '') === lead + (R.atTop ? '' : R.gained) + tail;
      break;
    }
    // OVERALL (Ari 2026-11-15): no overall % and no "average of all muscles" text on Today's progress. The overall only shows when it really ranks
    // up, as a big moment: "Overall: Bronze -> Silver!". Otherwise the header rank and the overall row are hidden.
    (function overallMoment() {
      var pctLeaf = leafWithText(root, R.pctLabel) || leafWithText(root, 'Top rank');
      var head = pctLeaf && pctLeaf.parentElement && pctLeaf.parentElement.parentElement;
      if (head) head.style.setProperty('display', 'none', 'important');
      var emb = null, ds2 = root.querySelectorAll('div[role="img"]');
      for (var e1 = 0; e1 < ds2.length; e1++) if (ds2[e1].style.width === '42px' || ds2[e1].getAttribute('data-mr-big')) emb = ds2[e1];
      var row = emb && emb.parentElement;
      if (!row) return;
      var arrowPath = root.querySelector('svg path[d^="M2 6h20.5"]'), arrowSvg = arrowPath && arrowPath.closest('svg'), lab = arrowSvg && arrowSvg.previousElementSibling;
      if (!R.rankedUp) { row.style.setProperty('display', 'none', 'important'); return; }
      row.style.setProperty('display', 'flex', 'important');
      row.style.setProperty('padding-top', '26px', 'important');
      emb.setAttribute('data-mr-big', '1');
      emb.style.setProperty('width', '64px', 'important'); emb.style.setProperty('height', '64px', 'important');
      if (lab) {
        setText(lab, 'Overall: ' + R.prevLabel + ' → ' + R.label + '!');
        lab.parentElement.style.setProperty('font-size', '22px', 'important');
        lab.parentElement.style.setProperty('font-weight', '800', 'important');
        var svgs = lab.parentElement.querySelectorAll('svg'), sp2 = lab.parentElement.querySelectorAll('span');
        for (var q = 0; q < svgs.length; q++) svgs[q].style.setProperty('display', 'none', 'important');
        for (var q2 = 1; q2 < sp2.length; q2++) sp2[q2].style.setProperty('display', 'none', 'important');
      }
      var gd2 = root.querySelector('[data-mr-overall]'); if (gd2) gd2.style.setProperty('display', 'none', 'important');
      var all2 = root.querySelectorAll('div');
      for (var b2 = 0; b2 < all2.length; b2++) if (all2[b2].style.height === '6px' && all2[b2].style.borderRadius === '999px') all2[b2].style.setProperty('display', 'none', 'important');
    })();
    // the fill-up: pre-state while armed, the final numbers otherwise
    if (!play.playing) { if (play.armed && !play.played) drawFill(-1); else drawFill(Infinity); }
    // Final layout = real text in, real image decoded, scaled. Only then reveal.
    var headerOk = !!leafWithText(root, R.pctLabel) && !!leafWithText(root, R.label) && gainDone;
    if (!reported && fitted && imgOk && headerOk && chips.length === d.hits.length && chipsFit) {
      reported = true;
      post({ type: 'ready' });
    }
  }

  // ── THE FILL-UP (Ari 2026-11-13) ────────────────────────────────────────────────────────────────────────────
  // After Finish a white wash sweeps up the screen (drawn by the app, components/WarmSurfaces.tsx) and Today's progress fills up LIVE:
  // the reps count up, the bars slide forward, the muscles light up one after another, so it feels like the app just read the workout.
  // ~1.5 s after the wash; a tap skips to the end. The app calls __mrArm() when the page is ready (pre-state: all zero) and __mrPlay() when the
  // wash covers the screen. A page that is never armed shows its final numbers at once (this file's default).
  var FILL = { rowStart: 130, rowDur: 760, overallDur: 1400, total: 1500 };
  var play = { headEl: null, armed: false, playing: false, played: false, t0: 0, raf: 0, safety: 0, lastLitKey: '' };
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function f1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  // a text change that does not look like a DOM change to the observer below (it only watches childList)
  function setText(el, s) {
    if (!el) return;
    var n = el.firstChild;
    if (n && n.nodeType === 3) { if (n.nodeValue !== s) n.nodeValue = s; } else if (el.textContent !== s) el.textContent = s;
  }
  var bodyCache = {};
  function bodySrc(litMap) {
    var d = D(); if (!d || !d.bodyMap) return null;
    var key = Object.keys(litMap).sort().join(',');
    if (bodyCache[key]) return bodyCache[key];
    try {
      var svg = decodeURIComponent(d.bodyMap.slice(d.bodyMap.indexOf(',') + 1));
      svg = svg.replace(/<path [^>]*data-m="([A-Za-z]+)"[^>]*\/>/g, function (tag, m) { return litMap[m] ? tag : tag.replace(/fill="#[0-9a-fA-F]{6}"/, 'fill="#E3E4EA"'); });
      bodyCache[key] = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      return bodyCache[key];
    } catch (e) { return null; }
  }
  // draws the whole page at time tt (ms since the fill started): tt < 0 = nothing filled yet, tt = Infinity = the final numbers
  function drawFill(tt) {
    var root = document.getElementById('dc-root'), d = D();
    if (!root || !d) return;
    var R = d.rank, final = tt === Infinity;
    var rowEls = [], dvs = root.querySelectorAll('div');
    for (var c0 = 0; c0 < dvs.length; c0++) { var ds0 = dvs[c0].style; if (ds0.position === 'absolute' && (ds0.top === '284px' || dvs[c0].hasAttribute('data-mr-chip'))) rowEls.push(dvs[c0]); }
    var lit = {}, i;
    for (i = 0; i < d.lit.before.length; i++) lit[d.lit.before[i]] = 1;
    for (i = 0; i < d.hits.length; i++) {
      var h = d.hits[i], el = rowEls[i];
      var started = final || tt >= i * FILL.rowStart;
      if (started) lit[h.muscle] = 1;
      if (!el) continue;
      var e = final ? 1 : easeOut(clamp01((tt - i * FILL.rowStart) / FILL.rowDur));
      var op = final ? 1 : clamp01((tt - i * FILL.rowStart) / 160);
      el.style.setProperty('opacity', String(op), 'important');
      el.style.setProperty('transform', 'translateY(' + ((1 - op) * 7).toFixed(1) + 'px)', 'important');
      // the row's % counts up from 0.0 to its real gain; the words after it ("to Gold") stay
      var gEl = el.children[2];
      if (gEl) setText(gEl, '+' + f1(h.gainNum * e) + '% ' + (h.nextLabel ? 'to ' + h.nextLabel : 'Top rank'));
    }
    if (final) for (i = 0; i < d.lit.after.length; i++) lit[d.lit.after[i]] = 1;
    var litKey = final ? 'final' : Object.keys(lit).sort().join(',');
    if (litKey !== play.lastLitKey) {
      var src = final ? d.bodyMap : bodySrc(lit);
      if (src) { play.lastLitKey = litKey; window.__mrBodySrc = final ? null : src; var im = root.querySelector('img[alt="Muscles worked this session"]'); if (im && im.getAttribute('src') !== src) im.setAttribute('src', src); }
    }
  }
  function overallFill(root) {
    var bars = root.querySelectorAll('div');
    for (var b = 0; b < bars.length; b++) {
      var s = bars[b].style;
      if (s.height === '6px' && s.borderRadius === '999px' && bars[b].firstElementChild) return bars[b].firstElementChild;
    }
    return null;
  }
  function finishFill() {
    play.playing = false; play.played = true; play.armed = false;
    if (play.raf) { cancelAnimationFrame(play.raf); play.raf = 0; }
    clearTimeout(play.safety);
    drawFill(Infinity);
  }
  function tick(now) {
    if (!play.playing) return;
    var tt = now - play.t0;
    if (tt >= FILL.total) { finishFill(); return; }
    drawFill(tt);
    play.raf = requestAnimationFrame(tick);
  }
  window.__mrArm = function (again) {
    if (play.playing) return;
    if (play.played && !again) return;
    play.armed = true; play.played = false; play.lastLitKey = '';
    clearTimeout(play.safety);
    play.safety = setTimeout(function () { window.__mrPlay(); }, 4500);   // never stays empty if the app forgets to start it
    drawFill(-1);
    schedule();
  };
  window.__mrPlay = function () {
    if (play.playing || play.played) return;
    clearTimeout(play.safety);
    play.armed = true; play.playing = true; play.t0 = performance.now();
    post({ type: 'fillStart' });
    play.raf = requestAnimationFrame(tick);
  };
  window.__mrSkip = function () { if (play.playing || play.armed) { play.playing = true; finishFill(); } };
  // a tap while it fills skips to the end and does nothing else (so it cannot press Done by accident)
  function skipTap(ev) {
    if (!play.playing) return;
    ev.stopPropagation(); ev.preventDefault();
    window.__mrSkip();
  }
  document.addEventListener('click', skipTap, true);
  document.addEventListener('touchend', skipTap, true);
  window.__mrFillState = function () { return { armed: play.armed, playing: play.playing, played: play.played }; };

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
