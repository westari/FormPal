#!/usr/bin/env node
/**
 * scripts/test-profile-slide.js  (Profile: tapping a row jumps hard to the next page)
 * Real profile.html + the shipped injection, CPU 4x slower, every animation frame probed. Each row that opens a page is
 * tapped: the new page must slide in (design's own push: opacity + translateX only, not an instant pop), never leave a
 * blank frame, and finish fully visible. INJECT_FILE=<older profileInject.ts> runs the same against older code.
 */
const path = require('path');
const { open } = require(path.join(__dirname, '..', '.scratch', 'tests', 'prof_common.js'));
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
(async () => {
  const { b, p } = await open('full', { rate: 4 });
  await p.waitForTimeout(700);
  await p.evaluate(() => {
    window.__probe = () => { window.__rows = []; window.__on = true; const t = performance.now(); (function loop() { if (!window.__on) return; const v = [...document.querySelectorAll('#dc-root div[style*="pf-in"]')][0]; const cs = v ? getComputedStyle(v) : null; window.__rows.push({ t: Math.round(performance.now() - t), page: !!v, anim: cs ? cs.animationName : '', op: cs ? parseFloat(cs.opacity) : 1, vis: getComputedStyle(document.body).visibility }); requestAnimationFrame(loop); })(); };
  });
  for (const row of ['Personal details', 'Training days', 'Audio coaching', 'Camera setup']) {
    const pt = await p.evaluate((row) => { const e = [...document.querySelectorAll('#dc-root div')].filter(d => d.children.length <= 1 && (d.textContent || '').trim() === row)[0]; if (!e) return null; e.scrollIntoView({ block: 'center' }); return 1; }, row);
    if (!pt) { console.log('      (row not present: ' + row + ')'); continue; }
    await p.waitForTimeout(250);
    const xy = await p.evaluate((row) => { const e = [...document.querySelectorAll('#dc-root div')].filter(d => d.children.length <= 1 && (d.textContent || '').trim() === row)[0]; const r = e.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; }, row);
    await p.evaluate(() => window.__probe());
    await p.touchscreen.tap(xy.x, xy.y);
    await p.waitForTimeout(1000);
    const rows = await p.evaluate(() => { window.__on = false; return window.__rows; });
    const on = rows.filter(r => r.page);
    if (!on.length) { console.log(`      ${row}: opens no in-page screen (goes to a native screen)`); await p.evaluate(() => { const a = document.querySelector('#dc-root a[aria-label="Back"]'); a && a.click(); }); continue; }
    const first = on[0];
    check(`"${row}": the page slides in (animation ${first.anim}, first frame opacity ${first.op}) instead of jumping`, first.anim === 'pf-in' && on.some(r => r.op < 1) && on.length > 3, `${on.length} frames`);
    check(`"${row}": never a blank frame, ends fully visible`, rows.every(r => r.vis === 'visible') && on[on.length - 1].op === 1);
    await p.screenshot({ path: path.join(__dirname, '..', '.scratch', 'flow', `profile_${row.replace(/\W/g, '')}.png`) });
    await p.evaluate(() => { const a = document.querySelector('#dc-root a[aria-label="Back"]') || [...document.querySelectorAll('#dc-root a')].find(x => x.querySelector('path[d^="M19 12H5"]')); a && a.click(); });
    await p.waitForTimeout(500);
  }
  await b.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
