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
  // Both charts draw into an svg that is 88% of a 326px card = 287px wide and 190px tall, with viewBox "0 0 287 190":
  // one svg unit = one css px, so the y of a dot is also the y the (html) axis labels and tooltips use. The old
  // 326-wide viewBox shrank the drawing to 0.88 and centred it, which pushed every dot off its own axis label.
  // (An axis row is 13px tall and its guide line runs through its middle, so a row sits at y - 6.5.)
  var VW = 287, GUT = 39.12;
  // ── Label above its dot, never touching the line ──────────────────────────────────────────────────────────
  // The tap label (black pill) sits directly above its dot. It is centred on the dot and only slides sideways as far
  // as needed to stay on the card/screen (the dot is still under it). Its height is then chosen from the REAL drawn
  // curve: its bottom edge is at least 10px above the highest point of the line anywhere under the label, so the
  // line can never run through it. Plot top is y=30, so the highest dot still has room for the label above it
  // (and clear of the range pills).
  var PILL_PAD = 10, EDGE_L = -8, EDGE_R = 340;
  function measurePill(text) {
    var el = document.getElementById('__tipm');
    if (!el) {
      el = document.createElement('span'); el.id = '__tipm';
      el.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;padding:0 ' + PILL_PAD + 'px;';
      try { var root = document.getElementById('dc-root'); if (root) el.style.fontFamily = getComputedStyle(root).fontFamily; } catch (e) {}
      document.body.appendChild(el);
    }
    el.textContent = text;
    return el.offsetWidth || (String(text).length * 7.4 + 2 * PILL_PAD);
  }
  function sampleCurve(d) {
    var NS = 'http://www.w3.org/2000/svg', out = [];
    try {
      var sv = document.createElementNS(NS, 'svg'), pa = document.createElementNS(NS, 'path');
      sv.setAttribute('width', '0'); sv.setAttribute('height', '0'); sv.style.cssText = 'position:absolute;left:-9999px;top:0';
      pa.setAttribute('d', d); sv.appendChild(pa); document.body.appendChild(sv);
      var L = pa.getTotalLength();
      for (var l = 0; l <= L; l += 1) { var q = pa.getPointAtLength(l); out.push([q.x, q.y]); }
      document.body.removeChild(sv);
    } catch (e) {}
    return out;
  }
  function placeTip(dotX, dotY, lineD, text) {
    var w = measurePill(text);
    var cx = Math.max(EDGE_L + w / 2, Math.min(EDGE_R - w / 2, GUT + dotX));
    var lo = cx - w / 2 - GUT - 4, hi = cx + w / 2 - GUT + 4, minY = dotY;
    var smp = lineD ? sampleCurve(lineD) : [];
    for (var i = 0; i < smp.length; i++) if (smp[i][0] >= lo && smp[i][0] <= hi && smp[i][1] < minY) minY = smp[i][1];
    return { left: cx.toFixed(1) + 'px', top: Math.min(dotY - 12, minY - 10).toFixed(1) + 'px' };
  }
  function tipLeft(x) { return Math.max(24, Math.min(76, (GUT + x) / 326 * 100)).toFixed(1) + '%'; }
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
      // The tapped weigh-in (like the Form Score chart); the newest one until something is tapped.
      var selIdx = series.length ? (s.wSel == null || s.wSel >= series.length ? series.length - 1 : s.wSel) : -1;
      window.__athltWSel = selIdx;
      window.__athltWPick = function (i) { self.setState({ wSel: i }); };
      var shown = series.length ? series[selIdx].w : null;
      if (series.length) {
        var vals = series.map(function (e) { return e.w; });
        var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
        // Same frame as the Form Score chart: five evenly spaced guide lines (whole-number labels), plot area
        // y 18..170 with the baseline at 176, points from x 8 to 286.
        var STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200], tick = 1, lo = 0, hi = 4;
        for (var si = 0; si < STEPS.length; si++) {
          tick = STEPS[si]; lo = Math.floor((vmin - 2) / tick) * tick; hi = lo + 4 * tick;
          if (hi >= vmax + 2) break;
        }
        var yOf = function (w) { return 170 - ((w - lo) / (hi - lo)) * 140; };
        var t0 = parseKey(series[0].d).getTime(), t1 = parseKey(series[series.length - 1].d).getTime();
        var pts = series.map(function (e, i) {
          var f = t1 > t0 ? (parseKey(e.d).getTime() - t0) / (t1 - t0) : 0.5;
          return { x: Math.round(8 + (VW - 16) * f), y: yOf(e.w) };
        });
        // every logged weight gets its own dot on the line (drawn by the DOM pass); the last one is the design's own
        window.__athltWPts = series.length >= 2 ? pts.map(function (q, i) { return { x: q.x, y: q.y, w: series[i].w, d: series[i].d }; }) : [];
        // A single weigh-in can't draw a trend, so draw it as a level line across the chart ending in
        // the dot (the same way the design's line ends at the current value) instead of a lone floating dot.
        if (pts.length === 1) pts = [{ x: 8, y: pts[0].y }, { x: VW - 8, y: pts[0].y }];
        var endPt = pts[pts.length - 1];
        var lp = series.length >= 2 ? pts[selIdx] : endPt; // the point the dot, guide line and label sit on
        if (pts.length >= 2) {
          line = this.curve(pts);
          area = line + ' L' + endPt.x + ' 176 L' + pts[0].x + ' 176 Z';
        }
        for (var ti = 0; ti < 5; ti++) { var tv = hi - ti * tick; ticks.push({ top: (yOf(tv) - 6.5) + 'px', label: String(tv) }); }
        lastPt = { x: lp.x, y: lp.y, left: tipLeft(lp.x), top: (lp.y - 12) + 'px' }; // (the single pill is hidden on this chart; every weight carries its own label)
        months = axisLabels(t0, t1);
      }

      // One-line summary under the chart (replaces "You're X% of the way to your goal" —
      // there is no goal weight stored locally to compute that from).
      var summary;
      var dlabel = function (k) { var dt = parseKey(k); return MON[dt.getMonth()] + ' ' + dt.getDate(); };
      window.__athltChart = all.length === 0 ? 'none' : series.length === 0 ? 'range' : 'ok';
      if (all.length === 0) summary = 'Log your weight to start your chart';
      else if (all.length === 1) summary = 'Log again to see your trend';
      else {
        var diff = Math.round((all[all.length - 1].w - all[0].w) * 10) / 10;
        summary = diff === 0 ? 'Same weight as ' + dlabel(all[0].d)
          : Math.abs(diff) + ' lb ' + (diff < 0 ? 'down' : 'up') + ' since ' + dlabel(all[0].d);
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
        // "Oct 20 · 180" + the design's own " lb"
        wNow: shown == null ? '–' : dlabel(series[selIdx].d) + ' · ' + fmt(shown),
        wLine: line, wArea: area, wTicks: ticks, wLast: lastPt, wMonths: months,
        wGoalPctLabel: summary,
        wRanges: ['2m', '6m', '1y', 'All'].map(function (label, i) {
          var p = pillStyle(i === ri);
          return { label: label, fg: p.fg, bg: p.bg, shadow: p.shadow, pick: function () { self.setState({ wRange: i, wSel: null }); } };
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
      // Front/Back must flip in the same render as the tap, not after the next DOM pass.
      if (window.__athltFlip) window.__athltFlip();

      v.rankName = R.label;
      v.rankPct = R.pct + '%';
      v.nextRank = R.nextLabel;
      v.topPct = '';

      // Photos open the design's own Photos page inside this page - instant, no navigation.
      v.openPhotos = function (e) { if (e && e.preventDefault) e.preventDefault(); self.go('photos'); };
      window.__athltApi = { openPhotos: function () { self.go('photos'); }, pose: ['front', 'side', 'back'][s.pose || 0] };

      // ── Progress photos (real, saved on the device) ──
      var pose = ['front', 'side', 'back'][s.pose || 0];
      var allPh = d.photos || [];
      var ofPose = allPh.filter(function (p) { return p.pose === pose; });
      var nearest = function (list, dateStr, newest) {
        if (!list.length) return null;
        if (!dateStr) return newest ? list[0] : list[list.length - 1];
        var t = new Date(dateStr + 'T12:00:00').getTime(), best = list[0], bd = Infinity;
        for (var i = 0; i < list.length; i++) { var dd = Math.abs(list[i].ts - t); if (dd < bd) { bd = dd; best = list[i]; } }
        return best;
      };
      // B = the newer photo (or the one nearest its date). A must be a DIFFERENT photo: with only one photo
      // of this pose there is nothing to compare against, so A stays empty instead of repeating B.
      var pb = nearest(ofPose, s.cmpB, true);
      var pa = nearest(ofPose.filter(function (p) { return !pb || p.id !== pb.id; }), s.cmpA, false);
      v.cmpALabel = pa ? pa.label : 'No photo'; v.cmpBLabel = pb ? pb.label : 'No photo';
      v.photoMonths = ofPose.map(function (p) { return p.label; }).concat(['Add photo']);
      var card3 = allPh.slice(0, 3);
      for (var ci = 0; ci < 3; ci++) {
        v['ppDate' + ci] = card3[ci] ? card3[ci].label : 'No photo yet';
        v['ppDate' + ci + 'Fg'] = card3[ci] ? '#111114' : '#5f5f69';
      }
      window.__athltPhotoView = { card: card3, cmpA: pa, cmpB: pb, grid: ofPose };

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
      // One point per real day (the day's average). The line is drawn through EXACTLY these points, with the design's
      // own monotone curve (it never overshoots), and the tap dot sits at the very same x/y - so a dot is always on
      // the line at its real value. (It used to smooth the line and fold long histories into 12 buckets while the
      // dots stayed at the raw values, which is why a tapped dot floated off the line.)
      var byDay = {};
      series.forEach(function (f) { var k = new Date(f.ts); k.setHours(0, 0, 0, 0); var kk = +k; (byDay[kk] = byDay[kk] || []).push(f.pct); });
      var mean = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
      var realDays = Object.keys(byDay).map(Number).sort(function (a, b) { return a - b; }).map(function (t) { return { ts: t, pct: mean(byDay[t]) }; });
      if (realDays.length) {
        var pcts = realDays.map(function (f) { return f.pct; });
        var minV = Math.floor((Math.min.apply(null, pcts) - 4) / 5) * 5, maxV = Math.ceil((Math.max.apply(null, pcts) + 4) / 5) * 5;
        if (maxV <= minV) maxV = minV + 5;
        var yOf = function (p) { return Math.round(170 - ((p - minV) / (maxV - minV)) * 140); };
        var t0 = realDays[0].ts, t1 = realDays[realDays.length - 1].ts;
        var rpts = realDays.map(function (f) {
          var fr = t1 > t0 ? (f.ts - t0) / (t1 - t0) : 0.5;
          return { v: f.pct, x: Math.round((8 + (VW - 16) * fr) * 10) / 10, y: 170 - ((f.pct - minV) / (maxV - minV)) * 140, ts: f.ts };
        });
        var sel = s.sel == null || s.sel >= rpts.length ? rpts.length - 1 : s.sel;
        var ln = rpts.length >= 2 ? this.curve(rpts) : '';
        var mid = Math.round((minV + maxV) / 2), q = (maxV - minV) / 4;
        v.line = ln;
        v.area = ln ? ln + ' L' + rpts[rpts.length - 1].x + ' 176 L' + rpts[0].x + ' 176 Z' : '';
        v.fTicks = [maxV, maxV - q, mid, minV + q, minV].map(function (x) { return Math.round(x); })
          .map(function (x) { return { y: 170 - ((x - minV) / (maxV - minV)) * 140, ty: yOf(x) + 4, top: ((170 - ((x - minV) / (maxV - minV)) * 140) - 6.5) + 'px', label: x + '%' }; });
        v.fXs = axisLabels(t0, t1);
        // tap columns: each real day owns the stretch up to halfway to its neighbours
        v.pts = rpts.map(function (pt, i) {
          var x0 = i === 0 ? 0 : (rpts[i - 1].x + pt.x) / 2, x1 = i === rpts.length - 1 ? VW : (pt.x + rpts[i + 1].x) / 2;
          return { x: pt.x, y: pt.y, hx: x0, hw: Math.max(1, x1 - x0),
            r: i === sel ? 5.5 : 0, guide: i === sel ? 0.5 : 0, pick: function () { self.setState({ sel: i }); } };
        });
        // the exact date of the tapped day and that day's own percent
        var dl = function (ts) { var dt = new Date(ts); return MON[dt.getMonth()] + ' ' + dt.getDate(); };
        var sp = rpts[sel], dateTxt = dl(sp.ts);
        v.tipText = dateTxt + ' · ' + Math.round(sp.v) + '%';
        var tp = placeTip(sp.x, sp.y, ln, v.tipText);
        v.tipX = tp.left;
        v.tipY = tp.top;
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
    // The screens the page opens when you tap (Log weight, Progress Photos, a workout, the rank page) slide in with the
    // design's own push (opacity + translateX only: nothing is laid out while it runs). Every other entrance stays off.
    + '#dc-root div[style*="pg-in"]{animation:pg-in 300ms cubic-bezier(.22,1,.36,1) both!important;-webkit-animation:pg-in 300ms cubic-bezier(.22,1,.36,1) both!important;will-change:transform,opacity;}'
    + '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}'
    // tapping a chart point must never flash the system tap-highlight box or a focus ring around the graph
    + '*,*:focus,*:active{-webkit-tap-highlight-color:rgba(0,0,0,0)!important;outline:none!important;}'
    // fake tab bar + FAB from the artboard (the real native ones exist app-wide)
    + 'div[style*="right: 88px"][style*="bottom: 22px"][style*="height: 64px"]{display:none!important;}'
    + 'div[style*="right: 14px"][style*="bottom: 22px"][style*="width: 64px"][style*="height: 64px"]{display:none!important;}'
    // never zoom on focus inside the date inputs
    + 'input{font-size:16px!important;}'
    // The page's own markup shows raw template text ("{{ rankName }}") until its logic renders. Nothing
    // is painted until the pass below has seen real content and marks <html data-pready>; the bundle
    // replaces <html> while unpacking, so every fresh document starts hidden again.
    + 'html:not([data-pready]) body{visibility:hidden!important;}';

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

  // Show the selected side of the big body map (both sides are already in the page).
  function flipSide() {
    var root = document.getElementById('dc-root');
    if (!root) return;
    var side = window.__athltSide || 0;
    var els = root.querySelectorAll('div[aria-label="Body map space"][style*="height: 300px"] > [data-side]');
    for (var i = 0; i < els.length; i++) {
      var want = +els[i].getAttribute('data-side') === side ? 'flex' : 'none';
      if (els[i].style.display !== want) els[i].style.display = want;
    }
  }
  window.__athltFlip = flipSide;

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
    // Only write when something changed: rewriting identical content every pass is a DOM mutation, which wakes
    // the observer, which runs the pass again - an endless loop that keeps the page "busy" forever.
    var osig = [title, sub, (opts && opts.inset) || '', (opts && opts.bg) || '', (opts && opts.radius) || ''].join('|');
    if (ov.__sig === osig) return;
    ov.__sig = osig;
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
    t.style.cssText = 'position:absolute;left:50%;bottom:' + (window.__athltTb || 110) + 'px;transform:translateX(-50%);z-index:200;padding:11px 18px;border-radius:999px;background:#111114;color:#fff;'
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

    // The native tab bar overlays the bottom of this page. Everything that scrolls gets bottom padding
    // so its last item can be scrolled clear of the bar, and the weigh-in sheet's keypad (a full-screen
    // overlay) is lifted above it.
    var S = (window.innerHeight || 844) / 844;
    var ins = d.insets || { top: 0, bottom: 0 };
    var tb = (ins.bottom + 49 + 16) / S;
    window.__athltTb = Math.round(tb + 8);
    var scrollers = root.querySelectorAll('div[data-scroll]');
    for (var sc = 0; sc < scrollers.length; sc++) {
      var scEl = scrollers[sc];
      if (scEl.style.overflowY === 'auto' && scEl.style.position === 'absolute') {
        if (scEl.__pb0 === undefined) scEl.__pb0 = parseFloat(scEl.style.paddingBottom) || 0;
        scEl.style.setProperty('padding-bottom', Math.max(scEl.__pb0, tb + 24).toFixed(1) + 'px', 'important');
      }
    }
    var sheet = root.querySelector('div[style*="z-index: 60"]');
    if (sheet) {
      // The keys sit above the tab bar, but the keypad's own grey runs all the way to the bottom edge
      // (padding goes inside the grey tray, not outside it where the white sheet would show through).
      sheet.style.setProperty('padding-bottom', '0px', 'important');
      var tray = sheet.querySelector('div[style*="30px 30px 0"]');
      if (tray) {
        if (tray.__pb0 === undefined) tray.__pb0 = parseFloat(tray.style.paddingBottom) || 30;
        tray.style.setProperty('padding-bottom', (tray.__pb0 + tb).toFixed(1) + 'px', 'important');
      }
    }
    // Date picker: the month chips are a horizontally scrolling row whose last chip is cut off.
    // Make them share the row evenly so every month fits with no scrolling.
    if (sheet) {
      var mrows = sheet.querySelectorAll('div[data-scroll][style*="overflow-x"]');
      for (var mr = 0; mr < mrows.length; mr++) {
        var mrow = mrows[mr], chips = mrow.children, allMonths = chips.length > 0;
        for (var mc = 0; mc < chips.length; mc++) if (!/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test((chips[mc].textContent || '').trim())) allMonths = false;
        if (!allMonths) continue;
        if (chips[0].style.flexGrow === '1' && chips[chips.length - 1].style.flexGrow === '1') continue;
        mrow.style.setProperty('overflow-x', 'visible', 'important');
        mrow.style.setProperty('gap', '5px', 'important');
        for (var mc2 = 0; mc2 < chips.length; mc2++) {
          chips[mc2].style.setProperty('flex', '1 1 0', 'important');
          chips[mc2].style.setProperty('min-width', '0', 'important');
          chips[mc2].style.setProperty('padding', '0 2px', 'important');
          chips[mc2].style.setProperty('justify-content', 'center', 'important');
        }
      }
    }
    // date pickers: the design caps them at its own mock "today" (Sep 12 2026)
    var nowD = new Date(), maxStr = nowD.getFullYear() + '-' + String(nowD.getMonth() + 1).padStart(2, '0') + '-' + String(nowD.getDate()).padStart(2, '0');
    var dateInputs = root.querySelectorAll('input[type="date"]');
    for (var di = 0; di < dateInputs.length; di++) if (dateInputs[di].getAttribute('max') !== maxStr) dateInputs[di].setAttribute('max', maxStr);

    // Body maps — rank card (both sides) + Muscle Map page (selected side)
    var slots = root.querySelectorAll('div[aria-label="Body map space"]');
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var big = slot.style.height === '300px';
      var sig = (big ? 'big' : 'card') + '|' + VERSION;
      if (slot.__sig === sig) { if (big) flipSide(); continue; }
      slot.__sig = sig;
      var fig = function (svg, h) { return '<div style="height:' + h + 'px;aspect-ratio:480/833;flex:none;">' + svg + '</div>'; };
      if (big) {
        // both sides are built once; Front/Back only toggles which one is displayed (instant)
        var wrap = function (n, svg) { return '<div data-side="' + n + '" style="height:100%;align-items:center;justify-content:center;display:' + ((window.__athltSide || 0) === n ? 'flex' : 'none') + ';">' + fig(svg, 292) + '</div>'; };
        slot.innerHTML = wrap(0, d.bodyMap.front) + wrap(1, d.bodyMap.back);
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
      if (info.icon && icons[m].__icon !== info.icon) {
        icons[m].__icon = info.icon;
        icons[m].style.setProperty('background-image', 'url(' + info.icon + ')', 'important');
        icons[m].style.setProperty('background-size', '78%', 'important');
        icons[m].style.setProperty('background-repeat', 'no-repeat', 'important');
        icons[m].style.setProperty('background-position', 'center', 'important');
      }
      icons[m].style.setProperty('opacity', info.tier ? '1' : '0.5');
    }

    // Weight card
    var wsvg = null, svgs = root.querySelectorAll('svg');
    for (var s = 0; s < svgs.length; s++) { if (svgs[s].querySelector('path[fill="url(#pgWt)"]')) { wsvg = svgs[s]; break; } }
    // Form Score chart: same 1 svg unit = 1 css px frame as the weight chart (see VW in the logic above)
    for (var fv = 0; fv < svgs.length; fv++) if (svgs[fv] !== wsvg && svgs[fv].getAttribute('viewBox') === '0 0 326 190') svgs[fv].setAttribute('viewBox', '0 0 287 190');
    if (wsvg) {
      var wcard = wsvg.closest('div[style*="border-radius: 28px"]');
      var chartBox = wsvg.parentElement; // the position:relative 150px box
      var wn = d.weight ? d.weight.length : 0;
      var ch = window.__athltChart || (wn === 0 ? 'none' : 'ok');
      var latestW = wn ? d.weight[wn - 1] : null;
      if (ch === 'none') setEmpty(chartBox, true, 'No weigh-ins yet', 'Tap Log weight to add your first one and your chart starts here.', { radius: '16px' });
      else if (ch === 'range') {
        var lp2 = latestW.d.split('-');
        setEmpty(chartBox, true, 'No weigh-ins in this range', 'Your latest is ' + (Math.round(latestW.w * 10) / 10) + ' lb on ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+lp2[1] - 1] + ' ' + (+lp2[2]) + '. Try a longer range.', { radius: '16px' });
      } else setEmpty(chartBox, false);
      var tip = chartBox.querySelector('div[style*="translate(-50%, -100%)"]');
      // every weigh-in is labelled on the graph itself (below), so the single black "latest" pill is not used here
      if (tip) tip.style.setProperty('display', 'none', 'important');
      // The weight chart is laid out exactly like the Form Score chart: same 190px frame (svg 88% wide, 12% gutter
      // for the axis labels), 30px label column, 2.8px line, baseline, dashed guide + ring on the tapped point.
      if (chartBox.style.getPropertyValue('height') !== '190px') chartBox.style.setProperty('height', '190px', 'important');
      if (chartBox.style.marginTop !== '16px') chartBox.style.setProperty('margin-top', '16px', 'important');
      var lblCols = chartBox.querySelectorAll('div[style*="width: 26px"], div[style*="width: 30px"]');
      for (var lc = 0; lc < lblCols.length; lc++) if (lblCols[lc].style.width !== '30px') lblCols[lc].style.setProperty('width', '30px', 'important');
      if (wsvg.getAttribute('viewBox') !== '0 0 287 190') {
        wsvg.setAttribute('viewBox', '0 0 287 190'); wsvg.setAttribute('width', '88%'); wsvg.setAttribute('height', '190');
        wsvg.style.setProperty('position', 'static', 'important'); wsvg.style.setProperty('left', 'auto', 'important');
        wsvg.style.setProperty('top', 'auto', 'important'); wsvg.style.setProperty('margin-left', '12%', 'important');
      }
      var xrow = chartBox.nextElementSibling;
      if (xrow && xrow.style.paddingLeft !== '12%') xrow.style.setProperty('padding', '8px 0 0 12%', 'important');
      var wline = wsvg.querySelectorAll('path')[1];
      if (wline && wline.getAttribute('stroke-width') !== '2.8') wline.setAttribute('stroke-width', '2.8');
      var base = wsvg.querySelector('line[data-athlt-base]');
      if (!base) {
        base = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        base.setAttribute('data-athlt-base', '1');
        base.setAttribute('x1', '0'); base.setAttribute('y1', '176'); base.setAttribute('x2', '287'); base.setAttribute('y2', '176');
        base.setAttribute('stroke', 'rgba(17,17,20,0.08)'); base.setAttribute('stroke-width', '1');
        wsvg.insertBefore(base, wsvg.querySelector('path'));
      }
      base.style.setProperty('display', ch !== 'ok' ? 'none' : '');
      var gl = wsvg.querySelector('line:not([data-athlt-base])'), gc = wsvg.querySelector('circle:not([data-athlt-pt])');
      if (gl) { if (gl.getAttribute('y2') !== '176') { gl.setAttribute('y2', '176'); gl.setAttribute('stroke-opacity', '0.5'); } }
      if (gc && gc.getAttribute('r') !== '5.5') { gc.setAttribute('r', '5.5'); gc.setAttribute('stroke-width', '2.8'); }
      var tipEl1 = chartBox.querySelector('div[style*="translate(-50%, -100%)"]');
      if (tipEl1 && tipEl1.style.fontVariantNumeric !== 'tabular-nums') tipEl1.style.setProperty('font-variant-numeric', 'tabular-nums');
      // Tapping works like the Form Score chart: every logged weight owns a full-height column (up to the
      // halfway point to its neighbours); the tapped one gets the ring, guide and tooltip.
      var wp = ch === 'ok' ? (window.__athltWPts || []) : [];
      if (!(wp.length >= 2 && wp.length <= 60)) wp = [];
      var wsel = window.__athltWSel == null ? -1 : window.__athltWSel;
      var dsig = wp.map(function (q) { return q.x + ',' + q.y + ',' + q.w + ',' + q.d; }).join(';') + '|' + wsel;
      if (wsvg.__dotSig !== dsig) {
        wsvg.__dotSig = dsig;
        var oldDots = wsvg.querySelectorAll('[data-athlt-pt]');
        for (var od = 0; od < oldDots.length; od++) oldDots[od].remove();
        var NS = 'http://www.w3.org/2000/svg';
        var mk = function (tag, attrs) {
          var e = document.createElementNS(NS, tag);
          e.setAttribute('data-athlt-pt', tag);
          for (var k in attrs) e.setAttribute(k, attrs[k]);
          return e;
        };
        for (var nd = 0; nd < wp.length; nd++) {
          var x0 = nd === 0 ? 0 : (wp[nd - 1].x + wp[nd].x) / 2, x1 = nd === wp.length - 1 ? 287 : (wp[nd].x + wp[nd + 1].x) / 2;
          var hit = mk('rect', { x: x0, y: 0, width: Math.max(1, x1 - x0), height: 190, fill: 'transparent' });
          hit.setAttribute('data-athlt-pt', 'hit');
          hit.style.pointerEvents = 'all'; hit.style.cursor = 'pointer';
          (function (idx) { hit.addEventListener('click', function (ev) { ev.stopPropagation(); if (window.__athltWPick) window.__athltWPick(idx); }, true); })(nd);
          wsvg.appendChild(hit);
        }
        // a small dot on the line for every weigh-in
        for (var dd = 0; dd < wp.length; dd++) {
          if (dd === wsel) continue; // the tapped one gets the design's own ring
          var dot = mk('circle', { cx: wp[dd].x, cy: wp[dd].y, r: 3.4, fill: '#ffffff', stroke: '#111114', 'stroke-width': 2.2 });
          dot.setAttribute('data-athlt-pt', 'dot'); dot.style.pointerEvents = 'none';
          wsvg.appendChild(dot);
        }
        // Every weigh-in shows its date and weight right on the graph, no tap needed. A label always sits directly
        // ABOVE its own dot (it only slides sideways as far as needed to stay inside the card, the dot stays under it).
        // Its height comes from the REAL drawn line: the label's bottom edge is kept above the highest point of the
        // line anywhere under it, so a label never touches the line. The tapped weigh-in is placed first, then the
        // newest, then the rest; a label that would touch one already placed is left out, so labels never overlap.
        wsvg.style.setProperty('overflow', 'visible', 'important');
        var MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var smp = [];
        try {
          var wl = wsvg.querySelectorAll('path')[1], tl = wl.getTotalLength();
          for (var sl = 0; sl <= tl; sl += 1) { var sq = wl.getPointAtLength(sl); smp.push([sq.x, sq.y]); }
        } catch (e) {}
        if (!smp.length) smp = wp.map(function (q) { return [q.x, q.y]; });
        var LW = 34, LH = 24, placed = [];
        var order = [];
        if (wsel >= 0) order.push(wsel);
        for (var oi = wp.length - 1; oi >= 0; oi--) if (oi !== wsel) order.push(oi);
        for (var oj = 0; oj < order.length; oj++) {
          var li = order[oj], q = wp[li], isSel = li === wsel;
          // Centred on its dot; if that touches a label already placed, slide it sideways in small steps (the dot
          // stays under its own label) before giving up on it.
          // Still crowded: a second row, one label-height higher (still straight above its own dot, further from the line).
          var rect = null, lx = 0, bottom = 0;
          var offs = [0, 4, -4, 8, -8, 12, -12];
          for (var row = 0; row < 2 && !rect; row++) {
            for (var oi2 = 0; oi2 < offs.length && !rect; oi2++) {
              var tx = Math.max(LW / 2, Math.min(287 - LW / 2, q.x + offs[oi2]));
              if (Math.abs(tx - q.x) > LW / 2 - 4) continue;
              var minY = q.y;
              for (var si = 0; si < smp.length; si++) if (smp[si][0] >= tx - LW / 2 - 3 && smp[si][0] <= tx + LW / 2 + 3 && smp[si][1] < minY) minY = smp[si][1];
              var bt = Math.min(q.y - (isSel ? 10 : 8), minY - 6) - row * (LH + 3);
              if (bt - LH < -8) continue; // would leave the chart's headroom
              var r2 = [tx - LW / 2, bt - LH, tx + LW / 2, bt], clash = false;
              for (var pr = 0; pr < placed.length; pr++) { var c = placed[pr]; if (r2[0] < c[2] + 2 && c[0] < r2[2] + 2 && r2[1] < c[3] + 2 && c[1] < r2[3] + 2) { clash = true; break; } }
              if (!clash) { rect = r2; lx = tx; bottom = bt; }
            }
          }
          if (!rect) continue;
          placed.push(rect);
          var dp = q.d.split('-'), dtxt = MONS[+dp[1] - 1] + ' ' + (+dp[2]);
          var wtxt = String(Math.round(q.w * 10) / 10);
          var t1 = mk('text', { x: lx, y: bottom - 13, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#111114' });
          t1.textContent = wtxt;
          var t2 = mk('text', { x: lx, y: bottom - 2, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 600, fill: isSel ? '#111114' : '#8e8e96' });
          t2.textContent = dtxt;
          [t1, t2].forEach(function (t) { t.style.pointerEvents = 'none'; t.style.fontVariantNumeric = 'tabular-nums'; wsvg.appendChild(t); });
        }
      }
      if (gl) gl.style.setProperty('display', ch !== 'ok' ? 'none' : '');
      if (gc) gc.style.setProperty('display', ch !== 'ok' ? 'none' : '');
      if (wcard) {
        var goalEl = wcard.querySelector('div[style*="line-height: 1.35"]');
        if (goalEl) {
          for (var c = 0; c < goalEl.childNodes.length; c++) {
            var node = goalEl.childNodes[c];
            if (node.nodeType === 3 && node.nodeValue !== '') node.nodeValue = '';
          }
          var gsp = goalEl.querySelector('span');
          if (gsp) { gsp.style.setProperty('font-weight', '700'); }
          // same footer type as the Form Score card: 13.5px / 500 / #3c3c43, 7px from the orb
          goalEl.style.setProperty('font-size', '13.5px'); goalEl.style.setProperty('font-weight', '500'); goalEl.style.setProperty('color', 'rgb(60, 60, 67)');
          if (goalEl.parentElement) goalEl.parentElement.style.setProperty('gap', '7px');
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

    // Progress Photos — the whole home card opens the design's own Photos page (in-page, instant)
    var pp = sectionAfter('Progress Photos');
    var ppCard = pp && pp.next && pp.next.children[0];
    if (ppCard) ppCard.setAttribute('data-athlt-photos', '1');
    var pv = window.__athltPhotoView || { card: [], grid: [], cmpA: null, cmpB: null };
    // Every photo is decoded as soon as the data lands, so opening the Photos page or switching Front / Side / Back
    // paints the pictures in the very first frame instead of an empty slot that fills a moment later.
    var allPh = (d.photos || []);
    window.__phImgs = window.__phImgs || {};
    for (var pi = 0; pi < allPh.length; pi++) {
      var ph0 = allPh[pi];
      if (ph0 && ph0.thumb && !window.__phImgs[ph0.id + '|' + ph0.thumb.length]) {
        var im0 = new Image(); im0.src = ph0.thumb; window.__phImgs[ph0.id + '|' + ph0.thumb.length] = im0;
        try { if (im0.decode) im0.decode().catch(function () {}); } catch (e0) {}
      }
    }
    var setPhoto = function (el, photo) {
      var sig = photo ? photo.id + '|' + (photo.thumb ? photo.thumb.length : 0) : '';
      if (el.__phSig === sig) return;
      el.__phSig = sig;
      if (photo && photo.thumb) {
        el.style.setProperty('background', 'url(' + photo.thumb + ') center / cover no-repeat', 'important');
        el.style.setProperty('border-style', 'solid', 'important');
        el.style.setProperty('border-color', 'rgba(17,17,20,0.08)', 'important');
        for (var ci = 0; ci < el.children.length; ci++) el.children[ci].style.setProperty('visibility', 'hidden');
      } else {
        el.style.removeProperty('background'); el.style.removeProperty('border-style'); el.style.removeProperty('border-color');
        for (var cj = 0; cj < el.children.length; cj++) el.children[cj].style.removeProperty('visibility');
      }
    };
    var addPhoto = function () { post({ type: 'addPhoto', pose: window.__athltApi && window.__athltApi.pose }); };
    // the 3 slots on the home card = the 3 newest photos
    var cardSlots = ppCard ? ppCard.querySelectorAll('div[style*="aspect-ratio: 3 / 4"]') : [];
    for (var ps = 0; ps < cardSlots.length; ps++) setPhoto(cardSlots[ps], pv.card[ps] || null);
    // Photos page: compare slots + All Photos grid
    var cmpSlots = root.querySelectorAll('div[style*="aspect-ratio: 3 / 4"][style*="border-radius: 20px"]');
    if (cmpSlots[0]) setPhoto(cmpSlots[0], pv.cmpA);
    if (cmpSlots[1]) setPhoto(cmpSlots[1], pv.cmpB);
    var gridTiles = root.querySelectorAll('div[style*="aspect-ratio: 3 / 4"][style*="border-radius: 16px"]');
    for (var gt = 0; gt < gridTiles.length; gt++) {
      setPhoto(gridTiles[gt], pv.grid[gt] || null);
      if (!gridTiles[gt].__addWired) {
        gridTiles[gt].__addWired = true;
        gridTiles[gt].addEventListener('click', function (ev) {
          var list = Array.prototype.slice.call(root.querySelectorAll('div[style*="aspect-ratio: 3 / 4"][style*="border-radius: 16px"]'));
          var gi = list.indexOf(ev.currentTarget), grid = window.__athltPhotoView ? window.__athltPhotoView.grid : [];
          if (gi >= grid.length) addPhoto(); else post({ type: 'viewPhoto', id: grid[gi].id });
        }, true);
      }
    }
    for (var cs = 0; cs < cmpSlots.length; cs++) {
      if (!cmpSlots[cs].__addWired) {
        cmpSlots[cs].__addWired = true;
        cmpSlots[cs].addEventListener('click', function (ev) {
          var pvw = window.__athltPhotoView || {}, ph = ev.currentTarget === cmpSlots[0] ? pvw.cmpA : pvw.cmpB;
          if (ph) post({ type: 'viewPhoto', id: ph.id }); else addPhoto();
        }, true);
      }
    }
    var links2 = root.querySelectorAll('a');
    for (var l2 = 0; l2 < links2.length; l2++) {
      if (!links2[l2].__addWired && /^Add today.s photo$/.test((links2[l2].textContent || '').trim())) {
        links2[l2].__addWired = true;
        links2[l2].addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); addPhoto(); }, true);
      }
    }

    // Share button (top right): hands off to the native share sheet
    var shareBtn = root.querySelector('div[aria-label="Share"]');
    if (shareBtn && !shareBtn.__shareWired) {
      shareBtn.__shareWired = true;
      shareBtn.addEventListener('click', function (ev) { ev.stopPropagation(); post({ type: 'share' }); }, true);
    }

    // Past Workouts: a real frame from each workout's video instead of the black box
    var wk = d.workouts || [];
    var vidBoxes = root.querySelectorAll('div[role="img"][aria-label$=" video"]');
    var listBoxes = root.querySelectorAll('div[style*="width: 74px"][style*="height: 92px"]');
    var setThumb = function (el, w) {
      var sig = w.thumb ? 'v' + w.thumb.length : w.fallback ? 'f' + w.fallback.length : '';
      if (!sig || el.__thumb === sig) return;
      el.__thumb = sig;
      if (w.thumb) {
        el.style.setProperty('background-image', 'url(' + w.thumb + ')', 'important');
        el.style.setProperty('background-size', 'cover', 'important');
        el.style.setProperty('background-position', 'center', 'important');
      } else {
        // no video frame: the muscle icon on a dark tile (never a black box)
        el.style.setProperty('background-image', 'url(' + w.fallback + '), linear-gradient(160deg, #3b4156 0%, #15171e 100%)', 'important');
        el.style.setProperty('background-size', '46%, cover', 'important');
        el.style.setProperty('background-position', 'center, center', 'important');
        el.style.setProperty('background-repeat', 'no-repeat, no-repeat', 'important');
      }
    };
    for (var vb = 0; vb < vidBoxes.length; vb++) if (wk[vb]) setThumb(vidBoxes[vb], wk[vb]);
    for (var lb = 0; lb < listBoxes.length; lb++) if (wk[lb]) setThumb(listBoxes[lb], wk[lb]);

    return { okFit: okFit, filled: true };
  }

  // Taps anywhere on the home photo card (incl. its date pickers) open the Photos page instead.
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-athlt-photos]') : null;
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (window.__athltApi) window.__athltApi.openPhotos();
  }, true);

  // The artboard links to sibling prototype pages by file name ("Rep Feedback.dc.html"); those files don't
  // exist in the app and following one would blank the WebView, so they are never followed.
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (a && /\.dc\.html?$/i.test(a.getAttribute('href') || '')) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  var reported = false, lastAsk = 0, deb;
  // Real content = the page's logic has rendered with real data: no leftover template text anywhere.
  function pageIsReal(r) {
    var root = document.getElementById('dc-root');
    if (!(r.okFit && r.filled && window.__athltLogicReady && root && leafWithText('Progress'))) return false;
    if ((root.textContent || '').indexOf('{{') >= 0) return false;
    // still for a moment: the viewport has stopped changing and the page has stopped re-rendering
    return !window.__dcSettle || window.__dcSettle(100);
  }
  function setPageReady(on) {
    var h = document.documentElement;
    if (!h) return;
    if (on) { if (!h.hasAttribute('data-pready')) h.setAttribute('data-pready', '1'); }
    else if (h.hasAttribute('data-pready')) h.removeAttribute('data-pready');
  }
  // The native side can ask again at any time (e.g. after a reload) and gets an answer right away.
  window.__athltCheckReady = function () { var ok = pageIsReal(apply()); setPageReady(ok); if (ok) { reported = true; post({ type: 'ready' }); } return ok; };
  function tick() {
    var r = apply();
    if (!window.__athltData && Date.now() - lastAsk > 700) { lastAsk = Date.now(); post({ type: 'needData' }); }
    // Once revealed, the page stays revealed (taps and re-renders must never hide it again); the gate only
    // applies to the first reveal.
    var ok = reported || pageIsReal(r);
    setPageReady(ok);
    if (!reported && ok) {
      reported = true;
      post({ type: 'ready' });
    }
    // data has landed but the page is still settling: look again soon instead of waiting for the interval
    if (!ok && r.okFit && r.filled && window.__athltLogicReady) { clearTimeout(deb); deb = setTimeout(tick, 40); }
  }
  function schedule() { ensureCss(); clearTimeout(deb); deb = setTimeout(tick, 20); }
  // After the first reveal, a screen the page just opened (Log weight, Photos, back to the top) is fixed up
  // IMMEDIATELY, in the same task as the page's own render (before the browser paints it), not 20ms later: a fix
  // that lands a frame after the screen shows is the "glitch" (keypad jumping up, photos popping in, labels appearing).
  var syncing = false;
  try { new MutationObserver(function () {
    if (reported && !syncing) { syncing = true; try { apply(); } catch (e) {} syncing = false; }
    schedule();
  }).observe(document, { childList: true, subtree: true, attributes: false }); } catch (e) {}
  window.addEventListener('resize', schedule);
  setInterval(tick, 250);
  tick();
})();
true;
`;
