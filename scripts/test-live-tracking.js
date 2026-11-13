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
  check('RISE: still counts up smoothly (exponential glide: never more than 16 numbers per frame, never down)', Math.max(...steps) <= 16 && o.slice(1).every((x, i) => x.v >= o[i].v), `max step ${Math.max(...steps)}`);
}
{
  // CONTINUOUS: small changes in the picture are small changes on screen, and nothing steps.
  // (1) the target slides 100 -> 90 over 2s (after the number has settled at 100): it slides with it, a number or two at a time
  const o = run((t) => (t < 1500 ? 100 : Math.max(90, 100 - (t - 1500) / 200)), 5000).filter((x) => x.t >= 1500);
  const d = o.slice(1).map((x, i) => x.v - o[i].v);
  check('CONTINUOUS: a slow 100 -> 90 slide moves the number by at most 2 per frame, and never up', Math.min(...d) >= -2 && Math.max(...d) <= 0, 'steps ' + [Math.min(...d), Math.max(...d)].join('..'));
  check('CONTINUOUS: ...and ends at 90', Math.abs(o[o.length - 1].v - 90) <= 1, String(o[o.length - 1].v));
  // (2) one frame of a bad reading (100 -> 55 -> 100) is a small blip, not a swing
  const blip = run((t) => (t >= 2000 && t < 2033 ? 55 : 100), 3500).filter((x) => x.t > 1500);
  const lowest = Math.min(...blip.map((x) => x.v));
  check('CONTINUOUS: a one-frame bad reading dips the number by only a few points (' + lowest + ')', lowest >= 94, 'lowest ' + lowest);
  // (3) a tiny change (100 -> 98) shows as a tiny change
  const tiny = run((t) => (t < 1500 ? 100 : 98), 5000).filter((x) => x.t > 1400);
  check('CONTINUOUS: 100 -> 98 shows 98 (never goes below it)', tiny[tiny.length - 1].v === 98 && Math.min(...tiny.map((x) => x.v)) >= 98, 'lowest ' + Math.min(...tiny.map((x) => x.v)));
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
  check('steady person: Ready comes at the native pass (every joint visible) or within ~1s of it, never later (Ari 2026-11-12: it never came)', a.readyAt >= a.passedAt && a.readyAt - a.passedAt <= 1000, `${a.readyAt - a.passedAt}ms after the pass`);
  check('steady person: Ready only after at least the steady time (about 1s) counted from the first full-body frame', a.readyAt - 300 >= LT.READY_STEADY_MS - 100, `${a.readyAt - 300}ms`);
  const b = readyTimes({ breaks: [[1200, 1500]] }); // 300ms flicker: native keeps its hold running, the steady run restarts
  console.log(`      flicker at 1.2-1.5s: native passes at ${b.passedAt}ms, Ready at ${b.readyAt}ms`);
  check('a flicker (body not fully tracked for 0.3s) restarts the steady count', b.readyAt - 1500 >= LT.READY_STEADY_MS - 100 && b.readyAt >= a.readyAt, `Ready ${b.readyAt - 1500}ms after the flicker ended`);
  const c = readyTimes({ gaps: [[1000, 1600]] }); // frames stop for 600ms (> READY_MAX_GAP_MS)
  check('a gap in the frame stream longer than READY_MAX_GAP_MS never makes Ready come EARLIER', c.readyAt >= a.readyAt, `Ready at ${c.readyAt}ms`);
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
  check('glass: setup guidance renders through <CueGlass> (was plain text)', /<CueGlass text=\{guide/.test(src) && !/<Text style=\{s\.setupBig\}>/.test(src));
  check('glass: live cues render through the very same <CueGlass>', /<CueGlass text=\{guideTrack\} \/>/.test(src));
  check('glass: CueGlass is a GlassPanel pill (the look you like)', /function CueGlass[\s\S]*?<GlassPanel radius=\{999\}/.test(src));
  check('meter: premium glass pill (GlassPanel + ring + Plus Jakarta), no bare 40px text', /<GlassPanel radius=\{999\} style=\{s\.meterPill\}>/.test(src) && !/cameraLockPct/.test(src));
}

// 6. screen stays awake + label + gate wiring
{
  const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
  const run = fs.readFileSync(path.join(__dirname, '..', 'app', 'workout', 'run.tsx'), 'utf8');
  const swift = fs.readFileSync(path.join(__dirname, '..', 'modules', 'athlt-camera', 'ios', 'ATHLTCameraModule.swift'), 'utf8');
  const pkg = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
  check('keep awake: the camera screen RELEASES AND TAKES the lock again every 15s and on return to the app (expo-keep-awake ignores a second request while it thinks it is on), logs [AWAKE], and no longer uses the one-shot hook', fc.includes('await deactivateKeepAwake(TAG)') && fc.includes('await activateKeepAwakeAsync(TAG)') && fc.includes('}, 15000)') && fc.includes("AppState.addEventListener('change'") && fc.includes('[AWAKE]') && !fc.includes("useKeepAwake('formcheck')"));
  check('keep awake: the native camera no longer switches the idle timer OFF when a session stops (that turned the screen lock back on behind expo-keep-awake), and expo-keep-awake is a declared dependency', swift.includes('isIdleTimerDisabled = true') && swift.includes('startAwakeKeeper') && swift.includes('didBecomeActiveNotification') && swift.indexOf('isIdleTimerDisabled = false') > swift.indexOf('private func startAwakeKeeper') && pkg.includes('"expo-keep-awake"'));
  check('keep awake: the workout screen calls useKeepAwake()', /import \{ useKeepAwake \} from 'expo-keep-awake'/.test(run) && /export default function WorkoutRunScreen\(\) \{[\s\S]{0,300}useKeepAwake\(\);/.test(run));
  check('pill: label "Camera confidence" is OUTSIDE the glass, just above it (before the <GlassPanel>)', /<Text style=\{s\.meterLabel\}>Camera confidence<\/Text>\s*<GlassPanel radius=\{999\} style=\{s\.meterPill\}>/.test(fc) && !/Body tracking|Form detection/.test(fc));
  const num = +(fc.match(/meterNum:.*?fontSize: (\d+)/) || [])[1], trackW = +(fc.match(/meterTrack: \{ width: (\d+), height: (\d+)/) || [])[1], trackH = +(fc.match(/meterTrack: \{ width: \d+, height: (\d+)/) || [])[1];
  check(`pill: the % is much bigger (${num}px, was 16), the bar is longer (${trackW}px, was 52) and thicker (${trackH}px, was 3)`, num >= 34 && trackW >= 100 && trackH >= 8);
  check('Ready / Go is gated by the steady-tracking gate and logs its values as placeholders', /createSteadyGate/.test(fc) && /\[READY-GATE\] Ready: every joint visible/.test(fc) && /READY_STEADY_MS/.test(fc) && /placeholder/.test(fc));
}

// 7. the confidence number reads the same signal the counter works from, replayed on two REAL device logs
{
  const LT = require('../lib/liveTracking.ts');
  const T = (h, m, x) => h * 3600 + m * 60 + x;
  const events = (file) => fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8').split(/\r?\n/).map((l) => {
    const m = /^(\d\d):(\d\d):(\d\d\.\d+) \[log\] \[DEBUG\] (.*)$/.exec(l);
    return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])), msg: m[4] } : null;
  }).filter(Boolean);
  function replay(file, from, to) {
    const c = LT.createCounterSignal(), out = [];
    let next = from;
    for (const e of events(file)) {
      if (e.t < from) continue; if (e.t > to) break;
      while (next < e.t) { out.push({ t: next, score: c.score(next * 1000) }); next += 0.1; }
      c.feedLog(e.msg, e.t * 1000);
    }
    while (next < to) { out.push({ t: next, score: c.score(next * 1000) }); next += 0.1; }
    return { out, c };
  }
  // the 2026-11-08 set: reps counted 0. The old pill said 100 the whole time (a person was visible).
  const bad = replay('shoulder-press-2026-11-08.log.txt', T(19, 56, 42.3), T(19, 57, 18));
  const goodShare = (r) => r.out.filter((x) => x.score >= 90).length / r.out.length;
  const low = bad.out.filter((x) => x.score < 60).length / bad.out.length;
  console.log(`      11-08 set (0 reps counted): confidence >= 90 for ${(goodShare(bad) * 100).toFixed(0)}% of the time, below 60 for ${(low * 100).toFixed(0)}% (the old pill: 100% the whole time)`);
  // every time the counter lost the pose (framesSincePoseGap resets in its own trace) the number must dip at once
  const ev8 = events('shoulder-press-2026-11-08.log.txt').filter((e) => e.t >= T(19, 56, 42.3) && e.t <= T(19, 57, 18));
  let prevGap = null; const gaps = [];
  for (const e of ev8) { const g = /REP-TRACE.*framesSincePoseGap=(\d+)/.exec(e.msg); if (g) { const n = +g[1]; if (prevGap !== null && n < prevGap) gaps.push(e.t); prevGap = n; } }
  const dips = gaps.filter((g) => { const x = bad.out.find((y) => y.t >= g + 0.15); return x && x.score < 60; }).length;
  check(`every one of the ${gaps.length} pose losses in the 11-08 set makes the number dip below 60 within 0.15s (the old pill stayed at 100)`, gaps.length >= 3 && dips === gaps.length, `${dips} of ${gaps.length}`);
  check('between losses it climbs back (not stuck low): high for a good part of the set', goodShare(bad) >= 0.3 && low > 0.05, `high ${(goodShare(bad) * 100).toFixed(0)}%, low ${(low * 100).toFixed(0)}%`);
  // the 2026-11-02 set: 6 reps counted. The counter saw the user for most of it.
  const ok = replay('shoulder-press-2026-11-02.log.txt', T(20, 1, 4.9), T(20, 1, 24));
  console.log(`      11-02 set (6 reps counted): confidence >= 90 for ${(goodShare(ok) * 100).toFixed(0)}% of the time`);
  check('on the set where reps DID count, confidence is high most of the time', goodShare(ok) >= 0.7, `${(goodShare(ok) * 100).toFixed(0)}%`);
  // Ready / Go replayed on the 11-08 start: Go used to show at 38.28s
  const start = replay('shoulder-press-2026-11-08.log.txt', T(19, 56, 34.5), T(19, 56, 38.3));
  const d = require('../constants/exerciseDefinitions.ts').EXERCISE_DEFINITIONS.shoulderPress;
  const startMin = d.goodROMThreshold + (d.topAngle - d.goodROMThreshold) * d.settleAnchorMinFraction;
  const goAt = T(19, 56, 38.3) * 1000;
  check(`Go no longer shows at 38.28s of the 11-08 log: the counter read ${start.c.lastValue().toFixed(0)}, not at the start position (needs >= ${startMin.toFixed(1)})`, !start.c.atStartPosition(startMin, goAt, LT.READY_COUNTER_WINDOW_MS, LT.READY_COUNTER_MIN_SAMPLES) && start.c.healthy(goAt, LT.READY_COUNTER_WINDOW_MS, LT.READY_COUNTER_MIN_SAMPLES));
  const later = replay('shoulder-press-2026-11-08.log.txt', T(19, 56, 41.9), T(19, 56, 42.4));
  check('...and Go WOULD show once the hands are at the shoulders (the 63+ readings at 42.2s)', later.c.lastValue() >= startMin - 0.5, `last reading ${later.c.lastValue()}`);
  const noLogs = LT.createCounterSignal();
  check('with no debug log at all (release build) nothing waits on the counter (seen() is false, score 100)', noLogs.seen() === false && noLogs.score(1e6) === 100);
  const mt = (cs) => LT.meterTarget({ phase: 'tracking', isActive: true, setupAllVisible: true, setupHoldProgress: 1, setupHint: '', personDetected: true, repDiag: null, counterScore: cs });
  check('meterTarget is the minimum of the old rule and the counter score while tracking', mt(45) === 45 && mt(100) === 100);
}

