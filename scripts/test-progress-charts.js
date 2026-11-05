#!/usr/bin/env node
/**
 * scripts/test-progress-charts.js
 *
 * Progress tab, Form Score + Weight charts, on the REAL progress.html with the EXACT injection the app ships.
 *   - every point (tapped one) sits exactly ON the line, and at its real value on the axis the labels draw
 *   - tapping a point leaves no focus box / tap highlight around the chart
 *   - weight chart: every point shows its date and weight without tapping, the form chart stays the way it is
 * Screenshots: .scratch/progress-form.png, .scratch/progress-weight.png
 */
const path = require('path');
const { openProgress, makeData, ROOT } = require('./lib/progress-harness.js');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

// Runs in the page. Which chart: 'form' (the svg whose points are <g> groups) or 'weight' (the svg with the pgWt gradient).
const PAGE_FNS = `
window.__chart = function (which) {
  var svgs = [].slice.call(document.querySelectorAll('svg')).filter(function (s) { return s.getAttribute('viewBox') === '0 0 287 190'; });
  var svg = svgs.filter(function (s) { return which === 'weight' ? !!s.querySelector('path[fill="url(#pgWt)"]') : !s.querySelector('path[fill="url(#pgWt)"]'); })[0];
  return svg;
};
// distance (screen px) from every drawn dot to the drawn line, and the value the dot reads on the axis labels
window.__measure = function (which) {
  var svg = window.__chart(which); if (!svg) return null;
  var box = svg.parentElement;
  var paths = [].slice.call(svg.querySelectorAll('path'));
  var line = paths.filter(function (p) { return p.getAttribute('stroke') === '#111114' && p.getAttribute('fill') === 'none'; })[0];
  var L = line.getTotalLength();
  var ctm = svg.getScreenCTM();
  var dots = [].slice.call(svg.querySelectorAll('circle')).filter(function (c) { return parseFloat(c.getAttribute('r')) > 0 && c.style.display !== 'none'; });
  // axis labels: absolutely positioned rows in the chart box, the label div is 30px wide
  var rows = [].slice.call(box.children).filter(function (e) { return e.tagName === 'DIV' && /top:/.test(e.getAttribute('style') || '') && e.children.length === 2 && e.children[0].style.width === '30px'; });
  var ticks = rows.map(function (r) { var b = r.getBoundingClientRect(); return { v: parseFloat(r.children[0].textContent), y: b.top + b.height / 2 }; }).sort(function (a, b) { return a.y - b.y; });
  var out = [];
  dots.forEach(function (c) {
    var cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy'), best = 1e9;
    for (var i = 0; i <= L; i += 0.25) { var p = line.getPointAtLength(i); var d = Math.hypot(p.x - cx, p.y - cy); if (d < best) best = d; }
    var sy = ctm.d * cy + ctm.f; // dot centre on screen (css px)
    var val = null;
    if (ticks.length >= 2) { var a = ticks[0], b = ticks[ticks.length - 1]; val = a.v + (sy - a.y) / (b.y - a.y) * (b.v - a.v); }
    out.push({ offLine: best * ctm.a, value: val });
  });
  return { dots: out, ticks: ticks.length };
};
`;

