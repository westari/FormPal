#!/usr/bin/env node
/**
 * scripts/test-train-schedule.js
 * Train's week strip. A day you did not train that the plan had a workout for says "Missed" (never "Rest day"). "Rest day" appears only
 * where the plan has rest, and the plan's rest days are spread (4 / 5 / 6 / 7 days a week never have two rest days in a row). The
 * plan's day pattern comes from its days per week (lib/trainData.ts trainingWeekdays). Pure data checks plus the real page.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'x' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const { buildTrainData, trainingWeekdays } = require('../lib/trainData.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const ex = (n) => ({ exerciseId: 'squat', displayName: n, targetSets: 3, targetReps: 10, restSeconds: 60, currentVariationId: 'squat' });
const DAY = 86400000;
const mkPlan = (dpw, now, idx = 0) => ({ id: 'p', profile: { goal: 'general', experience: 'beginner', daysPerWeek: dpw, location: 'gym' }, splitType: 'fullBody', currentWorkoutIndex: idx, generatedAt: now.getTime() - 30 * DAY, progressionState: {},
  workouts: ['Full body A', 'Full body B', 'Full body C', 'Full body D'].map((n, i) => ({ id: 'w' + i, sessionNumber: i + 1, splitLabel: n, rationale: '', exercises: [ex('Squat')], completed: false })) });
const sess = (d) => ({ ts: d.getTime(), exerciseId: 'squat', displayName: 'Squat', reps: 10, goodReps: 9, pct: 90, formChecked: true });

// ── the weekly pattern ──
for (let n = 1; n <= 7; n++) {
  const t = trainingWeekdays(n);
  const rest = [0, 1, 2, 3, 4, 5, 6].filter((d) => !t.includes(d));
  // longest run of rest days around the week (Sunday follows Saturday)
  let run = 0, best = 0; for (let i = 0; i < 14; i++) { if (rest.includes(i % 7)) { run++; best = Math.max(best, run); } else run = 0; }
  const limit = Math.ceil(rest.length / t.length); // the best any layout can do
  check(`pattern ${n} day(s) a week: ${t.length} training days, longest rest stretch ${best} (best possible ${limit})`, t.length === n && best <= Math.max(limit, 1), JSON.stringify(t));
}
check('4, 5, 6 and 7 days a week never have two rest days in a row', [4, 5, 6, 7].every((n) => { const t = trainingWeekdays(n); for (let d = 0; d < 7; d++) if (!t.includes(d) && !t.includes((d + 1) % 7)) return false; return true; }));

// ── the week strip: Sunday Nov 15 2026, 4 days a week (Mon Tue Thu Sat) ──
const sun = new Date(2026, 10, 15, 12);
const planA = mkPlan(4, sun);
let td = buildTrainData(planA, [], { top: 62, bottom: 34 }, sun);
const label = (d) => (d.missed || d.tag) ? 'Missed' : d.rest ? 'Rest' : d.done ? 'Done' : 'Plan'; // round 7: this week's missed workout is a normal card with a Missed tag
const strip = td.days.map((d) => d.short + ':' + label(d)).join(' ');
console.log('      4 days, nothing done :', strip);
// days: Tue 10, Wed 11, Thu 12, Fri 13, Sat 14, Sun 15 (today), Mon 16 (tomorrow)
check('a planned day you skipped says "Missed" (Tue, Thu, Sat), a plan rest day says "Rest day" (Wed, Fri)', td.days.slice(0, 5).map(label).join() === 'Missed,Rest,Missed,Rest,Missed', strip);
check('Missed cards are not called "Rest day"', td.days.filter((d) => d.missed || d.tag).every((d) => (d.tag ? d.cta === 'Do it today' : d.name === 'Missed') && !/Rest/.test(d.name)));
check('today (Sunday) is a plan rest day with workouts missed this week, so Train suggests the missed workout first (round 7), and tomorrow (Monday) is the next plan workout', !td.days[5].rest && td.days[5].tag === undefined && td.days[5].cta === 'Do it today' && td.days[6].name === 'Full body A', td.days[5].name + ' / ' + td.days[6].name);
check('no two "Rest day" cards in a row anywhere in the strip', td.days.every((d, i) => !(d.name === 'Rest day' && td.days[i + 1] && td.days[i + 1].name === 'Rest day')), strip);

// worked out Tue and Thu: those are Done, the rest as before
const tue = new Date(2026, 10, 10, 9), thu = new Date(2026, 10, 12, 9);
td = buildTrainData(mkPlan(4, sun, 2), [sess(tue), sess(thu)], { top: 62, bottom: 34 }, sun);
check('days you trained show as done; only Sat is Missed', td.days.slice(0, 5).map(label).join() === 'Done,Rest,Done,Rest,Missed', td.days.map(label).join());

// today is a training day (Monday Nov 16): planned workout today, nothing "Missed" for days before the plan existed
const mon = new Date(2026, 10, 16, 12);
td = buildTrainData(mkPlan(4, mon), [], { top: 62, bottom: 34 }, mon);
check('on a training day today shows the plan workout, tomorrow (Tue) the next one', !td.days[5].rest && td.days[5].name === 'Full body A' && td.days[6].name === 'Full body B', td.days[5].name + ' / ' + td.days[6].name);
const young = { ...mkPlan(4, mon), generatedAt: new Date(2026, 10, 15, 8).getTime() };
td = buildTrainData(young, [], { top: 62, bottom: 34 }, mon);
check('days before the plan existed are never "Missed" (the plan did not exist yet)', td.days.slice(0, 5).every((d) => !d.missed), td.days.map(label).join());
td = buildTrainData(null, [], { top: 62, bottom: 34 }, mon);
check('no plan: nothing is Missed and nothing is a plan rest day', td.days.every((d) => !d.missed), td.days.map((d) => d.name).join(' | '));
// 7 days a week: no rest days at all except... none
td = buildTrainData(mkPlan(7, sun), [], { top: 62, bottom: 34 }, sun);
check('7 days a week: no rest days, every skipped day is Missed', td.days.slice(0, 5).every((d) => d.missed || d.tag) && !td.days[5].rest && !td.days[6].rest, td.days.map(label).join());

// ── the real page: a Missed card and a Rest card are drawn ──
(async () => {
  const open = require('./lib/train-open.js');
  const { b, p } = await open(planA, [], sun);
  const names = await p.evaluate(() => [...document.querySelectorAll('div[data-scroll] > div')].map((c) => (c.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3).join(' / ')).slice(0, 7));
  console.log('      page cards:', JSON.stringify(names));
  check('the page shows Missed on the skipped days and Rest day on the plan rest days', names.filter((n) => /Missed/.test(n)).length === 3 && names.filter((n) => /Rest day/.test(n)).length >= 2, JSON.stringify(names));
  await p.screenshot({ path: require('path').join(__dirname, '..', '.scratch', 'train-schedule.png') });
  await b.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
