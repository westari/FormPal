#!/usr/bin/env node
/**
 * scripts/test-done-flow.js
 *
 * Ari 2026-11-15:
 *   4. a form check is PRACTICE: "Form check complete", keeps the rep feedback, skips Today's progress, saved with kind: 'practice',
 *      and never changes ranks, the muscle map or streaks
 *   5. one shared DoneScreen (white, green circle draws itself, check draws, title fades up in SF Pro semibold, haptic when the check ends, ~1.5 s, tap skips)
 *   6. the new order: Finish -> DoneScreen "workout" -> Workout complete / rep feedback -> Today's progress -> Done -> DoneScreen "streak" -> Home
 *   7. the white wash is gone
 *   8. Today's progress back button = the normal Liquid Glass back button
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

// ── 5. the timeline ──
const TL = require('../lib/doneTimeline.ts');
const T = TL.DONE_TIMES;
console.log('--- 5. DoneScreen ---');
check('about 1.5 seconds (animation 1.5 s, then a 0.2 s hold)', T.total === 1500 && T.hold <= 300);
check('the circle draws first (starts at 0, slow: at least 600 ms), THEN the check draws inside it, THEN the title fades up', T.circleStart === 0 && T.circleEnd - T.circleStart >= 600 && T.checkStart >= T.circleStart + 500 && T.checkEnd > T.circleEnd && T.titleStart >= T.checkStart && T.titleEnd > T.checkEnd - 200);
check('the success haptic is due exactly when the check finishes', T.hapticAt === T.checkEnd && TL.doneFrame(T.hapticAt - 1).hapticDue === false && TL.doneFrame(T.hapticAt).hapticDue === true);
const f0 = TL.doneFrame(0), fMid = TL.doneFrame(400), fEnd = TL.doneFrame(T.total);
check('at 0 nothing is drawn; the circle is half drawn along the way; at the end everything is drawn and the title is solid', f0.circle === 0 && f0.check === 0 && f0.titleOpacity === 0 && fMid.circle > 0.2 && fMid.circle < 0.9 && fMid.check === 0 && fEnd.circle === 1 && fEnd.check === 1 && fEnd.titleOpacity === 1 && fEnd.titleRise === 0 && fEnd.subOpacity === 1);
check('the circle never goes backwards (smooth: it only grows)', (() => { let last = -1; for (let t = 0; t <= T.total; t += 16) { const c = TL.doneFrame(t).circle; if (c < last) return false; last = c; } return true; })());
check('the title fades UP: it starts 10 points low and ends at 0', TL.doneFrame(T.titleStart).titleRise === 10 && TL.doneFrame(T.titleEnd).titleRise === 0);
check('workout variant: the reps count up live from 0 to the real total (27)', TL.doneFrame(0, { reps: 27 }).count === 0 && TL.doneFrame(1100, { reps: 27 }).count > 0 && TL.doneFrame(1100, { reps: 27 }).count < 27 && TL.doneFrame(T.total, { reps: 27 }).count === 27);
check('streak variant: the flame grows from nothing to full size', TL.doneFrame(T.flameStart).flame < 0.05 && Math.abs(TL.doneFrame(T.total).flame - 1) < 0.001 && TL.doneFrame(800).flame > 0.3);
const W = TL.doneWords;
check('words: small = the title given; workout = "Workout complete" / "Form check complete"; streak = "3-day streak" + "Come back tomorrow to keep it going."', W('small', { title: 'Workout saved' }).title === 'Workout saved' && W('workout', {}).title === 'Workout complete' && W('workout', { title: 'Form check complete' }).title === 'Form check complete' && W('streak', { streak: 3 }).title === '3-day streak' && W('streak', { streak: 3 }).subtitle === 'Come back tomorrow to keep it going.' && W('small', { title: 'x', subtitle: 'a grey line' }).subtitle === 'a grey line');
const ds = read('components/DoneScreen.tsx');
check('DoneScreen: white background, green circle + check DRAWN (stroke dash), system font (SF Pro) semibold title, grey line, streak flame, tap to skip, success haptic, finishes once', /backgroundColor: '#ffffff'/.test(ds) && /strokeDashoffset=\{CIRC \* \(1 - f\.circle\)\}/.test(ds) && /strokeDashoffset=\{CHECK_LEN \* \(1 - f\.check\)\}/.test(ds) && /fontWeight: '600'/.test(ds.split('title:')[1].split('\n')[0]) && !/fontFamily/.test(ds.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')) && /color: '#8a8a93'/.test(ds) && /flame\.fill/.test(ds) && /onPress=\{\(\) =>/.test(ds) && /hapticSuccess\(\)/.test(ds) && /if \(finished\.current\) return/.test(ds));
check('DoneScreen has the three variants (small, workout, streak) and takes onFinish', /variant: DoneVariant/.test(ds) && /'small' \| 'workout' \| 'streak'/.test(read('lib/doneTimeline.ts')) && /onFinish: \(\) => void/.test(ds));

// ── 6, 7, 8. the flow ──
console.log('\n--- 6, 7, 8. the flow ---');
const rc = read('app/recap.tsx');
const w = read('components/WarmSurfaces.tsx');
check('FLOW #1: the workout ends -> DoneScreen "workout" (reps counting up) first, and the Workout complete page only shows after it (the warm pages wait: mayShow needs !doneIntro)', /useState\(!isHistoryMode && !isLoggedMode\)/.test(rc) && /<DoneScreen variant="workout"/.test(rc) && /const mayShow = \(isFocused \|\| finishing\) && !doneIntro && !streakDone;/.test(rc) && /reps=\{data\.totalReps\}/.test(rc));
check('FLOW #2: Today\'s progress > Done -> DoneScreen "streak" with the REAL streak, then (photo prompt if due) home', /setStreakDone\(\{ count: Math\.max\(1, streakCount\), dest \}\)/.test(rc) && /<DoneScreen\s+variant="streak" streak=\{streakDone\.count\}/.test(rc) && /decideProgressPhotoVariant\(\)/.test(rc) && !/pathname: '\/streak-screen'/.test(rc));
check('the old workout-complete haptic on the recap is gone (DoneScreen fires it when the check finishes: one haptic, not two)', !/celebrated\.current = true; hapticSuccess/.test(rc));
check('Today\'s progress still fills up after Finish (armed when ready, played 260 ms after it shows)', /__mrPlay/.test(rc) && /warmKind !== 'ranks' \|\| !mayShow/.test(rc));
check('WHITE WASH GONE: no wash view, no startWash, no WASH constants anywhere in the warm surfaces', !/wash/i.test(w.replace(/white wash[^\n]*/gi, '')) || !/washOn|startWash|WASH_/.test(w));
check('Today\'s progress back button is the normal Liquid Glass back button (LiquidGlassButton, chevron.left), and the design\'s white one is hidden', /\(pageBroken \|\| k === 'ranks'\) && k !== 'recap'/.test(w) && /<LiquidGlassButton/.test(w) && /a\[href=\\?"Workout Recap\.dc\.html\\?"\]\{visibility:hidden/.test(read('lib/muscleRanksInject.ts')));
console.log('\n--- 4. practice ---');
check('PRACTICE: a solo form check (mode formCheck, not a workout, not logged, not history) is practice', /const isPractice = mode === 'formCheck' && !isWorkoutMode && !isLoggedMode && !isHistoryMode;/.test(rc));
check('PRACTICE: its session entry is saved with kind: \'practice\'', /\.\.\.\(isPractice \? \{ kind: 'practice' as const \} : \{\}\)/.test(rc));
check('PRACTICE: the screen says "Form check complete" (DoneScreen AND the Workout complete page title)', /title=\{isPractice \? 'Form check complete' : 'Workout complete'\}/.test(rc) && rc.includes("title: (isPractice || (data.isHistory") && /practice: !repCounterOnly/.test(read('app/formcheck.tsx')) && /'Workout Complete': opts\.title/.test(read('lib/recapInject.ts')));
check('PRACTICE HISTORY: opening a past form check from Progress -> Form checks says "Form check complete" (every entry is kind practice); a real workout keeps "Workout complete"', rc.includes("data.isHistory && data.entries.length > 0 && data.entries.every(e => e.kind === 'practice'))) ? 'Form check complete' : undefined"));
{
  const rfb = read('app/rep-feedback.tsx');
  check("PRACTICE: Finish on the rep feedback shows the short DoneScreen (small variant, \"Nice work\") FIRST, then goes HOME once (dismissAll when it finishes), behind a leaving guard; not back to the recap (the 2026-11-15 loop), no Today's progress, no streak",
    rc.includes("practice: isPractice ? '1' : ''") && /if \(isPractice\) \{[\s\S]{0,400}setPracticeDone\(true\);\s*return;/.test(rfb) && rfb.includes('<DoneScreen variant="small" title="Nice work" onFinish={() => router.dismissAll()} />') && (rfb.match(/router\.dismissAll\(\)/g) || []).length === 1 && rfb.includes('if (leaving.current) return;') && !rc.includes('practice, straight home')
    && rc.includes("if (isPractice) { router.replace('/(tabs)/' as any); return; }") && rc.includes("if (!isHistoryMode && !isPractice) warmWant('ranks', true)"));
}

// the data rules, run for real with a fake storage
const store = {};
const orig = Module._load;
Module._load = function (req) {
  if (req === '@react-native-async-storage/async-storage') return { __esModule: true, default: { getItem: async (k) => store[k] ?? null, setItem: async (k, v) => { store[k] = v; } } };
  return orig.apply(this, arguments);
};
const SL = require('../lib/sessionLog.ts');
const SI = require('../lib/streakInfo.ts');
const MTM = require('../components/MuscleTierMap.tsx');
const DAY = 86400000; const now = Date.now();
const e = (id, reps, ts, extra = {}) => ({ ts, exerciseId: id, displayName: id, reps, goodReps: reps, pct: 100, formChecked: true, ...extra });
(async () => {
  await SL.appendSessions([e('shoulderPress', 30, now - 3 * DAY, { kind: 'practice' }), e('curl', 10, now - 2 * DAY)], 'test');
  const all = await SL.getAllSessions();
  check('the log keeps the kind field: getAllSessions returns kind "practice" on the practice entry (Window A lists them by it) and nothing on a real one', all.find((x) => x.exerciseId === 'shoulderPress').kind === 'practice' && all.find((x) => x.exerciseId === 'curl').kind === undefined);
  const real = [e('curl', 10, now - 2 * DAY)];
  const withPractice = [...real, e('shoulderPress', 150, now - 1 * DAY, { kind: 'practice' }), e('squat', 150, now, { kind: 'practice' })];
  check('RANKS: 300 practice reps change nothing (muscle tiers identical with and without them)', JSON.stringify(SL.computeMuscleTiers(withPractice)) === JSON.stringify(SL.computeMuscleTiers(real)));
  check('MUSCLE MAP / overall: the overall standing is identical with and without practice', JSON.stringify(MTM.computeOverallStanding(SL.computeMuscleTiers(withPractice))) === JSON.stringify(MTM.computeOverallStanding(SL.computeMuscleTiers(real))));
  check('STREAKS: practice on 2 extra days gives NO streak (calcStreak and the streak page both ignore it)', SL.calcStreak([e('shoulderPress', 10, now, { kind: 'practice' })]) === 0 && SL.calcStreak([e('curl', 10, now), e('shoulderPress', 10, now - DAY, { kind: 'practice' })]) === 1 && SI.streakInfo([e('shoulderPress', 10, now, { kind: 'practice' })], now, 0).count === 0);
  check('the real session on the same days still counts as before (streak 2 with real sessions today and yesterday)', SL.calcStreak([e('curl', 10, now), e('curl', 10, now - DAY)]) === 2);
  check('credit totals (what the rank bars read) skip practice too', SL.muscleCreditTotals(withPractice).size === SL.muscleCreditTotals(real).size && [...SL.muscleCreditTotals(withPractice)].every(([m, v]) => SL.muscleCreditTotals(real).get(m) === v));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
