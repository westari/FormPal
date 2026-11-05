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
check('the meter alone is high within 400ms of the native pass (so the steady gate below is what decides)', gated.readyAt - oldRun.readyAt < 400,
  `${gated.readyAt - oldRun.readyAt}ms after pass`);
check('Ready blocked while meter low', !LT.trackingIsHigh(60, 100) && !LT.trackingIsHigh(100, 55));

// 2b. STRICTER START: Ready / Go only after the full body has been tracked without a break for READY_STEADY_MS.
// Setup events at ~10 fps. PLACEHOLDER values (see lib/liveTracking.ts): READY_STEADY_MS, READY_MAX_GAP_MS.
function readyTimes({ visibleAt = 300, holdMs = 2000, breaks = [], gaps = [], frameMs = 100 }) {
  // breaks: [from,to] ms where the body is not fully visible; gaps: [from,to] ms with NO events at all
  const g = LT.createSteadyGate(); let passedAt = null, ready = null;
  const inRange = (t, rs) => rs.some(([a, b]) => t >= a && t < b);
  let holdStart = null; // native: the hold timer starts at the first all-visible frame; short flicker keeps it running
  for (let t = 0; t <= 12000; t += frameMs) {
    if (passedAt === null) {
      if (inRange(t, gaps)) continue;
      const vis = t >= visibleAt && !inRange(t, breaks);
      if (vis && holdStart === null) holdStart = t;
      const passed = vis && holdStart !== null && t - holdStart >= holdMs;
      g.feed(vis, t, passed);
      if (passed) passedAt = t;
    } else if (ready === null && g.steadyMs(t) >= LT.READY_STEADY_MS) ready = t;
  }
  return { passedAt, readyAt: ready };
}
{
  const a = readyTimes({});
  console.log(`      steady person: native passes at ${a.passedAt}ms, Ready at ${a.readyAt}ms (needs ${LT.READY_STEADY_MS}ms steady tracking, placeholder)`);
  check('steady person: Ready comes later than the native pass (it used to be the same moment)', a.readyAt > a.passedAt, `${a.readyAt - a.passedAt}ms after the pass`);
  check('steady person: Ready after the steady time counted from the first full-body frame', Math.abs((a.readyAt - 300) - LT.READY_STEADY_MS) <= 100, `${a.readyAt - 300}ms`);
  const b = readyTimes({ breaks: [[1200, 1500]] }); // 300ms flicker: native keeps its hold running, the steady run restarts
  console.log(`      flicker at 1.2-1.5s: native passes at ${b.passedAt}ms, Ready at ${b.readyAt}ms`);
  check('a flicker (body not fully tracked for 0.3s) restarts the steady count', b.readyAt - 1500 >= LT.READY_STEADY_MS - 100 && b.readyAt > a.readyAt, `Ready ${b.readyAt - 1500}ms after the flicker ended`);
  const c = readyTimes({ gaps: [[1000, 1600]] }); // frames stop for 600ms (> READY_MAX_GAP_MS)
  check('a gap in the frame stream longer than READY_MAX_GAP_MS also restarts it', c.readyAt > a.readyAt + 300, `Ready at ${c.readyAt}ms`);
  const d = LT.createSteadyGate(); d.feed(true, 0); d.feed(true, 100);
  check('a tracking break is reported when it happens (for the [READY-GATE] log)', d.feed(false, 200) === true && d.steadyMs(300) === 0);
  d.reset(); check('reset clears it', d.steadyMs(5000) === 0);
}

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

// 6. screen stays awake + label + gate wiring
{
  const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
  const run = fs.readFileSync(path.join(__dirname, '..', 'app', 'workout', 'run.tsx'), 'utf8');
  check('keep awake: the camera screen calls useKeepAwake()', /import \{ useKeepAwake \} from 'expo-keep-awake'/.test(fc) && /export default function FormCheckScreen\(\) \{[\s\S]{0,300}useKeepAwake\(\);/.test(fc));
  check('keep awake: the workout screen calls useKeepAwake()', /import \{ useKeepAwake \} from 'expo-keep-awake'/.test(run) && /export default function WorkoutRunScreen\(\) \{[\s\S]{0,300}useKeepAwake\(\);/.test(run));
  check('pill: the label "Body tracking" sits ABOVE the % and the bar (label first, then one row with both)', /<Text style=\{s\.meterLabel\}>Body tracking<\/Text>\s*<View style=\{s\.meterRow\}>\s*<Text style=\{s\.meterNum\}>[\s\S]*?<View style=\{s\.meterTrack\}>/.test(fc) && !/Form detection/.test(fc));
  check('pill: stacked layout (column inner, row for % + bar)', /meterInner: \{ alignItems: 'center'/.test(fc) && !/meterInner: \{ flexDirection: 'row'/.test(fc) && /meterRow:   \{ flexDirection: 'row'/.test(fc));
  check('Ready / Go is gated by the steady-tracking gate and logs its values as placeholders', /createSteadyGate/.test(fc) && /\[READY-GATE\] Ready: steady/.test(fc) && /READY_STEADY_MS/.test(fc) && /placeholder/.test(fc));
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
