#!/usr/bin/env node
/**
 * scripts/test-no-zoom.js
 *
 * Proves the Home / Train / Progress / Profile web views cannot be zoomed: no pinch, no double-tap zoom.
 * Runs the REAL design files in mobile-emulated Chromium and drives REAL two-finger touches / double-taps through the
 * DevTools protocol, then reads what the page did with them (cancelled or not) and the computed touch-action.
 *   1. baseline (plain viewport meta, none of our code): the gestures are NOT cancelled -> proves the test sees the difference
 *   2. with DC_NO_ZOOM_JS: pinch / double-tap are cancelled and touch-action forbids zoom
 *   3. the bundle swapping <html> (which drops the viewport meta) is repaired, and still cannot be zoomed
 */
require('./lib/ts-node-loader.js')();
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { DC_NO_ZOOM_JS, DC_VIEWPORT_JS } = require('../lib/dcWebviewHelpers.ts');
const ROOT = path.join(__dirname, '..');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const SCREENS = { Home: 'home.html', Train: 'traintab.html', Progress: 'progress.html', Profile: 'profile.html' };

// Headless Chromium has no pinch-zoom of its own (a plain page does not zoom either, checked), so instead of reading a
// scale back this drives the REAL two-finger touches and double-tap through the DevTools protocol and records what the
// page does with them: zoom can only start if nobody cancels the gesture and touch-action allows it.
async function gestures(page, cdp) {
  await page.evaluate(() => {
    window.__seen = { multiTouchMove: null, multiTouchStart: null, dblclick: null };
    const rec = (k) => (e) => { if (k === 'dblclick' || (e.touches && e.touches.length > 1)) window.__seen[k] = e.defaultPrevented; };
    // registered on window in the bubble phase = runs AFTER the page's capture-phase guards, sees the final state
    window.addEventListener('touchstart', rec('multiTouchStart'), { passive: true });
    window.addEventListener('touchmove', rec('multiTouchMove'), { passive: true });
    window.addEventListener('dblclick', rec('dblclick'), { passive: true });
  });
  const p1 = { x: 150, y: 400 }, p2 = { x: 240, y: 400 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1, p2] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 400 }, { x: 290, y: 400 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // a double-tap on a touch device ends as a dblclick (Chromium's touch emulation does not synthesize one, so send it as clicks)
  for (const clickCount of [1, 2]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 120, y: 300, button: 'left', clickCount });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 120, y: 300, button: 'left', clickCount });
  }
  await page.waitForTimeout(400);
  const seen = await page.evaluate(() => window.__seen);
  const touchAction = await page.evaluate(() => getComputedStyle(document.body).touchAction);
  return { ...seen, touchAction };
}

async function open(file, { guard, dropMeta }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
  // baseline meta: what a page with NO limits looks like (what a lost/replaced meta leaves behind)
  await page.addInitScript(() => {
    const fix = () => {
      let m = document.querySelector('meta[name=viewport]');
      if (!m && document.head) { m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
      if (m && !window.__guarded) m.setAttribute('content', 'width=device-width, initial-scale=1');
    };
    new MutationObserver(fix).observe(document, { childList: true, subtree: true }); fix();
  });
  if (guard) await page.addInitScript(`window.__guarded = true; ${DC_VIEWPORT_JS} ${DC_NO_ZOOM_JS}`);
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', file)).href, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (dropMeta) {
    // what the bundle does while unpacking: the whole <html> is replaced, the viewport meta goes with it
    await page.evaluate(() => {
      const html = document.createElement('html'); const head = document.createElement('head'); const body = document.createElement('body');
      body.innerHTML = document.body.innerHTML; html.appendChild(head); html.appendChild(body);
      document.replaceChild(html, document.documentElement);
    });
    await page.waitForTimeout(300);
  }
  const cdp = await ctx.newCDPSession(page);
  return { browser, page, cdp };
}

(async () => {
  // 1. baseline: with none of our code the same gestures are NOT cancelled and the browser may zoom
  {
    const { browser, page, cdp } = await open(SCREENS.Home, { guard: false });
    const r = await gestures(page, cdp);
    check('baseline (no guard): two-finger touch is not cancelled and touch-action allows zoom, so the test can see the difference',
      r.multiTouchMove === false && r.dblclick === false && /auto|manipulation|pinch/.test(r.touchAction) && r.touchAction !== 'pan-x pan-y', JSON.stringify(r));
    await browser.close();
  }
  // 2 + 3. every screen, normal load and after the <html> swap
  for (const [name, file] of Object.entries(SCREENS)) {
    for (const dropMeta of [false, true]) {
      const { browser, page, cdp } = await open(file, { guard: true, dropMeta });
      const meta = await page.evaluate(() => (document.querySelector('meta[name=viewport]') || {}).content || '');
      const r = await gestures(page, cdp);
      const label = `${name}${dropMeta ? ' (after the <html> swap)' : ''}`;
      check(`${label}: viewport meta carries maximum-scale=1 and user-scalable=no`, /maximum-scale=1/.test(meta) && /user-scalable=no/.test(meta), meta);
      check(`${label}: touch-action is pan-x pan-y (the browser itself cannot start a pinch or double-tap zoom)`, r.touchAction === 'pan-x pan-y', r.touchAction);
      check(`${label}: a real two-finger touch is cancelled`, r.multiTouchStart === true && r.multiTouchMove === true, `start ${r.multiTouchStart}, move ${r.multiTouchMove}`);
      check(`${label}: a real double-tap is cancelled`, r.dblclick === true, `dblclick prevented ${r.dblclick}`);
      const prevented = await page.evaluate(() => {
        const out = {};
        for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
          const e = new Event(t, { bubbles: true, cancelable: true }); document.body.dispatchEvent(e); out[t] = e.defaultPrevented;
        }
        return out;
      });
      check(`${label}: iOS gesture events (pinch) are cancelled`, Object.values(prevented).every(Boolean), JSON.stringify(prevented));
      await browser.close();
    }
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
