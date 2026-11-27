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
  await p.waitForTimeout(400); const loadAnchors = h.msgs.filter((m) => m.type === 'calendarAnchor');
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
  // the arrow: a down chevron that turns up while the calendar is open
  {
    const rot = () => h.page.evaluate(() => document.querySelector('[data-fp-cal]').style.transform);
    const path0 = await h.page.evaluate(() => document.querySelector('[data-fp-cal] svg path').getAttribute('d'));
    check('5: a simple down-arrow (chevron) sits next to the date, not a calendar picture', path0 === 'M6 9.5l6 6 6-6' && !(await h.page.evaluate(() => !!document.querySelector('[data-fp-cal] rect'))));
    const m0 = h.msgs.length; await click('[data-fp-title]');
    const post = h.msgs.slice(m0).find((m) => m.type === 'calendar');
    check('5: tapping reports where the date block ends and where the arrow is (so the card can attach to it)', console.log('      post', JSON.stringify(post)) || post && post.top > 60 && post.top < 300 && post.cx > 60 && post.cx < 390, JSON.stringify(post));
    await h.page.evaluate(() => window.__fpChevron(true)); const up = await rot();
    await h.page.evaluate(() => window.__fpChevron(false)); const down = await rot();
    check('5: open flips the arrow up (180 degrees); closed puts it back down', up === 'rotate(180deg)' && down === 'rotate(0deg)', up + ' / ' + down);
  }
  // round 13: a real TOUCH opens it on the finger-up itself (no waiting for WebKit's later click), exactly once, and a scroll does not open it
  {
    const ses = await p.context().newCDPSession(p);
    const pt = await p.evaluate(() => { const b = document.querySelector('[data-fp-title]').getBoundingClientRect(); return { x: b.left + 40, y: b.top + b.height / 2 }; });
    const anchors = loadAnchors;
    check('round 13: the page tells the app where the arrow is at load, before any tap (calendarAnchor)', anchors.length >= 1 && anchors[0].top > 60 && anchors[0].cx > 60, JSON.stringify(anchors[0]));
    h.msgs.length = 0;
    await ses.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
    await p.waitForTimeout(60);
    await ses.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(20);
    const atUp = h.msgs.filter((m) => m.type === 'calendar').length;
    await p.waitForTimeout(400); // the click that follows a touch must not open it a second time
    const total = h.msgs.filter((m) => m.type === 'calendar');
    check('round 13: a touch posts "calendar" on finger-up (already there right after touchEnd, no click wait), once only, with the moment of the touch (tapAt)', atUp === 1 && total.length === 1 && typeof total[0].tapAt === 'number' && total[0].sentAt - total[0].tapAt >= 40, JSON.stringify(total));
    h.msgs.length = 0;
    await ses.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
    await ses.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x, y: pt.y + 40 }] });
    await ses.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(300);
    check('round 13: a finger that moves (a scroll) does not open it', !h.msgs.some((m) => m.type === 'calendar'), JSON.stringify(h.msgs));
  }
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
  check('app: Home toggles the calendar on "calendar" (taps again close it) and opens the streak screen on "streak"', /msg\.type === 'calendar'\) \{[\s\S]*?calRef\.current\?\.toggle\(/.test(src) && /msg\.type === 'streak'\) \{ router\.push\(\{ pathname: '\/streak-screen'/.test(src));
  const cal = fs.readFileSync(path.join(__dirname, '..', 'components', 'CalendarSheet.tsx'), 'utf8');
  check('5 (round 11): the calendar is a POPOVER under the date arrow (real glass, light), not a Modal and not a panel from the top of the screen', /<LiquidGlass radius=\{RADIUS\}/.test(cal) && !/<Modal/.test(cal) && /top = anchor\.top \+ 12/.test(cal) && /anchor\.cx - SIDE/.test(cal) && !/top: -BLEED/.test(cal));
  check('5: the arrow flips with the calendar (page-side __fpChevron is called when it opens and closes)', /__fpChevron && window\.__fpChevron\(\$\{open\}\)/.test(src));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
