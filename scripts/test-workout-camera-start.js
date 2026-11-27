#!/usr/bin/env node
/**
 * scripts/test-workout-camera-start.js
 *
 * Ari 2026-11-22 (log scripts/fixtures/workout-goblet-2026-11-22.log.txt, the OLD Oct 8 native build): in a real My Workout (goblet squat) "Step into view"
 * showed, he stepped in, but the camera number never started and the Guide said nothing. The shoulder press solo form check the same day worked.
 *
 * FOUND: the workout and the solo form check start the camera through the SAME code (nothing in the start path reads the workout params). What differs is the
 * EXERCISE. Native sends a setup update only when the rep metric can be measured (ExerciseEngine.ingest: `guard let angle = measure(pose)`). A squat needs
 * both legs; with a person in the picture but the legs cut off, NOTHING is sent: no [METRIC], no [SETUP-TRACE] (the 40 s fixture has none), and the last
 * "Get in frame" hint stays on screen for ever, so the setup meter read 0 and the Guide stayed on "Step into view".
 * Fix (JS, works on the old build): read Vision's own personDetected during setup. Fix (Swift, new build): send a setup update with a hint in that case.
 *
 * Also (Ari 2026-11-22 #2): the camera number never goes under 25 while a person is seen.
 */
require('./lib/ts-node-loader.js')();
const fs = require('fs');
const path = require('path');
const LT = require('../lib/liveTracking.ts');
const SG = require('../lib/setupGuide.ts');
const GC = require('../lib/guideCoach.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8').split('\r\n').join('\n');
const swift = fs.readFileSync(path.join(__dirname, '..', 'modules', 'athlt-camera', 'ios', 'ExerciseEngine.swift'), 'utf8');
const log = fs.readFileSync(path.join(__dirname, 'fixtures', 'workout-goblet-2026-11-22.log.txt'), 'utf8');

console.log('--- the phone log (My Workout, goblet squat, old native build) ---');
check('the log: the camera opened, and for the whole session there is no [METRIC] and no [SETUP-TRACE] line (native never measured the squat metric)', /AWAKE\] camera screen open/.test(log) && !/\[METRIC\]|\[SETUP-TRACE\]|\[SETUP\] gobletSquat (rep metric trackable|PASSED)/.test(log));
check('the log: the last setup line is "Step into view", and nothing after it for the rest of the session (the stale hint)', /setup line now "Step into view"/.test(log) && log.trim().split('\n').filter((l) => /\[GUIDE\]|\[SETUP-GUIDE\]/.test(l)).length === 2);

// ── 1. workout and solo start the same way ──
const a = fc.indexOf('// ── Session lifecycle'), b = fc.indexOf('// ── Setup: is a person in the picture?');
const startPath = fc.slice(a, b);
check('1: the session start (startSession, setup listener, Ready gate) does not read the workout params at all: a workout and a solo form check start the same way', startPath.length > 3000 && !/workoutExerciseId|isWorkoutHud|targetSets|targetReps|hudActive/.test(startPath));
const readyStart = fc.indexOf('useEffect(() => {\n    if (!readyPending) return;'), readyEnd = fc.indexOf('}, [readyPending, steadyGate]);');
check('1: neither does the Ready gate', readyStart > 0 && readyEnd > readyStart && !/workoutExerciseId|isWorkoutHud|targetSets/.test(fc.slice(readyStart, readyEnd)));
const meterCall = fc.slice(fc.indexOf('const cameraLockTargetRaw = meterTarget({'), fc.indexOf('const cameraLockTarget = cameraLockTargetRaw;'));
check('1: nor the meter input', meterCall.length > 100 && !/workoutExerciseId|isWorkoutHud|targetSets/.test(meterCall));

// ── 2. the squat case: a person seen, native silent ──
const seenNoJoints = { phase: 'setup', isActive: false, setupAllVisible: false, setupHoldProgress: 0, setupHint: 'Get in frame', repDiag: null };
const before = LT.meterTarget(seenNoJoints);
const after = LT.meterTarget({ ...seenNoJoints, setupPersonSeen: true });
const clearedHint = LT.meterTarget({ ...seenNoJoints, setupHint: '', setupPersonSeen: true });
check('BEFORE: a person in the picture, native silent, the old "Get in frame" hint still up: the setup number is 0 (the bug)', before === 0, String(before));
check('AFTER: the same, but Vision says a person is in the picture: 25 (person in frame, joints not trackable yet)', after === 25 && clearedHint === 25, JSON.stringify({ after, clearedHint }));
check('AFTER: Vision says nobody is there: 0, whatever the hint', LT.meterTarget({ ...seenNoJoints, setupHint: '', setupPersonSeen: false }) === 0 && LT.meterTarget({ ...seenNoJoints, setupPersonSeen: false }) === 0);
check('no word from Vision yet (undefined): the old rule, so nothing else changes', LT.meterTarget({ ...seenNoJoints, setupHint: '' }) === 0 && LT.meterTarget({ ...seenNoJoints, setupHint: 'Back up a bit' }) === 25);

