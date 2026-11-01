#!/usr/bin/env node
/**
 * scripts/test-recap-latency.js
 *
 * Workout Complete card: how long until the real card is revealed ('ready'),
 * and does it still move after that?
 *
 *   OLD  = the inject as shipped before this change (git rev given by
 *          OLD_REV, default HEAD~0 of the commit before the change), injected
 *          after the document loads (what injectedJavaScript does).
 *   NEW  = the inject in app/recap.tsx right now, injected at document start
 *          (what injectedJavaScriptBeforeContentLoaded does).
 *
 * Both run against the REAL assets/app screens/workoutrecap.html in headless
 * Chromium with 4x CPU throttling (a phone is much slower than this PC).
 * Chromium is not WKWebView, so absolute numbers are NOT device numbers; the
 * comparison and the "never shows placeholder data / never moves after
 * reveal" checks are what this proves.
 */
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const load = require('./lib/load-recap-inject.js');

const OLD_REV = process.env.OLD_REV || '044f58d';
const THROTTLE = Number(process.env.THROTTLE || 4);
const file = path.join(__dirname, '..', 'assets', 'app screens', 'workoutrecap.html');
const args = { totalReps: 20, moves: 2, pct: 88, hasFormData: true, durationSec: 600, overview: 'Real overview text here.', hasVideo: false };

const oldSrc = execSync(`git show ${OLD_REV}:app/recap.tsx`, { cwd: path.join(__dirname, '..'), maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const OLD = load(['workoutrecapInject'], oldSrc).workoutrecapInject(args);
const NEW = load(['workoutrecapInject']).workoutrecapInject(args);

async function run(label, inject, mode) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  let t0 = 0, readyAt = null, placeholderAtReady = null, rectAtReady = null;
  await page.exposeFunction('__post', async (d) => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.type !== 'ready' || readyAt !== null) return;
    readyAt = Date.now() - t0;
    const snap = await page.evaluate(() => {
      const txt = document.getElementById('dc-root') ? document.getElementById('dc-root').innerText : '';
      const card = document.querySelector('#dc-root div[style*="border-radius: 36px"]');
      const r = card ? card.getBoundingClientRect() : null;
      const root = document.getElementById('dc-root');
      return { txt, rect: r ? [r.left, r.top, r.width, r.height].map(Math.round) : null, transform: root && root.style.transform };
    });
    placeholderAtReady = /\b148\b|38:12|\b86%/.test(snap.txt);
    rectAtReady = snap;
  });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  if (mode === 'start') await page.addInitScript(inject);
  if (mode === 'dcl') page.on('domcontentloaded', () => { page.evaluate(inject).catch(() => {}); });
  if (mode === 'load') page.on('load', () => { page.evaluate(inject).catch(() => {}); });
  t0 = Date.now();
  await page.goto(pathToFileURL(file).href, { waitUntil: 'commit' });
  await page.waitForTimeout(6500);
  const after = await page.evaluate(() => {
    const card = document.querySelector('#dc-root div[style*="border-radius: 36px"]');
    const r = card ? card.getBoundingClientRect() : null;
    const root = document.getElementById('dc-root');
    return { rect: r ? [r.left, r.top, r.width, r.height].map(Math.round) : null, transform: root && root.style.transform };
  });
  await page.screenshot({ path: path.join(__dirname, '..', '.scratch', `recap-${label}.png`) });
  await browser.close();
  return { label, readyAt, placeholderAtReady, rectAtReady, after };
}

(async () => {
  let failed = 0;
  const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
  const oldDcl = await run('old-documentEnd', OLD, 'dcl');
  const oldLoad = await run('old-load', OLD, 'load');
  const newStart = await run('new-start', NEW, 'start');
  const newLoad = await run('new-load', NEW, 'load');
  for (const r of [oldDcl, oldLoad, newStart, newLoad]) {
    console.log(`      ${r.label}: ready at ${r.readyAt === null ? 'NEVER (RN would wait for its 2500ms backstop)' : r.readyAt + 'ms'}`);
  }
  check('NEW injected at document start posts ready', newStart.readyAt !== null, `${newStart.readyAt}ms`);
  check('NEW injected after load posts ready too (the old code never did when the DOM was already there)', newLoad.readyAt !== null, `${newLoad.readyAt}ms`);
  check('NEW is not slower than OLD (documentEnd injection, closest to the device)', oldDcl.readyAt === null || newStart.readyAt <= oldDcl.readyAt, `${newStart.readyAt}ms vs ${oldDcl.readyAt}`);
  check('NEW reveals with real data (no 148 / 38:12 / 86% placeholders)', newStart.placeholderAtReady === false);
  check('NEW card does not move after reveal', JSON.stringify(newStart.rectAtReady && newStart.rectAtReady.rect) === JSON.stringify(newStart.after.rect),
    `${JSON.stringify(newStart.rectAtReady && newStart.rectAtReady.rect)} -> ${JSON.stringify(newStart.after.rect)}`);
  check('NEW scale at reveal is already final', newStart.rectAtReady && newStart.rectAtReady.transform === newStart.after.transform,
    `${newStart.rectAtReady && newStart.rectAtReady.transform} -> ${newStart.after.transform}`);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
