#!/usr/bin/env node
/**
 * scripts/test-home-header-taps.js
 * Home: tapping the date (or its calendar icon) asks the app for the full calendar; tapping the fire chip asks for the streak
 * screen. Real home.html + the shipped injection, real mouse clicks. Also the month grid maths behind the calendar sheet.
 */
const { openHome } = require('./lib/home-harness.js');
const { monthGrid, trainedDays, dayKey } = require('../lib/calendarMonth.ts');
const fs = require('fs'), path = require('path');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
(async () => {
  const h = await openHome({ inset: 62 }); const p = h.page;
  const click = async (sel) => { const r = await p.evaluate((s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel); await p.mouse.click(r.x, r.y); await p.waitForTimeout(200); };
  const types = () => h.msgs.map((m) => m.type);
  await click('[data-fp-title]');
  check('7a: tapping the date posts "calendar"', types().includes('calendar'), types().join(','));
  h.msgs.length = 0;
  await click('[data-fp-cal]');
  check('7b: tapping the calendar icon posts "calendar"', types().includes('calendar'));
  h.msgs.length = 0;
  const chip = '[data-fp-header] div[style*="border-radius: 999px"][style*="height: 40px"]';
  await click(chip);
  check('7c: tapping the fire chip posts "streak"', types().includes('streak'), types().join(','));
  h.msgs.length = 0;
  // the number inside the chip too
  const numPt = await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find((d) => d.style && d.style.color === 'rgb(242, 112, 28)'); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await p.mouse.click(numPt.x, numPt.y); await p.waitForTimeout(200);
  check('7d: tapping the streak number posts "streak"', types().includes('streak'));
  h.msgs.length = 0;
  // other pills do not open the streak screen
  await click('[data-fp-header] ~ * div[style*="border-radius: 999px"]').catch(() => {});
  check('other taps near the header do not post "streak"', !types().includes('streak'), types().join(','));
  await h.browser.close();
  // calendar maths
  const now = new Date(2026, 10, 12);
  const tr = trainedDays([new Date(2026, 10, 3, 9).getTime(), new Date(2026, 10, 12, 20).getTime(), new Date(2026, 9, 30).getTime()]);
  const weeks = monthGrid(2026, 10, tr, now); const flat = weeks.flat();
  check('calendar: every week has 7 cells', weeks.every((w) => w.length === 7));
  check('calendar: November 2026 starts on a Sunday and has 30 days', flat.filter((c) => c.day).length === 30 && flat[0].day === 1);
  check('calendar: only Nov 3 and Nov 12 are marked trained (Oct 30 is another month)', flat.filter((c) => c.trained).map((c) => c.day).join() === '3,12');
  check('calendar: today (Nov 12) is the one ringed cell', flat.filter((c) => c.today).map((c) => c.day).join() === '12');
  const oct = monthGrid(2026, 9, tr, now).flat();
  check('calendar: October 2026 starts on a Thursday (4 blank cells before day 1)', oct.findIndex((c) => c.day === 1) === 4 && oct.filter((c) => c.trained).map((c) => c.day).join() === '30');
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
  check('app: Home shows the calendar sheet on "calendar" and opens the streak screen on "streak"', /msg\.type === 'calendar'\) \{ setCalOpen\(true\)/.test(src) && /msg\.type === 'streak'\) \{ router\.push\(\{ pathname: '\/streak-screen'/.test(src));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
