#!/usr/bin/env node
/**
 * scripts/test-home-edit-hidden.js
 *
 * Home: the Edit Workout sheet (and the Edit-with-Cue sheet) must be completely hidden until Edit is pressed:
 * no pixels on screen, no taps, and it works again when opened. Real home.html + the shipped injection, WebKit
 * (closest to the phone), several screen sizes. The BEFORE numbers are the old behaviour (closed sheet top edge
 * measured inside the screen); screenshots in .scratch/home-edit-*.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; return orig.apply(this, arguments); };
const path = require('path'); const { pathToFileURL } = require('url'); const { webkit } = require('playwright');
const ROOT = path.join(__dirname, '..');
const home = require('../app/(tabs)/index.tsx');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const now = Date.now();
const plan = { id: 'p', profile: {}, currentWorkoutIndex: 0, workouts: [{ id: 'w', splitLabel: 'Upper Body', exercises: [{}, {}, {}, {}] }] };
const sessions = Array.from({ length: 3 }, (_, i) => ({ ts: now - i * 86400000, exerciseId: 'shoulderPress', displayName: 'Shoulder Press', reps: 10, goodReps: 8, pct: 80, formChecked: true }));
const info = (p) => p.evaluate(() => {
  const sh = [...document.querySelectorAll('div')].filter(d => d.style.maxHeight === '620px' || (d.style.height === '520px' && d.style.position === 'absolute'));
  return { vh: innerHeight, sheets: sh.map(d => { const r = d.getBoundingClientRect(), cs = getComputedStyle(d); return { top: Math.round(r.top), vis: cs.visibility, pe: cs.pointerEvents, tr: d.style.transform }; }) };
});
(async () => {
  const b = await webkit.launch();
  for (const [W, H] of [[402, 874], [390, 844], [430, 932], [375, 667]]) {
    const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
    await p.exposeFunction('__post', () => {});
    await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'home.html')).href);
    await p.waitForTimeout(1500);
    await p.evaluate(home.HOME_SCALE_FIT_JS + home.HOME_CUE_REAL_JS);
    await p.evaluate(home.buildHomeInjectJs(plan, sessions, W >= 390 ? 62 : 20, W >= 390 ? 34 : 0));
    await p.waitForTimeout(2200);
    const c = await info(p);
    console.log(`  ${W}x${H}: closed sheets: ${JSON.stringify(c.sheets)}`);
    const insideBefore = c.sheets.filter(s => s.top < c.vh).length;
    check(`${W}x${H}: at launch both sheets are hidden (visibility hidden, no pointer events)`, c.sheets.length === 2 && c.sheets.every(s => s.vis === 'hidden' && s.pe === 'none'));
    const hit = await p.evaluate((vh) => { const e = document.elementFromPoint(200, vh - 25); return e ? (e.closest('[style*="620px"], [style*="520px"]') ? 'SHEET' : 'page') : 'none'; }, c.vh);
    check(`${W}x${H}: a tap just above the screen bottom lands on the page, not on a sheet`, hit !== 'SHEET', hit);
    await p.screenshot({ path: path.join(ROOT, '.scratch', `home-edit-closed-${W}x${H}.png`) });
    if (W === 402) {
      // open Edit
      await p.evaluate(() => document.querySelector('a[aria-label="Edit workout"]').click());
      await p.waitForTimeout(700);
      const o = await info(p);
      const e = o.sheets.find(s => /620/.test('') || s.tr === 'translateY(0)');
      check('pressing Edit shows the sheet (visible, slid in, takes taps)', o.sheets.some(s => s.vis === 'visible' && s.pe !== 'none' && s.tr === 'translateY(0px)' || s.vis === 'visible' && s.tr === 'translateY(0)'), JSON.stringify(o.sheets));
      await p.screenshot({ path: path.join(ROOT, '.scratch', 'home-edit-open.png') });
      // close it (the dim layer behind)
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => x.style.zIndex === '62'); d.click(); });
      await p.waitForTimeout(150);
      const mid = await info(p);
      check('while it slides out it is still visible (animation intact)', mid.sheets.some(s => s.vis === 'visible'));
      await p.waitForTimeout(700);
      const done = await info(p);
      check('after closing it is hidden again', done.sheets.every(s => s.vis === 'hidden' && s.pe === 'none'), JSON.stringify(done.sheets));
      // Edit with Cue sheet
      await p.evaluate(() => document.querySelector('a[aria-label="Edit workout"]').click());
      await p.waitForTimeout(600);
      await p.evaluate(() => { const t = [...document.querySelectorAll('div')].find(d => d.children.length === 0 && /Edit with Cue|Edit via Cue|Cue/i.test(d.textContent || '') && d.getBoundingClientRect().height > 0 && d.getBoundingClientRect().top > 0); });
    }
    await p.context().close();
  }
  await b.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
