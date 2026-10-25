/**
 * lib/progressInject.ts
 *
 * Page-side code for the Progress tab (assets/app screens/progress.html).
 * Two pieces, both injected before content loads (see app/(tabs)/progress.tsx):
 *
 *  1. PROGRESS_LOGIC_EXT — a subclass of the design's own logic (see
 *     lib/dcLogicPatch.ts) that feeds REAL data into the design's own chart /
 *     list / weigh-in-sheet machinery. Because the design's state machine
 *     keeps running, the weigh-in sheet closes instantly on Submit, the chart
 *     redraws from the new point in the same render, and range pills switch
 *     with no native round trip.
 *  2. PROGRESS_DOM_JS — a persistent, idempotent DOM pass for the few things
 *     that are static markup in the design (body-map slots, rank-card colours,
 *     empty-state overlays, fake-chrome hiding, fit-to-screen). It re-runs on
 *     every DOM change, so it survives the bundle's html swap and any remount.
 *
 * Written as plain ES5-ish strings with String.raw so regexes need no double
 * escaping. NEVER put a backtick or a dollar-brace in the page code.
 */

export const PROGRESS_LOGIC_EXT = String.raw`function (Orig) {
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var RANGE_DAYS = [61, 183, 365, 0];
  var DAY = 86400000;
  function D() { return window.__athltData || {}; }
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function keyOf(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function fmt(w) { return String(Math.round(w * 10) / 10); }
  function todayParts() { var t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; }
  function axisLabels(t0, t1) {
    if (!isFinite(t0) || !isFinite(t1)) return ['', '', '', ''];
    if (t1 === t0) { var one = new Date(t0); return ['', MON[one.getMonth()] + ' ' + one.getDate(), '', '']; }
    var longSpan = (t1 - t0) > 400 * DAY, shortSpan = (t1 - t0) < 100 * DAY;
    var out = [];
    for (var i = 0; i < 4; i++) {
      var d = new Date(t0 + (t1 - t0) * (i / 3));
      out.push(MON[d.getMonth()] + (shortSpan ? ' ' + d.getDate() : longSpan ? " '" + String(d.getFullYear()).slice(2) : ''));
    }
    return out;
  }
  function pillStyle(sel) {
    return { fg: sel ? '#111114' : '#6e6e77', bg: sel ? '#ffffff' : 'transparent',
      shadow: sel ? '0 2px 6px -2px rgba(40,50,90,0.3), inset 0 1px 0 rgba(255,255,255,1)' : 'none' };
  }

  return class extends Orig {
    // ── Weight Progress: real log, real chart, real weigh-in sheet ──────────
    weightVals() {
      var base = super.weightVals();
      var s = this.state, self = this;
      var all = D().weight || [];
      var ri = s.wRange == null ? 1 : s.wRange;
      var days = RANGE_DAYS[ri];
      var cutoff = days ? Date.now() - days * DAY : 0;
      var series = all.filter(function (e) { return parseKey(e.d).getTime() >= cutoff; });
      var last = all.length ? all[all.length - 1] : null;

      var line = '', area = '', ticks = [], lastPt = { x: 0, y: 0, left: '50%', top: '0px' };
      var months = ['', '', '', ''];
      var shown = series.length ? series[series.length - 1].w : null;
      if (series.length) {
        var vals = series.map(function (e) { return e.w; });
        var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
        var span = vmax - vmin + 6;
        var tick = span > 24 ? 10 : 5;
        var lo = Math.floor((vmin - 3) / tick) * tick, hi = Math.ceil((vmax + 3) / tick) * tick;
        while ((hi - lo) / tick > 4) {
          hi += tick; lo -= tick;
          if ((hi - lo) / tick > 4) { var t2 = tick * 2; lo = Math.floor(lo / t2) * t2; hi = Math.ceil(hi / t2) * t2; break; }
        }
        var yOf = function (w) { return Math.round(134 - ((w - lo) / (hi - lo)) * 116); };
        var t0 = parseKey(series[0].d).getTime(), t1 = parseKey(series[series.length - 1].d).getTime();
        var pts = series.map(function (e, i) {
          var f = t1 > t0 ? (parseKey(e.d).getTime() - t0) / (t1 - t0) : 0.5;
          return { x: Math.round(4 + 276 * f), y: yOf(e.w) };
        });
        var lp = pts[pts.length - 1];
        if (pts.length >= 2) {
          line = this.mono(pts);
          area = line + ' L' + lp.x + ' 140 L' + pts[0].x + ' 140 Z';
        }
        var st = (hi - lo) / tick > 4 ? tick * 2 : tick;
        for (var v = hi; v >= lo; v -= st) ticks.push({ top: (yOf(v) - 6) + 'px', label: String(v) });
        lastPt = { x: lp.x, y: lp.y, left: ((34 + Math.min(lp.x, 250)) / 326 * 100).toFixed(1) + '%', top: (lp.y - 12) + 'px' };
        months = axisLabels(t0, t1);
      }

      // One-line summary under the chart (replaces "You're X% of the way to your goal" —
      // there is no goal weight stored locally to compute that from).
      var summary;
      if (all.length === 0) summary = 'Log your weight to start your chart';
      else if (all.length === 1) summary = 'Log again to start seeing a trend';
      else {
        var diff = Math.round((all[all.length - 1].w - all[0].w) * 10) / 10;
        summary = diff === 0 ? 'No change since you started logging'
          : Math.abs(diff) + ' lb ' + (diff < 0 ? 'down' : 'up') + ' since you started logging';
      }

      var t = todayParts();
      var wy = s.wYear == null ? t.y : s.wYear, wm = s.wMonth, wd = s.wDay;
      if (s.wYear == null && s.wMonth === 8 && s.wDay === 12) { wm = t.m; wd = t.d; } // design's hard-coded "today"
      var isToday = wy === t.y && wm === t.m && wd === t.d;
      var typed = s.wIn;
      var canSubmit = !!typed || !!last;

      var monthList = [];
      for (var k = 5; k >= 0; k--) { var md = new Date(t.y, t.m - k, 1); monthList.push({ y: md.getFullYear(), m: md.getMonth() }); }

      var out = {
        wNow: shown == null ? '–' : fmt(shown),
        wLine: line, wArea: area, wTicks: ticks, wLast: lastPt, wMonths: months,
        wGoalPctLabel: summary,
        wRanges: ['2m', '6m', '1y', 'All'].map(function (label, i) {
          var p = pillStyle(i === ri);
          return { label: label, fg: p.fg, bg: p.bg, shadow: p.shadow, pick: function () { self.setState({ wRange: i }); } };
        }),
        openWeigh: function (e) {
          e.preventDefault();
          var n = todayParts();
          self.setState({ weigh: true, wIn: '', dateOpen: false, wYear: n.y, wMonth: n.m, wDay: n.d });
        },
        wInShow: typed || (last ? fmt(last.w) : '0'),
        wInColor: typed ? '#111114' : '#c4c4cc',
        subBg: canSubmit ? '#111114' : '#a9a9b0',
        subFg: canSubmit ? '#ffffff' : '#d8d8de',
        dateLabel: isToday ? 'Today' : MON[wm] + ' ' + wd,
        months: monthList.map(function (mo) {
          var on = mo.y === wy && mo.m === wm;
          return { label: MON[mo.m], fg: on ? '#ffffff' : '#111114', bg: on ? '#111114' : '#f1f1f4',
            pick: function () {
              var nd = Math.min(wd, daysIn(mo.y, mo.m));
              if (mo.y === t.y && mo.m === t.m) nd = Math.min(nd, t.d);
              self.setState({ wYear: mo.y, wMonth: mo.m, wDay: nd });
            } };
        }),
        calDays: (function () {
          var lead = new Date(wy, wm, 1).getDay(), n = daysIn(wy, wm), arr = [];
          for (var i = 0; i < lead; i++) arr.push({ n: '', vis: 'hidden', fg: '#111114', bg: 'transparent', pick: function () {} });
          var _loop = function (d) {
            var future = wy === t.y && wm === t.m && d > t.d, on = d === wd;
            arr.push({ n: d, vis: 'visible', fg: on ? '#ffffff' : future ? '#c4c4ca' : '#111114', bg: on ? '#111114' : 'transparent',
              pick: function () { if (!future) self.setState({ wYear: wy, wMonth: wm, wDay: d }); } });
          };
          for (var d2 = 1; d2 <= n; d2++) _loop(d2);
          return arr;
        })(),
        saveWeigh: function (e) {
          e.preventDefault();
          var v = parseFloat(typed || (last ? String(last.w) : ''));
          if (!(v > 0) || v > 1500) return;
          v = Math.round(v * 10) / 10;
          var key = keyOf(wy, wm, wd);
          var d = D();
          d.weight = (d.weight || []).filter(function (x) { return x.d !== key; })
            .concat([{ d: key, w: v }]).sort(function (a, b) { return a.d < b.d ? -1 : 1; });
          post({ type: 'logWeight', dateKey: key, weightLb: v });
          // Close + redraw in the same render: the chart above reads d.weight.
          self.setState({ weigh: false, logged: true, wIn: '', dateOpen: false });
          if (window.__athltToast) window.__athltToast('Logged ' + fmt(v) + ' lb');
        },
      };
      for (var key2 in out) base[key2] = out[key2];
      return base;
    }

    renderVals() {
      var v = super.renderVals();
      var d = D(), self = this, s = this.state;
      var R = d.rank || { label: 'Unranked', pct: 0, nextLabel: 'Bronze', atTop: false, lo: '#B97A42' };
      window.__athltSide = s.side || 0;

      v.rankName = R.label;
      v.rankPct = R.pct + '%';
      v.nextRank = R.nextLabel;
      v.topPct = '';

      v.openPhotos = function (e) { if (e && e.preventDefault) e.preventDefault(); post({ type: 'photos' }); };

      // ── By Muscle (Muscle Map page) ──
      var ms = d.muscles || [];
      v.muscles = ms.map(function (m, i) {
        return { name: m.name, rank: m.label, pct: m.pct + '%', note: '', line: i === 0 ? 'none' : '1px solid rgba(17,17,20,0.07)' };
      });

      // ── All Ranks ladder ──
      v.ladder = (d.ladder || []).map(function (l) {
        var you = l.state === 'you', locked = l.state === 'locked';
        return {
          name: l.name, img: 'none', // art is set by the DOM pass: a data: URI can't survive the runtime's style-string parser (it splits on ';')
          op: locked ? 0.92 : 1, gray: locked ? 'grayscale(0.55) opacity(0.75)' : 'none',
          ring: you ? '0 0 0 2px ' + R.lo + ', 0 12px 26px -14px ' + R.lo : '0 0 0 1px rgba(17,17,20,0.06), 0 8px 18px -12px rgba(40,50,90,0.2)',
          tag: you ? 'You' : l.state === 'done' ? 'Reached' : '', tagColor: you ? (R.ink || '#996e3c') : '#5f5f69',
        };
      });

      // ── Past workouts (home carousel + full list) → open the real recap ──
      var wk = d.workouts || [];
      v.recent = wk.slice(0, 8).map(function (w) {
        return { name: w.name, form: w.form + ' form', formPct: w.form,
          open: function (e) { if (e && e.preventDefault) e.preventDefault(); post({ type: 'openWorkout', ts: w.ts }); } };
      });
      v.history = wk.map(function (w) {
        return { name: w.name, when: w.when, form: w.form, len: '',
          open: function (e) { if (e && e.preventDefault) e.preventDefault(); post({ type: 'openWorkout', ts: w.ts }); } };
      });

      // ── Personal bests ──
      var ICON = { streak: 'r0', form: 'r1', reps: 'r2' };
      var FALLBACK = { streak: 'assets/export/pg-pb-flame.webp', form: 'assets/export/pg-pb-shield-ranks.webp', reps: 'assets/export/pg-pb-trophy-gold.webp' };
      var GLOW = { streak: 'rgba(255,170,110,0.5)', form: 'rgba(170,160,240,0.45)', reps: 'rgba(255,214,120,0.55)' };
      v.bests = (d.bests || []).map(function (b) {
        var src = (window.__resources && window.__resources[ICON[b.kind]]) || FALLBACK[b.kind];
        return { icon: 'url(' + src + ')', name: b.name, value: b.value, unit: b.unit, delta: '', when: '', isNew: false, deltaColor: '#5f5f69',
          glow: 'radial-gradient(90% 60% at 50% 0%, ' + GLOW[b.kind] + ' 0%, rgba(255,255,255,0) 72%)' };
      });

      // ── Form Score chart from real per-workout scores ──
      var ri = s.range == null ? 1 : s.range;
      var cutoff = RANGE_DAYS[ri] ? Date.now() - RANGE_DAYS[ri] * DAY : 0;
      var series = (d.form || []).filter(function (f) { return f.ts >= cutoff; });
      v.ranges = ['2m', '6m', '1y', 'All'].map(function (label, i) {
        var p = pillStyle(i === ri);
        return { label: label, fg: p.fg, bg: p.bg, shadow: p.shadow, pick: function () { self.setState({ range: i, sel: null }); } };
      });
      if (series.length) {
        var pcts = series.map(function (f) { return f.pct; });
        var minV = Math.floor((Math.min.apply(null, pcts) - 4) / 5) * 5, maxV = Math.ceil((Math.max.apply(null, pcts) + 4) / 5) * 5;
        if (maxV <= minV) maxV = minV + 5;
        var yOf = function (p) { return Math.round(170 - ((p - minV) / (maxV - minV)) * 152); };
        var t0 = series[0].ts, t1 = series[series.length - 1].ts;
        var pts = series.map(function (f) {
          var fr = t1 > t0 ? (f.ts - t0) / (t1 - t0) : 0.5;
          return { v: f.pct, x: Math.round(8 + 278 * fr), y: yOf(f.pct) };
        });
        var sel = s.sel == null || s.sel >= pts.length ? pts.length - 1 : s.sel;
        var ln = pts.length >= 2 ? this.smooth(pts) : '';
        var mid = Math.round((minV + maxV) / 2), q = (maxV - minV) / 4;
        v.line = ln;
        v.area = ln ? ln + ' L' + pts[pts.length - 1].x + ' 176 L' + pts[0].x + ' 176 Z' : '';
        v.fTicks = [maxV, maxV - q, mid, minV + q, minV].map(function (x) { return Math.round(x); })
          .map(function (x) { return { y: yOf(x), ty: yOf(x) + 4, top: (yOf(x) - 5) + 'px', label: x + '%' }; });
        v.fXs = axisLabels(t0, t1);
        v.pts = pts.map(function (pt, i) {
          return { x: pt.x, y: pt.y, hx: pt.x - 140 / pts.length, hw: 280 / pts.length,
            r: i === sel ? 5.5 : 0, guide: i === sel ? 0.5 : 0, pick: function () { self.setState({ sel: i }); } };
        });
        v.tipX = (12 + (Math.min(pts[sel].x, 264) / 326) * 88).toFixed(1) + '%';
        v.tipY = (pts[sel].y - 12) + 'px';
        v.tipText = Math.round(pts[sel].v) + '%';
        var diff = Math.round(pcts[pcts.length - 1] - pcts[0]);
        v.change = Math.abs(diff) + '% ' + (diff >= 0 ? 'higher' : 'lower');
      } else {
        v.line = ''; v.area = ''; v.fTicks = []; v.fXs = ['', '', '', '']; v.pts = [];
        v.tipX = '50%'; v.tipY = '0px'; v.tipText = ''; v.change = '';
      }
      return v;
    }
  };
}`;

