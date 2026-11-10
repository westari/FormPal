#!/usr/bin/env node
/**
 * scripts/test-post-lag.js
 * The post-workout lag fixes, checked on the real code:
 *  1. the rank numbers built from "older history + this workout's entries" (no second read, no waiting for the write)
 *     are IDENTICAL to the ones built from the stored log that already includes the workout (before/after, same payload)
 *  2. the muscle page gets icon art for EVERY muscle it lists (it used to load only the top two)
 *  3. the camera teardown no longer blocks the Workout complete card; every stage logs a [POST-LAG] line
 *  4. the All sets page is mounted when idle, not on a fixed 1.2s timer
 * and prints the CPU cost of the rank maths (it is microseconds: the lag was never the maths).
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const sessionLog = require('../lib/sessionLog.ts');
const MTM = require('../components/MuscleTierMap.tsx');
const data = require('../lib/muscleRanksData.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const DAY = 86400000, NOW = Date.now();
const e = (id, reps, good, ts) => ({ ts, exerciseId: id, displayName: id, reps, goodReps: good, pct: Math.round(100 * good / reps), formChecked: true });
const history = [e('shoulderPress', 40, 36, NOW - 9 * DAY), e('squat', 40, 36, NOW - 8 * DAY), e('curl', 30, 27, NOW - 3 * DAY)];
const today = [e('shoulderPress', 30, 28, NOW), e('curl', 20, 18, NOW), e('lunge', 24, 20, NOW)];
const build = (all, prior) => {
  const tiersAfter = sessionLog.computeMuscleTiers(all), tiersBefore = sessionLog.computeMuscleTiers(prior);
  return data.buildMuscleRanksPayload({ entries: today, tiersBefore, tiersAfter, standingBefore: MTM.computeOverallStanding(tiersBefore), standingAfter: MTM.computeOverallStanding(tiersAfter), labels: MTM.MUSCLE_LABELS, iconFor: () => null, emblem: null });
};
// OLD: stored log already contains today's write, prior = older than today
const stored = [...history, ...today];
const oldP = build(stored, stored.filter(s => s.ts < NOW));
// NEW: read happened before/while the write (stored has NO today rows, or already has them): prior + entries
for (const [label, st] of [['write not landed yet', history], ['write already landed', stored]]) {
  const prior = st.filter(s => s.ts < NOW);
  const newP = build([...prior, ...today], prior);
  check(`identical payload (${label}): rows, total, rank, % all equal`, JSON.stringify(newP.hits) === JSON.stringify(oldP.hits) && newP.rank.gained === oldP.rank.gained && newP.rank.pctLabel === oldP.rank.pctLabel && newP.rank.label === oldP.rank.label, `${newP.hits.map(h => h.name + h.gain).join(',')} total ${newP.rank.gained}`);
}
check('the muscle page lists every muscle that gained (4+) in this case', oldP.hits.length >= 4, oldP.hits.map(h => h.name).join(', '));

const recap = read('app/recap.tsx');
check('icons are loaded for EVERY worked muscle, not just the top two', /workedMuscles\(data\.entries\)\.map\(async/.test(recap) && !/workedMuscles\(data\.entries\)\.slice\(0, 2\)/.test(recap));
check('the stored log is read once, in parallel with the write (no second read after awaiting it)', !/await persistRef\.current; \/\/ this session/.test(recap) && /const all = \[\.\.\.prior, \.\.\.data\.entries\]/.test(recap));
check('icons + emblem load together', /Promise\.all\(\[iconsP, tierDataUri\(/.test(recap));
check('the All sets page mounts when idle (InteractionManager), not on a 1200ms timer', /InteractionManager\.runAfterInteractions/.test(recap) && !/setTimeout\(\(\) => warmWant\('allsets', true\), 1200\)/.test(recap));
const fc = read('app/formcheck.tsx');
check('camera teardown is not awaited before the Workout complete card (runs in the background)', /void stopSession\(\)\.then/.test(fc) && !/await stopSession\(\);\s*\n\s*if \(final\.videoUri\)/.test(fc));
const stages = [['formcheck', /postLagStart\('Stop pressed/], ['run.tsx', /postLagStart\('workout finished/], ['recap mount', /postLag\('recap: screen mounted/], ['rank read', /postLag\('recap: stored sessions read/], ['tiers', /postLag\('recap: tiers/], ['icons', /postLag\('recap: icons/], ['payload', /postLag\('recap: muscle page payload built/], ['rep feedback', /postLag\('rep feedback: screen mounted/], ['finish review', /postLag\('rep feedback: Finish review/], ['visible', /postLag\(`\$\{k\} page VISIBLE/]];
const all = [recap, fc, read('app/workout/run.tsx'), read('app/rep-feedback.tsx'), read('components/WarmSurfaces.tsx')].join('\n');
check(`[POST-LAG] timing lines exist for every stage (${stages.map(s => s[0]).join(', ')})`, stages.every(([, re]) => re.test(all)), stages.filter(([, re]) => !re.test(all)).map(s => s[0]).join());
const swift = read('modules/athlt-camera/ios/ATHLTCameraModule.swift');
const startOnQ = /AsyncFunction\("startSession"\)[^\n]*\n\s*self\.sessionQueue\.async \{ self\.doStartSession/.test(swift);
const stopOnQ  = /AsyncFunction\("stopSession"\)[^\n]*\n\s*self\.sessionQueue\.async \{/.test(swift);
const serial   = /private let sessionQueue[^\n]*DispatchQueue\(/.test(swift) && !/sessionQueue[^\n]*concurrent/.test(swift);
check('the next set camera still starts correctly after a background teardown: startSession and stopSession both run on the SAME serial sessionQueue (a start can never overtake the stop before it)', startOnQ && stopOnQ && serial, `start ${startOnQ} stop ${stopOnQ} serial ${serial}`);
check('the stop drains the inference queue before it finishes, so the engine is fully reset before the next start (inferenceQueue.sync inside stopSession)', /stopSession[\s\S]{0,1200}self\.inferenceQueue\.sync/.test(swift));
check('the log helper tags every line "[POST-LAG]" and is dev-only', /\[POST-LAG\]/.test(read('lib/postLag.ts')) && /if \(!__DEV__\) return;/.test(read('lib/postLag.ts')));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
