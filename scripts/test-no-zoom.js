#!/usr/bin/env node
/**
 * scripts/test-no-zoom.js
 *
 * No pinch zoom and no double-tap zoom (lib/noZoom.ts, injected into every web view on the post-workout /
 * camera screens). Real design files, mobile-emulated Chromium, REAL synthesized two-finger pinch and
 * double-tap gestures; the result is read back from visualViewport.scale.
 *
 * REPRODUCES it first: the same file without the injection zooms.
 */
require('./lib/ts-node-loader.js')();
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { NO_ZOOM_JS } = require('../lib/noZoom.ts');
const WARM = require('../components/WarmSurfaces.tsx');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const U = (f) => pathToFileURL(path.join(ROOT, 'assets', 'app screens', f)).href;

// a page that WANTS to be zoomable: the viewport the design files ship with (no scale limits)
const PLAIN = 'data:text/html,' + encodeURIComponent('<meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><div id=t style="height:2000px;font:40px sans-serif">zoom me <button id=b>tap</button></div>');

async function session(url, inject) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.exposeFunction('__post', () => {});
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  if (inject) await page.addInitScript(inject);
  await page.goto(url);
  await page.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(page);
  return { browser, page, cdp };
}
const scale = (page) => page.evaluate(() => window.visualViewport.scale);
// a real two-finger spread, sent as raw touch points (the browser's own pinch recogniser does the rest)
async function pinch(cdp) {
  const pts = (d) => [{ x: 195 - d, y: 400, id: 1 }, { x: 195 + d, y: 400, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(30) });
  for (let d = 30; d <= 150; d += 10) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) }); await new Promise(r => setTimeout(r, 16)); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function dbl(page) { await page.touchscreen.tap(60, 300); await page.waitForTimeout(80); await page.touchscreen.tap(60, 300); await page.waitForTimeout(500); }

(async () => {
  {
    const { browser, page, cdp } = await session(PLAIN, null);
    await pinch(cdp); await page.waitForTimeout(400);
    const s = await scale(page);
    check('REPRODUCED: without the fix a two-finger pinch zooms the page', s > 1.2, `scale ${s.toFixed(2)}`);
    await browser.close();
  }
  {
    const { browser, page, cdp } = await session(PLAIN, NO_ZOOM_JS);
    await pinch(cdp); await page.waitForTimeout(400);
    check('with the fix a pinch does not zoom', (await scale(page)) <= 1.001, `scale ${(await scale(page)).toFixed(3)}`);
    await dbl(page);
    check('with the fix a double tap does not zoom', (await scale(page)) <= 1.001, `scale ${(await scale(page)).toFixed(3)}`);
    const meta = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
    check('viewport meta carries maximum-scale=1 and user-scalable=no (and kept width=device-width)', /maximum-scale=1/.test(meta) && /user-scalable=no/.test(meta) && /width=device-width/.test(meta), meta);
    const ta = await page.evaluate(() => getComputedStyle(document.body).touchAction);
    check('touch-action is pan-x pan-y on the page (scrolling still works)', /pan-x/.test(ta) && /pan-y/.test(ta), ta);
    // the design bundles replace <html> after load: put the page's viewport back and the fix must re-apply
    await page.evaluate(() => { document.querySelector('meta[name=viewport]').setAttribute('content', 'width=device-width, initial-scale=1'); });
    await page.waitForTimeout(700);
    const meta2 = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
    check('if the page resets its viewport meta, the fix puts the limits back', /maximum-scale=1/.test(meta2) && /user-scalable=no/.test(meta2), meta2);
    await page.evaluate(() => { window.__g = []; ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => window.__g.push(e.defaultPrevented), false)); });
    const prevented = await page.evaluate(() => { const e = new Event('gesturestart', { cancelable: true, bubbles: true }); document.body.dispatchEvent(e); return e.defaultPrevented; });
    check('WebKit gesture events are cancelled', prevented === true);
    const scroll0 = await page.evaluate(() => window.scrollY);
    await page.touchscreen.tap(100, 300);
    await page.evaluate(() => window.scrollTo(0, 300));
    check('normal scrolling still works', (await page.evaluate(() => window.scrollY)) === 300);
    await browser.close();
  }
  // every warm page: the shipped scaffold string must contain the fix, and it must not break the real page
  for (const [k, file] of [['recap', 'workoutrecap.html'], ['repfeedback', 'repfeedback.html'], ['ranks', 'muscleranks.html'], ['allsets', 'allsetsfullworkout.html']]) {
    check(`${k}: the warm page scaffold includes the no-zoom fix`, WARM.BASE_JS[k].includes('__noZoomInstalled'));
    const { browser, page, cdp } = await session(U(file), WARM.BASE_JS[k]);
    await page.waitForTimeout(1200);
    await pinch(cdp); await page.waitForTimeout(400);
    const s = await scale(page);
    check(`${k}: the real design page ignores a pinch (page still renders)`, s <= 1.001 && (await page.evaluate(() => document.body.innerText.length)) > 5, `scale ${s.toFixed(3)}`);
    await browser.close();
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
