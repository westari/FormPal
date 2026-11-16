#!/usr/bin/env node
/**
 * scripts/test-progress-edge.js
 * Progress: under Past workouts and under Personal bests the page background cut from grey to white with a hard straight edge (the sideways
 * scrolling card rows clipped the cards' soft shadows). Checked on the real page by looking at the pixels just below each row: every pixel row
 * must change only a little from the one above (no step), and the row's own box must have room for the shadow.
 */
const { PNG } = require('pngjs');
const path = require('path');
const { openProgress, makeData } = require('./lib/progress-harness.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const { buildProgressData } = require('../lib/progressData.ts');
const withData = () => { const now = Date.now(); const ent = (d, n) => ({ ts: now - d * 86400000, exerciseId: 'squat', displayName: n, reps: 10, goodReps: 9, pct: 90, formChecked: true }); const d = makeData(); Object.assign(d, buildProgressData([ent(0, 'Squat'), ent(1, 'Push-up'), ent(2, 'Curl'), ent(4, 'Lunge')], {}, [], now, { insets: { top: 62, bottom: 34 } }), { form: d.form, weight: d.weight, hasSessions: true }); return d; };
(async () => {
  for (const withReal of [false, true]) {
  console.log('      --- ' + (withReal ? 'with real bests and workouts' : 'empty rows'));
  const { browser, page: p } = await openProgress(withReal ? withData() : makeData());
  await p.waitForTimeout(900);
  const rows = await p.evaluate(() => {
    const main = document.querySelector('#dc-root div[data-scroll]');
    return [...document.querySelectorAll('#dc-root div[data-scroll]')].slice(1).map((e) => { const cs = getComputedStyle(e); return { pad: parseFloat(cs.paddingBottom), mb: parseFloat(cs.marginBottom), un: e.hasAttribute('data-unclip') }; });
  });
  check((withReal ? '[data] ' : '[empty] ') + 'both card rows (Personal bests, Past workouts) have 46px extra room at the bottom, given back by a negative margin (nothing moves)', rows.length === 2 && rows.every((r) => r.un && r.mb === -46 && r.pad >= 46), JSON.stringify(rows));
  // the biggest jump between two neighbouring pixel rows, in a column through a card, from the card's bottom edge down 60px
  for (let i = 0; i < 2; i++) {
    const box = await p.evaluate((i) => { const main = document.querySelector('#dc-root div[data-scroll]'); const e = [...document.querySelectorAll('#dc-root div[data-scroll]')].slice(1)[i]; e.scrollIntoView({ block: 'center' }); const c = e.children[0].getBoundingClientRect(); const r = e.getBoundingClientRect(); return { x: Math.round(c.left + c.width / 2), cardBottom: Math.round(c.bottom), rowBottom: Math.round(r.bottom) }; }, i);
    await p.waitForTimeout(250);
    const box2 = await p.evaluate((i) => { const e = [...document.querySelectorAll('#dc-root div[data-scroll]')].slice(1)[i]; const c = e.children[0].getBoundingClientRect(); const r = e.getBoundingClientRect(); return { x: Math.round(c.left + c.width / 2), cardBottom: Math.round(c.bottom), rowBottom: Math.round(r.bottom) }; }, i);
    const buf = await p.screenshot({ type: 'png' });
    const png = PNG.sync.read(buf), S = png.width / 390;
    const px0 = (x, y) => { const k = (Math.round(y * S) * png.width + Math.round(x * S)) * 4; return (png.data[k] + png.data[k + 1] + png.data[k + 2]) / 3; };
    const px = (x, y) => px0(Math.min(350, Math.max(x, 300)), y); let worst = 0, at = 0;
    for (let y = box2.cardBottom + 8; y < box2.cardBottom + 64 && y < 840; y++) { const d = Math.abs(px(box2.x, y) - px(box2.x, y + 1)); if (d > worst) { worst = d; at = y - box2.cardBottom; } }
    // and across the row's old bottom edge in particular (row bottom + the 46px we gave back)
    check(`${withReal ? '[data] ' : '[empty] '}${i === 0 ? 'Personal bests' : 'Past workouts'}: below the cards the background is seamless (no pixel row steps by more than 3 levels; worst ${worst.toFixed(1)} at ${at}px under the card)`, worst <= 3, JSON.stringify(box2));
    await p.screenshot({ path: path.join(__dirname, '..', '.scratch', 'progress-edge-' + (withReal ? 'real-' : '') + i + '.png') });
  }
  await browser.close();
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
