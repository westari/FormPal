#!/usr/bin/env node
/**
 * scripts/test-camera-tips.js
 * "Quick workout tips" (Ari's cameratips.html, used as it is): shown once right after onboarding finishes; Continue and the back arrow are wired.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const T = require('../lib/cameraTips.ts');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

check('once: shown when it was never seen, never again once it was (stored "1")', T.shouldShowCameraTips(null) && T.shouldShowCameraTips('0') && !T.shouldShowCameraTips('1') && T.cameraTipsRoute(null) === '/camera-tips' && T.cameraTipsRoute('1') === '/(tabs)');
const ob = read('app/onboarding.tsx');
check('7: right after onboarding finishes (finishOnboarding), the app goes to the tips (first time) instead of straight to Home', /const finishOnboarding = async \(\) => \{[\s\S]{0,500}router\.replace\(cameraTipsRoute\(tipsSeen\) as any\)/.test(ob));
check('7: the entry gate for people who already finished onboarding still goes straight to Home (they never see it)', /router\.replace\('\/\(tabs\)'\)/.test(read('app/index.tsx')) && !/camera-tips/.test(read('app/index.tsx')));
const scr = read('app/camera-tips.tsx');
check('7: the screen marks it seen (formpal_camera_tips_seen = 1) and goes to Home on Continue and on the back arrow, once', /AsyncStorage\.setItem\(CAMERA_TIPS_KEY, '1'\)/.test(scr) && /router\.replace\('\/\(tabs\)' as any\)/.test(scr) && /if \(left\.current\) return/.test(scr) && /m === 'tipsContinue' \|\| m === 'tipsBack'/.test(scr));
let dirty = true; try { cp.execSync('git diff --quiet HEAD -- "assets/app screens/cameratips.html"', { cwd: ROOT }); dirty = false; } catch { dirty = true; }
check('the design file cameratips.html is used as it is (git sees no change)', !dirty);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const msgs = []; await page.exposeFunction('__post', (m) => msgs.push(m));
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (m) => window.__post(m) }; });
  await page.addInitScript(T.CAMERA_TIPS_BEFORE_JS);
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'cameratips.html')).href, { waitUntil: 'load' });
  const early = await page.evaluate(() => ({ vis: getComputedStyle(document.body).visibility, play: getComputedStyle(document.querySelector('a[aria-label="Back"]').nextElementSibling).animationPlayState }));
  check('held until final: nothing is visible and the entrance animations are paused until the page is fitted', early.vis === 'hidden' && early.play === 'paused', JSON.stringify(early));
  await page.evaluate(T.CAMERA_TIPS_AFTER_JS);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-go'), null, { timeout: 5000 });
  await page.waitForTimeout(1300);
  const st = await page.evaluate(() => {
    const box = document.body.firstElementChild, t = (box.textContent || '').split(/\s+/).join(' ');
    const nine = [...box.querySelectorAll('div')].find((d) => !d.children.length && d.textContent.trim() === '9:41');
    const cont = [...box.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Continue'), r = cont.getBoundingClientRect();
    return { vis: getComputedStyle(document.body).visibility, tf: box.style.transform, nine: nine && getComputedStyle(nine.parentElement).visibility, tips: ['Whole body in frame', 'Find good light', 'Aim for a high form score', "Listen to Cue's directions"].every((x) => t.includes(x)), title: /Quick workout tips/.test(t), bottom: Math.round(r.bottom), play: getComputedStyle(cont.parentElement).animationName };
  });
  check('shown when final: scaled to the screen, the fake status bar hidden, all four tips and the title there, Continue sits at the bottom, the design\'s own entrance animation runs', st.vis === 'visible' && /scale\(1\)/.test(st.tf) && st.nine === 'hidden' && st.tips && st.title && st.bottom > 780 && st.play === 'ct-rise', JSON.stringify(st));
  check('"tipsShown" is posted once', msgs.filter((m) => m === 'tipsShown').length === 1, JSON.stringify(msgs));
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'camera-tips.png') });
  const pt = await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find((x) => x.textContent.trim() === 'Continue'); const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(150);
  check('the Continue button posts "tipsContinue" and the page does not navigate', msgs.includes('tipsContinue') && page.url().includes('cameratips.html'), JSON.stringify(msgs));
  const bp = await page.evaluate(() => { const r = document.querySelector('a[aria-label="Back"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(bp.x, bp.y); await page.waitForTimeout(150);
  check('the back arrow posts "tipsBack"', msgs.includes('tipsBack'), JSON.stringify(msgs));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