export const PROGRESS_DOM_JS = String.raw`
(function () {
  if (window.__progDomInstalled) return;
  window.__progDomInstalled = true;
  function D() { return window.__athltData || null; }
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  var VERSION = 0;
  window.__athltBump = function () { VERSION++; schedule(); };

  var CSS = ''
    + 'html{background:#eeeef1!important;overflow:hidden!important;}'
    + 'body{margin:0!important;padding:0!important;background:#eeeef1!important;overflow:hidden!important;}'
    + '#dc-root{position:relative!important;margin:0 auto!important;width:390px!important;transform-origin:top center!important;}'
    + '#dc-root *{animation:none!important;-webkit-animation:none!important;transition:none!important;-webkit-transition:none!important;}'
    + '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}'
    // fake tab bar + FAB from the artboard (the real native ones exist app-wide)
    + 'div[style*="right: 88px"][style*="bottom: 22px"][style*="height: 64px"]{display:none!important;}'
    + 'div[style*="right: 14px"][style*="bottom: 22px"][style*="width: 64px"][style*="height: 64px"]{display:none!important;}'
    // never zoom on focus inside the date inputs
    + 'input{font-size:16px!important;}';

  function ensureCss() {
    if (document.getElementById('__prog_css')) return;
    var host = document.head || document.documentElement;
    if (!host) return;
    var s = document.createElement('style');
    s.id = '__prog_css';
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
    return true;
  }

  // ── helpers ──
  function leafWithText(txt, scope) {
    var all = (scope || document).querySelectorAll('#dc-root *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length === 0 && (el.textContent || '').trim() === txt) return el;
    }
    return null;
  }
  function setText(el, txt) { if (el && el.textContent !== txt) el.textContent = txt; }
  function grad(hi, lo) {
    return 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 55%), linear-gradient(90deg, ' + hi + ' 0%, ' + lo + ' 100%)';
  }
  // Overlay an empty-state message over a container (never removes React's nodes).
  function setEmpty(host, on, title, sub, opts) {
    if (!host) return;
    var ov = host.querySelector(':scope > [data-athlt-empty]');
    if (!on) { if (ov) ov.remove(); if (host.__minH) { host.style.minHeight = ''; host.__minH = 0; } return; }
    if (opts && opts.minH && !host.__minH) { host.style.minHeight = opts.minH + 'px'; host.__minH = opts.minH; }
    if (host.style.position !== 'relative' && host.style.position !== 'absolute') host.style.position = 'relative';
    if (!ov) {
      ov = document.createElement('div');
      ov.setAttribute('data-athlt-empty', '1');
      host.appendChild(ov);
    }
    var inset = (opts && opts.inset) || '0';
    ov.style.cssText = 'position:absolute;inset:' + inset + ';z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:0 26px;'
      + 'background:' + ((opts && opts.bg) || '#ffffff') + ';border-radius:' + ((opts && opts.radius) || '22px') + ';box-shadow:0 0 0 1px rgba(17,17,20,0.04),0 14px 34px -16px rgba(40,50,90,0.22);';
    ov.innerHTML = '<div style="font-size:15px;font-weight:700;color:#111114;letter-spacing:-0.3px;">' + title + '</div>'
      + '<div style="font-size:12.5px;font-weight:500;color:#6e6e77;line-height:1.4;">' + sub + '</div>';
  }
  function sectionAfter(heading) {
    var h = leafWithText(heading);
    if (!h) return null;
    // heading is either a bare div (sibling = card wrapper) or inside an <a> link row
    var row = h.tagName === 'A' || h.closest('a') ? h.closest('a') : h;
    return { heading: h, row: row, next: row ? row.nextElementSibling : null };
  }

  // ── toast ──
  var toastTimer;
  window.__athltToast = function (msg) {
    var t = document.getElementById('__athlt_toast');
    var root = document.getElementById('dc-root');
    if (!root) return;
    if (!t) {
      t = document.createElement('div');
      t.id = '__athlt_toast';
      root.appendChild(t);
    }
    t.style.cssText = 'position:absolute;left:50%;bottom:110px;transform:translateX(-50%);z-index:200;padding:11px 18px;border-radius:999px;background:#111114;color:#fff;'
      + 'font-size:14px;font-weight:700;white-space:nowrap;box-shadow:0 10px 24px -8px rgba(17,17,20,0.5);pointer-events:none;opacity:1;';
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 1800);
  };

  // ── the pass ──
  function apply() {
    ensureCss();
    var okFit = fit();
    var d = D();
    var root = document.getElementById('dc-root');
    if (!root || !d) return { okFit: okFit, filled: false };
    var R = d.rank || {};

    // Body maps — rank card (both sides) + Muscle Map page (selected side)
    var slots = root.querySelectorAll('div[aria-label="Body map space"]');
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var big = slot.style.height === '300px';
      var side = window.__athltSide || 0;
      var sig = (big ? 'big' + side : 'card') + '|' + VERSION;
      if (slot.__sig === sig) continue;
      slot.__sig = sig;
      var fig = function (svg, h) { return '<div style="height:' + h + 'px;aspect-ratio:480/833;flex:none;">' + svg + '</div>'; };
      if (big) {
        slot.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;">'
          + fig(side === 0 ? d.bodyMap.front : d.bodyMap.back, 292) + '</div>';
      } else {
        slot.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;gap:34px;">'
          + fig(d.bodyMap.front, 206) + fig(d.bodyMap.back, 206) + '</div>';
      }
    }

    // Rank card
    var rankLink = root.querySelector('a[style*="padding: 18px 18px 14px"]');
    if (rankLink) {
      var emb = rankLink.querySelector('div[role="img"]');
      if (emb) {
        if (R.emblem && emb.__emb !== R.emblem) { emb.__emb = R.emblem; emb.style.setProperty('background-image', 'url(' + R.emblem + ')', 'important'); }
        emb.setAttribute('aria-label', (R.label || 'Unranked') + ' rank');
        if (!R.has) emb.style.setProperty('opacity', '0.35');
        else emb.style.removeProperty('opacity');
      }
      var nameEl = rankLink.querySelector('div[style*="font-size: 23px"]');
      if (nameEl) nameEl.style.setProperty('color', R.has ? R.ink : '#8e8e96', 'important');
      var track = rankLink.querySelector('div[style*="height: 9px"]');
      var fill = track && track.children[0];
      if (fill && R.hi) fill.style.setProperty('background', grad(R.hi, R.lo), 'important');
      var rowEl = track ? track.parentElement.nextElementSibling : null;
      if (rowEl && rowEl.children.length >= 2) {
        var left = rowEl.children[0], right = rowEl.children[1];
        if (!R.has) { setText(left, 'Train to earn your first rank'); setText(right, ''); }
        else {
          if (R.atTop) setText(left, 'Top rank reached');
          setText(right, R.streak > 0 ? R.streak + '-day streak' : '');
        }
      }
    }

    // Muscle Map page — "Target your <b>back</b> this week."
    var all = root.querySelectorAll('div');
    for (var a = 0; a < all.length; a++) {
      var el = all[a];
      if (el.children.length === 1 && el.children[0].tagName === 'SPAN' && /^\s*Target your\s*$/.test(el.firstChild && el.firstChild.nodeValue || '')) {
        var span = el.children[0], tail = el.lastChild;
        if (d.weakest) { setText(span, d.weakest.toLowerCase()); if (el.firstChild.nodeValue !== 'Target your ') el.firstChild.nodeValue = 'Target your '; if (tail && tail.nodeType === 3 && tail.nodeValue !== ' this week.') tail.nodeValue = ' this week.'; }
        else { span.textContent = ''; el.firstChild.nodeValue = 'Train a few exercises to see your weakest muscle'; if (tail && tail.nodeType === 3) tail.nodeValue = ''; }
        break;
      }
    }

    // All Ranks ladder art
    var lad = d.ladder || [];
    for (var li = 0; li < lad.length; li++) {
      if (!lad[li].img) continue;
      var le = root.querySelector('div[role="img"][aria-label="' + lad[li].name + '"]');
      if (le && le.__img !== lad[li].img) { le.__img = lad[li].img; le.style.setProperty('background-image', 'url(' + lad[li].img + ')', 'important'); }
    }

    // Muscle rows: tier-coloured rank text + bar + icon chip
    var icons = root.querySelectorAll('div[aria-label$=" icon"]');
    for (var m = 0; m < icons.length; m++) {
      var info = (d.muscles || [])[m]; if (!info) continue;
      var rowM = icons[m].parentElement;
      var content = rowM.children[1]; if (!content) continue;
      var top = content.children[0], barWrap = content.children[1];
      var rankDiv = top && top.children[1] && top.children[1].children[0];
      if (rankDiv) rankDiv.style.setProperty('color', info.tier ? info.ink : '#8e8e96', 'important');
      var barFill = barWrap && barWrap.children[0] && barWrap.children[0].children[0];
      if (barFill) barFill.style.setProperty('background', grad(info.hi, info.lo), 'important');
      icons[m].style.setProperty('background', info.tier ? 'linear-gradient(160deg, ' + info.hi + ', ' + info.lo + ')' : '#f4f4f6', 'important');
    }

    // Weight card
    var wsvg = null, svgs = root.querySelectorAll('svg');
    for (var s = 0; s < svgs.length; s++) { if (svgs[s].getAttribute('viewBox') === '0 0 292 150') { wsvg = svgs[s]; break; } }
    if (wsvg) {
      var wcard = wsvg.closest('div[style*="border-radius: 28px"]');
      var chartBox = wsvg.parentElement; // the position:relative 150px box
      var wn = d.weight ? d.weight.length : 0;
      setEmpty(chartBox, wn === 0, 'No weigh-ins yet', 'Tap Log weight to add your first one and your chart starts here.', { radius: '16px' });
      // a single point can't draw a line — keep the dot, hide the empty dashed guide
      var tip = chartBox.querySelector('div[style*="translate(-50%, -100%)"]');
      if (tip) tip.style.setProperty('display', wn === 0 ? 'none' : '');
      var gl = wsvg.querySelector('line'), gc = wsvg.querySelector('circle');
      if (gl) gl.style.setProperty('display', wn === 0 ? 'none' : '');
      if (gc) gc.style.setProperty('display', wn === 0 ? 'none' : '');
      if (wcard) {
        var goalEl = wcard.querySelector('div[style*="line-height: 1.35"]');
        if (goalEl) {
          for (var c = 0; c < goalEl.childNodes.length; c++) {
            var node = goalEl.childNodes[c];
            if (node.nodeType === 3 && node.nodeValue !== '') node.nodeValue = '';
          }
          var gsp = goalEl.querySelector('span');
          if (gsp) { gsp.style.setProperty('font-weight', '700'); }
        }
      }
    }

    // Form Score card
    var fs = sectionAfter('Form Score');
    if (fs && fs.next) {
      var fcard = fs.next.children[0];
      setEmpty(fcard, !d.form || d.form.length === 0, 'No form scores yet', 'Finish a form-checked exercise and your score over time shows up here.', { radius: '28px' });
      var chg = fcard && fcard.querySelector('span[style*="font-weight: 700"]');
      var chgRow = chg && chg.parentElement;
      if (chgRow) chgRow.style.setProperty('visibility', d.form && d.form.length >= 2 ? 'visible' : 'hidden');
    }

    // Personal Bests
    var pb = sectionAfter('Personal Bests');
    if (pb && pb.next) setEmpty(pb.next, !d.bests || d.bests.length === 0, 'No personal bests yet', 'Finish your first workout and your records land here.', { inset: '14px 14px 20px', radius: '24px', minH: 170 });

    // Past Workouts
    var pw = sectionAfter('Past Workouts');
    if (pw && pw.next) setEmpty(pw.next, !d.workouts || d.workouts.length === 0, 'No workouts yet', 'Your finished workouts show up here with a form score.', { inset: '12px 14px 20px', radius: '26px', minH: 190 });

    // Progress Photos — the whole card opens the real photo screen
    var pp = sectionAfter('Progress Photos');
    if (pp && pp.next && pp.next.children[0]) pp.next.children[0].setAttribute('data-athlt-photos', '1');

    return { okFit: okFit, filled: true };
  }

  // Swallow taps inside the photo card (date inputs etc.) and open the photo screen instead.
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-athlt-photos]') : null;
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    post({ type: 'photos' });
  }, true);

  var reported = false, lastAsk = 0, deb;
  function tick() {
    var r = apply();
    if (!window.__athltData && Date.now() - lastAsk > 700) { lastAsk = Date.now(); post({ type: 'needData' }); }
    if (!reported && r.okFit && r.filled && window.__athltLogicReady && leafWithText('Progress')) {
      reported = true;
      post({ type: 'ready' });
    }
  }
  function schedule() { clearTimeout(deb); deb = setTimeout(tick, 50); }
  try { new MutationObserver(schedule).observe(document, { childList: true, subtree: true, attributes: false }); } catch (e) {}
  window.addEventListener('resize', schedule);
  setInterval(tick, 500);
  tick();
})();
true;
`;
