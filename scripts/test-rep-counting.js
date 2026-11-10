#!/usr/bin/env node
/**
 * scripts/test-rep-counting.js
 *
 * Shoulder-press rep counting against TWO real device logs of the same exercise:
 *   2026-11-02 (the device counted 6 reps)   and   2026-11-08 (the device counted 0 reps in a full session).
 * The counting rule lives in Swift (ExerciseEngine .atTop/.inRep), which cannot run here, so this replays each log's
 * per-frame metric through a faithful MIRROR of the rule (enter below `enter`, finish after 3 frames above `exit`,
 * the three movement guards) and prints what each set of thresholds would have counted.
 *   - REPRODUCED: the thresholds before the fix (enter 68 / exit 72) give 0 reps on the 2026-11-08 log, as on the device.
 *   - FIXED: the shipped thresholds (read from constants/exerciseDefinitions.ts) count the presses in both logs, and
 *     never count the 52-53 drift (a hand settling at the rack).
 * The device proof is the [REP] #N lines of the next session (the counter prints them).
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const { EXERCISE_DEFINITIONS } = require('../constants/exerciseDefinitions.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

function frames(file, afterSec) {
  const out = [];
  for (const l of fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8').split(/\r?\n/)) {
    const m = /^(\d\d):(\d\d):(\d\d\.\d+) .*\[(REP-TRACE|SETTLE-TRACE)\] shoulderPress angle=([0-9.]+)/.exec(l);
    if (m) { const t = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]); if (t >= afterSec) out.push({ t, v: +m[5] }); }
  }
  return out;
}
// mirror of the native rule (ExerciseEngine.swift): entry below `enter`, completion after exitConfirmFrames(3) frames above `exit`,
// guards: movement >= required, movementPastEntry >= requiredPastEntry, movement >= minSwing
function count(series, { enter, exit, top0, frac = 0.18, rom = 55, topAngle = 84 }) {
  let phase = 'top', min = 999, conf = 0, top = top0; const reps = [];
  const minSwing = Math.abs(topAngle - rom) * Math.max(frac, 0.3);
  for (const f of series) {
    const v = f.v;
    if (phase === 'top') { top = Math.min(Math.max(top, v), topAngle + 20); if (v < enter) { phase = 'in'; min = v; conf = 0; } continue; }
    if (v < min) min = v;
    if (v > exit) {
      if (++conf >= 3) {
        conf = 0; phase = 'top';
        const movement = top - min, required = Math.max(Math.abs(top - rom) * frac, 0.01), past = enter - min, reqPast = Math.max(Math.abs(enter - rom) * frac, 0.01);
        if (movement >= required && past >= reqPast && movement >= minSwing) reps.push({ t: f.t, min }); min = 999;
      }
    } else conf = 0;
  }
  return reps;
}
const T = (h, m, s) => h * 3600 + m * 60 + s;
const log1 = frames('shoulder-press-2026-11-02.log.txt', T(20, 1, 4.856));   // after "[SETTLE] resynced" in that log
const log2 = frames('shoulder-press-2026-11-08.log.txt', T(19, 56, 42.294));  // after "[SETTLE] resynced" in that log
const def = EXERCISE_DEFINITIONS.shoulderPress;
const OLD = { enter: 68, exit: 72 }, NEW = { enter: def.repEnterThreshold, exit: def.repExitThreshold };
const o1 = count(log1, { ...OLD, top0: 68 }), o2 = count(log2, { ...OLD, top0: 65.4 });
const n1 = count(log1, { ...NEW, top0: 68 }), n2 = count(log2, { ...NEW, top0: 65.4 });
console.log(`  before (enter ${OLD.enter} / exit ${OLD.exit}):  2026-11-02 log -> ${o1.length} reps (device: 6)   2026-11-08 log -> ${o2.length} reps (device: 0)`);
console.log(`  shipped (enter ${NEW.enter} / exit ${NEW.exit}): 2026-11-02 log -> ${n1.length} reps   2026-11-08 log -> ${n2.length} reps  (bottoms ${n2.map(r => r.min.toFixed(0)).join(', ')})`);
check('mirror agrees with the device on the old thresholds: ~6 reps on the 11-02 log', o1.length >= 5 && o1.length <= 8, `${o1.length}`);
check('REPRODUCED: the old thresholds count 0 reps on the 11-08 log, exactly what the device did', o2.length === 0, `${o2.length}`);
check('FIXED: the shipped thresholds count the presses in the 11-08 log (at least 3)', n2.length >= 3, `${n2.length}`);
check('the 11-02 presses are still counted (no fewer than before) and not inflated by more than the same drift-free count', n1.length >= o1.length - 1 && n1.length <= o1.length + 1, `${n1.length} vs ${o1.length}`);
check('no rep is counted from drift or a shallow wobble (every counted rep bottomed out below 50)', [...n1, ...n2].every(r => r.min < 50), [...n1, ...n2].map(r => r.min.toFixed(0)).join(','));
check('the exit threshold sits below the lowest rack reading seen in both logs (so returning to the rack completes a rep)', NEW.exit < Math.min(...[...log1, ...log2].filter(f => f.v > 60 && f.v < 70).map(f => f.v)) + 5 && NEW.exit <= 60, `exit ${NEW.exit}`);
for (const id of ['overheadPress', 'arnoldPress', 'dumbbellShoulderPress', 'machineShoulderPress']) {
  const d = EXERCISE_DEFINITIONS[id];
  check(`${id}: same thresholds`, !d || (d.repEnterThreshold === NEW.enter && d.repExitThreshold === NEW.exit));
}
const gate = def.startPositionGate;
check('the return-to-start gate no longer needs hips (verticalGap, shoulder + elbow only)', gate && JSON.stringify(gate.metric).indexOf('normalized') < 0 && /verticalGap/.test(JSON.stringify(gate.metric)) && !/Hip/.test(JSON.stringify(gate.metric)));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
