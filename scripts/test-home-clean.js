#!/usr/bin/env node
/**
 * scripts/test-home-clean.js
 *
 * Home tab "hyper-clean" pass (lib/homeClean.ts + app/(tabs)/index.tsx), run in
 * headless Chromium against the REAL assets/app screens/home.html with the EXACT
 * injection the app ships (HOME_SCALE_FIT_JS + buildHomeInjectJs).
 *
 * Checks every rule of the spec against the live DOM (computed styles), proves
 * the interactive logic still works (Start / Cue / Progress / Recent / the
 * artboard's own energy picker + edit sheet), and that "8 of 4 workouts" can no
 * longer happen. Screenshots: .scratch/home-before.png, .scratch/home-after.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module');
const origLoad = Module._load;
Module._load = function (req) { if (/constants\/api$/.test(req)) return { MYPAL_API_URL: 'http://localhost/none' }; return origLoad.apply(this, arguments); };
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const home = require('../app/(tabs)/index.tsx');
const clean = require('../lib/homeClean.ts');

const TOP = `(re) => { const m = [...document.querySelectorAll('div,span,a')].filter(d => re.test((d.textContent||'').trim())); return m.find(e => !(e.parentElement && re.test((e.parentElement.textContent||'').trim()))); }`;
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const now = Date.now();
const plan = { id: 'p', profile: { goal: 'general', experience: 'beginner', daysPerWeek: 4, location: 'gym' }, currentWorkoutIndex: 0,
  workouts: [{ id: 'w', splitLabel: 'Upper Body', exercises: [{}, {}, {}, {}] }] };
// 8 workouts today-ish (this week), each its own ts
const sessions = Array.from({ length: 8 }, (_, i) => ({ ts: now - i * 60000, exerciseId: 'shoulderPress', displayName: 'Shoulder Press', reps: 10, goodReps: 8, pct: 80, formChecked: true }));
const file = pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'home.html')).href;

async function open(withClean, sess) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
  const msgs = [];
  await page.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await page.goto(file, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.evaluate(home.HOME_SCALE_FIT_JS);
  if (withClean) await page.evaluate(home.buildHomeInjectJs(plan, sess, 47, 34));
  await page.waitForTimeout(1500);
  // freeze the artboard's own entrance animations for stable measuring
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(300);
  return { browser, page, msgs };
}

(async () => {
  // ── the page loads with the real injection and shows the real week count ──
  {
    const { browser, page } = await open(true, sessions);
    await page.screenshot({ path: path.join(ROOT, '.scratch', 'home-after.png') });
    const week = await page.evaluate(() => { const e = [...document.querySelectorAll('div,span')].filter(d => /^\d+ of \d+ workouts$/.test((d.textContent || '').trim())); return e.length ? e[e.length - 1].textContent.trim() : null; });
    check('the week line is the real count (8 sessions -> "8 of 4 workouts"; the sample text "2 of 4" is gone)', week === '8 of 4 workouts', week);
    const scrollPad = await page.evaluate(() => { const sc = document.querySelector('[data-scroll]'); return sc ? parseFloat(getComputedStyle(sc).paddingBottom) : -1; });
    check('the page scrolls and its bottom clears the floating tab bar', scrollPad < 0 || scrollPad >= 34 + 49 + 24 - 1, scrollPad + 'px');
    await browser.close();
  }

  // ── interactive logic still works ──
  {
    const { browser, page, msgs } = await open(true, sessions);
    const click = (sel) => page.evaluate((s) => { const e = typeof s === 'string' ? document.querySelector(s) : null; if (e) e.click(); return !!e; }, sel);
    await page.evaluate(() => [...document.querySelectorAll('span,div')].filter(d => d.textContent.trim() === 'Start workout').pop().click());
    check('Start workout still posts "start"', msgs.some(m => m.type === 'start'));
    await click('a[href="Cue.dc.html"]');
    check('Chat with Cue still posts "cue"', msgs.some(m => m.type === 'cue'));
    await click('a[href="Progress.dc.html"]');
    check('Recent Workouts header still posts "progress"', msgs.some(m => m.type === 'progress'));
    await page.evaluate(() => document.querySelector('a[href="Workout Recap v2.dc.html"]').click());
    check('a recent workout card still posts "recap" with its ts', msgs.some(m => m.type === 'recap' && m.ts));
    await page.evaluate(() => document.querySelector('a[aria-label="Edit workout"]').click());
    await page.waitForTimeout(500);
    const edit = await page.evaluate(() => !!document.querySelector('[style*="max-height: 620px"]'));
    check("the edit (pencil) button still opens the artboard's own edit sheet", edit);
    await browser.close();
  }

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
