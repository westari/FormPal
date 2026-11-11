#!/usr/bin/env node
/**
 * scripts/test-workout-menu.js
 * Long-press a past workout (Progress page, real progress.html + the real injection): a menu message goes to the app with that
 * workout's time, the tap that ends the press does NOT also open the recap, a normal tap still opens it, a drag cancels.
 * (The log removal itself is in scripts/test-workout-remove.js.)
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const { openProgress, makeData, DAY } = require('./lib/progress-harness.js');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

(async () => {
  const W = require('../lib/workoutMenu.ts');
  const sl = require('../lib/sessionLog.ts');

  const data = makeData(); const now = Date.now();
  data.workouts = [0, 1, 2].map(i => ({ ts: now - i * DAY, name: ['Upper Body', 'Lower Body', 'Full Body'][i], when: 'x', form: 90, formPct: 90, reps: 40, sets: 4, thumb: null, muscle: 'chest', fallback: null, logged: i === 1 }));
  const { browser, page, msgs } = await openProgress(data);
  await page.evaluate(W.WORKOUT_LONGPRESS_JS);
  await page.evaluate(() => window.__athltBump && window.__athltBump());
  await page.waitForTimeout(600);
  const box = async (i) => { const el = (await page.$$('#dc-root div[role="img"][aria-label$=" video"]'))[i]; await el.scrollIntoViewIfNeeded(); return await el.boundingBox(); };
  const count = (t) => msgs.filter(m => m.type === t).length;

  const b = await box(1); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(700);
  check('holding a card 0.7s sends the menu message with THAT workout\'s time', msgs.some(m => m.type === 'workoutMenu' && m.ts === data.workouts[1].ts), JSON.stringify(msgs.filter(m => m.type === 'workoutMenu')));
  await page.mouse.up(); await page.waitForTimeout(200);
  check('the tap that ends the long press does not open the recap', count('openWorkout') === 0, String(count('openWorkout')));

  await page.waitForTimeout(1000);
  const menus = count('workoutMenu');
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 60, cy, { steps: 4 }); await page.waitForTimeout(700); await page.mouse.up();
  check('dragging (scrolling) while holding cancels it: no menu', count('workoutMenu') === menus);

  await page.waitForTimeout(1000);
  await page.mouse.click(cx, cy); await page.waitForTimeout(300);
  check('a normal tap still opens the workout (recap)', count('openWorkout') === 1, String(count('openWorkout')));

  await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up(); await page.waitForTimeout(100);
  check('a short press does not open the menu', count('workoutMenu') === menus);
  await browser.close();

  console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
})();
