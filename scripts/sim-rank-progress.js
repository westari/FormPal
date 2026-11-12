#!/usr/bin/env node
/**
 * scripts/sim-rank-progress.js
 *
 * The rank system goes by GOOD REPS per muscle, not weeks (lib/rankTuning.ts, all numbers PLACEHOLDERS). This prints the reps
 * table with the REAL shipped maths (lib/sessionLog.ts computeMuscleTiers / tierProgress), not a copy:
 *   1. rank step table: good reps needed, percent per rep
 *   2. what 30 good reps are worth at each rank (the +x% on the after-workout rows)
 *   3. a worked example: one muscle trained 30 good reps at a time, workout by workout (cumulative reps -> rank and %)
 *   4. the overall rank is built from the muscles (weakest established muscle sets the rank)
 *   --check  runs the rules and exits non-zero on a failure
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const sessionLog = require('../lib/sessionLog.ts');
const tuning = require('../lib/rankTuning.ts');
const MTM = require('../components/MuscleTierMap.tsx');
const TIERS = sessionLog.TIER_ORDER;
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const NOW = Date.UTC(2026, 10, 12);
const DAY = 864e5;

const entry = (id, reps, good, daysAgo = 0) => ({ ts: NOW - daysAgo * DAY, exerciseId: id, displayName: id, reps, goodReps: good, pct: Math.round((100 * good) / Math.max(1, reps)), formChecked: true });
const curl = (n, daysAgo) => entry('curl', n, n, daysAgo);
const tierOf = (entries, muscle = 'biceps') => sessionLog.computeMuscleTiers(entries)[muscle];
const pct = (info) => (info ? 100 * sessionLog.tierProgress(info) : 0);

/** the % a muscle gains for `n` good reps when it already has `have` good reps (the real maths) */
function gainFor(have, n) {
  const before = have > 0 ? [curl(have, 400)] : [];
  const a = tierOf(before), b = tierOf([...before, curl(n, 0)]);
  const abs = (i) => (i ? sessionLog.tierIndex(i.tier) * 100 + pct(i) : 0);
  return abs(b) - abs(a);
}

