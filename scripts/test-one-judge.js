#!/usr/bin/env node
/**
 * scripts/test-one-judge.js
 *
 * Ari 2026-11-15: there were TWO judges (the native engine and the JS attempt detector reading debug text 2.5 times a second) and they disagreed:
 * an X and a check 0.1 s apart for ONE rep, "Go lower" a second after he stopped. Now there is ONE: a check or X comes only from NATIVE events.
 *
 *   Part 1 (JS, works today): the JS attempt detector can judge nothing; replay Ari's newest log: one verdict per counted rep, never two, none at rest
 *   Part 2 (Swift, next build): the engine's new onAttemptMissed event, mirrored in JS (scripts/lib/missed-attempt-mirror.js) and replayed;
 *           the Swift is checked statically (constants equal the mirror's, event names and argument order, brackets)
 */
const fs = require('fs');
const path = require('path');
const P = require('./lib/pipeline.js');
const GC = require('../lib/guideCoach.ts');
const { createMissedAttemptMirror } = require('./lib/missed-attempt-mirror.js');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

// ── Part 1 ──
console.log('--- Part 1: one judge (JS) ---');
const fc = read('app/formcheck.tsx');
check('the attempt detector handler does nothing on screen: no X, no soft rep, no taking a rep back', fc.includes('onAttemptRef.current = (_evs: DetectorEvent[]) => { /* nothing on screen */ };') && !/source: 'soft'|source: 'attempt'|softRepsRef\.current [+-]= 1|took back a counted rep/.test(fc));
check('a check or X is shown from exactly two places: the native rep event and the native missed-attempt event', (fc.match(/coachRef\.verdict\(/g) || []).length === 2 && /addRepListener\(/.test(fc) && /addAttemptMissedListener\(/.test(fc));
{
  const c = GC.createCoach({});
  const m = { score: 80, trying: true, notTrying: false, haveData: true };
  const a = c.verdict({ now: 1000, match: m, source: 'native', good: true });
  const b = c.verdict({ now: 1100, match: m, source: 'missed', missedReason: 'short_bottom' });
  check('one verdict per event: a missed stroke 0.1 s after a rep\'s check is withheld (Ari got an X and a check 0.1 s apart)', a.show === 'check' && b.show === null);
  const d = c.verdict({ now: 5000, match: m, source: 'missed', missedReason: 'short_top' });
  const e = c.verdict({ now: 9000, match: m, source: 'missed', missedReason: 'short_bottom' });
  check('the words: short_top = "Go higher", short_bottom = "Go lower"', d.show === 'x' && d.reason === 'Go higher' && e.show === 'x' && e.reason === 'Go lower');
  const f = c.verdict({ now: 20000, match: { ...m, score: 5, trying: false, notTrying: true }, source: 'missed', missedReason: 'short_bottom' });
  check('no verdict when Movement Match says he is not trying', f.show === null);
}
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
for (const name of ['2026-11-15', '2026-11-13']) {
  const rows0 = fs.readFileSync(path.join(__dirname, 'fixtures', `shoulder-press-${name}.log.txt`), 'utf8').split(/\r?\n/).filter(Boolean).map(parse).filter(Boolean);
  const i0 = rows0.findIndex((r) => /^\[METRIC\].*phase=(?!setup)/.test(r.line));
  const rows1 = rows0.slice(Math.max(0, i0)); const t0 = rows1[0].t;
  const events = rows1.map((r) => ({ t: r.t - t0, line: r.line }));
  const res = P.run(events, { exerciseId: 'shoulderPress' });
  const reps = events.filter((e) => /^\[REP\] #\d+/.test(e.line));
  const shown = res.verdicts.filter((v) => v.show);
  console.log(`  ${name}: ${reps.length} engine reps, ${shown.length} verdicts shown (${shown.filter((v) => v.src === 'native').length} for reps, ${shown.filter((v) => v.src === 'missed').length} half-rep X)`);
  check(`${name}: every counted rep gets EXACTLY ONE verdict (a rep that fires twice in the log, like #6 "verdict overridden", is still one)`, [...new Set(reps.map((e) => Math.round(e.t / 50)))].every((k) => res.verdicts.filter((v) => v.src === 'native' && v.show && Math.abs(Math.round(v.t / 50) - k) <= 1).length >= 1) && reps.every((e) => res.verdicts.filter((v) => v.src === 'native' && v.show && Math.abs(v.t - e.t) < 100).length <= 2));
  const gaps = shown.slice(1).map((v, i) => v.t - shown[i].t);
  check(`${name}: NO double verdicts: no two verdicts closer than 0.3 s unless both are counted reps (round 11: a half rep is no longer dropped for coming within 1.2 s of the verdict before it) (the engine counted two reps that fast)`, shown.slice(1).every((v, i) => v.t - shown[i].t >= 300 || (v.src === 'native' && shown[i].src === 'native')), 'closest ' + (Math.min(...gaps) / 1000).toFixed(2) + 's');
  check(`${name}: NO verdict while he is not moving: every verdict is within 0.4 s of a moment Movement Match does not call "not trying"`, shown.every((v) => res.rows.some((r) => Math.abs(r.t - v.t) <= 400 && !r.match.notTrying)));
  check(`${name}: only native events judge (verdict sources are native reps, engine missed-attempts, and the screen's fallback cross for a stroke the engine gave no verdict at all, round 11)`, res.verdicts.every((v) => v.src === 'native' || v.src === 'missed' || v.src === 'silent' || v.src === 'camera'));
  const restX = shown.filter((v) => v.src === 'missed').filter((v) => { const row = res.rows.reduce((a, b) => (Math.abs(b.t - v.t) < Math.abs(a.t - v.t) ? b : a)); return !row.match.movingNow && v.t - (reps.filter((e) => e.t <= v.t).slice(-1)[0] || { t: -1e9 }).t > 6000 && false; });
  check(`${name}: no half-rep X while the arms rest flat`, restX.length === 0);
}

// ── Part 2 ──
console.log('\n--- Part 2: the engine missed-attempt event (Swift, mirrored) ---');
const sw = read('modules/athlt-camera/ios/ExerciseEngine.swift');
const mod = read('modules/athlt-camera/ios/ATHLTCameraModule.swift');
const num = (name) => parseFloat(new RegExp(`static let ${name}: (?:Double|Int) = ([0-9.]+)`).exec(sw)[1]);
const MM = require('./lib/missed-attempt-mirror.js');
check('the Swift constants equal the mirror constants (35% of the range is a real try, labelled placeholder)', num('ATTEMPT_MIN_FRACTION') === MM.ATTEMPT_MIN_FRACTION && num('ATTEMPT_TURN_FRACTION') === MM.ATTEMPT_TURN_FRACTION && num('ATTEMPT_MIN_FRAMES') === MM.ATTEMPT_MIN_FRAMES && num('ATTEMPT_MIN_SECONDS') === MM.ATTEMPT_MIN_SECONDS && num('ATTEMPT_TOP_FRACTION') === MM.ATTEMPT_TOP_FRACTION, [num('ATTEMPT_MIN_FRACTION'), num('ATTEMPT_TURN_FRACTION'), num('ATTEMPT_MIN_FRAMES'), num('ATTEMPT_MIN_SECONDS'), num('ATTEMPT_TOP_FRACTION')].join('/'));
check('the four numbers are labelled PLACEHOLDERS in the Swift', /ALL FOUR NUMBERS ARE PLACEHOLDERS/.test(sw));
check('argument order: the engine calls onAttemptMissed?(reason, reached, needed); the module closure takes { reason, reached, needed in } and sends the keys reason, reached, needed', /onAttemptMissed\?\(reason, reached, needed\)/.test(sw) && /var onAttemptMissed:\s+\(\(_ reason: String, _ reached: Double, _ needed: Double\) -> Void\)\?/.test(sw) && /engine\.onAttemptMissed = \{ \[weak self\] reason, reached, needed in/.test(mod) && /"reason":\s+reason,\s+"reached":\s+reached,\s+"needed":\s+needed,/.test(mod));
check('the event name is the same in the Swift Events list, sendEvent and the JS listener: onAttemptMissed', /Events\("onRepDetected", "onAttemptMissed"/.test(mod) && /sendEvent\("onAttemptMissed"/.test(mod) && /safeListen\('onAttemptMissed'/.test(read('modules/athlt-camera/src/index.ts')));
check('the reasons are exactly "short_top" and "short_bottom" in Swift, the mirror and the JS Coach', /reason = "short_top"/.test(sw) && /reason = "short_bottom"/.test(sw) && GC.missedWord('short_top') === 'Go higher' && GC.missedWord('short_bottom') === 'Go lower');
{
  // brackets of the NEW Swift block (from the attempt tracker through finishAttempt), strings and comments removed
  const a = sw.indexOf('// ── Missed-attempt tracker'), b = sw.indexOf('// ── Callbacks', a);
  let blk = sw.slice(a, b).replace(/\/\/.*$/gm, '').replace(/"(?:\\\(([^()]|\([^()]*\))*\)|[^"\\])*"/g, '""');
  const cnt = (c) => blk.split(c).length - 1;
  check('Swift brackets balance in the new tracker block: { } ( ) [ ]', cnt('{') === cnt('}') && cnt('(') === cnt(')') && cnt('[') === cnt(']'), `{${cnt('{')}/${cnt('}')} (${cnt('(')}/${cnt(')')} [${cnt('[')}/${cnt(']')}`);
  const blk2 = mod.slice(mod.indexOf('engine.onAttemptMissed'), mod.indexOf('engine.onDebugStats'));
  const c2 = (c) => blk2.split(c).length - 1;
  check('Swift brackets balance in the module wiring', c2('{') === c2('}') && c2('(') === c2(')') && c2('[') === c2(']'));
  check('the tracker is called only on trusted frames at the top (after the suppressed guard and the pose-gap check) and reset when a rep starts and while one is in progress', /guard activityState != \.suppressed else \{ return \}[\s\S]{0,2200}trackAttempt\(angle: angle, timestamp: timestamp\)/.test(sw) && /resetAttemptTracker\(\)\s+\/\/ a real rep starts/.test(sw) && /case \.inRep:\s+resetAttemptTracker\(\)/.test(sw));
  check('both reset functions clear the tracker', (sw.match(/resetTrackingHealth\(\)\n        resetAttemptTracker\(\)/g) || []).length === 2);
}
// the mirror on synthetic strokes (same numbers as press: enter 50, exit 58, rom 55, top 84; a frame every 33 ms like the phone)
function run(values, dtMs = 33) {
  const evs = []; const m = createMissedAttemptMirror({ onMissed: (e) => evs.push(e) });
  m.setLines({ enter: 50, exit: 58, rom: 55, top: 84 });
  const fed = [];
  let t = 0; for (const v of values) { m.frame(v, t); fed.push({ t, v, nEv: evs.length }); t += dtMs; }
  return { evs, fed };
}
const ramp = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 1) / n);
const rest = (v, n) => Array(n).fill(v);
{
  const half = [...rest(86, 20), ...ramp(86, 62, 14), ...ramp(62, 86, 14), ...rest(86, 20)];
  const r = run(half);
  check('MIRROR: a half rep (86 down to 62, back to 86) fires ONE short_bottom, reached 62 needed 50', r.evs.length === 1 && r.evs[0].reason === 'short_bottom' && Math.abs(r.evs[0].reached - 62) < 1 && r.evs[0].needed === 50, JSON.stringify(r.evs));
  const tEnd = r.evs[0] && r.evs[0].t;
  check('MIRROR: it fires when the stroke ENDS (on the way back up), not while he is still going down', tEnd > 20 * 33 + 14 * 33 - 1, `fired at ${tEnd}ms, bottom at ${20 * 33 + 14 * 33}ms`);
  const lowTop = [...rest(68, 20), ...ramp(68, 52, 14), ...ramp(52, 68, 14), ...rest(68, 20)];
  const r2 = run(lowTop);
  check('MIRROR: a stroke that never started from a high top (68 down to 52) says short_top: "Go higher"', r2.evs.length === 1 && r2.evs[0].reason === 'short_top', JSON.stringify(r2.evs.map((e) => e.reason + ' reached ' + e.reached.toFixed(0) + ' needed ' + e.needed.toFixed(1))));
  const full = [...rest(86, 20), ...ramp(86, 40, 14), ...ramp(40, 90, 20), ...rest(88, 20)];
  check('MIRROR: a full rep (down to 40) fires NOTHING: it is a rep, and the rep event judges it', run(full).evs.length === 0);
  check('MIRROR: a small wiggle (86 to 80, 20% of the range) fires nothing (below the 35% line)', run([...rest(86, 20), ...ramp(86, 80, 10), ...ramp(80, 86, 10), ...rest(86, 20)]).evs.length === 0);
  check('MIRROR: one garbled frame (a single 55 in a row of 86) fires nothing (needs 3 frames)', run([...rest(86, 20), 55, ...rest(86, 20)]).evs.length === 0);
  check('MIRROR: standing still fires nothing (no stroke, no event)', run(rest(86, 300)).evs.length === 0 && run(rest(73, 300)).evs.length === 0);
  const two = [...half, ...half];
  check('MIRROR: two half reps give two events, one each (never two for one stroke)', run(two).evs.length === 2);
  const afterRep = [...full, ...rest(88, 10), ...ramp(88, 64, 14), ...ramp(64, 88, 14), ...rest(88, 20)];
  const r3 = run(afterRep);
  check('MIRROR: a half rep right after a full rep still fires (the rep did not "cover" it)', r3.evs.length === 1 && r3.evs[0].reason === 'short_bottom');
}
// replay Ari's log through the mirror: what the engine would say
{
  const rows0 = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-15.log.txt'), 'utf8').split(/\r?\n/).filter(Boolean).map(parse).filter(Boolean);
  const i0 = rows0.findIndex((r) => /^\[METRIC\].*phase=(?!setup)/.test(r.line));
  const rows1 = rows0.slice(Math.max(0, i0)); const t0 = rows1[0].t;
  const events = rows1.map((r) => ({ t: r.t - t0, line: r.line }));
  const res = P.run(events, { exerciseId: 'shoulderPress' });
  const miss = res.verdicts.filter((v) => v.src === 'missed');
  console.log('  2026-11-15 through the mirror: ' + miss.map((v) => (v.t / 1000).toFixed(1) + 's ' + (v.show ? v.reason : 'withheld')).join(', '));
  // (2026-11-27 audit) the bottom of the shoulder press NUMBER was short = the press never reached the top: "Go higher" (test-cue-direction.js)
  check('REPLAY 2026-11-15: the half reps get an X (at least 5), every one "Go higher" (the press never reached the top in this log), none right after a check', miss.filter((v) => v.show).length >= 5 && miss.filter((v) => v.show).every((v) => v.reason === 'Go higher'));
  const old = P.run(events, { exerciseId: 'shoulderPress', nativeMissed: false });
  check('on an OLD build (no onAttemptMissed event) nothing shows for half reps, and every rep still gets its check', old.verdicts.filter((v) => v.src === 'missed').length === 0 && old.verdicts.filter((v) => v.show === 'check').length >= 8);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
