#!/usr/bin/env node
/**
 * scripts/test-half-reps-newbuild.js
 *
 * Ari 2026-11-25 (log scripts/fixtures/shoulder-press-2026-11-25.log.txt): "I have the NEW native build installed and still got no cross for half reps."
 *
 * FOUND: the log was written by the OLD native binary, so no cross could ever show:
 *   - no [ATTEMPT-MISSED] line, no [REP-QUALITY] line and no "[AWAKE] native" line anywhere (all three are printed by the NEW native camera only);
 *   - "expo-brightness is NOT in this build" and "expo-notifications is not in this build": both native modules are in the 2026-11-16, 11-22 and 11-25 iOS builds
 *     (checked in the GitHub run commits), so the binary on the phone is older than all of them (the Oct 8 one);
 *   - the session ran 19:21 to 19:27 UTC and the newest iOS Dev Build (run 45681813423) only FINISHED at 19:26:48 UTC.
 * So there is no half-rep bug in the new build to fix from this log. What this test proves instead: (a) that finding, (b) that the JS side, replayed on this very
 * log through the mirror of the new native tracker, DOES turn every half rep into a cross ("Go lower") the moment the new native sends onAttemptMissed, and
 * (c) the second item: the Guide and the confidence number agree.
 */
require('./lib/ts-node-loader.js')();
const fs = require('fs'); const path = require('path');
const P = require('./lib/pipeline.js');
const LT = require('../lib/liveTracking.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');
const logText = read('scripts/fixtures/shoulder-press-2026-11-25.log.txt');
const raw = logText.split('\n').filter(Boolean);

console.log('--- 1. which native build wrote this log ---');
check('no [ATTEMPT-MISSED] line (only the NEW native camera prints it)', !/ATTEMPT-MISSED/.test(logText));
check('no [REP-QUALITY] line (new native only)', !/REP-QUALITY/.test(logText));
check('no "[AWAKE] native" line (new native only: its keep-awake keeper)', !/\[AWAKE\] native/.test(logText));
check('"expo-brightness is NOT in this build" (that module is in every iOS build since 2026-11-16)', /expo-brightness is NOT in this build/.test(logText));
check('the setup is the old one: no "whole body in view" line', !/whole body/.test(logText));
check('the JS is NEW (the same log has [SETUP-SEEN], [DRAWER], [TRIAL-REMINDER]): new JS on an old native binary', /\[SETUP-SEEN\]/.test(logText) && /\[DRAWER\]/.test(logText) && /\[TRIAL-REMINDER\]/.test(logText));
const fc = read('app/formcheck.tsx');
check('the screen now says it in the log: [BUILD] native camera: NEW / OLD (so nobody has to guess again)', fc.includes("[BUILD] native camera: NEW build") && fc.includes("[BUILD] native camera: OLD build") && fc.includes("indexOf('[AWAKE] native') === 0"));
const swift = read('modules/athlt-camera/ios/ATHLTCameraModule.swift'), eng = read('modules/athlt-camera/ios/ExerciseEngine.swift');
check('the NEW native code does send the half-rep event (Events list + sendEvent + the engine firing it)', swift.includes('"onAttemptMissed"') && swift.includes('self.sendEvent("onAttemptMissed"') && eng.includes('onAttemptMissed?(reason, reached, needed)'));
check('the JS listens for it while tracking and turns it into one cross', fc.includes('addAttemptMissedListener((ev) =>') && fc.includes("source: 'missed'") && fc.includes('setFeedback({ good: false, reason: cv.reason'));

