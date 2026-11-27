#!/usr/bin/env node
/**
 * scripts/test-one-result.js  (Ari 2026-11-27)
 * Replays the REAL camera session of 2026-11-27 (scripts/fixtures/shoulder-press-2026-11-27.log.txt, the new native build: its own [ATTEMPT-MISSED] events are used,
 * not a mirror) through the screen's verdict pipeline (scripts/lib/pipeline.js = app/formcheck.tsx), BEFORE (round 11) and AFTER this round's fixes:
 *   a) one half rep got TWO "Go lower"          -> every result needs its own stroke out of the start position
 *   b) a half rep got nothing                    -> every real half rep the engine reported gets exactly one cross (also after a rest)
 *   c) barely moving after a check / cross fired a result -> a stroke that never left the start zone gets nothing
 *   d) walking to the phone at the end kept firing results -> once he is out of position nothing is judged
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'); const path = require('path');
const P = require('./lib/pipeline.js');
const VT = require('../lib/verdictTiming.ts');
const NS = require('../lib/noSilentReps.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');

const raw = read('scripts/fixtures/shoulder-press-2026-11-27.log.txt').split('\n');
const ev = []; let goAt = null, stopAt = null;
for (const l of raw) {
  const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (?:\[DEBUG\] )?(.*)$/.exec(l); if (!m) continue;
  const t = ((+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])) * 1000;
  if (!goAt && /READY-GATE\] Ready/.test(m[4])) goAt = t;
  if (goAt && !stopAt && /Stop pressed/.test(m[4])) stopAt = t;
  ev.push({ t, line: m[4] });
}
const sess = ev.filter((e) => e.t >= goAt && e.t <= stopAt);
const clock = (t) => { const s = t / 1000; return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
const press = { topAngle: 84, repExitThreshold: 58 };
const startZone = VT.startLevel(press);
check('the log: a real camera session from the NEW native build (engine half-rep events), Ready to Stop found', sess.length > 500 && sess.some((e) => /^\[ATTEMPT-MISSED\] shoulderPress/.test(e.line)) && goAt && stopAt, `${sess.length} lines`);

// the metric as the log has it ([METRIC] ~2.5/s, [REP-TRACE] 10/s during reps)
const samples = sess.map((e) => { const m = /^\[METRIC\][^\n]*? value=([-\d.]+)/.exec(e.line) || /^\[REP-TRACE\][^\n]*?angle=([-\d.]+)/.exec(e.line); return m ? { t: e.t, v: +m[1] } : null; }).filter(Boolean);
// (the engine sees every frame: its own half-rep event that reached below the start zone is also proof the arms left it)
const leftZoneBetween = (a, b) => samples.some((s) => s.t > a && s.t <= b && s.v < startZone) || engineReal().some((e) => e.t > a && e.t <= b);
let engineReal = () => [];
// the engine's own half-rep events
const engine = sess.map((e) => { const m = /^\[ATTEMPT-MISSED\] (?!from )\S+ (short_\w+) reached=([-\d.]+)/.exec(e.line); return m ? { t: e.t, reason: m[1], reached: +m[2] } : null; }).filter(Boolean);
const real = engine.filter((x) => x.reached < startZone), tiny = engine.filter((x) => x.reached >= startZone);
engineReal = () => real;
console.log(`engine half-rep events: ${engine.length} (real half reps that left the start zone: ${real.length}, reached ${real.map((x) => x.reached).join(', ')}; barely moving: ${tiny.length}, reached ${tiny.map((x) => x.reached).join(', ')}; the start zone begins at ${startZone.toFixed(1)})`);
check('the log has both kinds: real half reps (reached 52-69) and barely-moving strokes right after a result (reached 74.6-77.7)', real.length >= 8 && tiny.length >= 6 && Math.max(...real.map((x) => x.reached)) < startZone && Math.min(...tiny.map((x) => x.reached)) >= startZone);

// where he walks to the phone: the camera's own visibility falls (pose lost again and again) a few seconds before Stop
const walkAt = (() => { const l = sess.find((e) => /^\[TRACK\] person lost/.test(e.line)); return l ? l.t : stopAt; })();

const runs = { BEFORE: P.run(sess, { exerciseId: 'shoulderPress', engineFromLog: true, round11: true }), AFTER: P.run(sess, { exerciseId: 'shoulderPress', engineFromLog: true }) };
const out = {};
for (const [k, r] of Object.entries(runs)) {
  const t0 = sess[0].t;
  const shown = r.verdicts.filter((v) => v.show).map((v) => ({ ...v, at: v.t + 0 }));
  console.log(`\n--- ${k} ---`);
  for (const v of r.verdicts) console.log(`  ${clock(v.t)}  ${v.src.padEnd(6)} ${v.show ? (v.show === 'x' ? 'X "' + v.reason + '"' : 'CHECK') : '(nothing: ' + (v.why || 'withheld') + ')'}`);
  // a) two results for one stroke: between two shown results the arms never left the start position
  const doubles = []; for (let i = 1; i < shown.length; i++) if (!leftZoneBetween(shown[i - 1].at, shown[i].at)) doubles.push(clock(shown[i].at));
  // b) a real half rep with no cross: no shown X within 1.6 s after the engine event
  const missed = real.filter((e) => !shown.some((v) => v.show === 'x' && v.at >= e.t - 50 && v.at <= e.t + 1600)).map((e) => clock(e.t) + ' reached ' + e.reached);
  // c) a barely-moving stroke that got a result: a shown X within 1.2 s after a tiny event, with no real dip in between
  // (only the engine's own crosses: a screen fallback cross belongs to a stroke the detector saw, and the detector's barely-moving strokes are checked on their own below)
  const tinyFired = tiny.filter((e) => shown.some((v) => v.show === 'x' && v.src === 'missed' && v.at >= e.t - 50 && v.at <= e.t + 1200 && !real.some((rr) => rr.t > e.t - 1300 && rr.t <= v.at))).map((e) => clock(e.t) + ' reached ' + e.reached);
  // d) results while walking to the phone: from the moment he is not clearly seen any more until Stop
  const outAt = r.positionLog.find((p) => p.out);
  // he starts walking where the camera first sees him badly (the first [CONFIDENCE] line under 85: 19:10:06.1, right after the first pose gap)
  const firstBad = (sess.find((e) => /\[CONFIDENCE\] .*camera sees (\d+)/.test(e.line) && +/camera sees (\d+)/.exec(e.line)[1] < 85) || { t: walkAt }).t;
  const lateFrom = Math.min(firstBad, outAt ? outAt.t : Infinity);
  const late = shown.filter((v) => v.at >= lateFrom).map((v) => clock(v.at) + ' ' + (v.show === 'x' ? 'X ' + v.reason : 'CHECK'));
  console.log(`  results shown: ${shown.length}; two results for one stroke: ${doubles.length} ${JSON.stringify(doubles)}; real half reps with no cross: ${missed.length} ${JSON.stringify(missed)}; barely-moving strokes that fired: ${tinyFired.length} ${JSON.stringify(tinyFired)}; results while walking to the phone (from ${clock(lateFrom)}): ${late.length} ${JSON.stringify(late)}`);
  out[k] = { shown, doubles, missed, tinyFired, late, r, lateFrom, outAt };
}
const B = out.BEFORE, A = out.AFTER;
console.log('');
check('BEFORE reproduces Ari\'s report: a) a stroke with two results, b) a real half rep with no cross, c) barely moving fired a result, d) results while walking to the phone', B.doubles.length > 0 && B.missed.length > 0 && B.tinyFired.length > 0 && B.late.length > 0, JSON.stringify({ d: B.doubles.length, m: B.missed.length, t: B.tinyFired.length, l: B.late.length }));
check('a) AFTER: ONE stroke = ONE result: between any two results the arms left the start position', A.doubles.length === 0, JSON.stringify(A.doubles));
check('b) AFTER: every real half rep the engine reported got exactly one cross (including the one after a 5 s rest, which Movement Match called "not trying")', A.missed.length === 0, JSON.stringify(A.missed));
const afterRest = real.find((e) => Math.abs(e.t - (sess.find((x) => /reached=55\.7/.test(x.line)) || { t: -1 }).t) < 5);
check('b) the half rep after the rest (reached 55.7): BEFORE withheld ("Movement Match is LOW"), AFTER a cross ("Go higher": a press, see test-cue-direction.js)', !!afterRest && !B.shown.some((v) => v.at >= afterRest.t && v.at <= afterRest.t + 1600) && A.shown.some((v) => v.show === 'x' && v.reason === 'Go higher' && v.at >= afterRest.t && v.at <= afterRest.t + 1600));
check('c) AFTER: a stroke that never left the start position (the arms settling right after a result) gets nothing, and every one of them was recognised as that', A.tinyFired.length === 0 && tiny.every((e) => A.r.ignored.some((x) => x.src === 'engine' && Math.abs(x.t + 0 - e.t) < 5)), JSON.stringify(A.tinyFired));
check('c) the screen own detector strokes that never left the start position are ignored too (no fallback cross for them)', A.r.ignored.filter((x) => x.src === 'detector').length >= 4 && A.r.ignored.filter((x) => x.src === 'detector').every((x) => x.low >= startZone));
check('c) ...it does not change tracking: the next real half rep after each of them is still judged', tiny.every((e) => { const nx = real.find((rr) => rr.t > e.t); return !nx || A.shown.some((v) => v.show === 'x' && v.at >= nx.t - 50 && v.at <= nx.t + 1600); }));
check('d) AFTER: from the moment he walks to the phone (not clearly seen) nothing is judged until Stop', !!A.outAt && A.late.length === 0, JSON.stringify(A.late));
check('d) ...and it stopped judging only THEN (the pose lost again and again): never during the set', !!A.outAt && A.outAt.t > (real[real.length - 1].t) && A.r.positionLog.filter((p) => p.out).length === 1, JSON.stringify(A.r.positionLog.map((p) => [clock(p.t), p.out, p.why])));
check('the counted reps of the set (7 before he walked) all still get their check', A.shown.filter((v) => v.src === 'native' && v.show === 'check').length === 7, A.shown.filter((v) => v.src === 'native').length);
check('never two results closer than 0.3 s (the screen can show them)', A.shown.every((v, i) => i === 0 || v.at - A.shown[i - 1].at >= 300));

console.log('\n--- the pieces ---');
check('start zone: shoulder press 73.6; 75.4 never left it, 68.9 did', VT.leftStartZone(68.9, press) && !VT.leftStartZone(75.4, press) && VT.leftStartZone(null, press));
const w = NS.createSilentWatch();
w.noteAnswered(5000); w.noteAttempt({ n: 1, outcome: 'missed', blocker: 'bottom-short', lowAt: 4800 }, 7500);
check('silent watch: a stroke reported LATE (2.5 s after its low) whose cross was already shown gets no second cross', w.tick(9000, { notTrying: false, engineRejectedUnreliable: false }) === null);
w.noteAttempt({ n: 2, outcome: 'missed', blocker: 'bottom-short', lowAt: 9500 }, 10000);
check('silent watch: a stroke with NO result at all still gets its cross (never silence)', (() => { const r = w.tick(11400, { notTrying: false, engineRejectedUnreliable: false }); return r && r.kind === 'cross'; })());
const pw = NS.createPositionWatch();
const a0 = pw.update(0, { visibility: 45, personMissing: false, recentGaps: 1 }), a1 = pw.update(100, { visibility: 100, personMissing: false, recentGaps: 0 }), a2 = pw.update(200, { visibility: 40, personMissing: false, recentGaps: 2 }), a3 = pw.update(400, { visibility: 80, personMissing: false, recentGaps: 1 }), a35 = pw.update(600, { visibility: 95, personMissing: false, recentGaps: 0 }), a4 = pw.update(1700, { visibility: 95, personMissing: false, recentGaps: 0 });
check('position watch: ONE pose gap never stops judging (it happens mid-set); the pose lost twice within 3 s does; back only after 1 s clearly seen (no repeated gaps, camera 85+)', !a0.out && !a1.out && a2.out && a2.changed && a3.out && a35.out && !a4.out && a4.changed);
check('silent watch: a stroke whose pose was lost after its low gets no guessed cross (the camera cannot judge it)', (() => { const w2 = NS.createSilentWatch(); w2.noteAttempt({ n: 1, outcome: 'missed', blocker: 'bottom-short', lowAt: 1000 }, 2000); const r = w2.tick(3400, { notTrying: false, engineRejectedUnreliable: false, lastPoseGapAt: 1900 }); return r && r.kind === 'camera'; })());
const fc = read('app/formcheck.tsx');
check('app/formcheck.tsx is wired the same way (start-zone filter on engine events and detector strokes, stroke low time, out of position for checks and crosses, strokeOnPath)', fc.includes("if (ev.reason === 'short_bottom' && sl && !leftStartZone(ev.reached, sl))") && fc.includes('!leftStartZone(ev.low, startLinesRef.current)') && fc.includes('lowAt: ev.lowAt') && fc.includes('if (outOfPositionRef.current) {') && fc.includes('&& !outOfPositionRef.current;') && fc.includes("source: 'missed', missedReason: reason, strokeOnPath, exerciseId: exerciseType }") && fc.includes('positionWatch.update(now, { visibility: vis'));
check('every decision is in the log: [ONE-RESULT] lines', (fc.match(/\[ONE-RESULT\]/g) || []).length >= 5);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
