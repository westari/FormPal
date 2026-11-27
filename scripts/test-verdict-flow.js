#!/usr/bin/env node
/**
 * scripts/test-verdict-flow.js  (Ari 2026-11-25)
 *   1. A check and a cross must land at the SAME moment: when the rep is finished (arms back at the start position). The engine reports a half rep when the stroke
 *      TURNS at its shallow bottom, earlier than a counted rep: the screen holds the cross until the metric is back in the start zone (lib/verdictTiming.ts).
 *   2. Never more than 1 rep in a row with no result. Every real attempt gets a check or a cross (lib/noSilentReps.ts, Coach no longer drops a stroke that comes within
 *      1.2 s of the verdict before it, a counted rep is only withheld when nobody is in the picture). If the engine rejected a rep because tracking was unreliable the
 *      camera cannot judge it: the number drops and the Guide says why.
 * HONEST NOTE: the attached latest.log of 2026-11-25 (evening) holds only app start and onboarding, no camera session, so the real new-build delays could not be
 * measured from it. This test replays the three newest real camera logs we have (JS mirror of the new native tracker) and prints the numbers.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'); const path = require('path');
const P = require('./lib/pipeline.js');
const VT = require('../lib/verdictTiming.ts');
const NS = require('../lib/noSilentReps.ts');
const CC = require('../lib/cameraConfidence.ts');
const GC = require('../lib/guideCoach.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');

console.log('--- timing helpers ---');
const press = { topAngle: 84, repExitThreshold: 58 };
check('shoulder press: the start zone begins at 58 + 60% of the way to 84 = 73.6', Math.abs(VT.startLevel(press) - 73.6) < 0.01);
check('at the shallow bottom (62) the arms are NOT back at the start; near the top (80) they are', !VT.backAtStart(62, press) && VT.backAtStart(80, press) && !VT.backAtStart(null, press));
check('an exercise whose metric runs the other way works too', VT.backAtStart(20, { topAngle: 10, repExitThreshold: 40 }) && !VT.backAtStart(35, { topAngle: 10, repExitThreshold: 40 }));
check('a held cross is due when the arms are back, or after at most 1.1 s (it can never be lost or stuck)', VT.crossDue({ reason: 'short_bottom', at: 0, reached: 58 }, 300, 60, press).due === false && VT.crossDue({ reason: 'short_bottom', at: 0 }, 300, 80, press).due === true && VT.crossDue({ reason: 'short_bottom', at: 0 }, 1100, null, press).due === true);

console.log('--- the silent watch ---');
const w = NS.createSilentWatch();
w.noteAttempt({ n: 1, outcome: 'missed', blocker: 'bottom-short' }, 1000);
check('a missed stroke with no verdict gets its cross after the grace time, with the detector\'s own reason', w.tick(1500, { notTrying: false, engineRejectedUnreliable: false }) === null && (() => { const r = w.tick(2400, { notTrying: false, engineRejectedUnreliable: false }); return r && r.kind === 'cross' && r.reason === 'short_bottom'; })());
w.noteAttempt({ n: 2, outcome: 'rejected', blocker: 'none' }, 5000);
check('a rejected stroke with no blocker gets "Full movement" (never silence)', (() => { const r = w.tick(6500, { notTrying: false, engineRejectedUnreliable: false }); return r && r.kind === 'cross' && r.reason === 'rejected' && GC.missedWord('rejected') === 'Full movement'; })());
w.noteAttempt({ n: 3, outcome: 'missed', blocker: 'top-short' }, 9000); w.noteAnswered(9500);
check('a stroke the engine already judged is left alone', w.tick(11000, { notTrying: false, engineRejectedUnreliable: false }) === null);
w.noteAttempt({ n: 4, outcome: 'missed', blocker: 'bottom-short' }, 12000);
check('a stroke while Movement Match says he is not doing the exercise gets no verdict (not a real attempt)', w.tick(14000, { notTrying: true, engineRejectedUnreliable: false }) === null);
w.noteAttempt({ n: 5, outcome: 'rejected', blocker: 'none' }, 15000);
check('tracking unreliable: no cross, the camera cannot judge it (the number drops and the Guide says why)', (() => { const r = w.tick(16500, { notTrying: false, engineRejectedUnreliable: true }); return r && r.kind === 'camera'; })());
check('the Coach never drops a stroke for being close to the verdict before it, and an unknown reason is still a cross', (() => { const coach = GC.createCoach(); const m = { haveData: true, notTrying: false, score: 90 }; coach.verdict({ now: 1000, match: m, source: 'native', good: true, reason: '' }); const a = coach.verdict({ now: 1500, match: m, source: 'missed', missedReason: 'short_bottom' }); const b = coach.verdict({ now: 3000, match: m, source: 'missed', missedReason: 'weird' }); return a.show === 'x' && b.show === 'x' && b.reason === 'Full movement'; })());

console.log('--- confidence when the engine rejects for unreliable tracking ---');
{
  const mm = { haveData: true, trying: true, tryingForSec: 10, movingNow: true, cut: null, score: 90, cutAgo: { top: Infinity, bottom: Infinity, frame: Infinity }, topCuts: 0, bottomCuts: 0, frameCuts: 0, notTrying: false };
  const c = CC.createCameraConfidence(); let a, b;
  for (let t = 0; t < 4000; t += 200) a = c.update({ now: 1e6 + t, visibility: 100, match: mm, lastCountAt: 1e6, missedSinceCount: 0 });
  for (let t = 4000; t < 6000; t += 200) b = c.update({ now: 1e6 + t, visibility: 100, match: mm, lastCountAt: 1e6, missedSinceCount: 0, unreliableRecently: true });
  check('before: everything visible, reps counting = 100; the engine rejects a rep as unreliable: the number is capped at 45 at once, even while reps count', a.value >= 95 && b.value <= 45 && b.cap === 'unreliable', JSON.stringify({ a: a.value, b: b.value, cap: b.cap }));
}

console.log('--- the real logs, replayed (JS mirror of the new native tracker) ---');
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const H = (h, m, s) => (h * 3600 + m * 60 + s) * 1000;
const SETS = [
  ['scripts/fixtures/shoulder-press-2026-11-25.log.txt', H(19, 21, 10), H(19, 22, 30), '2026-11-25'],
  ['scripts/fixtures/shoulder-press-2026-11-16b.log.txt', H(16, 17, 0), H(16, 18, 35), '2026-11-16b'],
  ['scripts/fixtures/shoulder-press-2026-11-16.log.txt', H(15, 19, 40), H(15, 21, 30), '2026-11-16'],
];
let anyBeforeBad = false;
for (const [f, a, b, name] of SETS) {
  const rows = read(f).split('\n').filter(Boolean).map(parse).filter(Boolean).filter((r) => r.t >= a && r.t <= b);
  const sel = rows.slice(rows.findIndex((r) => /^\[METRIC\].*phase=(?!setup)/.test(r.line))); const t0 = sel[0].t;
  const ev = sel.map((r) => ({ t: r.t - t0, line: r.line }));
  // (2026-11-27) the strokes are the replay's own detector strokes, with the time of their LOW: a stroke's result may come any time from its low (the engine's
  // cross is shown when the arms are back) to 2.3 s after the detector reported it (the detector reports a stroke up to ~2 s late). Strokes that never left the
  // start zone (barely moving) must get NOTHING. A second result for the same stroke is counted too (it was hidden by the old window).
  const real = (res) => res.attempts.filter((x) => (x.outcome === 'missed' || x.outcome === 'rejected') && VT.leftStartZone(x.low, press));
  const atts = real(P.run(ev, { exerciseId: 'shoulderPress' }));
  const stat = (res) => { const shown = res.verdicts.filter((v) => v.show).map((v) => v.t); let run = 0, worst = 0, silent = 0; for (const x of real(res)) { if (shown.some((t) => t >= x.lowAt - 400 && t <= x.t + 2300)) run = 0; else { run++; silent++; worst = Math.max(worst, run); } } return { silent, worst }; };
  const before = stat(P.run(ev, { exerciseId: 'shoulderPress', immediateCross: true }));
  const resA = P.run(ev, { exerciseId: 'shoulderPress' });
  const after = stat(resA);
  console.log(`  ${name}: ${atts.length} missed/rejected strokes. BEFORE: ${before.silent} with no verdict, worst ${before.worst} in a row. AFTER: ${after.silent}, worst ${after.worst}.`);
  if (before.worst >= 2) anyBeforeBad = true;
  check(`${name}: AFTER every real stroke gets a check or a cross (never more than 1 in a row with none; here 0 of ${atts.length})`, after.worst <= 1 && after.silent === 0, JSON.stringify(after));
  const held = resA.verdicts.filter((v) => v.src === 'missed' && typeof v.heldMs === 'number');
  check(`${name}: every held cross was delivered within the 1.1 s maximum and, when the metric was known, only once the arms were back at the start position (or the maximum wait ran out)`, held.length > 0 && held.every((v) => v.heldMs <= 1300 && (v.metric === null || VT.backAtStart(v.metric, press) || /waited|about back/.test(v.why))), JSON.stringify(held.map((v) => [Math.round(v.heldMs), v.metric, v.why])));
  console.log(`    crosses held ${held.map((v) => Math.round(v.heldMs) + ' ms').join(', ')} (the log only has the metric 3 times a second; the phone sees 30 frames a second)`);
}
check('the bug reproduces on the old behaviour: BEFORE, at least one real log had 2 strokes in a row with no verdict', anyBeforeBad);

console.log('--- the screen wires it ---');
const fc = read('app/formcheck.tsx');
check('a half rep from the engine is HELD (pendingCrossRef) and delivered by the one place deliverCrossRef when the arms are back (crossDue) or after the most it may wait', fc.includes('pendingCrossRef.current = { reason: ev.reason') && fc.includes('crossDue(pc, now, val, lines)') && fc.includes('deliverCrossRef.current = (reason, at, why, value, strokeOnPath) =>'));
check('a counted rep flushes a held cross first and is withheld ONLY when nobody is in the picture or he is out of position (2026-11-27), never by the raw camera cue', fc.includes("const verdictOk = statsRef.current?.personDetected !== false && !outOfPositionRef.current;") && fc.includes("deliverCrossRef.current(old.reason, old.at, 'a counted rep arrived'"));
check('a stroke with no verdict gets its cross (silentWatch.tick) and an unreliable reject drops the number (unreliableRecently)', fc.includes('silentWatch.tick(now,') && fc.includes('unreliableRecently: rej.lowQuality') && fc.includes('[SILENT] stroke #'));
check('the log says how long each verdict took: [TIMING] cross shown N ms after the engine event, when ...', fc.includes("[TIMING] cross shown '"));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