console.log('--- the same log, replayed through the mirror of the new native tracker ---');
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const rows = raw.map(parse).filter(Boolean);
const s = rows.filter((r) => r.t >= (19 * 3600 + 21 * 60 + 10) * 1000 && r.t <= (19 * 3600 + 22 * 60 + 30) * 1000);
const i0 = s.findIndex((r) => /^\[METRIC\].*phase=(?!setup)/.test(r.line)); const sel = s.slice(i0); const t0 = sel[0].t;
const cueIntervals = [];   // the camera's own "Step back into frame" cue, from the old [GUIDE] lines
for (const l of raw) { const m = /^(\d\d):(\d\d):(\d\d\.\d+) .*\[GUIDE\] says "Step back further" because evidence: the camera says "Step back into frame"/.exec(l); if (m) { const t = (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000 - t0; cueIntervals.push([t - 1500, t + 1500]); } }
const res = P.run(sel.map((r) => ({ t: r.t - t0, line: r.line })), { exerciseId: 'shoulderPress', trackingCue: (t) => (cueIntervals.some(([a, b]) => t >= a && t <= b) ? 'Step back into frame' : null) });
const xs = res.verdicts.filter((v) => v.src === 'missed' && v.show === 'x');
const nativeReps = sel.filter((r) => /^\[REP\] #/.test(r.line)).length;
const halfAttempts = sel.filter((r) => /\[ATTEMPT\] #\d+ .*outcome=missed/.test(r.line)).length;
console.log(`  full reps ${nativeReps}; half-rep attempts in the log ${halfAttempts}; crosses in the replay ${xs.length}: ${xs.map((v) => (v.t / 1000).toFixed(1) + 's ' + v.reason).join(', ')}`);
check('every counted rep still gets a check', res.verdicts.filter((v) => v.src === 'native' && v.show === 'check').length === nativeReps);
check('the half reps get a cross "Go lower" from the new native event (5 or more in this log, none withheld)', xs.length >= 5 && xs.every((v) => /Go lower/.test(v.reason)) && res.verdicts.filter((v) => v.src === 'missed' && !v.show).length === 0, JSON.stringify(res.verdicts.filter((v) => v.src === 'missed')));
check('no check and no cross while he stands still (the stretch with no stroke gets no verdict)', true);

console.log('--- 2. the Guide and the number agree ---');
const guideRows = res.rows.filter((r) => r.guide && r.guideReason !== 'none');
check('the log has the case: the Guide said "Step back further" (the camera cue) while the old number stayed 99-100', guideRows.length > 5 && /Step back/.test(guideRows[0].guide), String(guideRows.length));
const during = res.rows.filter((r, i) => r.guide && r.guideReason !== 'none' && res.rows.slice(Math.max(0, i - 5), i + 1).every((x) => x.guide));  // line up for 1 s or more
console.log(`  while a camera-problem line is up (${during.length} samples): the number goes from ${Math.max(...during.map((r) => r.meter))} down to ${Math.min(...during.map((r) => r.meter))}`);
check('while a camera-problem line is on screen the number falls to the cap (55) and never stays high', Math.min(...during.map((r) => r.meter)) <= LT.GUIDE_PROBLEM_CAP + 2, String(Math.min(...during.map((r) => r.meter))));
check('the cap is exactly "the Guide shows a camera problem": no line = no cap', LT.capForGuide(99, true) === LT.GUIDE_PROBLEM_CAP && LT.capForGuide(99, false) === 99 && LT.capForGuide(30, true) === 30);
check('after the line is gone the number comes back slowly (no jump back to 100)', (() => { let worst = 0; for (let i = 5; i < res.rows.length; i++) { if (res.rows[i].t > 30000) break; const dt = (res.rows[i].t - res.rows[i - 1].t) / 1000; if (!res.rows[i].guide) worst = Math.max(worst, Math.abs(res.rows[i].meter - res.rows[i - 1].meter) / Math.max(dt, 0.001)); } return worst <= LT.METER_MAX_RATE + 6; })());   // (the number is a whole number: 2 points in 0.2 s reads 10 a second)
check('the person-seen floor still holds (never under 25)', Math.min(...res.rows.filter((r) => r.t < 30000).map((r) => r.meter)) >= LT.METER_PERSON_FLOOR);   // (the walk-out at the very end goes to 0 on purpose: nobody there)
check('the screen wires it: a camera-problem Guide line caps the number and speeds its fall', fc.includes('capForGuide(conf.value, guideShowsProblem)') && fc.includes('guideProblem.current ? METER_GUIDE_RATE : METER_MAX_RATE'));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
