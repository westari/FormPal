#!/usr/bin/env node
/**
 * scripts/test-cue-direction.js  (Ari 2026-11-27: "on shoulder press, half reps say 'Go lower'. That's backwards.")
 *
 * FEEDBACK AUDIT. For EVERY exercise in constants/exerciseDefinitions.ts:
 *   - an INDEPENDENT list (below, written from how each exercise is done, not from the app's code) of which way the body moves to reach the WORK end of the rep
 *     (up / down / neither); the start position is the other way;
 *   - the X words for a half rep that fell short at the work end (engine short_bottom) must not point the opposite way, and the words for a half rep that did
 *     not get back to the start (engine short_top) must not point toward the work end;
 *   - every form-fault cue keeps its direction on the screen (a raw "... UP" never becomes a "... lower" word, and the reverse);
 *   - every exercise has its words (a new exercise without them fails here).
 * Then the REAL shoulder press log of 2026-11-27 (19:22-19:23, 11 half reps) is replayed: BEFORE every cross said "Go lower", AFTER "Go higher".
 * Prints the full table (it is in reports/window-b.md too).
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'); const path = require('path');
const D = require('../constants/exerciseDefinitions.ts'); const E = D.EXERCISE_DEFINITIONS;
const CD = require('../lib/cueDirection.ts');
const GC = require('../lib/guideCoach.ts');
const S = require('../lib/shortCue.ts');
const AD = require('../lib/attemptDetector.ts');
const RD = require('../lib/repDiagnostics.ts');
const P = require('./lib/pipeline.js');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };

// WHICH WAY THE BODY MOVES TO THE WORK END OF THE REP (independent of the code)
const WORK = {
  // squat down
  squat: 'down', gobletSquat: 'down', airSquat: 'down', frontSquat: 'down', backSquat: 'down', sumoSquat: 'down',
  lunge: 'down', splitSquat: 'down', reverseLunge: 'down', bulgarianSplitSquat: 'down',
  stepUp: 'down',                // the knee bends deepest with the foot on the step (the body at its lowest), then he drives up to stand tall
  // chest goes down
  pushup: 'down', kneePushup: 'down', inclinePushup: 'down', widePushup: 'down', diamondPushup: 'down', declinePushup: 'down', closegripPushup: 'down',
  barbellBenchPress: 'down',     // the bar comes down to the chest
  chestPress: 'neither',         // seated machine: the handles come back toward the chest, forward to press
  dips: 'down',
  // press up overhead
  shoulderPress: 'up', overheadPress: 'up', arnoldPress: 'up', dumbbellShoulderPress: 'up', machineShoulderPress: 'up',
  jumpingJack: 'up',             // the arms go up overhead
  // curl the weight up
  curl: 'up', hammerCurl: 'up', concentrationCurl: 'up', preacherCurl: 'up', reverseCurl: 'up', cableCurl: 'up',
  // triceps: pushdown = hands down; overhead extension / skullcrusher = hands up
  tricepPushdown: 'down', overheadTricepExtension: 'up', skullcrusher: 'up',
  // rows / pull-up: pull the weight (or the body) up
  bentOverRow: 'up', barbellRow: 'up', singleArmRow: 'up', invertedRow: 'up', tBarRow: 'up', pullup: 'up',
  seatedCableRow: 'neither', machineRow: 'neither', facePull: 'neither',   // pulled back toward the body
  latPulldown: 'down',           // the bar comes down
  legCurl: 'neither',            // the heel comes back (seated) or up (lying)
  // hinges: the torso goes down
  romanianDeadlift: 'down', deadlift: 'down', goodMorning: 'down', kettlebellSwing: 'down', singleLegRDL: 'down', cablePullThrough: 'down',
  // raises: the arms go up
  lateralRaise: 'up', frontRaise: 'up',
  crunch: 'up',                  // the shoulders come up off the floor
};
const UP = /\b(higher|up|raise|lift|tall|overhead)\b/i, DOWN = /\b(lower|deeper|down|deep|sink)\b/i;
const pointsUp = (w) => UP.test(w) && !DOWN.test(w), pointsDown = (w) => DOWN.test(w) && !UP.test(w);
const wrongFor = (dir, w) => (dir === 'up' ? pointsDown(w) : dir === 'down' ? pointsUp(w) : (pointsUp(w) || pointsDown(w)));

const ids = Object.keys(E);
check(`every exercise (${ids.length}) is in the independent direction list`, ids.every((id) => WORK[id]), ids.filter((id) => !WORK[id]).join(', '));
check('every exercise has its return words (lib/cueDirection.ts RETURN_CUE)', ids.every((id) => CD.RETURN_CUE[id]), ids.filter((id) => !CD.RETURN_CUE[id]).join(', '));

const rows = [], wrongNow = [], wrongBefore = [];
for (const id of ids) {
  const dir = WORK[id] || '?';
  const work = GC.missedWord('short_bottom', id), back = GC.missedWord('short_top', id);
  const oldWork = GC.missedWord('short_bottom'), oldBack = GC.missedWord('short_top');   // BEFORE: no exercise, the same words for every exercise
  const backDir = dir === 'up' ? 'down' : dir === 'down' ? 'up' : 'neither';
  if (wrongFor(dir, work)) wrongNow.push(`${id} short rep "${work}" (work end is ${dir})`);
  if (wrongFor(backDir, back)) wrongNow.push(`${id} not back to start "${back}" (start is ${backDir})`);
  if (wrongFor(dir, oldWork) || wrongFor(backDir, oldBack)) wrongBefore.push(id);
  const faults = (E[id].formChecks || []).filter((f) => f.enabled !== false).map((f) => f.cue).filter((c, i, a) => a.indexOf(c) === i);
  const faultWords = faults.map((c) => ({ raw: c, shown: GC.createCoach().verdict({ now: 0, match: { haveData: true, notTrying: false, score: 90 }, source: 'native', exerciseId: id, good: false, reason: c }).reason }));
  for (const f of faultWords) {
    if ((UP.test(f.raw) && pointsDown(f.shown)) || (DOWN.test(f.raw) && pointsUp(f.shown))) wrongNow.push(`${id} form cue "${f.raw}" shown as "${f.shown}"`);
  }
  const rom = GC.createCoach().verdict({ now: 0, match: { haveData: true, notTrying: false, score: 90 }, source: 'native', exerciseId: id, good: false, reason: E[id].insufficientROMCue }).reason;
  if (rom !== work) wrongNow.push(`${id}: a counted rep that is too short says "${rom}", a half rep "${work}" (must be the same)`);
  rows.push({ id, mode: E[id].mode === 'repCounter' ? 'reps only (no check / X shown)' : 'check / X', dir, work, back, faults: faultWords.map((f) => `${f.raw} -> "${f.shown}"`).join('; ') || '(none)', before: `${oldWork} / ${oldBack}` });
}
console.log('\n| Exercise | Full range (work end) | Half rep, short at the work end | Did not get back to the start | Other form faults (engine cue -> screen) | BEFORE (every exercise) |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.id}${r.mode.startsWith('reps') ? ' (reps only)' : ''} | ${r.dir} | ${r.work} | ${r.back} | ${r.faults} | ${r.before} |`);
console.log('');
check(`BEFORE: the same words for every exercise pointed the WRONG way for ${wrongBefore.length} exercises (presses, curls, rows, raises, pull-ups, crunch, extensions ...)`, wrongBefore.length >= 20 && wrongBefore.includes('shoulderPress'), wrongBefore.join(', '));
check('AFTER: no exercise\'s short-rep, back-to-start or form-fault words point the wrong way', wrongNow.length === 0, wrongNow.join(' | '));
check('every one of those words is 3 words or fewer', rows.every((r) => r.work.split(' ').length <= 3 && r.back.split(' ').length <= 3), rows.filter((r) => r.work.split(' ').length > 3 || r.back.split(' ').length > 3).map((r) => r.id).join(', '));
check('shoulder press: a half rep says "Go higher", not getting back down says "Lower to shoulders"; squat still "Go lower" / "Stand tall"', GC.missedWord('short_bottom', 'shoulderPress') === 'Go higher' && GC.missedWord('short_top', 'shoulderPress') === 'Lower to shoulders' && GC.missedWord('short_bottom', 'squat') === 'Go lower' && GC.missedWord('short_top', 'squat') === 'Stand tall');
check('the screen\'s own fallback cross (attempt detector) uses the same per-exercise words', AD.blockerCue('bottom-short', 'shoulderPress') === 'Go higher' && AD.blockerCue('top-short', 'shoulderPress') === 'Lower to shoulders' && AD.blockerCue('bottom-short', 'squat') === 'Go lower');
check('the "why not counting" words too (a bench press used to get "Go higher" from its name)', RD.shortMovementReason('barbellBenchPress') === 'Go lower' && RD.shortMovementReason('shoulderPress') === 'Go higher' && RD.shortMovementReason('tricepPushdown') === 'Straighten arms');
check('every word the Coach can show is in its word list (never mixed up with a Guide line)', rows.every((r) => S.COACH_WORDS.includes(r.work) && S.COACH_WORDS.includes(r.back)), rows.filter((r) => !S.COACH_WORDS.includes(r.work) || !S.COACH_WORDS.includes(r.back)).map((r) => r.id + ' ' + r.work + '/' + r.back).join(', '));
const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
check('the camera screen passes the exercise to the Coach for half reps AND counted reps', fc.includes("source: 'missed', missedReason: reason, strokeOnPath, exerciseId: exerciseType }") && fc.includes("source: 'native', exerciseId: exerciseType,"));

// the real log: Ari's half shoulder presses
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const all = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-27b.log.txt'), 'utf8').split(/\r?\n/).map(parse).filter(Boolean);
const goI = all.findIndex((r) => /READY-GATE\] Ready|\[REP\] #1 /.test(r.line)); const stopI = all.findIndex((r, i) => i > goI && /Stop pressed/.test(r.line));
const sess = all.slice(Math.max(0, goI - 40), stopI > 0 ? stopI : undefined); const t0 = sess[0].t;
const ev = sess.map((r) => ({ t: r.t - t0, line: r.line }));
const logX = all.filter((r) => /\[COACH\] X "/.test(r.line)).map((r) => /X "([^"]+)"/.exec(r.line)[1]);
const before = P.run(ev, { exerciseId: 'shoulderPress', engineFromLog: true, oldWords: true }).verdicts.filter((v) => v.show === 'x').map((v) => v.reason);
const after = P.run(ev, { exerciseId: 'shoulderPress', engineFromLog: true }).verdicts.filter((v) => v.show === 'x').map((v) => v.reason);
console.log(`  the phone said: ${logX.join(', ')}\n  replay BEFORE: ${before.join(', ')}\n  replay AFTER:  ${after.join(', ')}`);
check('the real log: the phone showed "Go lower" on his half shoulder presses (the bug)', logX.length >= 8 && logX.every((w) => w === 'Go lower'));
check('replay BEFORE says "Go lower" the same way; AFTER every half shoulder press says "Go higher"', before.length >= 8 && before.every((w) => w === 'Go lower') && after.length >= 8 && after.every((w) => w === 'Go higher'), JSON.stringify({ before, after }));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