function main() {
  console.log('RANKS GO BY GOOD REPS (placeholders, lib/rankTuning.ts). No fading: a rep counts the same today and in a year.\n');
  console.log('1. Rank steps (per muscle; main muscle credit 1.0 per good rep, helpers less)');
  console.log('   step                    good reps   % per rep   total good reps at the start of the next rank');
  let total = 0;
  for (const r of tuning.REPS_TO_NEXT_RANK) {
    total += r.reps;
    console.log(`   ${(cap(r.from) + ' -> ' + cap(r.to)).padEnd(22)} ${String(r.reps).padStart(9)}   +${(100 / r.reps).toFixed(3).padStart(6)}%   ${String(total).padStart(8)}`);
  }
  console.log('\n2. What 30 good reps are worth at each rank (the +x% on the after-workout rows)');
  const starts = Object.fromEntries(tuning.VOLUME_THRESHOLDS.map(([t, v]) => [t, v]));
  const rows = [];
  for (const t of TIERS.slice(0, 6)) {
    const g = gainFor(starts[t], 30);
    rows.push([t, g]);
    console.log(`   at ${cap(t).padEnd(9)} 30 good reps = +${g.toFixed(2)}%`);
  }
  console.log('\n3. One muscle, 30 good reps per workout: workouts needed to reach each rank');
  let have = 0, w = 0; const reached = {};
  while (w < 2000 && !reached.champion) {
    w++; have += 30;
    const t = sessionLog.computeMuscleTiers([curl(have, 0)]).biceps.tier;
    for (let i = 0; i <= sessionLog.tierIndex(t); i++) if (reached[TIERS[i]] == null) reached[TIERS[i]] = w;
  }
  console.log('   rank       workouts   good reps   at 3 workouts/week');
  for (const t of TIERS) console.log(`   ${cap(t).padEnd(10)} ${String(reached[t] == null ? '-' : reached[t]).padStart(8)}   ${String(reached[t] == null ? '-' : (reached[t] - 0) * 30 - (t === 'bronze' ? 30 : 0)).padStart(9)}   ${reached[t] == null ? '-' : (reached[t] / 3 <= 1 ? '<1 week' : (reached[t] / 3 / 4.345 < 3 ? (reached[t] / 3).toFixed(1) + ' weeks' : (reached[t] / 3 / 4.345).toFixed(1) + ' months'))}`);
  console.log('\n4. Overall rank: the AVERAGE of every muscle rank (an untrained muscle is Bronze 0%), read the same way a muscle is');
  const ov = (entries) => MTM.computeOverallStanding(sessionLog.computeMuscleTiers(entries));
  const o1 = ov([curl(30, 0)]), o2 = ov([curl(150, 0), entry('pushup', 30, 30, 0)]);
  console.log(`   30 curls only:                 ${cap(o1.tier)} ${(o1.progress * 100).toFixed(1)}%`);
  console.log(`   150 curls + 30 push-ups:       ${cap(o2.tier)} ${(o2.progress * 100).toFixed(1)}%  (biceps is Silver but ten other muscles are Bronze, so the average is still Bronze)`);

  if (!process.argv.includes('--check')) return;
  let failed = 0;
  const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
  console.log('');
  const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;
  check('30 curls at Bronze is about +20% biceps', near(gainFor(0, 30), 20, 0.1), gainFor(0, 30).toFixed(2));
  check('30 reps at Silver is about +6%', near(gainFor(starts.silver, 30), 6, 0.1), gainFor(starts.silver, 30).toFixed(2));
  check('30 reps at Gold is about +2.5%; Platinum +1.2%; Diamond +0.6%; Master +0.3%', near(gainFor(starts.gold, 30), 2.5, 0.05) && near(gainFor(starts.platinum, 30), 1.2, 0.05) && near(gainFor(starts.diamond, 30), 0.6, 0.05) && near(gainFor(starts.master, 30), 0.3, 0.05));
  check('the rank steps are exactly 150 / 500 / 1,200 / 2,500 / 5,000 / 10,000 good reps', tuning.REPS_TO_NEXT_RANK.map((r) => r.reps).join() === '150,500,1200,2500,5000,10000');
  check('every rep is worth less at a higher rank (diminishing returns)', rows.every((r, i) => i === 0 || r[1] < rows[i - 1][1]));
  check('everyone starts at Bronze 0%', sessionLog.tierIndex(tierOf([curl(0, 0)]).tier) === 0 && pct(tierOf([curl(0, 0)])) === 0);
  // NO FADING: the same reps a year ago give the same rank and percent as today
  const fresh = tierOf([curl(300, 0)]), old = tierOf([curl(300, 700)]);
  check('NO FADING: 300 good reps 700 days ago rank exactly like 300 good reps today', fresh.tier === old.tier && near(pct(fresh), pct(old), 1e-9), `${fresh.tier} ${pct(fresh).toFixed(2)}% vs ${old.tier} ${pct(old).toFixed(2)}%`);
  check('NO FADING: resting never lowers a rank (peak is always the current rank)', old.peakTier === old.tier);
  // only good reps count
  const half = tierOf([entry('curl', 30, 15, 0)]);
  check('ONLY GOOD REPS COUNT: 30 reps with 15 good = +10%, not +20%', near(pct(half), 10, 0.05), pct(half).toFixed(2));
  check('reps whose form cannot be checked (Log a session, rep counter only) count at HALF credit: 30 reps = +10%', near(pct(tierOf([{ ts: NOW, exerciseId: 'curl', displayName: 'c', reps: 30, goodReps: 0, pct: 0, formChecked: false }])), 10, 0.05));
  // helpers get partial credit
  const pu = sessionLog.computeMuscleTiers([entry('pushup', 30, 30, 0)]);
  check('main muscles get full credit, helpers partial (push-up: chest +20%, triceps less, biceps none)', near(pct(pu.chest), 20, 0.05) && pct(pu.triceps) < pct(pu.chest) && pct(pu.triceps) > 0 && !pu.biceps, `chest ${pct(pu.chest).toFixed(1)} triceps ${pct(pu.triceps).toFixed(1)}`);
  check('a rank-up carries the extra reps over (160 good reps = Silver + 10 reps toward Gold)', tierOf([curl(160, 0)]).tier === 'silver' && near(pct(tierOf([curl(160, 0)])), (10 / 500) * 100, 0.05));
  check('Champion is 19,350 good reps in total and never quick', starts.champion === 19350 && reached.champion > 600, String(reached.champion));
  check('the overall rank is the AVERAGE of every muscle: mostly Bronze plus one Silver is still Bronze overall', o2.tier === 'bronze' && o2.progress > 0);
  {
    // the overall rank = the AVERAGE of all 11 muscles on the rank map (tier * 100 + progress), tier = whole hundreds, % = the rest
    const tierOfV = (v) => tuning.VOLUME_THRESHOLDS.filter(([, t]) => v >= t).pop()[0];
    const info = (v) => ({ tier: tierOfV(v), peakTier: tierOfV(v), volume: v, goodRatio: 1, qualityJudged: true });
    const order = MTM.MUSCLE_DISPLAY_ORDER, N = order.length;
    const tiers = (vols) => Object.fromEntries(order.map((m, i) => [m, info(vols[i] || 0)]));
    const silver = starts.silver;
    const twoSilver = MTM.computeOverallStanding(tiers([silver, silver]));
    check('mostly Bronze plus a couple of Silver = Bronze overall (' + N + ' muscles, 2 at Silver: ' + (twoSilver.progress * 100).toFixed(1) + '%)', twoSilver.tier === 'bronze' && near(twoSilver.progress * 100, 200 / N, 0.05));
    const allSilver = MTM.computeOverallStanding(tiers(Array(N).fill(silver)));
    check('every muscle at Silver = Silver overall, 0%', allSilver.tier === 'silver' && near(allSilver.progress * 100, 0, 0.05));
    const onlyTwo = MTM.computeOverallStanding({ [order[0]]: info(silver), [order[1]]: info(silver) });
    check('muscles with NO training count too (Bronze 0%): two Silver muscles and nine untrained are not "Silver" overall', onlyTwo.tier === 'bronze');
    const fresh = MTM.computeOverallStanding(tiers([30 * 0]));
    const one = MTM.computeOverallStanding(tiers([30]));
    check('one muscle at +20% (30 good reps at Bronze) moves the overall by 20 / ' + N + ' = ' + (20 / N).toFixed(1) + '% (small)', near((one.progress - fresh.progress) * 100, 20 / N, 0.05), ((one.progress - fresh.progress) * 100).toFixed(2));
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
if (require.main === module) main();
