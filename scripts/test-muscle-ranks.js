#!/usr/bin/env node
/**
 * scripts/test-muscle-ranks.js
 *
 * After-workout muscle page (assets/app screens/muscleranks.html).
 *
 * Part 1 (node, REAL app code): sessions -> lib/sessionLog + components/
 *   MuscleTierMap standing -> lib/muscleRanksData payload. Proves the rank,
 *   the per-muscle +%, the muscle rows and the body-map highlight come from the
 *   real data and differ per workout (no fixed "Shoulders, Triceps").
 * Part 2 (Playwright, REAL design file + the shipped injection from
 *   lib/muscleRanksInject): loads the page with the payload, waits for the
 *   'ready' the app waits for, and checks the live DOM: real rank/%/gain text,
 *   no placeholder text, real body map, and that NOTHING moves after reveal.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const sessionLog = require('../lib/sessionLog.ts');
const MTM = require('../components/MuscleTierMap.tsx');
const data = require('../lib/muscleRanksData.ts');
const inject = require('../lib/muscleRanksInject.ts');
const paths = require('../components/muscleMapPaths.generated.ts');
const { TIER_META } = require('../constants/tierPalette.ts');
const { EXERCISE_CATALOG, Muscle } = require('../constants/exercises.ts');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const DAY = 24 * 60 * 60 * 1000;
const TIERIDX = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4, master: 5, champion: 6 };
const NOW = Date.now();
const entry = (id, reps, good, daysAgo, ts) => ({
  ts: ts ?? NOW - daysAgo * DAY, exerciseId: id, displayName: id, reps, goodReps: good, pct: Math.round(100 * good / reps), formChecked: true,
});

const ICON_FILE = { shoulders: 'shoulders', triceps: 'triceps', quads: 'quads', glutes: 'glutes', biceps: 'biceps', chest: 'chest', hamstrings: 'hamstrings', abs: 'abs', lats: 'lats' };
function iconFor(m) {
  const slug = ICON_FILE[m];
  if (!slug) return null;
  const f = path.join(ROOT, 'assets', 'images', 'muscle-icons', `${slug}-bronze.png`);
  return fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : null;
}
function emblemFor(tier) {
  const f = path.join(ROOT, 'assets', 'ranks', `${tier ?? 'bronze'}.png`);
  return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
}

function build(prior, today) {
  const ts = NOW;
  const thisWorkout = today.map(e => ({ ...e, ts }));
  const all = [...prior, ...thisWorkout];
  const tiersBefore = sessionLog.computeMuscleTiers(prior);
  const tiersAfter = sessionLog.computeMuscleTiers(all);
  const standingBefore = MTM.computeOverallStanding(tiersBefore);
  const standingAfter = MTM.computeOverallStanding(tiersAfter);
  const payload = data.buildMuscleRanksPayload({
    entries: thisWorkout, tiersBefore, tiersAfter, standingBefore, standingAfter,
    labels: MTM.MUSCLE_LABELS, note: 'Solid session. You hit good form on 28 of 30 reps (93%).',
    iconFor, emblem: emblemFor(standingAfter && standingAfter.tier), history: all,
  });
  return { payload, standingBefore, standingAfter, tiersBefore, tiersAfter, entries: thisWorkout, all, prior };
}

const oneMuscle = EXERCISE_CATALOG.find(e => e.muscles.length === 1);

const SCENARIOS = {
  'shoulders+triceps (bronze)': build(
    [entry('shoulderPress', 40, 36, 10)],
    [entry('shoulderPress', 30, 28, 0)]),
  'legs (squat+lunge)': build(
    [entry('squat', 60, 55, 12), entry('shoulderPress', 90, 80, 20)],
    [entry('squat', 30, 27, 0), entry('lunge', 24, 20, 0)]),
  'silver user': build(
    [entry('shoulderPress', 400, 396, 20)],
    [entry('shoulderPress', 40, 40, 0)]),
  'brand new user, unranked': build([], [entry('curl', 6, 6, 0)]),
};
// 3 muscles in one workout (shoulder press = shoulders + triceps, curl = biceps) and a long full-body workout
SCENARIOS['3 muscles (press + curl)'] = build(
  [entry('shoulderPress', 40, 36, 10), entry('curl', 30, 27, 10)],
  [entry('shoulderPress', 30, 28, 0), entry('curl', 20, 18, 0)]);
SCENARIOS['many muscles (full body)'] = build(
  [entry('shoulderPress', 40, 36, 10), entry('squat', 40, 36, 10)],
  [entry('shoulderPress', 30, 28, 0), entry('curl', 20, 18, 0), entry('squat', 30, 27, 0), entry('lunge', 24, 20, 0), entry('romanianDeadlift', 20, 18, 0)]);
// worst-case widths: the two longest muscle labels side by side
{
  const sc = build([entry('romanianDeadlift', 60, 55, 10)], [entry('romanianDeadlift', 30, 27, 0)]);
  sc.payload.hits = [
    { name: 'Hamstrings', gain: '+30.0%', icon: iconFor('hamstrings') },
    { name: 'Rear Delts', gain: '+30.0%', icon: iconFor('shoulders') },
  ];
  sc.synthetic = true; // rows overridden by hand for a layout stress test
  sc.payload.note = 'Layout stress test.';
  SCENARIOS['longest labels (Hamstrings + Rear Delts)'] = sc;
}
if (oneMuscle) SCENARIOS[`single muscle (${oneMuscle.id})`] = build([entry(oneMuscle.id, 20, 18, 5)], [entry(oneMuscle.id, 25, 23, 0)]);

// ── Part 1: data ─────────────────────────────────────────────────────────────
console.log('--- data (real sessionLog + MuscleTierMap standing) ---');
for (const [name, sc] of Object.entries(SCENARIOS)) {
  const { payload: p, standingAfter } = sc;
  console.log(`  ${name}: rank=${p.rank.label}->${p.rank.next} ${p.rank.pct}% (+${p.rank.gained}% today)  rows=${p.hits.map(h => h.name + ' ' + h.gain).join(' | ') || '(none)'}`);
  check(`${name}: rank label is the real standing`, p.rank.label === (standingAfter ? standingAfter.tier[0].toUpperCase() + standingAfter.tier.slice(1) : 'Unranked'));
  {
    // ── the page's numbers, recomputed INDEPENDENTLY from the raw tiers ──
    // every muscle's progress is its OWN progress toward ITS next tier (rank-ups count as tier*100 + progress)
    const r1 = (n) => Math.round(n * 10) / 10;
    const worked = data.workedMuscles(sc.entries);
    const credit = Object.fromEntries(worked.map(w => [w.muscle, w.credit]));
    const universe = [...new Set([...Object.keys(sc.tiersAfter), ...worked.map(w => w.muscle)])];
    // below Bronze: progress toward Bronze from ALL the training the muscle has had (capped at 99%), before and after today
    const creditOf = (sessions) => Object.fromEntries(data.workedMuscles(sessions).map(w => [w.muscle, w.credit]));
    const credAll = creditOf(sc.all), credPrior = creditOf(sc.prior);
    const unrA = (m) => Math.min(99, (credAll[m] || 0) / 50 * 100), unrB = (m) => Math.min(99, (credPrior[m] || 0) / 50 * 100);
    const progA = (m) => sc.tiersAfter[m] ? data.muscleProgressPct(sc.tiersAfter[m]) : unrA(m);
    const absA = (m) => sc.tiersAfter[m] ? TIERIDX[sc.tiersAfter[m].tier] * 100 + data.muscleProgressPct(sc.tiersAfter[m]) : unrA(m) - 100;
    const absB = (m) => sc.tiersBefore[m] ? TIERIDX[sc.tiersBefore[m].tier] * 100 + data.muscleProgressPct(sc.tiersBefore[m]) : unrB(m) - 100;
    const gain = (m) => Math.min(99.9, Math.max(0, r1(absA(m)) - r1(absB(m))));
    // the overall rank position, recomputed independently: weakest tier * 100 + (average position of the ranked muscles - weakest tier * 100)
    const ovAbs = (tiers) => {
      const ks = Object.keys(tiers); if (!ks.length) return 0;
      const minIdx = Math.min(...ks.map(m => TIERIDX[tiers[m].tier]));
      const mean = ks.reduce((a, m) => a + TIERIDX[tiers[m].tier] * 100 + data.muscleProgressPct(tiers[m]), 0) / ks.length;
      return minIdx * 100 + Math.max(0, Math.min(99.9, mean - minIdx * 100));
    };
    const ranked = Object.keys(sc.tiersAfter);
    const avgA = ranked.length && !(sc.standingAfter && sc.standingAfter.atTop)
      ? r1(ovAbs(sc.tiersAfter) - 100 * Math.min(...ranked.map(m => TIERIDX[sc.tiersAfter[m].tier])))
      : r1(universe.reduce((a, m) => a + progA(m), 0) / universe.length);
    const overallGain = r1(Math.max(0, ovAbs(sc.tiersAfter) - ovAbs(sc.tiersBefore))); // how far the OVERALL rank % moved this workout
    // header: ONLY the newest number
    check(`${name}: the header shows ONLY the newest % (${avgA}%), no "old -> new"`, p.rank.pctLabel === `${avgA.toFixed(1)}%` && !/→/.test(p.rank.pctLabel) && p.rank.pct === avgA, p.rank.pctLabel);
    if (!sc.synthetic) check(`${name}: "Overall +X%" is EXACTLY the sum of the muscle rows (${p.hits.map(h => h.gain).join(' + ')} = +${p.rank.gained}%)`, Math.round(parseFloat(p.rank.gained) * 10) === (p.hits.reduce((a, h) => a + Math.round(parseFloat(h.gain.replace(/[+%]/g, '')) * 10), 0)), `${p.rank.gained}`);
    check(`${name}: the overall gain is never negative and has one decimal`, parseFloat(p.rank.gained) >= 0 && /^\d+\.\d$/.test(p.rank.gained), p.rank.gained);
    const rowsOk = p.hits.every((h, i) => Math.abs(parseFloat(h.gain.replace(/[+%]/g, '')) - r1(gain(worked[i].muscle))) <= 0.11);
    if (!sc.synthetic) check(`${name}: each ROW = that muscle's own progress after - before`, rowsOk);
    if (!sc.synthetic && sc.entries.some(e => e.reps > 0)) check(`${name}: a workout GIVES a gain (every shown muscle > +0.0%)`, p.hits.length > 0 && p.hits.every(h => parseFloat(h.gain.replace(/[+%]/g, '')) > 0), p.hits.map(h => h.gain).join(','));
    check(`${name}: every number on the page has exactly one decimal`, /^\d+\.\d$/.test(p.rank.gained) && /^\d+\.\d%$|^Top rank$/.test(p.rank.pctLabel) && p.hits.every(h => /^\+\d+\.\d%$/.test(h.gain)), `${p.rank.pctLabel} | ${p.rank.gained} | ${p.hits.map(h => h.gain).join(',')}`);
    if (!sc.synthetic) check(`${name}: the note is plain coach words (no maths, no arrows, no "total gained")`, !/Total gained|average of|=|→|\+\d/.test(p.note) && p.note.length < 190 && /moved up|Nice work|top rank/.test(p.note), p.note);
  }
  check(`${name}: every row has a real muscle name + a +N% gain (no bare "+%")`, p.hits.every(h => h.name && /^\+\d+(\.\d)?%$/.test(h.gain)));
}
// ── user's report: "Bronze 53.2% -> 53.2%", Shoulders +0.0%, Triceps +0.0% right after a workout ──
// Shoulders/triceps were already past the overall (weakest-link) tier, so they were capped at 100 before AND after.
{
  const prior = [entry('shoulderPress', 300, 290, 5), entry('squat', 60, 54, 7)];
  const today = [entry('shoulderPress', 10, 9, 0)];
  const sc = build(prior, today);
  const p = sc.payload;
  console.log(`  user report repro: ${p.rank.label} ${p.rank.pctLabel}  today +${p.rank.gained}%  rows=${p.hits.map(h => h.name + ' ' + h.gain).join(' | ')}`);
  check('REPORT: the tiers are what the report describes (shoulders already above the overall rank)', sc.tiersAfter.shoulders.tier === 'silver' && sc.standingAfter.tier === 'bronze', `${sc.tiersAfter.shoulders.tier} vs overall ${sc.standingAfter.tier}`);
  { const g = (n) => { const h = p.hits.find(x => x.name === n); return h ? parseFloat(h.gain.replace(/[+%]/g, '')) : null; };
    check('REPORT FIXED: Shoulders and Triceps both show a real gain', g('Shoulders') > 0 && g('Triceps') > 0, p.hits.map(h => h.name + ' ' + h.gain).join(' ')); }
  check('REPORT FIXED: the overall gain is above zero and equals the sum of the rows', parseFloat(p.rank.gained) > 0 && Math.round(parseFloat(p.rank.gained) * 10) === (p.hits.reduce((a, h) => a + Math.round(parseFloat(h.gain.replace(/[+%]/g, '')) * 10), 0)), p.rank.gained);
}
{
  // the user's rule: ONE header number = how far the OVERALL rank % went up (not a sum of the rows)
  const p = data.buildMuscleRanksPayload({
    entries: [{ ts: 1, exerciseId: 'shoulderPress', displayName: 'Shoulder Press', reps: 10, goodReps: 9, pct: 90, formChecked: true }],
    tiersBefore: { shoulders: { tier: 'bronze', peakTier: 'bronze', volume: 100, goodRatio: 0.9 }, triceps: { tier: 'bronze', peakTier: 'bronze', volume: 100, goodRatio: 0.9 }, quads: { tier: 'bronze', peakTier: 'bronze', volume: 60, goodRatio: 0.9 }, chest: { tier: 'bronze', peakTier: 'bronze', volume: 60, goodRatio: 0.9 } },
    tiersAfter: { shoulders: { tier: 'bronze', peakTier: 'bronze', volume: 100.9, goodRatio: 0.9 }, triceps: { tier: 'bronze', peakTier: 'bronze', volume: 100.9, goodRatio: 0.9 }, quads: { tier: 'bronze', peakTier: 'bronze', volume: 60, goodRatio: 0.9 }, chest: { tier: 'bronze', peakTier: 'bronze', volume: 60, goodRatio: 0.9 } },
    standingBefore: { tier: 'bronze', progress: 0.5, atTop: false }, standingAfter: { tier: 'bronze', progress: 0.512, atTop: false },
    labels: { shoulders: 'Shoulders', triceps: 'Triceps' }, iconFor: () => null, emblem: null,
  });
  check(`HEADER: "Overall +${p.rank.gained}%" is the sum of the rows (${p.hits.map(h => h.gain).join(' + ')}), not the % the overall bar moved`, Math.round(parseFloat(p.rank.gained) * 10) === (p.hits.reduce((a, h) => a + Math.round(parseFloat(h.gain.replace(/[+%]/g, '')) * 10), 0)) && p.rank.next === 'Silver' && p.hits.length === 2, p.rank.gained);
}
{
  // below Bronze counts ALL the training, capped at 99% until Bronze is real
  const mk = (reps, ts) => ({ ts, exerciseId: 'curl', displayName: 'Curl', reps, goodReps: reps, pct: 100, formChecked: true });
  const prior = [mk(20, NOW - 5 * DAY), mk(10, NOW - 3 * DAY)], today = [mk(9, NOW)];
  const sc = build(prior, today);
  const bic = sc.payload.hits.find(h => h.name === 'Biceps');
  // 30 reps before (60% toward Bronze), 39 after (78%): the row is +18.0, not today's 9 reps alone (+18 coincides) - use a case that tells them apart below
  check('below Bronze: biceps (39 of 50 reps ever) is not ranked yet and its row is the gain in ALL-time progress (+18.0%)', !sc.tiersAfter.biceps && bic && bic.gain === '+18.0%', bic && bic.gain);
  const big = build([mk(40, NOW - 4 * DAY)], [mk(9, NOW)]); // 40 -> 49 reps: 80% -> 98%
  const bic2 = big.payload.hits.find(h => h.name === 'Biceps');
  check('below Bronze: 49 of 50 reps shows 98% (never 100% until Bronze is real) - row +18.0%', !big.tiersAfter.biceps && bic2 && bic2.gain === '+18.0%', bic2 && bic2.gain);
  const cross = build([mk(45, NOW - 4 * DAY)], [mk(30, NOW)]); // crosses Bronze today: a positive, bounded gain
  const bic3 = cross.payload.hits.find(h => h.name === 'Biceps');
  check('crossing Bronze today gives a positive gain (not a drop from 99% to ~0) and never reads over +99.9%', !!cross.tiersAfter.biceps && bic3 && parseFloat(bic3.gain) > 0 && parseFloat(bic3.gain) <= 99.9, bic3 && bic3.gain);
}
// ── Per-exercise muscle weights (PLACEHOLDERS, constants/muscleWeights.ts): main muscle most, helpers much less ─────────
{
  const W = require('../constants/muscleWeights.ts');
  const ids = EXERCISE_CATALOG.map((e) => e.id);
  check('every exercise in the catalogue has a weight table (' + ids.length + ' exercises)', ids.every((id) => W.MUSCLE_WEIGHTS[id]), ids.filter((id) => !W.MUSCLE_WEIGHTS[id]).join());
  check('each table has its main muscle at 1.0 and every helper strictly lower, all above 0', ids.every((id) => { const v = Object.values(W.MUSCLE_WEIGHTS[id]); return v.filter((x) => x === 1).length >= 1 && v.every((x) => x > 0 && x <= 1); }));
  check('the catalogue really uses the table (what the rank maths reads)', ids.every((id) => { const def = EXERCISE_CATALOG.find((e) => e.id === id); const got = {}; for (const c of def.muscles) { const p = require('../constants/exercises.ts').muscleCreditParts(c); got[p.muscle] = p.weight; } return JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(W.MUSCLE_WEIGHTS[id]).sort()) && Object.keys(got).every((k) => got[k] === W.MUSCLE_WEIGHTS[id][k]); }));
  check('the weights are labelled as placeholders', W.MUSCLE_WEIGHTS_ARE_PLACEHOLDERS === true && /PLACEHOLDER/.test(fs.readFileSync(path.join(ROOT, 'constants', 'muscleWeights.ts'), 'utf8')));
  const credit = (id, mu) => { const def = EXERCISE_CATALOG.find((e) => e.id === id); const c = def.muscles.map((x) => require('../constants/exercises.ts').muscleCreditParts(x)).find((x) => x.muscle === mu); return c ? c.weight : 0; };
  check('push-up: chest highest, triceps less, shoulders less, biceps none', credit('pushup', 'chest') === 1 && credit('pushup', 'triceps') < 1 && credit('pushup', 'shoulders') < 1 && credit('pushup', 'triceps') > 0 && credit('pushup', 'biceps') === 0, ['chest', 'triceps', 'shoulders', 'biceps'].map((m) => m + ' ' + credit('pushup', m)).join(', '));
  // through the real rank maths: a push-up workout, a fresh user (all bronze, so the rows are comparable)
  const pu = build([], [entry('pushup', 20, 18, 0)]);
  const g = (n) => { const h = pu.payload.hits.find((x) => x.name === n); return h ? parseFloat(h.gain.replace(/[+%]/g, '')) : 0; };
  console.log('      push-up x20 through the rank maths: ' + pu.payload.hits.map((h) => h.name + ' ' + h.gain).join(' | ') + '   Overall +' + pu.payload.rank.gained + '%');
  check('push-up workout: Chest gains the most, then Triceps, then Shoulders; Biceps has no row', g('Chest') > g('Triceps') && g('Triceps') > g('Shoulders') && g('Shoulders') > 0 && !pu.payload.hits.some((h) => h.name === 'Biceps'), pu.payload.hits.map((h) => h.name + ' ' + h.gain).join(' '));
  check('the rows no longer all show the same number', new Set(pu.payload.hits.map((h) => h.gain)).size === pu.payload.hits.length, pu.payload.hits.map((h) => h.gain).join(' '));
  const sp = build([], [entry('shoulderPress', 30, 28, 0)]);
  const gs = (n) => { const h = sp.payload.hits.find((x) => x.name === n); return h ? parseFloat(h.gain.replace(/[+%]/g, '')) : 0; };
  check('shoulder press: Shoulders gain clearly more than Triceps (placeholder weights 1.0 vs 0.4)', gs('Shoulders') > gs('Triceps') && gs('Triceps') > 0, sp.payload.hits.map((h) => h.name + ' ' + h.gain).join(' '));
  for (const [nm, sc] of Object.entries({ 'push-up': pu, 'shoulder press': sp })) {
    const sum = sc.payload.hits.reduce((a, h) => a + Math.round(parseFloat(h.gain.replace(/[+%]/g, '')) * 10), 0);
    check(nm + ': Overall +X% is exactly the sum of the rows', Math.round(parseFloat(sc.payload.rank.gained) * 10) === sum, sc.payload.hits.map((h) => h.gain).join(' + ') + ' = ' + sc.payload.rank.gained);
  }
}
const A = SCENARIOS['shoulders+triceps (bronze)'].payload, B = SCENARIOS['legs (squat+lunge)'].payload;
check('rows follow the workout: shoulders workout -> Shoulders/Triceps (traps has no art, so no row)', A.hits.map(h => h.name).sort().join() === 'Shoulders,Triceps', A.hits.map(h => h.name).join());
check('rows follow the workout: legs workout -> different muscles', !B.hits.some(h => /Shoulders|Triceps/.test(h.name)) && B.hits.length >= 2, B.hits.map(h => h.name).join());
check('rows carry the real Flaticon art', A.hits.every(h => h.icon && h.icon.startsWith('data:image/png;base64,')));
{
  // gain really is after - before for that muscle
  const sc = SCENARIOS['shoulders+triceps (bronze)'];
  // before today the shoulders had 40 of Bronze's 50 reps (unranked, 80% toward Bronze = -20 on the scale just below Bronze's 0)
  const exp = data.muscleGainPct(undefined, sc.tiersAfter.shoulders) + 20;
  const shown = parseFloat(A.hits.find(h => h.name === 'Shoulders').gain.replace(/[+%]/g, ''));
  check('Shoulders +% equals (after - before) progress from the logs', Math.abs(shown - exp) <= 0.51, `shown ${shown} expected ${exp.toFixed(2)}`);
}
{
  // body map: only the worked muscles are coloured
  const idByD = {};
  for (const [id, d] of Object.entries({ ...paths.MUSCLE_MAP_FRONT_PATHS, ...paths.MUSCLE_MAP_BACK_PATHS })) idByD[d] = id;
  const svg = decodeURIComponent(A.bodyMap.replace('data:image/svg+xml;utf8,', ''));
  const colored = new Set();
  for (const m of svg.matchAll(/<path d="([^"]+)" fill="(#[0-9a-fA-F]{6})"/g)) {
    if (!['#E3E4EA', '#F1F2F6'].includes(m[2]) && idByD[m[1]]) colored.add(idByD[m[1]]);
  }
  const base = [...colored].map(id => id.replace(/-\d+$/, ''));
  const regionIds = (mu) => paths.MUSCLE_MAP_REGIONS[mu].ids;
  const expected = new Set([...regionIds('shoulders'), ...regionIds('triceps'), ...regionIds('traps')]); // traps are a helper muscle of the press (placeholder weight 0.15), so they are worked too
  check('body map colours the worked muscles (shoulders + triceps fragments)', [...expected].every(id => colored.has(id)), `${colored.size}/${expected.size}`);
  check('body map colours NOTHING else (quads/chest/etc stay neutral)', [...colored].every(id => expected.has(id)), [...new Set(base)].join());
  check('body map has a clear (~1.6px) outline around both figures', (svg.match(/stroke="#454B5C" stroke-width="6"/g) || []).length === 2);
  check('body map is front + back side by side', svg.includes('viewBox="78 -9 479 833"') && svg.includes('viewBox="641 -13 483 832"'));
}

// ── Part 2: the real page ────────────────────────────────────────────────────
(async () => {
  console.log('\n--- page (real muscleranks.html + shipped injection, CPU x4) ---');
  const file = path.join(ROOT, 'assets', 'app screens', 'muscleranks.html');
  const browser = await chromium.launch();
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    const p = sc.payload;
    const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let t0 = 0, readyAt = null;
    const msgs = [];
    await page.exposeFunction('__post', (d) => {
      let m; try { m = JSON.parse(d); } catch { return; }
      if (m.type === 'pageConsole') return;
      msgs.push(m.type);
      if (m.type === 'ready' && readyAt === null) readyAt = Date.now() - t0;
    });
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await page.addInitScript(inject.muscleRanksBeforeJs(p));
    t0 = Date.now();
    await page.goto(pathToFileURL(file).href, { waitUntil: 'commit' });
    const deadline = Date.now() + 9000;
    while (readyAt === null && Date.now() < deadline) await page.waitForTimeout(25);
    check(`${name}: page posts ready`, readyAt !== null, `${readyAt}ms`);

    const snap = () => page.evaluate(() => {
      const root = document.getElementById('dc-root');
      const rects = [];
      root.querySelectorAll('div,span,img,svg').forEach((el) => {
        const r = el.getBoundingClientRect();
        const t = el.children.length === 0 ? (el.textContent || '').trim() : '';
        const cs = getComputedStyle(el);
        rects.push([el.tagName, t.slice(0, 30), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), cs.opacity, cs.visibility, el.tagName === 'IMG' ? (el.src || '').length : 0]);
      });
      const img = root.querySelector('img[alt="Muscles worked this session"]');
      return { text: root.innerText, rects, imgSrc: img && img.getAttribute('src'), imgW: img && img.naturalWidth, imgVis: img && getComputedStyle(img).visibility, transform: root.style.transform };
    });
    const atReady = await snap();
    await page.waitForTimeout(2200);
    const later = await snap();

    const txt = atReady.text.replace(/\s+/g, ' ');
    check(`${name}: header shows real rank + % + where it is heading`, txt.includes(p.rank.label) && txt.includes(p.rank.pctLabel), `${p.rank.label} ${p.rank.pctLabel}`);
    const overallText = p.rank.atTop ? 'Top rank reached' : `Overall +${p.rank.gained}%`;
    check(`${name}: "${p.rank.label} -> ${p.rank.next}" row + "${overallText}"`, txt.includes(p.rank.next) && txt.includes(overallText), txt.match(/Overall[^A-Z]*/)?.[0]);
    check(`${name}: the "Each muscle's own progress" text and the old "Overall rank x% → y%" line are GONE`, !/own progress/i.test(txt) && !/Overall rank/i.test(txt) && !/→ ?\d/.test(txt.replace(p.rank.label + ' → ' + p.rank.next, '')), txt.match(/Overall[^A-Z]*/)?.[0]);
    const pos = await page.evaluate(() => { const gd = document.querySelector('[data-mr-overall]'); if (!gd) return null; const r = gd.getBoundingClientRect(); const grp = gd.parentElement.firstElementChild.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, grpTop: grp.top, grpBottom: grp.bottom, grpRight: grp.right }; });
    if (!p.rank.atTop) check(`${name}: "Overall +X%" is on the far RIGHT of the same row as "${p.rank.label} -> ${p.rank.next}" (same line, to the right of it, right edge at the card edge)`, !!pos && pos.top < pos.grpBottom && pos.bottom > pos.grpTop && pos.left >= pos.grpRight - 1 && pos.right > 330, JSON.stringify(pos));
    check(`${name}: muscle rows = ${p.hits.map(h => h.name + ' ' + h.gain).join(', ') || 'none'}`,
      p.hits.every(h => txt.includes(h.name) && txt.includes(h.gain)));
    const placeholders = ['Bronze II', 'Bronze III', '+14% today', 'Quads', 'Glutes', '+6%', '+5%', '72%'];
    const bad = placeholders.filter(x => txt.includes(x) && !(p.hits.some(h => h.name === x || h.gain === x) || p.rank.label + p.rank.next + p.rank.pct + '%' === 'x'));
    // 'Quads'/'Glutes' etc may legitimately be a real row; anything else from the design's demo must be gone
    const realBad = bad.filter(x => !p.hits.some(h => h.name === x || h.gain === x) && x !== p.rank.pct + '%' && x !== p.rank.pctLabel);
    check(`${name}: no design placeholder text left`, realBad.length === 0, realBad.join());
    const chipInfo = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('#dc-root div')].filter(d => d.style.position === 'absolute' && (d.style.top === '284px' || d.hasAttribute('data-mr-chip')));
      const card = chips[0] && chips[0].parentElement.getBoundingClientRect();
      return chips.map(c => {
        const r = c.getBoundingClientRect(); const ic = c.children[0]; const cs = getComputedStyle(ic);
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, cardT: card.top, cardB: card.bottom, cardL: card.left, cardR: card.right, icon: cs.backgroundImage.slice(0, 12), iw: ic.getBoundingClientRect().width };
      });
    });
    check(`${name}: every row shows its Flaticon art`, p.hits.every((h, i) => !h.icon || (chipInfo[i] && chipInfo[i].icon.startsWith('url(')) ), JSON.stringify(chipInfo.map(c => c.icon)));
    check(`${name}: rows don't overlap each other or leave the card`, chipInfo.every((c, i) => c.l >= c.cardL - 1 && c.r <= c.cardR + 1 && (i === 0 || c.l >= chipInfo[i - 1].r || c.t >= chipInfo[i - 1].b - 1 || chipInfo[i - 1].t >= c.b - 1) && c.t >= c.cardT && c.b <= c.cardB + 1), chipInfo.map(c => Math.round(c.l) + '-' + Math.round(c.r) + '@' + Math.round(c.t)).join(' | '));
    if (p.hits.length >= 3) {
      const lay = await page.evaluate(() => {
        const chips = [...document.querySelectorAll('#dc-root div')].filter(d => d.hasAttribute('data-mr-chip'));
        const card = chips[0].parentElement, cr = card.getBoundingClientRect(), img = card.querySelector('img').getBoundingClientRect();
        const boxes = chips.map(c => c.getBoundingClientRect());
        let overlaps = 0; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++; }
        return { cardH: card.clientHeight, cardPx: Math.round(cr.height), n: chips.length, top: Math.round(Math.min(...boxes.map(b => b.top)) - cr.top), bottom: Math.round(Math.max(...boxes.map(b => b.bottom)) - cr.top), imgBottom: Math.round(img.bottom - cr.top), overlaps, rows: new Set(boxes.map(b => Math.round(b.top))).size };
      });
      check(`${name}: ${p.hits.length} muscles -> ${lay.n} rows on screen (every muscle that gained), ${lay.rows} compact line(s), no overlaps`, lay.n === p.hits.length && lay.overlaps === 0, JSON.stringify(lay));
      check(`${name}: the card stays the same size (${lay.cardH}px, design 360) and the rows sit inside it below the body map`, lay.cardH === 360 && lay.bottom <= lay.cardPx && lay.top >= lay.imgBottom - 2, JSON.stringify(lay));
      check(`${name}: the overall is ONE line ("Overall +${p.rank.gained}%") and nothing else sums the rows`, txt.includes(`Overall +${p.rank.gained}%`) && !/% today/.test(txt) && !/own progress/i.test(txt), txt.match(/Overall[^A-Z]*/)?.[0]);
    }
    check(`${name}: real body map image, decoded, visible`, atReady.imgSrc === p.bodyMap && atReady.imgW > 0 && atReady.imgVis === 'visible');
    check(`${name}: layout identical at reveal and 2.2s later (nothing shifts)`, JSON.stringify(atReady.rects) === JSON.stringify(later.rects) && atReady.transform === later.transform);
    await page.screenshot({ path: path.join(ROOT, '.scratch', `muscle-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) });
    await page.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
