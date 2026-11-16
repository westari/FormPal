#!/usr/bin/env node
/**
 * scripts/test-weekly-goal.js
 * The weekly goal (lib/weeklyGoal.ts): workouts per week, from the plan's days per week unless the user picked their own; the week runs Monday
 * to Sunday; camera workouts and logged sessions count, practice form checks do not; the count caps at the goal and extras are a bonus.
 * Plus Home's week line (no more "8 of 4") and Profile's "Weekly goal" row.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'x' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const W = require('../lib/weeklyGoal.ts');
const home = require('../app/(tabs)/index.tsx');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const at = (y, m, d, h = 10) => new Date(y, m, d, h).getTime();
const ent = (ts, extra = {}) => ({ ts, exerciseId: 'squat', displayName: 'Squat', reps: 10, goodReps: 9, pct: 90, formChecked: true, ...extra });
const logged = (ts) => ent(ts, { manual: true, formChecked: false, goodReps: 0, pct: 0 });

// the week: Monday to Sunday. Sunday Nov 15 2026 belongs to the week that started Monday Nov 9.
const sun = at(2026, 10, 15, 12), mon = at(2026, 10, 16, 12);
const b1 = W.weekBounds(sun), b2 = W.weekBounds(mon), b3 = W.weekBounds(at(2026, 10, 9, 0));
check('the week runs Monday to Sunday: Sunday Nov 15 is in the week of Mon Nov 9', new Date(b1.start).getDay() === 1 && new Date(b1.start).getDate() === 9 && new Date(b1.end).getDate() === 16, new Date(b1.start).toDateString() + ' .. ' + new Date(b1.end).toDateString());
check('Monday Nov 16 00:00 starts the NEXT week (Sunday night belongs to the old one)', new Date(b2.start).getDate() === 16 && b3.start === b1.start && W.weekBounds(at(2026, 10, 15, 23)).start === b1.start && W.weekBounds(at(2026, 10, 16, 0)).start === b2.start);
check('the week bounds are right over a clock change and a month end (Mon Oct 26 .. Mon Nov 2 2026; Mon Mar 2 2026)', new Date(W.weekBounds(at(2026, 10, 1, 12)).start).getDate() === 26 && new Date(W.weekBounds(at(2026, 2, 5, 12)).start).getDate() === 2);

// the goal
check('goal: the plan\'s days per week is the starting point', JSON.stringify(W.resolveWeeklyGoal(4, null)) === '{"goal":4,"source":"plan"}');
check('goal: the user\'s own pick (number of days picked) wins over the plan', JSON.stringify(W.resolveWeeklyGoal(4, [true, false, true, false, false, false, false])) === '{"goal":2,"source":"user"}');
check('goal: nothing picked and no plan -> the default 3; garbage values never give 0 or a negative goal', W.resolveWeeklyGoal(null, null).goal === 3 && W.resolveWeeklyGoal(0, [false, false, false, false, false, false, false]).goal === 3 && W.resolveWeeklyGoal(99, null).goal === 7 && W.resolveWeeklyGoal(NaN, null).goal === 3);

// the count
const week = [ent(at(2026, 10, 9)), ent(at(2026, 10, 11)), logged(at(2026, 10, 13)), ent(at(2026, 10, 15))];
let p = W.weekProgress(week, 4, sun);
check('camera workouts and logged sessions both count: 4 of 4 this week', p.count === 4 && p.done === 4 && p.bonus === 0 && p.reached && p.label === '4 of 4 workouts', JSON.stringify(p));
const practice = ent(at(2026, 10, 12), { kind: 'practice' });
p = W.weekProgress([...week.slice(0, 2), practice, practice], 4, sun);
check('practice form checks do not count (2 workouts + 2 practice = 2 of 4)', p.count === 2 && p.label === '2 of 4 workouts' && !p.reached && p.remaining === 2, JSON.stringify(p));
const extra = [...week, ent(at(2026, 10, 15, 18)), ent(at(2026, 10, 14, 8)), ent(at(2026, 10, 12, 8)), ent(at(2026, 10, 10, 8))];
p = W.weekProgress(extra, 4, sun);
check('the count caps at the goal and the rest is a bonus: 8 workouts on a goal of 4 = "4 of 4 workouts · +4 bonus", never "8 of 4"', p.count === 8 && p.done === 4 && p.bonus === 4 && p.label === '4 of 4 workouts · +4 bonus' && !/8 of 4/.test(p.label), p.label);
p = W.weekProgress(week, 4, mon);
check('on Monday the new week starts at 0 of 4 (last week\'s workouts do not count)', p.count === 0 && p.label === '0 of 4 workouts' && p.remaining === 4, JSON.stringify(p));
p = W.weekProgress([ent(at(2026, 10, 8, 23)), ent(at(2026, 10, 16, 0))], 3, sun);
check('workouts just outside the week (Sunday 23:00 before, Monday 00:00 after) are not counted', p.count === 0, String(p.count));
p = W.weekProgress([ent(at(2026, 10, 10, 8)), ent(at(2026, 10, 10, 8), { exerciseId: 'pushup', displayName: 'Push-up' }), ent(at(2026, 10, 10, 18))], 3, sun);
check('one workout is one timestamp (two exercises in one workout count once; a second workout the same day counts too)', p.count === 2, String(p.count));
check('goal of 1 says "workout", others "workouts"; the Profile text is "4 workouts a week"', W.weekProgress([], 1, sun).label === '0 of 1 workout' && W.weeklyGoalLabel(4) === '4 workouts a week' && W.weeklyGoalLabel(1) === '1 workout a week');

// Home's week line
const plan = { id: 'p', profile: { goal: 'general', experience: 'beginner', daysPerWeek: 4, location: 'gym' }, splitType: 'fullBody', currentWorkoutIndex: 0, generatedAt: 1, progressionState: {}, workouts: [{ id: 'w0', sessionNumber: 1, splitLabel: 'Full body', rationale: '', exercises: [{ exerciseId: 'squat', displayName: 'Squat', targetSets: 3, targetReps: 10, restSeconds: 60, currentVariationId: 'squat' }], completed: false }] };
const RealDate = Date; // the Home builder reads "now" itself: freeze it at Sunday Nov 15 2026 12:00
global.Date = class extends RealDate { constructor(...a) { if (a.length === 0) return new RealDate(sun); return new RealDate(...a); } static now() { return sun; } };
const js = home.buildHomeInjectJs(plan, extra, 62, 34);
const js2 = home.buildHomeInjectJs(plan, extra, 62, 34, [true, true, false, false, false, false, false]);
global.Date = RealDate;
check('Home: the week line uses the weekly goal: "4 of 4 workouts · +4 bonus" (8 workouts, goal 4 from the plan), never "8 of 4"', js.includes('4 of 4 workouts · +4 bonus') && !/8 of 4/.test(js), (/"2 of 4 workouts":"([^"]*)"/.exec(js) || [])[1]);
check('Home: a goal the user picked in Profile (2 days) replaces the plan\'s 4: "2 of 2 workouts · +6 bonus"', js2.includes('2 of 2 workouts · +6 bonus'), (/"2 of 4 workouts":"([^"]*)"/.exec(js2) || [])[1]);
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
check('Home loads the user\'s picked days with the plan and sessions (so the goal follows Profile)', /loadUserDays\(\)/.test(src) && /buildHomeInjectJs\(plan, sessions, insets\.top, insets\.bottom, userDays\)/.test(src));

// Profile
(async () => {
  const pc = require('./lib/prof-common.js');
  const { b, p: page } = await pc.open('full', { width: 390, height: 844 });
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#dc-root div')].filter((d) => d.children.length <= 1 && d.textContent.trim().length < 60).map((d) => d.textContent.trim()));
  check('Profile: the row is called "Weekly goal" (no "Training days" anywhere) and reads like "4 workouts a week"', rows.includes('Weekly goal') && !rows.includes('Training days') && rows.some((t) => /^\d+ workouts? a week$/.test(t)), rows.filter((t) => t.length < 60 && /Weekly goal|workouts? a week|Training/.test(t)).join(' | '));
  await page.waitForTimeout(100);
  const pt = await page.evaluate(() => { const e = [...document.querySelectorAll('#dc-root div')].filter((d) => d.children.length <= 1 && d.textContent.trim() === 'Weekly goal')[0]; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.touchscreen.tap(pt.x, pt.y); await page.waitForTimeout(900);
  const sheet = await page.evaluate(() => { const root = document.getElementById('dc-root'); const t = root.textContent.split(/\s+/).join(' '); return { text: t, intro: /Pick the days you plan to train/.test(t), oldIntro: /Pick the days you want to train/.test(t), dayBtns: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter((w) => [...root.querySelectorAll('div')].some((d) => d.textContent.trim() === w && d.getBoundingClientRect().height > 0)).length }; });
  check('Profile: tapping it opens an editable page titled "Weekly goal" with the day picker (the number of days picked is the goal)', sheet.intro && !sheet.oldIntro && !/Training days/.test(sheet.text), JSON.stringify([sheet.intro, sheet.oldIntro, sheet.dayBtns]));
  await b.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
