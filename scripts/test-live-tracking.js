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
// Smooth meter (lib/liveTracking.ts createMeterSmoother), driven at 33ms like formcheck.tsx
function run(targetAt, ms) {
  const m = LT.createMeterSmoother(); const out = [];
  for (let t = 0; t <= ms; t += 33) out.push({ t, v: m.tick(targetAt(t), t), eff: m.effectiveTarget });
  return out;
}
{
  const m = LT.createMeterSmoother();
  for (let t = 0; t < 2000; t += 33) m.tick(100, t);
  check('display goes 100 -> 0 on the very next tick when nobody is there', m.tick(0, 2033) === 0);
}
{
  const o = run(() => 100, 2000);
  const t95 = o.find(x => x.v >= 95).t;
  check('RISE: 0 -> 95 in under 0.8s (was ~2.1s at one number per 45ms)', t95 < 800, `${t95}ms`);
  const steps = o.slice(1).map((x, i) => x.v - o[i].v).filter(d => d > 0);
  check('RISE: still counts up smoothly (never jumps more than 6 numbers per frame)', Math.max(...steps) <= 6, `max step ${Math.max(...steps)}`);
}
{
  // JITTER: the raw target flickers 100 <-> 55 every ~100ms for a second (a cue blinking), then settles at 100.
  const flick = (t) => (t >= 1000 && t < 2000 ? (Math.floor(t / 100) % 2 ? 55 : 100) : 100);
  const o = run(flick, 3000);
  const after = o.filter(x => x.t > 800);
  const dip = Math.min(...after.map(x => x.v));
  // what the OLD meter did: follow every flicker, one number per 45ms up / faster down
  let old = 100, oldMin = 100; for (let t = 1000; t < 2000; t += 45) { const tg = flick(t); old = old < tg ? old + 1 : Math.max(tg, old - Math.max(1, Math.ceil((old - tg) / 4))); oldMin = Math.min(oldMin, old); }
  console.log(`      flickering target 100/55 for 1s: old meter swung down to ${oldMin}, new meter's lowest value ${dip}`);
  check('JITTER: a flickering target no longer makes the number swing (old meter swung to ' + oldMin + ')', dip >= 95 && oldMin < 80, `lowest ${dip}`);
}
{
  // a REAL, sustained drop is still shown quickly
  const o = run((t) => (t < 1000 ? 100 : 40), 3000);
  const t60 = o.find(x => x.t >= 1000 && x.v <= 60);
  check('ACCURACY: a sustained drop (100 -> 40) shows within 0.8s', t60 && t60.t - 1000 < 800, t60 ? `${t60.t - 1000}ms` : 'never');
  check('ACCURACY: ...and settles on the true value', o[o.length - 1].v === 40);
}

// 2. Ready only when tracking is high.
// Native hold: allVisible from t=0.3s, holdProgress 0->1 over 2s, passed at 2.3s.
function simulateReady(gated) {
  let display = 0, readyAt = null, readyDisplay = null, nextTick = 45;
  const m = LT.createMeterSmoother();
  for (let t = 0; t <= 8000; t++) {
    const sec = t / 1000;
    const visible = sec >= 0.3;
    const hold = visible ? Math.min(1, (sec - 0.3) / 2) : 0;
    const passed = hold >= 1;
    const target = LT.meterTarget({
      ...base, phase: 'setup', setupAllVisible: visible, setupHoldProgress: hold,
      setupHint: visible ? '' : 'Get in frame',
    });
    let eff = target;
    if (gated) { if (t % 33 === 0) { display = m.tick(target, t); } eff = m.effectiveTarget; }
    else if (t >= nextTick) { // the OLD meter: +1 every 45ms (18ms when far behind)
      display = display < target ? display + 1 : Math.max(target, display - Math.max(1, Math.ceil((display - target) / 4)));
      nextTick = t + (Math.abs(target - display) > 8 ? 18 : 45);
    }
    const fire = gated ? (passed && LT.trackingIsHigh(display, eff)) : passed;
    if (fire && readyAt === null) { readyAt = t; readyDisplay = display; }
  }
  return { readyAt, readyDisplay };
}
const oldRun = simulateReady(false), gated = simulateReady(true);
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

// 4. native "[TRACK] person lost" line (Swift, ExerciseEngine.notePersonMissing, ~6 frames = ~0.2s)
{
  let clock = 7000000; const realNow = Date.now; Date.now = () => clock;
  try {
    const diag = RD.createRepDiagnostic(0.9); let last = 0;
    for (; clock < 7000000 + 6000; clock += 10) if (clock - last >= 330) { diag.feed('[METRIC] shoulderPress value=60 top=84 rom=55'); last = clock; }
    const leftAt = last;
    clock = leftAt + 200; // ~0.2s after the last pose: native logs the line
    check('before the line arrives there is no cue yet', diag.message() === null);
    diag.feed('[TRACK] person lost');
    check('"[TRACK] person lost" shows "Step back into frame" immediately (~0.2s, was ~1.0s)', diag.message() === LT.NO_PERSON_CUE, `${clock - leftAt}ms after the last pose`);
    check('...and the tracking meter target is 0 at once', LT.meterTarget({ phase: 'tracking', isActive: true, setupAllVisible: true, setupHoldProgress: 1, setupHint: '', repDiag: diag.message() }) === 0);
    clock += 400; diag.feed('[TRACK] person back'); diag.feed('[METRIC] shoulderPress value=60 top=84 rom=55');
    check('"[TRACK] person back" clears the cue', diag.message() === null);
  } finally { Date.now = realNow; }
}

// 5. glass: setup guidance and live cues go through the SAME component
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
  check('glass: setup guidance renders through <CueGlass> (was plain text)', /<CueGlass text=\{setupAllVisible/.test(src) && !/<Text style=\{s\.setupBig\}>/.test(src));
  check('glass: live cues render through the very same <CueGlass>', /<CueGlass text=\{cue\} \/>/.test(src));
  check('glass: CueGlass is a GlassPanel pill (the look you like)', /function CueGlass[\s\S]*?<GlassPanel radius=\{999\}/.test(src));
  check('meter: premium glass pill (GlassPanel + ring + Plus Jakarta), no bare 40px text', /<GlassPanel radius=\{999\} style=\{s\.meterPill\}>/.test(src) && !/cameraLockPct/.test(src));
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
