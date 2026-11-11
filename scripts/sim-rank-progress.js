#!/usr/bin/env node
/**
 * scripts/sim-rank-progress.js
 *
 * Simulates a normal user (3 full-body-ish workouts per week, 85% good form, 30 reps per exercise) through the REAL rank
 * code (lib/sessionLog computeMuscleTiers + components/MuscleTierMap computeOverallStanding) and prints, per muscle and for
 * the overall rank, the week each rank is first reached.
 *
 *   node scripts/sim-rank-progress.js            -> the table
 *   node scripts/sim-rank-progress.js --check    -> also asserts the pacing targets (exit 1 if they are missed)
 *
 * Every number the simulation (and lib/rankTuning.ts) uses is a PLACEHOLDER to be tuned from real use.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const sessionLog = require('../lib/sessionLog.ts');
const MTM = require('../components/MuscleTierMap.tsx');
const { MUSCLE_DISPLAY_ORDER } = MTM;
const DAY = 86400000;
const TIERS = sessionLog.TIER_ORDER;

// ---- the simulated user (PLACEHOLDER assumptions) ----------------------------------------------------------------
const REPS_PER_EXERCISE = 30;     // 3 sets x 10 reps
const GOOD_FORM = 0.9;            // share of reps with good form (the "normal" user)
// one full-body workout, repeated every session, so every tracked muscle gets roughly one 30-rep slot per workout
const WORKOUT = ['squat', 'pushup', 'bentOverRow', 'shoulderPress', 'hammerCurl', 'romanianDeadlift'];
const WORKOUTS = [WORKOUT];
const WEEKS = +((process.argv.find(a => a.startsWith('--weeks=')) || '').split('=')[1] || 130);
const START = Date.UTC(2026, 0, 5); // a Monday

function simulate({ goodForm = GOOD_FORM, workoutsPerWeek = 3, reps = REPS_PER_EXERCISE, weeks = WEEKS } = {}) {
  const realNow = Date.now;
  const log = [];
  const first = {};     // key -> first week reached, per tier
  const mark = (key, tier, wk) => { (first[key] = first[key] || {}); if (first[key][tier] == null) first[key][tier] = wk; };
  const DAYS = workoutsPerWeek === 3 ? [0, 2, 4] : workoutsPerWeek === 2 ? [1, 4] : workoutsPerWeek === 4 ? [0, 1, 3, 5] : [0, 1, 2, 3, 4];
  try {
    for (let wk = 0; wk < weeks; wk++) {
      DAYS.forEach((d, i) => {
        const ts = START + (wk * 7 + d) * DAY;
        for (const ex of WORKOUTS[(wk * DAYS.length + i) % WORKOUTS.length]) log.push({ ts, exerciseId: ex, displayName: ex, reps, goodReps: Math.round(reps * goodForm), pct: Math.round(goodForm * 100), formChecked: true });
      });
      const evalTs = START + (wk * 7 + 6) * DAY;
      Date.now = () => evalTs;
      const tiers = sessionLog.computeMuscleTiers(log);
      for (const [m, info] of Object.entries(tiers)) for (let t = 0; t <= sessionLog.tierIndex(info.tier); t++) mark(m, TIERS[t], wk + 1);
      const st = MTM.computeOverallStanding(tiers);
      if (st) for (let t = 0; t <= sessionLog.tierIndex(st.tier); t++) mark('OVERALL', TIERS[t], wk + 1);
    }
  } finally { Date.now = realNow; }
  return first;
}

function weekLabel(w) { return w == null ? '-' : w; }
function print(first, title) {
  console.log(`\n${title}`);
  console.log('weeks (from the first workout) until each rank is first reached; "-" = not within the simulated period');
  const head = ['muscle'.padEnd(12), ...TIERS.map(t => t.padStart(8))].join(' ');
  console.log(head); console.log('-'.repeat(head.length));
  const keys = [...MUSCLE_DISPLAY_ORDER.filter(m => first[m]), ...Object.keys(first).filter(k => k !== 'OVERALL' && !MUSCLE_DISPLAY_ORDER.includes(k)), 'OVERALL'];
  for (const k of keys) console.log([(k === 'OVERALL' ? 'OVERALL' : k).padEnd(12), ...TIERS.map(t => String(weekLabel(first[k] && first[k][t])).padStart(8))].join(' '));
}
module.exports = { simulate, gainsByTier, TIERS };

// How far one muscle's % bar moves per workout while it sits in each rank (the "gain" the after-workout page shows).
function gainsByTier({ goodForm = GOOD_FORM, workoutsPerWeek = 3, reps = REPS_PER_EXERCISE, weeks = WEEKS, muscle = 'shoulders' } = {}) {
  const realNow = Date.now, log = [], DAYS = workoutsPerWeek === 3 ? [0, 2, 4] : workoutsPerWeek === 2 ? [1, 4] : [0, 1, 3, 5];
  const buckets = {};
  let prevAbs = 0;
  try {
    for (let wk = 0; wk < weeks; wk++) for (const d of DAYS) {
      const ts = START + (wk * 7 + d) * DAY;
      for (const ex of WORKOUT) log.push({ ts, exerciseId: ex, displayName: ex, reps, goodReps: Math.round(reps * goodForm), pct: Math.round(goodForm * 100), formChecked: true });
      Date.now = () => ts;
      const info = sessionLog.computeMuscleTiers(log)[muscle];
      if (!info) continue;
      const abs = sessionLog.tierIndex(info.tier) * 100 + sessionLog.tierProgress(info) * 100;
      if (abs > prevAbs && prevAbs > 0) { const t = info.tier; (buckets[t] = buckets[t] || []).push(abs - prevAbs); }
      prevAbs = abs;
    }
  } finally { Date.now = realNow; }
  return Object.fromEntries(Object.entries(buckets).map(([t, g]) => [t, g.reduce((a, b) => a + b, 0) / g.length]));
}

const PERSONAS = [
  { name: 'Casual', desc: '2 workouts/week, 80% good form', opts: { workoutsPerWeek: 2, goodForm: 0.8 } },
  { name: 'Normal', desc: '3 workouts/week, 90% good form', opts: { workoutsPerWeek: 3, goodForm: 0.9 } },
  { name: 'Dedicated', desc: '4 workouts/week, 96% good form', opts: { workoutsPerWeek: 4, goodForm: 0.96 } },
];
module.exports.PERSONAS = PERSONAS;

if (require.main === module) {
  const results = {};
  for (const p of PERSONAS) { results[p.name] = simulate(p.opts); print(results[p.name], `${p.name} user: ${p.desc}, ${REPS_PER_EXERCISE} reps per exercise, 6 exercises per workout, ${WEEKS} weeks`); }
  // overall rank, all three users side by side, in weeks and in months
  console.log('\nOVERALL rank (the weakest muscle sets it): weeks (months) until reached');
  console.log(['user'.padEnd(10), ...TIERS.map(t => t.padStart(12))].join(' '));
  for (const p of PERSONAS) console.log([p.name.padEnd(10), ...TIERS.map(t => { const w = results[p.name].OVERALL && results[p.name].OVERALL[t]; return (w == null ? '-' : `${w} (${(w / 4.345).toFixed(1)}m)`).padStart(12); })].join(' '));
  const gains = gainsByTier(PERSONAS[1].opts);
  console.log("\nHow far a muscle's % bar moves in ONE workout while it is in each rank (Normal user, shoulders; this is the +x% on the after-workout rows)");
  console.log(['rank'.padEnd(10), ...TIERS.slice(0, 6).map(t => t.padStart(9))].join(' '));
  console.log(['gain/workout'.padEnd(10), ...TIERS.slice(0, 6).map(t => (gains[t] == null ? '-' : '+' + gains[t].toFixed(1) + '%').padStart(9))].join(' '));
  if (process.argv.includes('--check')) {
    let failed = 0;
    const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
    const o = results.Normal.OVERALL || {}, d = results.Dedicated.OVERALL || {}, c = results.Casual.OVERALL || {};
    check('everyone starts at Bronze (there is no Unranked): Bronze from the first workout', o.bronze === 1 && d.bronze === 1 && c.bronze === 1, `week ${o.bronze}`);
    check('first rank-up (Bronze -> Silver) for a normal user in about 1.5-2 weeks (week 2)', o.silver != null && o.silver >= 2 && o.silver <= 2, `week ${o.silver}`);
    check('first rank up (Bronze -> Silver) for a normal user within about 6 weeks (the weakest muscle sets the overall rank)', o.silver != null && o.silver <= 8, `week ${o.silver}`);
    const gaps = (r) => ['silver', 'gold', 'platinum', 'diamond', 'master', 'champion'].map((t, i, a) => (r[t] == null ? null : r[t] - (i ? r[a[i - 1]] : 0)));
    const gd = gaps(d).filter(g => g != null);
    check('every next rank takes longer than the one before (diminishing returns), dedicated user', gd.every((g, i) => i === 0 || g > gd[i - 1]), `weeks between ranks: ${gd.join(', ')}`);
    check('the top rank (Champion) is never quick: not reached in under 18 months by a dedicated user (the weakest muscle, Abs, sets the overall rank)', d.champion == null || d.champion / 4.345 >= 18, `week ${d.champion}`);
    check('a normal user does not reach Champion within 2 years (never too easy)', o.champion == null || o.champion / 4.345 > 24, `week ${o.champion}`);
    check('a casual user (2/week, 80% form) tops out well below Champion', c.champion == null && c.master == null, JSON.stringify(c));
    const gv = TIERS.slice(0, 6).map(t => gains[t]).filter(g => g != null);
    check('the bar moves less and less per workout as the rank goes up (diminishing returns)', gv.length >= 5 && gv.every((g, i) => i === 0 || g < gv[i - 1]), gv.map(g => g.toFixed(1)).join(' > '));
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
  }
}
