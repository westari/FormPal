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
    // MUSCLE ROWS (Ari 2026-11-13): one row per muscle that gained, "Shoulders  +7 reps · 113 to Gold" with a bar. Up to 3 rows are one
    // per line; 4 to 6 sit two per line (name, then the reps line, then the bar). More than 6 muscles: the 6 biggest show (the note
    // says "...and N more moved up"). The body map shrinks just enough to leave room, so the card never grows.
    var MAXROWS = 6;
    var rowsFit = true;
    (function layoutRows() {
      if (!chips.length) return;
      var shownN = Math.min(chips.length, MAXROWS);
      for (var hx = MAXROWS; hx < chips.length; hx++) chips[hx].style.setProperty('display', 'none', 'important');
      var card = chips[0].parentElement, cardW = card.clientWidth || 346, cardH = card.clientHeight || 360;
      var cols = shownN <= 3 ? 1 : 2, PADX = 16, GAP = 8, BOT = 14, IMGTOP = cols === 1 ? 40 : 26;
      var cellW = cols === 1 ? cardW - 2 * PADX : (cardW - 2 * PADX - GAP) / 2;
      var fillBg = (R.hi && R.lo) ? grad(R.hi, R.lo) : 'linear-gradient(90deg, #b8864f 0%, #996e3c 100%)';
      for (var m1 = 0; m1 < shownN; m1++) {
        var ch1 = chips[m1];
        ch1.setAttribute('data-mr-chip', '1');
        var st = ch1.style;
        st.setProperty('right', 'auto', 'important');
        st.setProperty('left', '0px', 'important');
        st.setProperty('width', cellW.toFixed(1) + 'px', 'important');
        st.setProperty('box-sizing', 'border-box', 'important');
        st.setProperty('display', 'flex', 'important');
        st.setProperty('flex-wrap', 'wrap', 'important');
        st.setProperty('align-items', 'center', 'important');
        st.setProperty('column-gap', '7px', 'important');
        st.setProperty('row-gap', '0px', 'important');
        st.setProperty('padding', cols === 1 ? '8px 12px 10px' : '6px 10px 8px', 'important');
        st.setProperty('border-radius', '16px', 'important');
        st.setProperty('background', '#f4f4f6', 'important');
        var kids = ch1.children;
        kids[0].style.setProperty('width', cols === 1 ? '20px' : '18px', 'important'); kids[0].style.setProperty('height', cols === 1 ? '23px' : '21px', 'important');
        kids[1].style.setProperty('font-size', cols === 1 ? '14px' : '13px', 'important');
        kids[1].style.setProperty('flex', '1 1 0px', 'important');
        kids[1].style.setProperty('min-width', '0', 'important');
        kids[1].style.setProperty('white-space', 'nowrap', 'important');
        kids[1].style.setProperty('overflow', 'hidden', 'important');
        kids[1].style.setProperty('text-overflow', 'ellipsis', 'important');
        kids[2].setAttribute('data-mr-gain', '1');
        kids[2].style.setProperty('font-size', cols === 1 ? '13px' : '11px', 'important');
        kids[2].style.setProperty('letter-spacing', cols === 1 ? '0' : '-0.1px', 'important');
        kids[2].style.setProperty('white-space', 'nowrap', 'important');
        kids[2].style.setProperty('flex', cols === 1 ? '0 0 auto' : '0 0 100%', 'important');
        kids[2].style.setProperty('margin-top', cols === 1 ? '0px' : '2px', 'important');
        kids[2].style.setProperty('padding-left', '0px', 'important');
        kids[2].style.setProperty('box-sizing', 'border-box', 'important');
        var bar = ch1.querySelector('[data-mr-bar]');
        if (!bar) {
          bar = document.createElement('div');
          bar.setAttribute('data-mr-bar', '1');
          var fl = document.createElement('div');
          fl.setAttribute('data-mr-fill', '1');
          bar.appendChild(fl);
          ch1.appendChild(bar);
        }
        bar.style.setProperty('flex', '0 0 100%', 'important');
        bar.style.setProperty('height', '4px', 'important');
        bar.style.setProperty('margin-top', cols === 1 ? '7px' : '5px', 'important');
        bar.style.setProperty('border-radius', '999px', 'important');
        bar.style.setProperty('background', '#e4e4ea', 'important');
        bar.style.setProperty('overflow', 'hidden', 'important');
        var fl2 = bar.firstChild;
        fl2.style.setProperty('height', '100%', 'important');
        fl2.style.setProperty('border-radius', '999px', 'important');
        fl2.style.setProperty('background', fillBg, 'important');
        if (!fl2.style.width) fl2.style.setProperty('width', ((d.hits[m1] && d.hits[m1].barTo) || 0) + '%', 'important');
      }
      var rows = Math.ceil(shownN / cols), chH = chips[0].offsetHeight || 46;
      var block = rows * chH + (rows - 1) * GAP, top0 = cardH - BOT - block;
      for (var m2 = 0; m2 < shownN; m2++) {
        var r2 = Math.floor(m2 / cols), c2 = m2 % cols;
        chips[m2].style.setProperty('left', (PADX + c2 * (cellW + GAP)).toFixed(1) + 'px', 'important');
        chips[m2].style.setProperty('top', (top0 + r2 * (chH + GAP)).toFixed(1) + 'px', 'important');
      }
      // body map: keeps its 40px top, shrinks (never grows past the design's 218px) to end 10px above the first row
      if (img) { img.style.setProperty('top', IMGTOP + 'px', 'important'); img.style.setProperty('height', Math.max(96, Math.min(218, top0 - 10 - IMGTOP)) + 'px', 'important'); }
      window.__mrRows = rows; window.__mrCols = cols;
      rowsFit = top0 - 10 - IMGTOP >= 90;
    })();

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
    // OVERALL gets its own section (Ari 2026-11-13): "Overall rank: Bronze", its bar, and one plain line under it. It is NOT one of the muscle rows.
    (function overallSection() {
      // the section's own label is the text right before its arrow (the header at the top also shows the rank name, and is left alone)
      var arrowPath = root.querySelector('svg path[d^="M2 6h20.5"]'), arrowSvg = arrowPath && arrowPath.closest('svg'), lab = arrowSvg && arrowSvg.previousElementSibling;
      if (!lab) return;
      setText(lab, 'Overall rank: ' + R.label);
      var grp = lab.parentElement, svgs = grp.querySelectorAll('svg'), sp2 = grp.querySelectorAll('span');
      for (var q = 0; q < svgs.length; q++) svgs[q].style.setProperty('display', 'none', 'important');
      for (var q2 = 1; q2 < sp2.length; q2++) sp2[q2].style.setProperty('display', 'none', 'important');
      var col = grp.parentElement && grp.parentElement.parentElement;
      if (col && !col.querySelector('[data-mr-ovnote]')) {
        var note = document.createElement('div');
        note.setAttribute('data-mr-ovnote', '1');
        note.textContent = R.atTop ? 'You are at the top rank.' : 'The average of all ' + R.count + ' muscles. Train the gray ones to raise it.';
        note.style.cssText = 'margin-top:9px;font-size:12.5px;line-height:1.35;font-weight:500;color:#8a8a93;letter-spacing:-0.1px;';
        col.appendChild(note);
      }
    })();
    // the fill-up: pre-state while armed, the final numbers otherwise
    if (!play.playing) { if (play.armed && !play.played) drawFill(-1); else drawFill(Infinity); }
    // Final layout = real text in, real image decoded, scaled. Only then reveal.
    var headerOk = !!leafWithText(root, R.pctLabel) && !!leafWithText(root, R.label) && gainDone;
    if (!reported && fitted && imgOk && headerOk && chips.length === d.hits.length && rowsFit) {
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
    var rowEls = root.querySelectorAll('[data-mr-chip]');
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
      var r = Math.round(h.reps * e);
      var txt = '+' + r + (r === 1 ? ' rep' : ' reps') + ' · ' + (h.toNext === null ? 'Top rank' : (h.toNext + (h.reps - r)) + ' to ' + h.nextLabel);
      setText(el.querySelector('[data-mr-gain]'), txt);
      var fl = el.querySelector('[data-mr-fill]');
      if (fl) fl.style.setProperty('width', (h.barFrom + (h.barTo - h.barFrom) * e).toFixed(2) + '%', 'important');
    }
    if (final) for (i = 0; i < d.lit.after.length; i++) lit[d.lit.after[i]] = 1;
    var litKey = final ? 'final' : Object.keys(lit).sort().join(',');
    if (litKey !== play.lastLitKey) {
      var src = final ? d.bodyMap : bodySrc(lit);
      if (src) { play.lastLitKey = litKey; window.__mrBodySrc = final ? null : src; var im = root.querySelector('img[alt="Muscles worked this session"]'); if (im && im.getAttribute('src') !== src) im.setAttribute('src', src); }
    }
    // overall: the header number, the overall bar and "+X% today"
    var oe = final ? 1 : easeOut(clamp01(tt / FILL.overallDur));
    var from = R.rankedUp ? 0 : R.beforePctNum, pct = from + (R.pctNum - from) * oe;
    if (!R.atTop) {
      if (!play.headEl) play.headEl = leafWithText(root, R.pctLabel);
      setText(play.headEl, f1(pct) + '%');
      var oFill = overallFill(root);
      if (oFill) oFill.style.setProperty('width', pct.toFixed(2) + '%', 'important');
      var gnum = root.querySelector('[data-mr-overall] span');
      if (gnum) setText(gnum, f1(R.gainedNum * oe));
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
