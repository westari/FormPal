#!/usr/bin/env node
/**
 * scripts/test-profile-badge.js
 * Profile tab: the top-right badges button shows a clean line trophy instead of the design's ribbon medal, and still
 * opens the badges page. Real profile.html + the real injection. Screenshots: .scratch/profile-badge-before.png / -after.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const H = require('../lib/dcWebviewHelpers.ts');
const { dcLogicPatchJs } = require('../lib/dcLogicPatch.ts');
const P = require('../lib/profileInject.ts');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

async function open(withInject) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
  const pre = H.DC_VIEWPORT_JS + H.DC_NO_ZOOM_JS + H.DC_SETTLE_JS + (withInject ? dcLogicPatchJs(P.PROFILE_LOGIC_EXT) + P.PROFILE_DOM_JS : '');
  await page.addInitScript(pre);
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'profile.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  return { browser, page };
}
const clip = { x: 290, y: 40, width: 100, height: 70 };

(async () => {
  let a = await open(false);
  await a.page.screenshot({ path: path.join(ROOT, '.scratch', 'profile-badge-before.png'), clip });
  const before = await a.page.evaluate(() => document.querySelector('div[aria-label="Badges"] svg').innerHTML.length);
  await a.browser.close();
  const { browser, page } = await open(true);
  await page.evaluate(() => document.documentElement.setAttribute('data-pready', '1')); // the app reveals the page once data has landed; this test has none
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'profile-badge-after.png'), clip });
  const r = await page.evaluate(() => { const b = document.querySelector('div[aria-label="Badges"]'); const s = b.querySelector('svg'); const bb = b.getBoundingClientRect(); return { icon: s.getAttribute('data-icon'), paths: s.querySelectorAll('path').length, filled: [...s.querySelectorAll('circle')].length, w: Math.round(bb.width), h: Math.round(bb.height), size: [s.getAttribute('width'), s.getAttribute('height')] }; });
  check('badges button now draws the line trophy (4 stroked paths, no filled medal circle)', r.icon === 'trophy' && r.paths === 4 && r.filled === 0, JSON.stringify(r));
  check('button size unchanged (42x42 white circle)', r.w === 42 && r.h === 42);
  await page.evaluate(() => { document.querySelector('div[aria-label="Badges"]').click(); });
  await page.waitForTimeout(500);
  const opened = await page.evaluate(() => /\d+\/\d+ badges/.test(document.body.textContent));
  check('tapping it still opens the badges page', opened);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
