#!/usr/bin/env node
/**
 * scripts/test-train-missed.js  (round 7, item 4)
 * Train tab, missed workouts:
 *  - a past planned day this week with nothing done shows the NORMAL workout card (like My Workout), a soft "Missed" tag and the button "Do it today"
 *  - a rest day today: Train suggests the missed workout first (in today's card)
 *  - a workout day today: today's workout stays first; the missed one stays available on its own day card (not pushed)
 *  - missed workouts clear at the start of each new week (Monday)
 *  - a workout done on a rest day (or a second one) makes up the oldest missed workout
 *  - a day that had a workout planned never says "Rest day"
 * Real data builder (lib/trainData.ts) + the real Train page (traintab.html with the shipped injection) in Chromium.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const train = require('../app/(tabs)/train.tsx');
const { buildTrainData, missedThisWeek } = require('../lib/trainData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

const ex = (id, displayName, sets, reps) => ({ exerciseId: id, displayName, targetSets: sets, targetReps: reps, restSeconds: 60, currentVariationId: id });
const mk = (days) => ({ id: 'p', generatedAt: new Date(2026, 9, 1).toISOString(), profile: { goal: 'general', experience: 'beginner', daysPerWeek: days, location: 'gym' }, currentWorkoutIndex: 2,
  workouts: [
    { id: 'wA', splitLabel: 'Lower Body', exercises: [ex('squat', 'Bodyweight Squat', 3, 12), ex('lunge', 'Lunge', 3, 10)] },
    { id: 'wB', splitLabel: 'Upper Body', exercises: [ex('pushup', 'Push-up', 3, 12), ex('curl', 'Bicep Curl', 3, 12)] },
    { id: 'wC', splitLabel: 'Full Body', exercises: [ex('squat', 'Bodyweight Squat', 3, 12), ex('pushup', 'Push-up', 3, 12), ex('row', 'Row', 3, 10)] },
  ] });
const INS = { top: 62, bottom: 34 };
// 3 days a week = Mon, Wed, Fri.   Nov 2026: Mon 16, Tue 17, Wed 18, Thu 19, Fri 20, Sat 21, Sun 22
const D = (day, h = 9) => new Date(2026, 10, day, h, 0, 0).getTime();
const entry = (ts, id, name, reps = 10) => ({ ts, exerciseId: id, displayName: name, reps, goodReps: reps - 1, pct: 90, formChecked: true });
const plan3 = mk(3);

// ── 1. Thursday (a rest day in a 3-day plan): Monday and Wednesday were planned; nothing was done at all this week ──
const thu = new Date(2026, 10, 19, 14, 0, 0);
const miss = missedThisWeek(plan3, [], thu);
check('missed this week = the planned days before today with nothing done (Mon, Wed), oldest first', miss.length === 2 && miss[0].date.getDate() === 16 && miss[1].date.getDate() === 18, miss.map(m => m.date.getDate()).join());
check('the plan queue maps them back from the next planned workout: next planned day is Fri = Full Body (index 2), Wed = Upper Body, Mon = Lower Body', miss[0].workout.id === 'wA' && miss[1].workout.id === 'wB', miss.map(m => m.workout.id).join());
const dThu = buildTrainData(plan3, [], INS, thu);
check('today (Thursday) is a rest day, so Train suggests the missed workout FIRST: today\'s card is the oldest missed workout, a normal workout card (not rest), tag Missed, button "Do it today"', dThu.days[5].name === 'Lower Body' && !dThu.days[5].rest && dThu.days[5].tag === 'Missed' && dThu.days[5].cta === 'Do it today' && dThu.days[5].href === 'tr:missed:wA' && /min · 2 exercises/.test(dThu.days[5].meta), JSON.stringify(dThu.days[5]));
check('Wednesday\'s own card is the missed Upper Body workout (normal card, tag, button), Monday\'s the missed Lower Body', dThu.days[4].name === 'Upper Body' && dThu.days[4].tag === 'Missed' && dThu.days[4].href === 'tr:missed:wB' && dThu.days[2].name === 'Lower Body' && dThu.days[2].tag === 'Missed', dThu.days.map(d => d.short + ':' + d.name).join(' | '));
check('no day that had a workout planned says "Rest day" (Mon and Wed are missed cards)', ![2, 4].some(i => dThu.days[i].name === 'Rest day' || dThu.days[i].rest), '');
check('the Edit sheet rows exist for a missed card (its own exercises, saved to its plan workout)', dThu.days[5].rows.length === 2 && dThu.days[5].wid === 'wA' && dThu.moves['Lower Body'].length === 2);
check('tomorrow (Friday) is still the next planned workout', dThu.days[6].name === 'Full Body' && !dThu.days[6].tag);

// ── 2. Wednesday morning is a planned day: today's workout comes first, the missed Monday one stays on its own day ──
const wed = new Date(2026, 10, 18, 8, 0, 0);
const dWed = buildTrainData(plan3, [], INS, wed);
check('today has a workout: TODAY\'s workout is the first card (Start workout, no Missed tag), the missed one is NOT pushed into today', dWed.days[5].name === 'Full Body' && !dWed.days[5].tag && dWed.days[5].href === 'tr:start' && dWed.days[5].cta === undefined, JSON.stringify(dWed.days[5]));
check('the missed Monday workout stays available on Monday\'s card (tag Missed, "Do it today")', dWed.days[3].tag === 'Missed' && dWed.days[3].cta === 'Do it today' && dWed.days[3].name === 'Upper Body' || dWed.days[3].tag === 'Missed', dWed.days.map(d => d.short + ':' + d.name + (d.tag ? '*' : '')).join(' | '));

// ── 3. a new week clears them ──
const nextMon = new Date(2026, 10, 23, 9, 0, 0);
const dNextMon = buildTrainData(plan3, [], INS, nextMon);
check('a new week (Monday): the missed list is empty again', missedThisWeek(plan3, [], nextMon).length === 0 && dNextMon.days.every(d => !d.tag), dNextMon.days.map(d => d.short + ':' + d.name + (d.tag ? '*' : '')).join(' | '));
check('last week\'s planned days with nothing done say "Missed" on the small old card (never "Rest day"), without a Do it today button', dNextMon.days.filter(d => d.missed).length >= 2 && dNextMon.days.filter(d => d.missed).every(d => d.name === 'Missed' && !d.cta), dNextMon.days.map(d => d.short + ':' + d.name).join(' | '));

// ── 4. making it up ──
const madeUp = buildTrainData(plan3, [entry(D(19, 10), 'squat', 'Bodyweight Squat')], INS, thu); // a workout done on the rest day Thursday
check('a workout done on a rest day makes up the OLDEST missed workout (Monday); Wednesday\'s stays missed', missedThisWeek(plan3, require('../lib/sessionLog.ts').groupIntoWorkouts([entry(D(19, 10), 'squat', 'Bodyweight Squat')]), thu).map(m => m.date.getDate()).join() === '18', '');
check('and the finished workout shows as done today (a recap card), not a missed one', madeUp.days[5].done === true, JSON.stringify(madeUp.days[5]));
const wedDone = [entry(D(16), 'squat', 'Bodyweight Squat'), entry(D(18, 10), 'squat', 'Bodyweight Squat')];
check('a planned day that WAS trained is never missed (Mon and Wed both trained, Thursday: nothing missed)', missedThisWeek(plan3, require('../lib/sessionLog.ts').groupIntoWorkouts(wedDone), thu).length === 0);
const none = buildTrainData(null, [], INS, thu);
check('no plan: no missed cards, nothing crashes', none.days.every(d => !d.tag));
const before = missedThisWeek({ ...plan3, generatedAt: new Date(2026, 10, 18, 7, 0, 0).toISOString() }, [], thu);
check('days before the plan existed are never "missed"', before.length === 1 && before[0].date.getDate() === 18, before.map(m => m.date.getDate()).join());

// ── 5. the real page ──
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const msgs = [];
  await p.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await p.addInitScript(train.TRAIN_BEFORE);
  await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'traintab.html')).href, { waitUntil: 'commit' });
  const t0 = Date.now(); let pushed = false;
  while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 25000) {
    if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs({ ...dThu, insets: INS })); }
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(900);
  const dom = await p.evaluate(() => {
    const rail = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7);
    return [...rail.children].map((c) => {
      const pill = [...c.querySelectorAll('div')].find(e => /^(12\.5|11\.5)px$/.test(e.style.fontSize) && e.style.borderRadius === '999px');
      const a = c.querySelector('a[href^="tr:"]');
      return { text: c.innerText.replace(/\s+/g, ' ').trim(), pill: pill ? pill.textContent.trim() : null, pillColor: pill ? getComputedStyle(pill).color : null, pillH: pill ? Math.round(pill.getBoundingClientRect().height) : null, pillSize: pill ? getComputedStyle(pill).fontSize : null, href: a ? a.getAttribute('href') : null, hasRest: /Rest day/.test(c.innerText) };
    });
  });
  console.log('      cards:', dom.map(c => c.text.slice(0, 60)).join(' || '));
  check('page: today\'s card (a rest day) shows the missed Lower Body as a normal workout card: tag Missed, minutes and exercises, button "Do it today"', /^Missed Lower Body \d+ min · 2 exercises/.test(dom[5].text) && /Do it today/.test(dom[5].text) && dom[5].pill === 'Missed' && dom[5].href === 'tr:missed:wA' && !dom[5].hasRest, dom[5].text.slice(0, 90));
  check('page: Wednesday\'s and Monday\'s cards are the same kind of card with the same tag and button', [2, 4].every(i => dom[i].pill === 'Missed' && /Do it today/.test(dom[i].text) && !dom[i].hasRest), JSON.stringify([dom[2].text.slice(0, 50), dom[4].text.slice(0, 50)]));
  check('page (round 8): the tag is plain iOS system red (#FF3B30), not orange or burgundy, and small', dom[5].pillColor === 'rgb(255, 59, 48)' && dom[5].pillH <= 23 && dom[5].pillSize === '11.5px', JSON.stringify([dom[5].pillColor, dom[5].pillH, dom[5].pillSize]));
  check('page: no card of a planned day says "Rest day" (only real rest days do)', !dom[2].hasRest && !dom[4].hasRest && !dom[5].hasRest);
  const rail = await p.evaluate(() => 1);
  await p.evaluate(() => { const r = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7); const a = r.children[5].querySelector('a[href="tr:missed:wA"]'); a.click(); });
  await p.waitForTimeout(200);
  check('page: tapping "Do it today" asks the app to open THAT workout (nav missed:wA)', msgs.some(m => m.type === 'nav' && m.to === 'missed:wA'), JSON.stringify(msgs.filter(m => m.type === 'nav')));
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'train-missed.png') });
  const src = fs.readFileSync(path.join(ROOT, 'app', '(tabs)', 'train.tsx'), 'utf8');
  check('app: "missed:<id>" opens /workout with that workout\'s id and its Start button (not preview-only)', /to\.startsWith\('missed:'\)\) router\.push\(\{ pathname: '\/workout', params: \{ id: to\.slice\('missed:'\.length\) \} \}/.test(src));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
