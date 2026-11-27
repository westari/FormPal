#!/usr/bin/env node
/**
 * scripts/test-rep-timing.js  (Ari 2026-11-27: "both check and cross still come a bit late. Make them land as the rep finishes.")
 * From the [TIMING] lines of the two real 2026-11-27 logs:
 *   - CROSS: the app sees the metric only about every 0.4 s, and a held cross waited for a reading that showed the arms back, checked on a 0.2 s tick:
 *     125-551 ms after the engine's half-rep event on the phone. The arms were back about 0.2-0.3 s after the event. Now a held cross is checked the moment a
 *     reading arrives AND lands 250 ms after the event unless a reading says the arms are still down at the bottom (lib/verdictTiming.ts).
 *   - CHECK: the engine counted a press 0.3 s after the arms were back (the start-position gate, then 3 confirm frames at ~10 frames a second). The shoulder
 *     presses now need 2 confirm frames (the gate is what stops a mid-rep count): about 0.1 s sooner. That one is native: only the next phone log can show it.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'); const path = require('path');
const P = require('./lib/pipeline.js');
const VT = require('../lib/verdictTiming.ts');
const E = require('../constants/exerciseDefinitions.ts').EXERCISE_DEFINITIONS;
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const press = { topAngle: 84, repExitThreshold: 58 };

check('the cross helper: at the turn with no newer reading it is not due yet; 250 ms later it is; a reading still at the bottom holds it; a reading back at the start shows it at once',
  !VT.crossDue({ reason: 'short_bottom', at: 0, reached: 62 }, 100, null, press).due && VT.crossDue({ reason: 'short_bottom', at: 0, reached: 62 }, 250, null, press).due &&
  !VT.crossDue({ reason: 'short_bottom', at: 0, reached: 62 }, 400, 63, press).due && VT.crossDue({ reason: 'short_bottom', at: 0, reached: 62 }, 400, 70, press).due &&
  VT.crossDue({ reason: 'short_bottom', at: 0, reached: 62 }, 40, 80, press).due && VT.crossDue({ reason: 'short_bottom', at: 0, reached: 62 }, 1100, 63, press).due);

for (const f of ['shoulder-press-2026-11-27b', 'shoulder-press-2026-11-27']) {
  const all = fs.readFileSync(path.join(__dirname, 'fixtures', f + '.log.txt'), 'utf8').split(/\r?\n/).map(parse).filter(Boolean);
  const goI = all.findIndex((r) => /READY-GATE\] Ready|\[REP\] #1 /.test(r.line)); const stopI = all.findIndex((r, i) => i > goI && /Stop pressed/.test(r.line));
  const sess = all.slice(Math.max(0, goI - 40), stopI); const t0 = sess[0].t; const ev = sess.map((r) => ({ t: r.t - t0, line: r.line }));
  const phone = all.filter((r) => /\[TIMING\] cross shown (\d+) ms after the engine event, when the arms/.test(r.line)).map((r) => +/cross shown (\d+)/.exec(r.line)[1]);
  const held = (o) => P.run(ev, { exerciseId: 'shoulderPress', engineFromLog: true, tickMs: 50, ...o }).verdicts.filter((v) => v.src === 'missed' && v.show).map((v) => Math.round(v.heldMs));
  const b = held({ timing: 'r12' }), a = held({});
  const avg = (x) => Math.round(x.reduce((p, q) => p + q, 0) / x.length);
  console.log(`  ${f}: on the phone ${phone.join(', ')} ms (avg ${avg(phone)}); replay BEFORE ${b.join(', ')} (avg ${avg(b)}, worst ${Math.max(...b)}); AFTER ${a.join(', ')} (avg ${avg(a)}, worst ${Math.max(...a)})`);
  // (one exception: a half rep right after a rest, while Movement Match is still low, waits for a reading that shows the arms back: it is shown only for a complete stroke)
  check(`${f}: every cross lands within 0.3 s of the half rep's turn (the replay ticks every 50 ms; the phone uses a timer at 250 ms), at most one waits for a reading (under 0.4 s), never later than before`, a.length >= 8 && a.filter((x) => x > 300).length <= 1 && Math.max(...a) <= 400 && avg(a) < avg(b) && Math.max(...a) < Math.max(...b), JSON.stringify({ a, b }));
}
const presses = ['shoulderPress', 'overheadPress', 'arnoldPress', 'dumbbellShoulderPress', 'machineShoulderPress'];
check('the shoulder presses confirm the return in 2 frames (was 3), behind the start-position gate', presses.every((id) => E[id].exitConfirmFrames === 2 && E[id].startPositionGate));
check('no other exercise changed its confirm frames', E.squat.exitConfirmFrames === undefined && E.curl.exitConfirmFrames === undefined);
const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
check('the camera screen checks a held cross on every metric reading and on a timer at the expected return time (not only on the 200 ms tick)', fc.includes('checkHeldCrossRef.current(); } }') && fc.includes('setTimeout(() => checkHeldCrossRef.current(), CROSS_EXPECTED_RETURN_MS + 5);'));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