// the Guide: the same inputs the setup effect feeds, person seen, no metric samples at all
const guide = SG.createSetupGuide();
const sawNobody = guide.update({ now: 1000, seen: false, healthy: false, frameHint: true, hintLine: GC.guideLine('Get in frame', 'gobletSquat'), handsExercise: false, expectSamples: true });
const sawPerson = guide.update({ now: 1000, seen: false, healthy: false, frameHint: false, hintLine: null, handsExercise: false, expectSamples: true });
check('BEFORE (nobody found): since 2026-11-27 the setup says "Move back" there, never "Step into view" (he starts at the phone: too close)', sawNobody.text === 'Move back', sawNobody.text);
check('AFTER: Vision sees him, no metric samples: the Guide asks him to step back (the legs are cut off / too close), not "Step into view"', sawPerson.text === 'Step back further' && sawPerson.stage === 'fit', sawPerson.text);
check('the Guide evidence table says when "Step back further" may show in setup (Vision sees a person, no metric)', /Vision SEES a person/.test(GC.GUIDE_EVIDENCE['Step back further'].evidence));

// ── 3. wiring in the screen ──
check('the screen reads onDebugStats during setup (phase starting / setup), not only while tracking', /if \(phase !== 'starting' && phase !== 'setup'\) return;\n    const sub = addDebugStatsListener/.test(fc));
check('a person seen drops the stale "Get in frame" / "Get back in frame" hint', /SETUP_NO_PERSON_HINTS\.includes\(setupHintRef\.current\)/.test(fc) && /setSetupHint\(''\)/.test(fc));
check('the meter and the setup Guide both get the answer', /setupPersonSeen,\n    trackingCue/.test(fc) && /setupPersonRef\.current\.seen === false/.test(fc));
check('a log line says what Vision sees (so the next log tells the truth): [SETUP-SEEN]', /\[SETUP-SEEN\] Vision says a person is/.test(fc));
check('Swift (new build): a person seen but the metric not measurable during setup sends a setup update with a hint', /enginePhase == \.setup \{[\s\S]{0,900}onSetupUpdate\?\(SetupStatus\(allJointsVisible: false[\s\S]{0,200}positionGuidance\(pose: pose, missing: weakJoints\)/.test(swift));

// ── 4. the floor ──
console.log('--- the number never under 25 while a person is seen ---');
for (const cs of [0, 3, 10, 24]) {
  const t = LT.meterTarget({ phase: 'tracking', isActive: true, setupAllVisible: true, setupHoldProgress: 1, setupHint: '', personDetected: true, repDiag: null, counterScore: cs });
  check(`tracking, person seen, the counter sees ${cs}: the target is 25`, t === 25, String(t));
}
check('tracking, person seen, the counter sees 90: unchanged (90)', LT.meterTarget({ phase: 'tracking', isActive: true, setupAllVisible: true, setupHoldProgress: 1, setupHint: '', personDetected: true, repDiag: null, counterScore: 90 }) === 90);
check('tracking, nobody in the picture: 0', LT.meterTarget({ phase: 'tracking', isActive: true, setupAllVisible: true, setupHoldProgress: 1, setupHint: '', personDetected: false, repDiag: null, counterScore: 90 }) === 0);
check('the on-screen number applies the floor to whatever the confidence module says (the smoothed number never shows under 25 while the target is above 0)', /targetRef\.current > 0 && tgt < METER_PERSON_FLOOR\) tgt = METER_PERSON_FLOOR/.test(fc));
{
  const sm = LT.createMeterSmoother(); let v = 100, t = 0, min = 100;
  for (; t < 60000; t += 33) { let tgt = 100 - Math.min(100, t / 200); if (tgt < LT.METER_PERSON_FLOOR) tgt = LT.METER_PERSON_FLOOR; v = sm.tick(tgt, t, LT.METER_MAX_RATE); min = Math.min(min, v); }
  check('a long, steady fall of the camera confidence (person seen) stops at 25, not 0', min === 25, 'min ' + min);
  const sm2 = LT.createMeterSmoother(); let w = 100, m2 = 100;
  for (let t2 = 0; t2 < 20000; t2 += 33) { w = sm2.tick(0, t2, LT.METER_MAX_RATE); m2 = Math.min(m2, w); }
  check('nobody in the picture: it still goes to 0', m2 === 0, 'min ' + m2);
}
check('the confidence module\'s own floor is 25 too', require('../lib/coachTuning.ts').CONFIDENCE.stuckFloor === 25);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