(async () => {
  const data = makeData();
  const { browser, page, msgs, logs } = await openProgress(data);
  await page.evaluate(PAGE_FNS);

  for (const which of ['form', 'weight']) {
    const Cap = which === 'form' ? 'Form score' : 'Weight';
    const n = await page.evaluate((w) => { const s = window.__chart(w); return s ? s.querySelectorAll(w === 'form' ? 'g' : 'rect[data-athlt-pt]').length : -1; }, which);
    check(`${Cap}: chart found with one tap target per point`, n > 1, `${n} targets`);
    let worst = 0, worstVal = 0; const seen = [];
    for (let i = 0; i < n; i++) {
      await page.evaluate(([w, i]) => { const s = window.__chart(w); const el = w === 'form' ? s.querySelectorAll('g')[i].querySelector('rect') : s.querySelectorAll('rect[data-athlt-pt]')[i]; el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }, [which, i]);
      await page.waitForTimeout(120);
      const m = await page.evaluate((w) => window.__measure(w), which);
      const label = await page.evaluate((w) => {
        const s = window.__chart(w); const tip = [].slice.call(s.parentElement.querySelectorAll('div')).filter((d) => /translate[(]-50%, -100%[)]/.test(d.getAttribute('style') || ''))[0];
        return tip ? tip.textContent.trim() : '';
      }, which);
      const dot = m && m.dots[0];
      const num = parseFloat((label.match(/([\d.]+)\s*(%|lb)?\s*$/) || [])[1]);
      if (dot) { worst = Math.max(worst, dot.offLine); if (dot.value != null && isFinite(num)) worstVal = Math.max(worstVal, Math.abs(dot.value - num)); }
      seen.push(`${label} (${dot ? dot.offLine.toFixed(2) + 'px off line, reads ' + (dot.value == null ? '?' : dot.value.toFixed(1)) : 'no dot'})`);
    }
    console.log('      ' + seen.join('\n      '));
    check(`${Cap}: every tapped dot sits on the line (worst ${worst.toFixed(2)}px off)`, worst < 0.6);
    check(`${Cap}: every tapped dot is at its real value on the axis labels (worst ${worstVal.toFixed(2)} off)`, worstVal < (which === 'form' ? 0.8 : 0.35));
  }

  // ── weight chart: every point is labelled with its date and weight, nothing needs a tap ──
  {
    await page.evaluate(() => { const s = window.__chart('weight'); s.querySelectorAll('rect[data-athlt-pt]')[3].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const info = await page.evaluate(() => {
      const s = window.__chart('weight');
      const texts = [...s.querySelectorAll('text')].map((t) => t.textContent);
      const dots = [...s.querySelectorAll('circle')].length;
      return { texts, dots };
    });
    const expect = makeData().weight;
    const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const missing = expect.filter((e) => { const [y, m, d] = e.d.split('-').map(Number); return !(info.texts.includes(String(e.w)) && info.texts.includes(`${MONS[m - 1]} ${d}`)); });
    check('Weight: all 8 weigh-ins show their weight AND date on the graph without a tap', missing.length === 0, `missing ${JSON.stringify(missing)}`);
    check('Weight: every weigh-in has a dot on the line (the tapped one has the ring)', info.dots >= expect.length, `${info.dots} circles`);
    const pill = await page.evaluate(() => { const s = window.__chart('weight'); const t = [...s.parentElement.querySelectorAll('div')].filter((d) => /translate[(]-50%, -100%[)]/.test(d.getAttribute('style') || ''))[0]; return t ? getComputedStyle(t).display : 'none'; });
    check('Weight: the single black "latest" pill is gone (the labels replace it)', pill === 'none', pill);
  }
  // many weigh-ins: labels are thinned so none overlap
  {
    const now = Date.now();
    const many = Array.from({ length: 40 }, (_, i) => { const t = new Date(now - (40 - i) * 86400000 * 1.5); return { d: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`, w: 190 - i * 0.2 + (i % 3) }; });
    const b2 = await openProgress(makeData({ weights: many }));
    await b2.page.evaluate(PAGE_FNS);
    await b2.page.evaluate(() => { const r = [...document.querySelectorAll('div')].filter((d) => d.textContent.trim() === 'All' && d.children.length === 0 && d.parentElement.children.length === 4); const w = r[0]; if (w) w.click(); });
    await b2.page.waitForTimeout(400);
    const boxes = await b2.page.evaluate(() => { const s = window.__chart('weight'); return [...s.querySelectorAll('text')].map((t) => { const b = t.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }); });
    let overlap = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if ((i >> 1) === (j >> 1)) continue; // the two lines of one label
      const a = boxes[i], c = boxes[j];
      if (a[0] < c[2] - 0.5 && c[0] < a[2] - 0.5 && a[1] < c[3] - 0.5 && c[1] < a[3] - 0.5) overlap++;
    }
    check(`Weight: with 40 weigh-ins the ${boxes.length / 2} shown labels (date + weight each) do not overlap`, boxes.length >= 10 && overlap === 0, `${boxes.length / 2} labels, ${overlap} overlapping pairs`);
    await b2.browser.close();
  }
  // ── tapping leaves no highlight box / focus ring ──
  {
    const hl = await page.evaluate(() => {
      const f = window.__chart('form'), w = window.__chart('weight');
      const els = [f.querySelector('g'), f.querySelector('g rect'), w.querySelector('rect[data-athlt-pt]'), f, w];
      return els.map((e) => { const c = getComputedStyle(e); return { hl: c.webkitTapHighlightColor, outline: c.outlineStyle, bg: c.backgroundColor }; });
    });
    check('Tapping a chart: tap-highlight colour is fully transparent on every chart element', hl.every((h) => /rgba\(0, 0, 0, 0\)|transparent/.test(h.hl)), JSON.stringify(hl[0]));
    check('Tapping a chart: no focus outline on any chart element', hl.every((h) => h.outline === 'none'), JSON.stringify(hl.map((h) => h.outline)));
  }

    for (const [which, file] of [['form', 'progress-form.png'], ['weight', 'progress-weight.png']]) {
    const card = await page.evaluateHandle((w) => window.__chart(w).closest('div[style*="border-radius: 28px"]'), which);
    await card.asElement().scrollIntoViewIfNeeded();
    await card.asElement().screenshot({ path: path.join(ROOT, '.scratch', file) });
  }
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
