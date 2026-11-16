#!/usr/bin/env node
/**
 * scripts/test-goal-pages.js
 * Tapping a ring on Home opens that goal in depth (app/goal/[id].tsx, data lib/goalDetail.ts): this week by day, the past weeks, what counts.
 * The data is checked against the same maths as the rings; the tap on the real home.html posts which ring; the screen's source is checked.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const G = require('../lib/goalDetail.ts');
const R = require('../lib/homeRings.ts');
const { openHome } = require('./lib/home-harness.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const at = (m, d, h = 10) => new Date(2026, m, d, h).getTime();
const ent = (ts, id, reps, good, extra = {}) => ({ ts, exerciseId: id, displayName: id, reps, goodReps: good, pct: Math.round(good / reps * 100), formChecked: true, ...extra });
const now = at(10, 12, 15);                                  // Thursday Nov 12 2026: the week is Mon Nov 9 .. Sun Nov 15
const sessions = [
  ent(at(10, 9), 'squat', 10, 9), ent(at(10, 9), 'pushup', 10, 8),   // Mon: one workout
  ent(at(10, 11), 'pullup', 5, 5), ent(at(10, 11, 18), 'curl', 10, 10), // Wed: two workouts
  ent(at(10, 12, 9), 'squat', 10, 10, { kind: 'practice' }),         // today: practice only
  ent(at(10, 3), 'squat', 10, 7), ent(at(10, 4), 'pushup', 10, 9),   // last week: 2 workouts
  ent(at(9, 27), 'squat', 10, 10),                                   // two weeks ago
];
const W = G.goalDetail('workouts', sessions, 4, now), F = G.goalDetail('form', sessions, 4, now), M = G.goalDetail('muscles', sessions, 4, now);
check('the page ring is the SAME as the Home ring (same maths): workouts, form and muscles', ['workouts', 'form', 'muscles'].every((id, i) => JSON.stringify(G.goalDetail(id, sessions, 4, now).ring) === JSON.stringify(R.homeRings(sessions, 4, now).rings[i])));
check('this week by day: 7 days Mon..Sun, today (Thu) marked, Fri-Sun are future', W.days.map((d) => d.label).join() === 'Mon,Tue,Wed,Thu,Fri,Sat,Sun' && W.days[3].today && W.days.slice(4).every((d) => d.future) && !W.days[2].future);
check('Workouts by day: Mon 1, Tue 0, Wed 2, Thu 0 (practice does not count), future days empty', W.days.map((d) => d.text).join() === '1,0,2,0,,,', W.days.map((d) => d.text).join());
check('Workouts summary says where you are and what is left: "3 of 4 workouts this week, 1 to go"', W.summary === '3 of 4 workouts this week, 1 to go', W.summary);
check('Form by day: Mon 85% (17/20), Wed 100%, Tue and Thu "–" (nothing form-checked); summary says the points to the 90% goal', F.days[0].text === '85%' && F.days[2].text === '100%' && F.days[1].text === '–' && F.days[3].text === '–' && /points to the 90% goal|goal reached/.test(F.summary), F.days.map((d) => d.text).join() + ' | ' + F.summary);
check('Muscles by day: a count per day, the 11 muscles listed with the ones trained this week lit, summary "N of 11 muscles"', M.days[0].text !== '0' && M.muscles.length === 11 && M.muscles.filter((m) => m.hit).length === M.ring.value && /of 11 muscles trained this week|All 11/.test(M.summary), M.summary);
check('past weeks: this week and the 7 before it (8 rows), the first is "This week"', W.weeks.length === 8 && W.weeks[0].label === 'This week' && W.weeks[0].current && !W.weeks[1].current);
check('past weeks Workouts: last week 2/4, two weeks ago 1/4, older weeks 0/4', W.weeks[1].text === '2/4' && W.weeks[2].text === '1/4' && W.weeks.slice(3).every((w) => w.text === '0/4'), W.weeks.map((w) => w.text).join());
check('past weeks Form: last week (7+9)/20 = 80%, two weeks ago 100%', F.weeks[1].text === '80%' && F.weeks[2].text === '100%', F.weeks.map((w) => w.text).join());
check('past week labels are real dates like "Nov 2 – 8"', /^Nov 2 – 8$/.test(W.weeks[1].label) && /^Oct 26 – Nov 1$/.test(W.weeks[2].label), W.weeks[1].label + ' / ' + W.weeks[2].label);
check('"What counts" explains each goal in plain words (practice does not count; the week is Monday to Sunday; the 90% goal; the 11 muscles)', W.counts.some((t) => /Form checks are practice/.test(t)) && W.counts.some((t) => /4 workouts a week/.test(t)) && F.counts.some((t) => /90%/.test(t)) && M.counts.some((t) => /11 on your muscle map/.test(t)));
const E = G.goalDetail('workouts', [], 3, now);
check('empty state at 0: 0/3, all days "0" up to today, no crash', E.ring.text === '0/3' && E.days.slice(0, 4).every((d) => d.text === '0') && E.weeks.every((w) => w.text === '0/3') && /0 of 3 workouts this week, 3 to go/.test(E.summary), E.summary);
check('only the three goal ids are valid; anything else falls back to Workouts in the screen', G.isGoalId('form') && !G.isGoalId('x') && /isGoalId\(id\) \? id : 'workouts'/.test(fs.readFileSync(path.join(__dirname, '..', 'app', 'goal', '[id].tsx'), 'utf8')));

// the real Home page: a tap on each ring posts which one
(async () => {
  const h = await openHome({ inset: 62 });
  for (const id of ['workouts', 'form', 'muscles']) {
    const before = h.msgs.length;
    await h.page.evaluate((id) => document.querySelector('[data-ring="' + id + '"]').click(), id);
    await h.page.waitForTimeout(150);
    const m = h.msgs.slice(before).find((x) => x.type === 'ring');
    check(`1: tapping the ${id} ring posts "ring" with id ${id}`, m && m.id === id, JSON.stringify(m));
  }
  check('1: the rings look tappable (pointer)', await h.page.evaluate(() => getComputedStyle(document.querySelector('[data-ring="form"]')).cursor === 'pointer'));
  await h.browser.close();
  const idx = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'index.tsx'), 'utf8'), scr = fs.readFileSync(path.join(__dirname, '..', 'app', 'goal', '[id].tsx'), 'utf8');
  check('1: Home opens /goal/<id> for a ring tap', /msg as any\)\.type === 'ring'|msg\.type === 'ring'/.test(idx) && /router\.push\(`\/goal\/\$\{encodeURIComponent/.test(idx));
  check('1: the page shows the big ring, "This week" by day, "Past weeks", "What counts" (and the 11 muscles on Muscles), with the ring colours and the white tile style of Home', ['This week', 'Past weeks', 'What counts', 'goal-days', 'goal-weeks', 'goal-counts', 'goal-muscles', 'GOAL_COLORS', 'GlassBackButton', "backgroundColor: '#ffffff', borderRadius: 24"].every((x) => scr.includes(x)));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
