#!/usr/bin/env node
/**
 * scripts/test-rank-consistency.js
 *
 * End to end, with the REAL app code and an in-memory AsyncStorage:
 *   workout saved (appendSessions) -> stored log -> computeMuscleTiers -> the numbers each screen shows
 * and checks that every screen's number is the SAME number:
 *   - after-workout page   lib/muscleRanksData.buildMuscleRanksPayload (header rank + %, per-muscle gains, total)
 *   - Progress tab         lib/progressData.buildProgressData (rank + %, every muscle row %)
 *   - Train / Home / Profile / rank hook   computeOverallStanding (tier)
 * plus: the log keeps years of history (it used to keep only 200 entries), ranks never drop after a workout, and the
 * "+x% today" total is the sum of the rows.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module');
// in-memory AsyncStorage (installed AFTER the loader so it wins over the loader's catch-all stub)
const mem = new Map();
const fakeStorage = { getItem: async (k) => (mem.has(k) ? mem.get(k) : null), setItem: async (k, v) => { mem.set(k, v); }, removeItem: async (k) => { mem.delete(k); } };
const prevLoad = Module._load;
Module._load = function (req) { if (req === '@react-native-async-storage/async-storage') return { default: fakeStorage, __esModule: true }; return prevLoad.apply(this, arguments); };

const sessionLog = require('../lib/sessionLog.ts');
const MTM = require('../components/MuscleTierMap.tsx');
const data = require('../lib/muscleRanksData.ts');
const progress = require('../lib/progressData.ts');
const tuning = require('../lib/rankTuning.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const DAY = 86400000, START = Date.UTC(2026, 0, 5);
const WORKOUT = ['squat', 'pushup', 'bentOverRow', 'shoulderPress', 'hammerCurl', 'romanianDeadlift'];

(async () => {
  const realNow = Date.now;
  let prevOverall = -1, prevTier = -1, workouts = 0, allSame = true, details = [];
  const failsOf = { tier: [], pct: [], rows: [], total: [], drop: [] };
  for (let w = 0; w < 60; w++) {
    const ts = START + w * 2.3 * DAY;
    Date.now = () => ts;
    const entries = WORKOUT.map(ex => ({ ts, exerciseId: ex, displayName: ex, reps: 30, goodReps: 27, pct: 90, formChecked: true }));
    const before = await sessionLog.getAllSessions();
    await sessionLog.appendSessions(entries);
    const after = await sessionLog.getAllSessions();
    workouts++;
    const tiersBefore = sessionLog.computeMuscleTiers(before), tiersAfter = sessionLog.computeMuscleTiers(after);
    const stB = MTM.computeOverallStanding(tiersBefore), stA = MTM.computeOverallStanding(tiersAfter);
    const payload = data.buildMuscleRanksPayload({ entries, tiersBefore, tiersAfter, standingBefore: stB, standingAfter: stA, labels: MTM.MUSCLE_LABELS, iconFor: () => null, emblem: null });
    const prog = progress.buildProgressData(after, tiersAfter, [], ts);
    const trainTier = stA && stA.tier; // train.tsx / home / profile / rank hook all read computeOverallStanding(...).tier
    // same tier everywhere
    if (!(stA && payload.rank.label.toLowerCase() === stA.tier && prog.rank.label.toLowerCase() === stA.tier && trainTier === stA.tier)) failsOf.tier.push(w);
    // same overall %
    const pPage = parseFloat(payload.rank.pctLabel), pProg = prog.rank.pct;
    if (stA && !stA.atTop && !(Math.abs(pPage - stA.progress * 100) <= 0.06 && Math.abs(pProg - Math.round(stA.progress * 100)) < 1e-9)) failsOf.pct.push(`${w}: page ${pPage} progress ${pProg} standing ${(stA.progress * 100).toFixed(2)}`);
    // every Progress muscle row == the shared per-muscle progress
    for (const row of prog.muscles) if (tiersAfter[row.key] && row.pct !== Math.round(data.muscleProgressPct(tiersAfter[row.key]))) failsOf.rows.push(`${w}: ${row.key} progress-tab ${row.pct} vs shared ${Math.round(data.muscleProgressPct(tiersAfter[row.key]))}`);
    // header = how far the OVERALL rank % moved (one number), never a sum; rows keep their own % and stay under +100
    const absOf = (st) => (st ? sessionLog.tierIndex(st.tier) * 100 + st.progress * 100 : 0);
    const wantGain = Math.round(Math.max(0, absOf(stA) - absOf(stB)) * 10) / 10;
    if (Math.abs(parseFloat(payload.rank.gained) - wantGain) > 0.11 || parseFloat(payload.rank.gained) >= 100) failsOf.total.push(`${w}: header ${payload.rank.gained} vs overall move ${wantGain}`);
    if (payload.hits.some(h => parseFloat(h.gain.replace(/[+%]/g, '')) > 99.9)) failsOf.total.push(`${w}: a row is over +99.9%`);
    // below Bronze: the Progress tab and the shared helper agree (all the training, capped at 99%)
    const creditAll = sessionLog.muscleCreditTotals(after);
    for (const row of prog.muscles) if (!tiersAfter[row.key] && row.pct !== Math.round(100 * sessionLog.belowBronzeProgress(creditAll.get(row.key) || 0))) failsOf.rows.push(`${w}: ${row.key} below-bronze progress-tab ${row.pct} vs shared ${Math.round(100 * sessionLog.belowBronzeProgress(creditAll.get(row.key) || 0))}`);
    // never goes backwards (tier, or the overall % inside a tier) because of a workout
    const ti = sessionLog.tierIndex(stA.tier), ov = ti * 100 + stA.progress * 100;
    if (ov + 1e-9 < prevOverall) failsOf.drop.push(`${w}: ${prevOverall.toFixed(2)} -> ${ov.toFixed(2)}`);
    prevOverall = ov; prevTier = ti;
    if (w === 0 || w === 3 || w === 12 || w === 59) details.push(`workout ${w + 1}: ${stA.tier} ${(stA.progress * 100).toFixed(1)}%  page "${payload.rank.label} ${payload.rank.pctLabel}", progress tab ${prog.rank.label} ${prog.rank.pct}%, rows ${payload.hits.length}, +${payload.rank.gained}% to ${payload.rank.next}`);
  }
  Date.now = realNow;
  console.log('  ' + details.join('\n  '));
  check(`after ${workouts} saved workouts the tier is identical on the after-workout page, Progress and Train/Home/Profile`, failsOf.tier.length === 0, failsOf.tier.join());
  check('the overall % is identical on the after-workout page (1 decimal) and the Progress tab (whole number)', failsOf.pct.length === 0, failsOf.pct.slice(0, 3).join(' | '));
  check('every muscle row on the Progress tab equals the shared per-muscle progress', failsOf.rows.length === 0, failsOf.rows.slice(0, 3).join(' | '));
  check('header gain = the move of the OVERALL rank % (one small number, never a sum), rows never over +99.9%, every workout', failsOf.total.length === 0, failsOf.total.slice(0, 3).join(' | '));
  check('a workout never lowers the overall rank or % (a rank-up resets the bar but raises the tier)', failsOf.drop.length === 0, failsOf.drop.slice(0, 3).join(' | '));
  const stored = JSON.parse(mem.get(sessionLog.SESSION_LOG_KEY)).length;
  check(`the log keeps all history: ${stored} entries kept (it used to cut at 200, i.e. only the last ~11 weeks)`, stored === 60 * WORKOUT.length && tuning.MAX_LOG_ENTRIES >= 5000, `${stored} of ${60 * WORKOUT.length}`);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
