#!/usr/bin/env node
/**
 * scripts/test-streak.js
 * The streak page (opened from the Train flame): the number, the words and the week row all come from the REAL streak.
 * Unit: lib/streakInfo.ts on made-up sessions. Page: real streak.html + the real injection, screenshot .scratch/streak-after.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const H = require('../lib/dcWebviewHelpers.ts');
const { streakInfo, streakPageJs } = require('../lib/streakInfo.ts');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const DAY = 86400000;
// a Wednesday at noon, so Mon/Tue are before it and Thu..Sun after
const now = new Date(2026, 10, 11, 12).getTime(); // 2026-11-11 is a Wednesday
const at = (daysAgo) => ({ ts: now - daysAgo * DAY, displayName: 'x', reps: 5, goodReps: 5, sets: 1 });

const two = streakInfo([at(0), at(1)], now);
check('2-day streak, trained today: count 2, "Day 2 streak!", no "starts today" line', two.count === 2 && two.headline === 'Day 2 streak!' && !/starts today/i.test(two.sub), JSON.stringify(two));
check('...and Tue + Wed (yesterday + today) are the orange days in the week row', JSON.stringify(two.week) === JSON.stringify([false, true, true, false, false, false, false]) && two.todayIdx === 2, JSON.stringify(two.week));
const one = streakInfo([at(0)], now);
check('1-day streak today: "Day 1 streak!" and it says the streak started today', one.count === 1 && one.headline === 'Day 1 streak!' && /started your streak today/.test(one.sub));
const alive = streakInfo([at(1), at(2)], now);
check('streak alive through yesterday, nothing today yet: 2 days, asks to train today, Mon + Tue orange', alive.count === 2 && !alive.trainedToday && /Train today/.test(alive.sub) && JSON.stringify(alive.week) === JSON.stringify([true, true, false, false, false, false, false]), JSON.stringify(alive));
const none = streakInfo([at(5)], now);
check('no streak: 0, "No streak yet"', none.count === 0 && none.headline === 'No streak yet' && none.week.every(x => !x));
const fresh = streakInfo([], now, 3);
check('the workout flow\'s own count wins if the session is not on disk yet (3, today done)', fresh.count === 3 && fresh.trainedToday && fresh.headline === 'Day 3 streak!');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
  await page.addInitScript(H.DC_VIEWPORT_JS + H.DC_NO_ZOOM_JS);
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'streak.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'streak-before.png') });
  await page.evaluate(H.dcScaleFitJs('#ffffff') + streakPageJs(two));
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const t = (sel) => (document.querySelector('#dc-root ' + sel) || {}).textContent;
    const cs = [...document.querySelectorAll('#dc-root div[style*="width: 30px"][style*="height: 30px"]')];
    return {
      flame: t('div[style*="font-size: 54px"]'), head: t('div[style*="font-size: 29px"]'), sub: t('div[style*="font-size: 16px"]'),
      days: cs.map(c => ({ on: c.getAttribute('data-streak-day'), bg: getComputedStyle(c).backgroundImage.slice(0, 22), check: !!c.querySelector('svg'), w: Math.round(c.getBoundingClientRect().width) })),
    };
  });
  console.log('      page:', JSON.stringify(r));
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'streak-after.png') });
  check('flame shows the real streak (2), not the design\'s 1', r.flame === '2', r.flame);
  check('words match: "Day 2 streak!" and not "Your streak starts today"', r.head === 'Day 2 streak!' && !/starts today/i.test(r.sub), r.head + ' / ' + r.sub);
  check('exactly the two streak days are orange circles with a white check; the rest are plain grey with no check', r.days.length === 7 && r.days.map(d => d.on).join() === '0,1,1,0,0,0,0' && r.days.every(d => (d.on === '1') === (d.bg.startsWith('linear-gradient') && d.check)), JSON.stringify(r.days));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
