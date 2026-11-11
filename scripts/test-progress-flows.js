#!/usr/bin/env node
/**
 * scripts/test-progress-flows.js   (Progress tab: "Add weight" and Progress Photos transitions)
 *
 * Opens the REAL progress.html with the shipped injection and real-looking data (with photos), then taps through the
 * flows and checks EVERY animation frame (requestAnimationFrame probe, CPU 4x slower), not just the end state:
 *   - Log weight -> "Confirm your weight": the keypad is in its final place in the FIRST frame (no jump), the screen
 *     slides in with the design's own push (opacity / transform only).
 *   - Progress Photos -> photos page, Front / Side / Back, back arrow: the picture slots are filled in the first frame
 *     they exist (no empty slot that fills a moment later), and the page never goes blank.
 * INJECT_FILE=<path to an older progressInject.ts> runs the same checks against it (to show the bug it had).
 * Frames of the flows: .scratch/flow/
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..');
const H = require('../lib/dcWebviewHelpers.ts');
const { dcLogicPatchJs, athltSetDataJs } = require('../lib/dcLogicPatch.ts');
const INJ = process.env.INJECT_FILE ? require(path.resolve(process.env.INJECT_FILE)) : require('../lib/progressInject.ts');
const { makeData } = require('./lib/progress-harness.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const OLD = !!process.env.INJECT_FILE;
// two different pictures so "filled" and "which one" can be told apart
const png = (c) => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="120" fill="${c}"/><circle cx="45" cy="45" r="20" fill="#fff"/></svg>`).toString('base64');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const msgs = [];
  await p.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await p.addInitScript(H.DC_VIEWPORT_JS + H.DC_NO_ZOOM_JS + H.CONSOLE_FORWARD_JS + H.DC_SETTLE_JS + dcLogicPatchJs(INJ.PROGRESS_LOGIC_EXT) + INJ.PROGRESS_DOM_JS);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const data = makeData(); const now = Date.now(), DAY = 86400000;
  data.photos = [0, 1, 2, 3, 4, 5].map(i => ({ id: 'p' + i, ts: now - i * 9 * DAY, pose: ['front', 'side', 'back'][i % 3], thumb: png(['#c0392b', '#2980b9', '#27ae60'][i % 3]) }));
  data.insets = { top: 62, bottom: 34 };
  await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'progress.html')).href, { waitUntil: 'commit' });
  const t0 = Date.now(); let pushed = false;
  while (!(await p.evaluate(() => document.documentElement.hasAttribute('data-pready')).catch(() => false)) && Date.now() - t0 < 25000) { if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); } await p.waitForTimeout(50); }
  await p.waitForTimeout(900);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // per-frame probe: from "now" until stop, one record per animation frame
  await p.evaluate(() => {
    window.__probe = (fn) => { window.__rows = []; window.__on = true; const t = performance.now(); (function loop() { if (!window.__on) return; try { window.__rows.push(Object.assign({ t: Math.round(performance.now() - t) }, fn())); } catch (e) { window.__rows.push({ t: -1, err: String(e) }); } requestAnimationFrame(loop); })(); };
    window.__stop = () => { window.__on = false; return window.__rows; };
  });
  const tapAt = async (finder) => {
    const pt = await p.evaluate(`(() => { const e = (${finder})(); e.scrollIntoView({ block: 'center' }); return 1; })()`);
    await p.waitForTimeout(250);
    const r = await p.evaluate(`(() => { const e = (${finder})(); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await p.touchscreen.tap(r.x, r.y);
  };

  // ── Log weight ──
  await p.evaluate(() => window.__probe(() => {
    const sheet = document.querySelector('#dc-root div[style*="z-index: 60"]');
    if (!sheet) return { open: false };
    const tray = sheet.querySelector('div[style*="30px 30px 0"]');
    const key = [...sheet.querySelectorAll('div')].find(d => (d.innerText || '').trim() === '5');
    return { open: true, trayPad: tray ? tray.style.paddingBottom : '', keyTop: key ? Math.round(key.getBoundingClientRect().top) : -1, anim: getComputedStyle(sheet).animationName, op: getComputedStyle(sheet).opacity, vis: getComputedStyle(document.body).visibility };
  }));
  await tapAt(`() => [...document.querySelectorAll('#dc-root a')].find(a => /(Log weight|Edit today's weight)/.test(a.innerText))`);
  await p.waitForTimeout(1300);
  const w = (await p.evaluate(() => window.__stop())).filter(r => r.open);
  const keyTops = w.map(r => r.keyTop).filter(v => v > 0);
  const moved = keyTops.length ? Math.max(...keyTops) - Math.min(...keyTops) : 999;
  console.log(`      Log weight: ${w.length} frames with the screen open; keypad key "5" top by frame: ${[...new Set(keyTops)].join(' -> ')}; sheet animation: ${w[0] && w[0].anim}`);
  check('Log weight: the keypad is in its final place in the very first frame (it jumped up a moment later before)', w.length > 3 && moved <= 1, `moved ${moved}px between frames`);
  check('Log weight: the screen slides in with the design\'s push, opacity/transform only (not an instant pop)', w.length > 3 && w[0].anim === 'pg-in' && w.some(r => parseFloat(r.op) < 1), `animation ${w[0] && w[0].anim}, first frame opacity ${w[0] && w[0].op}`);
  check('Log weight: the page is never hidden or blank during it', w.every(r => r.vis === 'visible'));
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'flow', 'weight_final.png') });
  await tapAt(`() => document.querySelector('#dc-root div[style*="z-index: 60"] a[aria-label="Back"]')`);
  await p.waitForTimeout(900);

  // ── Progress Photos ──
  const slotProbe = () => {
    const page = document.querySelector('#dc-root');
    const slots = [...page.querySelectorAll('div[style*="aspect-ratio: 3 / 4"]')].filter(e => e.getBoundingClientRect().width > 0);
    const onPage = [...page.querySelectorAll('div')].some(d => /Compare photos/.test(d.textContent || '') && (d.innerText || '').trim().length < 20);
    const filled = slots.filter(s => /url\(/.test(s.style.background || s.style.backgroundImage || '')).length;
    const op = (() => { const v = [...page.querySelectorAll('div[style*="pg-in"]')][0]; return v ? parseFloat(getComputedStyle(v).opacity) : 1; })();
    const grid = [...page.querySelectorAll('div[style*="aspect-ratio: 3 / 4"][style*="border-radius: 16px"]')].map(s => (s.style.background || '').slice(0, 12));
    return { onPage, slots: slots.length, filled, op, vis: getComputedStyle(document.body).visibility, grid: grid.join('|') };
  };
  await p.evaluate(`window.__probe(${slotProbe.toString()})`);
  await tapAt(`() => [...document.querySelectorAll('#dc-root a, #dc-root div')].filter(e => /Progress Photos/.test(e.innerText || '') && (e.innerText || '').length < 30).sort((a, b) => a.innerText.length - b.innerText.length)[0]`);
  await p.waitForTimeout(1300);
  const ph = (await p.evaluate(() => window.__stop())).filter(r => r.onPage);
  const emptyFrames = ph.filter(r => r.slots > 0 && r.filled < Math.min(r.slots, 2)).length;
  console.log(`      Photos page: ${ph.length} frames showing it; frames with empty picture slots: ${emptyFrames}`);
  check('Photos page: opens with a slide (opacity / transform) and every picture slot is already filled in its first frame', ph.length > 3 && emptyFrames === 0 && (OLD || ph.some(r => r.op < 1)), `${emptyFrames} frames had empty slots of ${ph.length}`);
  check('Photos page: never hidden or blank while opening', ph.every(r => r.vis === 'visible'));
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'flow', 'photos_final.png') });

  for (const pose of ['Side', 'Back', 'Front']) {
    await p.evaluate(`window.__probe(${slotProbe.toString()})`);
    await tapAt(`() => [...document.querySelectorAll('#dc-root div, #dc-root a, #dc-root span')].filter(e => (e.innerText || '').trim() === '${pose}').sort((a, b) => a.children.length - b.children.length)[0]`);
    await p.waitForTimeout(700);
    const rows = (await p.evaluate(() => window.__stop())).filter(r => r.onPage);
    const sw = rows.filter(r => r.slots > 0 && r.filled < Math.min(r.slots, 2)).length;
    const grids = [...new Set(rows.map(r => r.grid))];
    check(`Photos page, switch to ${pose}: no frame with empty slots, the pictures change in ONE step (${grids.length} grid states over ${rows.length} frames)`, sw === 0 && grids.length <= 2 && rows.every(r => r.vis === 'visible'), `${sw} empty frames, grids ${grids.length}`);
  }

  // ── back arrow ──
  await p.evaluate(() => window.__probe(() => ({ vis: getComputedStyle(document.body).visibility, labels: document.querySelectorAll('#dc-root svg text[data-athlt-pt]').length, home: [...document.querySelectorAll('#dc-root div')].some(d => (d.innerText || '').trim() === 'Weight Progress') })));
  await tapAt(`() => document.querySelector('#dc-root a[aria-label="Back"]') || [...document.querySelectorAll('#dc-root a')].find(x => x.querySelector('path[d^="M19 12H5"]'))`);
  await p.waitForTimeout(900);
  const bk = (await p.evaluate(() => window.__stop())).filter(r => r.home);
  const lab = [...new Set(bk.map(r => r.labels))];
  console.log(`      Back arrow: ${bk.length} frames on the home screen; weight-graph labels by frame: ${lab.join(' -> ')}`);
  check('Back arrow: the home screen is complete in its first frame (the graph labels used to appear later)', bk.length > 0 && lab.length === 1 && lab[0] > 0 && bk.every(r => r.vis === 'visible'), lab.join(' -> '));
  await b.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