// 8. the number is a live, continuous value on the REAL 11-10 session (it used to be just 100 / 55 / 35 / 0)
{
  const LT = require('../lib/liveTracking.ts');
  const rows = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-10.log.txt'), 'utf8').split(/\r?\n/).map((l) => {
    const m = /^(\d\d):(\d\d):(\d\d\.\d+) \[log\] \[DEBUG\] (.*)$/.exec(l);
    return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, msg: m[4] } : null;
  }).filter(Boolean).filter((e) => e.t >= (22 * 3600 + 28 * 60 + 38) * 1000);
  const c = LT.createCounterSignal(), sm = LT.createMeterSmoother();
  const shown = [], steps = []; let ri = 0; let prev = null; let maxStep = 0;
  const end = rows[rows.length - 1].t;
  for (let t = rows[0].t; t < end; t += 33) {
    while (ri < rows.length && rows[ri].t <= t) { c.feedLog(rows[ri].msg, rows[ri].t); ri++; }
    const v = sm.tick(c.score(t), t); shown.push(v);
    if (prev !== null && prev > 0 && v > 0 && shown.length > 45) { maxStep = Math.max(maxStep, Math.abs(v - prev)); steps.push(Math.abs(v - prev)); } prev = v; // (the first 1.5s is the number rising from 0)
  }
  const distinct = new Set(shown).size;
  console.log('      11-10 session: ' + shown.length + ' frames, ' + distinct + ' different numbers shown, biggest change between two frames ' + maxStep);
  check('the number takes many different values (not just 100 / 55 / 35 / 0)', distinct >= 12, String(distinct));
  const ordered = steps.slice().sort((a, b) => a - b), p99 = ordered[Math.floor(ordered.length * 0.99)];
  check('it never steps: 99% of frame-to-frame changes are 4 numbers or less (a real pose loss may move it up to ' + maxStep + ')', p99 <= 4 && maxStep <= 12, 'p99 ' + p99 + ', max ' + maxStep);
  check('it reacts to the real trouble in that session (dips well below 100 at some point, recovers to above 90 later)', Math.min(...shown) <= 70 && Math.max(...shown.slice(Math.floor(shown.length / 2))) >= 90, 'min ' + Math.min(...shown));
}

