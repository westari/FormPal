#!/usr/bin/env node
/**
 * scripts/test-live-tracking.js
 *
 * Runs the REAL lib/liveTracking.ts + lib/repDiagnostics.ts (transpiled from
 * the shipped TS, not copied) against simulated sessions:
 *   1. no person -> meter is 0% (setup and tracking)
 *   2. "Ready. Go!" is only announced once the meter reads high
 *   3. "Step back into frame" latency after the person leaves
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'live-tracking-'));
for (const f of ['liveTracking', 'repDiagnostics']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', f + '.ts'), 'utf8');
  fs.writeFileSync(path.join(out, f + '.js'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText);
}
const LT = require(path.join(out, 'liveTracking.js'));
const RD = require(path.join(out, 'repDiagnostics.js'));

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
  if (!ok) failed++;
}

const base = {
  phase: 'setup', isActive: false, setupAllVisible: false, setupHoldProgress: 0,
  setupHint: '', repDiag: null,
};

// 1. no person => 0%
check('setup, before any native event -> 0', LT.meterTarget(base) === 0);
check('setup, native says "Get in frame" -> 0', LT.meterTarget({ ...base, setupHint: 'Get in frame' }) === 0);
check('setup, native says "Get back in frame" -> 0', LT.meterTarget({ ...base, setupHint: 'Get back in frame' }) === 0);
check('setup, person present but framing off ("Back up a bit") -> 25', LT.meterTarget({ ...base, setupHint: 'Back up a bit' }) === 25);
check('tracking, personDetected=false -> 0',
  LT.meterTarget({ ...base, phase: 'tracking', isActive: true, personDetected: false }) === 0);
check('tracking, step-back cue from diagnostic -> 0',
  LT.meterTarget({ ...base, phase: 'tracking', isActive: true, repDiag: LT.NO_PERSON_CUE }) === 0);
check('tracking, healthy -> 100',
  LT.meterTarget({ ...base, phase: 'tracking', isActive: true, personDetected: true }) === 100);
let d = 100; d = LT.stepMeter(d, 0);
check('display goes 100 -> 0 on the very next tick when nobody is there', d === 0, `display=${d}`);
let r = 0; const seen = [];
for (let i = 0; i < 5; i++) { r = LT.stepMeter(r, 100); seen.push(r); }
check('display still climbs one number per tick', seen.join(',') === '1,2,3,4,5', seen.join(','));

// 2. Ready only when tracking is high.
// Native hold: allVisible from t=0.3s, holdProgress 0->1 over 2s, passed at 2.3s.
// Display ticks every 45ms (same as formcheck.tsx's interval).
function simulateReady(gated, adaptive) {
  let display = 0, readyAt = null, readyDisplay = null, nextTick = 45;
  let target = 0;
  for (let t = 0; t <= 8000; t++) {
    const sec = t / 1000;
    const visible = sec >= 0.3;
    const hold = visible ? Math.min(1, (sec - 0.3) / 2) : 0;
    const passed = hold >= 1;
    target = LT.meterTarget({
      ...base, phase: 'setup', setupAllVisible: visible, setupHoldProgress: hold,
      setupHint: visible ? '' : 'Get in frame',
    });
    if (t >= nextTick) {
      display = LT.stepMeter(display, target);
      nextTick = t + (adaptive ? LT.meterTickMs(display, target) : 45);
    }
    const fire = gated ? (passed && LT.trackingIsHigh(display, target)) : passed;
    if (fire && readyAt === null) { readyAt = t; readyDisplay = display; }
  }
  return { readyAt, readyDisplay };
}
const oldRun = simulateReady(false, false), gated = simulateReady(true, true);
console.log(`      old behavior: "Ready. Go!" at ${oldRun.readyAt}ms while the meter showed ${oldRun.readyDisplay}%`);
console.log(`      new behavior: "Ready. Go!" at ${gated.readyAt}ms while the meter showed ${gated.readyDisplay}%`);
check('new: Ready announced only with meter >= ' + LT.READY_MIN_PCT, gated.readyDisplay >= LT.READY_MIN_PCT);
check('new: Ready still fires promptly (< 400ms after native pass)', gated.readyAt - oldRun.readyAt < 400,
  `${gated.readyAt - oldRun.readyAt}ms after pass`);
check('Ready blocked while meter low', !LT.trackingIsHigh(60, 100) && !LT.trackingIsHigh(100, 55));

// 3. "Step back into frame" latency
function latency(streamDeadSec, pollMs) {
  let clock = 1000000;
  const realNow = Date.now;
  Date.now = () => clock;
  try {
    const diag = RD.createRepDiagnostic(streamDeadSec);
    let lastLine = 0;
    for (; clock < 1000000 + 6000; clock += 10) {
      if (clock - lastLine >= 330) { diag.feed('[METRIC] squat value=1.0'); lastLine = clock; }
    }
    const leftAt = lastLine; // person leaves right after the last line
    let shownAt = null;
    for (; clock < leftAt + 8000 && shownAt === null; clock += 10) {
      if ((clock - leftAt) % pollMs === 0 && diag.message() === LT.NO_PERSON_CUE) shownAt = clock - leftAt;
    }
    return shownAt;
  } finally { Date.now = realNow; }
}
const oldLat = latency(2.5, 1000), newLat = latency(0.9, 200);
console.log(`      old: cue after ${oldLat}ms   new: cue after ${newLat}ms`);
check('new cue shows within 1.3s of the person leaving', newLat !== null && newLat <= 1300, `${newLat}ms`);
check('new cue is at least 2x faster than before', newLat * 2 <= oldLat, `${oldLat}ms -> ${newLat}ms`);
check('no false cue while METRIC lines keep flowing', (() => {
  let clock = 5000000; const realNow = Date.now; Date.now = () => clock;
  try {
    const diag = RD.createRepDiagnostic(0.9); let last = 0, bad = 0;
    for (; clock < 5000000 + 20000; clock += 20) {
      if (clock - last >= 345) { diag.feed('[METRIC] squat value=1.0'); last = clock; }
      if (clock % 200 === 0 && diag.message() === LT.NO_PERSON_CUE) bad++;
    }
    return bad === 0;
  } finally { Date.now = realNow; }
})());

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
