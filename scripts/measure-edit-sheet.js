#!/usr/bin/env node
/**
 * scripts/measure-edit-sheet.js  (round 11, item 6: MEASURE the Edit sheet lag, do not guess)
 * Opens the real Train tab page (traintab.html with the shipped injection) in Chromium at 4x slower CPU (a phone-like handicap), taps the pencil "Edit workout"
 * on a day card, and records: the longest main-thread block after the tap (long tasks), the time from the tap until the sheet has begun to move, and how many
 * DOM nodes were created or removed by the tap (a full page re-render shows as thousands). Prints the numbers; test-edit-sheet-speed.js asserts on them.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const train = require('../app/(tabs)/train.tsx');
const { buildTrainData } = require('../lib/trainData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');

const ex = (id, displayName, sets, reps) => ({ exerciseId: id, displayName, targetSets: sets, targetReps: reps, restSeconds: 60, currentVariationId: id });
const plan = { id: 'p', generatedAt: new Date(2026, 9, 1).toISOString(), profile: { goal: 'general', experience: 'beginner', daysPerWeek: 7, location: 'gym' }, currentWorkoutIndex: 0,
  workouts: [{ id: 'wA', splitLabel: 'My workout', exercises: [ex('squat', 'Bodyweight Squat', 3, 12), ex('lunge', 'Lunge', 3, 10), ex('pushup', 'Push-up', 3, 12), ex('curl', 'Bicep Curl', 3, 12)] }] };
const INS = { top: 62, bottom: 34 };
const data = { ...buildTrainData(plan, [], INS, new Date(2026, 10, 18, 9)), insets: INS };

async function measure(cpu) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const msgs = [];
  await p.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await p.addInitScript(train.TRAIN_BEFORE);
  await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'traintab.html')).href, { waitUntil: 'commit' });
  const t0 = Date.now(); let pushed = false;
  while (!msgs.some((m) => m.type === 'ready') && Date.now() - t0 < 25000) {
    if (!pushed && msgs.some((m) => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); }
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(p);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  // instrument: long tasks, node churn, the sheet's first movement
  await p.evaluate(() => {
    window.__lt = []; window.__churn = 0; window.__t = {};
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    new MutationObserver((ms) => ms.forEach((m) => { window.__churn += m.addedNodes.length + m.removedNodes.length; })).observe(document, { childList: true, subtree: true });
    const sheet = [...document.querySelectorAll('div')].find((d) => d.style.maxHeight === '620px');
    window.__sheet = sheet;
    const tf0 = sheet.style.transform; window.__t.tf0 = tf0;
    new MutationObserver(() => { if (window.__t.moved == null && sheet.style.transform !== tf0) window.__t.moved = performance.now(); }).observe(sheet, { attributes: true, attributeFilter: ['style'] });
  });
  const btn = await p.evaluate(() => { const r = document.querySelector('a[aria-label="Edit workout"]'); const rail = [...document.querySelectorAll('div[data-scroll]')].find((x) => x.style.overflowX === 'auto'); const a = [...rail.querySelectorAll('a[aria-label="Edit workout"]')].find((x) => { const b = x.getBoundingClientRect(); return b.left > 0 && b.right < innerWidth && b.width > 0; }) || r; const b = a.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await p.evaluate(() => { window.__t.tap = performance.now(); });
  await p.mouse.click(btn.x, btn.y);
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({ longTasks: window.__lt, churn: window.__churn, toMove: window.__t.moved != null ? Math.round(window.__t.moved - window.__t.tap) : null, tfBefore: window.__t.tf0, tfAfter: window.__sheet.style.transform }));
  await browser.close();
  return r;
}
(async () => {
  for (const cpu of [1, 4]) { const r = await measure(cpu); console.log('CPU x' + cpu + ':', JSON.stringify(r)); }
})().catch((e) => { console.error(e); process.exit(1); });

// ── the same measurement on HOME's "My workout" card (home.html with the shipped injection) ──
(async () => {
  const { openHome } = require('./lib/home-harness.js');
  for (const cpu of [1, 4]) {
    const { browser, page: p } = await openHome({});
    const cdp = await p.context().newCDPSession(p);
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await p.evaluate(() => {
      window.__lt = []; window.__churn = 0; window.__t = {};
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
      new MutationObserver((ms) => ms.forEach((m) => { window.__churn += m.addedNodes.length + m.removedNodes.length; })).observe(document, { childList: true, subtree: true });
      const sheet = [...document.querySelectorAll('div')].find((d) => d.style.maxHeight === '620px');
      window.__sheet = sheet; const tf0 = sheet && sheet.style.transform; window.__t.tf0 = tf0;
      if (sheet) new MutationObserver(() => { if (window.__t.moved == null && sheet.style.transform !== tf0) window.__t.moved = performance.now(); }).observe(sheet, { attributes: true, attributeFilter: ['style'] });
    });
    const btn = await p.evaluate(() => { const a = document.querySelector('a[aria-label="Edit workout"]'); const b = a.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await p.evaluate(() => { window.__t.tap = performance.now(); });
    await p.mouse.click(btn.x, btn.y); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({ longTasks: window.__lt, churn: window.__churn, toMove: window.__t.moved != null ? Math.round(window.__t.moved - window.__t.tap) : null, sheetFound: !!window.__sheet }));
    console.log('HOME CPU x' + cpu + ':', JSON.stringify(r));
    await browser.close();
  }
})().catch((e) => { console.error(e); });

// ── frame gaps while the sheet slides (rAF every frame), 6x slower CPU, with and without the layer hints ──
(async () => {
  const { openHome } = require('./lib/home-harness.js');
  for (const hint of [false, true]) {
    const { browser, page: p } = await openHome({});
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    if (hint) await p.evaluate(() => { const st = document.createElement('style'); st.textContent = 'div[style*="max-height: 620px"],div[style*="height: 520px"][style*="position: absolute"]{will-change:transform;backface-visibility:hidden;} div[style*="rgba(17,17,20,0.28)"][style*="z-index: 60"]{will-change:opacity;}'; document.head.appendChild(st); });
    const btn = await p.evaluate(() => { const a = document.querySelector('a[aria-label="Edit workout"]'); const b = a.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await p.evaluate(() => { window.__gaps = []; let last = performance.now(); window.__run = true; (function f(t) { window.__gaps.push(t - last); last = t; if (window.__run) requestAnimationFrame(f); })(performance.now()); });
    await p.mouse.click(btn.x, btn.y); await p.waitForTimeout(900);
    const g = await p.evaluate(() => { window.__run = false; const a = window.__gaps.slice(2); return { frames: a.length, worst: Math.round(Math.max(...a)), over32: a.filter((x) => x > 32).length }; });
    console.log('HOME frames at 6x CPU, layer hints ' + (hint ? 'ON ' : 'OFF') + ':', JSON.stringify(g));
    await browser.close();
  }
})().catch((e) => { console.error(e); });