// ── A frame hint and a check / X are never on screen together ────────────────────────────────────────────────
{
  const { isFrameHint, showVerdict, showFrameHint, JUDGED_QUIET_MS, NO_PERSON_CUE } = LT;
  check('the frame hints are recognised', ['Step into frame', 'Move back', "Can't see arms", NO_PERSON_CUE].every(isFrameHint) && !isFrameHint('Press higher') && !isFrameHint('Too much swing') && !isFrameHint(null));
  check('a counted rep gets NO check / X while a frame hint is up, or while no person is detected', !showVerdict('Step into frame', true) && !showVerdict(null, false) && !showVerdict("Can't see arms", true));
  check('a counted rep gets its check / X when the camera sees the person (reasons like "Press higher" are not frame hints)', showVerdict(null, true) && showVerdict('Press higher', true) && showVerdict(null, undefined));
  check('right after a judged rep the frame hint is hidden; later it can show again; other cues are never hidden', showFrameHint('Step into frame', 500) === null && showFrameHint('Step into frame', JUDGED_QUIET_MS + 1) === 'Step into frame' && showFrameHint('Press higher', 100) === 'Press higher');
  // replay of a set: check shown whenever the frame hint is not, in every moment
  let both = 0;
  for (let t = 0; t < 20000; t += 100) {
    const judgedAt = (Math.floor(t / 2500)) * 2500;                   // a rep is judged every 2.5s
    const hint = (t % 7000) > 5500 ? 'Step into frame' : null;        // the person steps out of frame for 1.5s every 7s
    const frame = showFrameHint(hint, t - judgedAt);
    const verdict = showVerdict(hint, !hint);
    if (frame && verdict) both++;
  }
  check('replay over 20s: the frame hint and a verdict are never both allowed at the same time', both === 0, String(both));
}
// ── status, confidence and cues agree ──
{
  const { capMeterTarget, FRAME_HINT_METER_CAP } = LT;
  check('a frame hint on screen caps the confidence at 35, whatever the raw number says (it read 75 beside "Step back into frame")', capMeterTarget(75, null, true) === FRAME_HINT_METER_CAP && capMeterTarget(100, null, true) === 35 && capMeterTarget(20, null, true) === 20);
  check('while setting up, the step caps the number (100 only at Go); no cap otherwise', capMeterTarget(100, 70, false) === 70 && capMeterTarget(100, 100, false) === 100 && capMeterTarget(88, null, false) === 88);
  check('both caps apply together (the lowest wins)', capMeterTarget(100, 80, true) === 35);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
