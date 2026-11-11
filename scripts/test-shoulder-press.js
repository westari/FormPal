#!/usr/bin/env node
/**
 * scripts/test-shoulder-press.js
 *
 * Shoulder press: counting + silence + framing, from the real device log
 * (scripts/fixtures/shoulder-press-2026-11-02.log.txt).
 *
 * Part 1  replays that log through lib/repDiagnostics.ts (the REAL file) and
 *         shows the "silent" stretch before the fix vs after.
 * Part 2  the return-to-start rule. The rule itself lives in Swift
 *         (ExerciseEngine .inRep), which cannot run here, so this is a faithful
 *         MIRROR of its decision logic run on synthetic press trajectories:
 *         it demonstrates the old rule counting on the way UP and the new
 *         rule counting only back at the start. The device proof is the
 *         [REP-WAIT] / [REP-GATE] / [SETUP ... NOT ready] log lines (see the
 *         summary at the end).
 * Part 3  the constants shipped in constants/exerciseDefinitions.ts apply to
 *         every exercise in the shoulder-press group.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

// ── Part 1: replay the real log ─────────────────────────────────────────────
function loadDiag(src, dir) {
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const file = path.join(dir, 'repDiagnostics.js');
  fs.writeFileSync(file, js);
  return require(file);
}
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'diag-'));
fs.writeFileSync(path.join(tmp, 'liveTracking.js'),
  ts.transpileModule(fs.readFileSync(path.join(ROOT, 'lib', 'liveTracking.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText);
const NEW = loadDiag(fs.readFileSync(path.join(ROOT, 'lib', 'repDiagnostics.ts'), 'utf8'), tmp);
const oldTmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'diag-old-'));
fs.writeFileSync(path.join(oldTmp, 'liveTracking.js'), fs.readFileSync(path.join(tmp, 'liveTracking.js')));
const OLD = loadDiag(execSync('git show 1804d6b:lib/repDiagnostics.ts', { cwd: ROOT }).toString('utf8'), oldTmp);

const lines = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-02.log.txt'), 'utf8').split(/\r?\n/);
const events = [];
let started = false;
for (const l of lines) {
  const m = /^(\d\d):(\d\d):(\d\d\.\d+) \[log\] \[DEBUG\] (.*)$/.exec(l);
  if (!m) continue;
  const t = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  if (/DEF-LOAD\] loaded 'shoulderPress'/.test(m[4])) started = true;
  if (started) events.push({ t, msg: m[4] });
}
const t0 = events[0].t;

function replay(mod, streamDead) {
  let clock = 0; const realNow = Date.now; Date.now = () => 1e12 + clock;
  const d = mod.createRepDiagnostic(streamDead);
  const shown = []; // [t, msg]
  const repTimes = [];
  try {
    let i = 0;
    const end = events[events.length - 1].t + 3;
    for (let t = t0; t <= end; t += 0.1) {
      clock = (t - t0) * 1000;
      while (i < events.length && events[i].t <= t) {
        d.feed(events[i].msg);
        if (/^\[REP\] #\d+/.test(events[i].msg)) repTimes.push(events[i].t - t0);
        i++;
      }
      shown.push([t - t0, d.message()]);
    }
  } finally { Date.now = realNow; }
  return { shown, repTimes };
}
const oldRun = replay(OLD, 0.9), newRun = replay(NEW, 0.9);
const firstRep = newRun.repTimes[0];
console.log(`      real log: first rep counted ${firstRep.toFixed(1)}s after tracking started (reps at ${newRun.repTimes.map(t => t.toFixed(1)).join(', ')}s)`);
const silentWindow = (run) => run.shown.filter(([t]) => t >= 5 && t < firstRep);
const oldCueSecs = silentWindow(oldRun).filter(([, m]) => m).length / 10;
const newCueSecs = silentWindow(newRun).filter(([, m]) => m).length / 10;
const newMsgs = [...new Set(silentWindow(newRun).map(([, m]) => m).filter(Boolean))];
console.log(`      moving but nothing counted, 5s..${firstRep.toFixed(1)}s: old cue shown ${oldCueSecs.toFixed(1)}s, new cue shown ${newCueSecs.toFixed(1)}s (${newMsgs.join(' | ')})`);
check('REPRODUCED: before the fix the user got NO cue while moving and nothing counted', oldCueSecs === 0, `${oldCueSecs}s of cue`);
check('FIXED: now a cue is shown during that stretch', newCueSecs >= 2, `${newCueSecs}s of cue`);
const afterFirst = newRun.shown.filter(([t]) => t > newRun.repTimes[2] && t < newRun.repTimes[5] + 1.5);
check('no false cue while reps are being counted every ~1-2s', afterFirst.every(([, m]) => !m), `${afterFirst.filter(([, m]) => m).length} cue frames`);
const restSim = (() => {
  // resting in the rack position for 8s (wobble 52-70) after a rep: must stay quiet
  let clock = 0; const realNow = Date.now; Date.now = () => 1e12 + clock;
  const d = NEW.createRepDiagnostic(0.9); let bad = 0;
  try {
    d.feed('[METRIC] shoulderPress value=62.0 enter=68.0000 exit=72.0000 rom=55.0000 top=84.0 state=down phase=inRep');
    d.feed('[REP] #1 top=86.4 bottom=28.6 thr=55.0 swing=57.8 ROM=ok cue=GOOD');
    for (let t = 0; t < 8000; t += 330) {
      clock = t; d.feed(`[METRIC] shoulderPress value=${(61 + 8 * Math.sin(t / 700)).toFixed(1)} enter=68.0000 exit=72.0000 rom=55.0000 top=84.0 state=down phase=inRep`);
      if (d.message()) bad++;
    }
  } finally { Date.now = realNow; }
  return bad;
})();
check('no cue while just resting in the start position', restSim === 0, `${restSim} cue frames`);
check('a native [REP-WAIT] line gives the cue "Lower arms"', (() => {
  const d = NEW.createRepDiagnostic(0.9); let clock = 0; const rn = Date.now; Date.now = () => 1e12 + clock;
  try { d.feed('[METRIC] x value=60 top=84 rom=55'); clock = 2000; d.feed('[METRIC] x value=88 top=84 rom=55'); d.feed('[REP-WAIT] shoulderPress metric=88.0 is above exit but arms are not back at the start'); return d.message() === 'Lower arms'; }
  finally { Date.now = rn; }
})());
// Every rejected rep says WHY in plain words (never the useless "Rep not counted")
function reasonFor(exerciseId, rejectLine) {
  const d = NEW.createRepDiagnostic(0.9, exerciseId); let clock = 0; const rn = Date.now; Date.now = () => 1e12 + clock;
  try { d.feed('[METRIC] x value=60 top=84 rom=55'); clock = 2000; d.feed('[METRIC] x value=60 top=84 rom=55'); d.feed(rejectLine); return d.message(); }
  finally { Date.now = rn; }
}
const REAL_UNRELIABLE = '[REP] rejected — tracking unreliable for 4/4 frames (100%), not counted | joint conf (min-max over rep): leftShoulder=[0.34-0.50] leftElbow=[0.17-0.59] rightShoulder=[0.43-0.53] rightElbow=[0.21-0.43]';
const PHANTOM = '[REP] rejected — movement=3.0000 minSwing=8.7000 (start=64.0000 peak=61.0000) required=1.6 movementPastEntry=2 requiredPastEntry=1.6 (phantom)';
check('a rejected rep for tracking says "Can not see arms" (the real 11-10 line)', reasonFor('shoulderPress', REAL_UNRELIABLE) === "Can't see arms", reasonFor('shoulderPress', REAL_UNRELIABLE));
check('a too-small shoulder press says Press higher', reasonFor('shoulderPress', PHANTOM) === 'Press higher', reasonFor('shoulderPress', PHANTOM));
check('a too-shallow squat / push-up says "Go lower"', reasonFor('squat', PHANTOM) === 'Go lower' && reasonFor('pushup', PHANTOM) === 'Go lower');
check('a short curl / row says Pull higher; a lateral raise Raise higher', reasonFor('curl', PHANTOM) === 'Pull higher' && reasonFor('bentOverRow', PHANTOM) === 'Pull higher' && reasonFor('lateralRaise', PHANTOM) === 'Raise higher');
check('no exercise ever gets the bare "Rep not counted" any more', ['shoulderPress', 'squat', 'curl', 'lateralRaise', 'unknownThing'].every((id) => !/^Rep not counted$/.test(reasonFor(id, PHANTOM) + '') && !/^Rep not counted$/.test(reasonFor(id, REAL_UNRELIABLE) + '')));

// ── Feedback is 2-3 words, never "Hold still" while moving ────────────────────────────────────────────────────
{
  const { shortCue } = require('../lib/shortCue.ts');
  const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;
  const cues = ['SWINGING — control the weight', 'CHEST UP. Excessive forward lean', 'CONTROL IT. No swinging', 'KEEP ELBOWS STILL — compensation', 'GO DEEPER. Not reaching parallel',
    'PRESS HIGHER. Not reaching overhead', 'RUSHING — rep faster than your baseline', 'UNEVEN — one side lagging', 'STAY UPRIGHT, NO SWINGING', 'ELBOWS DOWN AND BACK, NOT OUT', 'Step into frame', 'Go lower'];
  const out = cues.map(shortCue);
  check('every feedback line is at most 3 words', out.every((t) => words(t) >= 1 && words(t) <= 3), out.join(' | '));
  check('"SWINGING — control the weight" becomes "Too much swing"', shortCue('SWINGING — control the weight') === 'Too much swing');
  const live = [NEW.CANT_SEE_REASON, NEW.shortMovementReason('shoulderPress'), NEW.shortMovementReason('squat'), NEW.shortMovementReason('curl'), NEW.shortMovementReason('lateralRaise'), NEW.shortMovementReason('x'), NEW.startHint('shoulderPress'), NEW.startHint('squat')];
  check('every diagnostic line is at most 3 words', live.every((t) => words(t) <= 3), live.join(' | '));
}
{
  // The old rule said "Hold still" after 4 "[SETTLE] still waiting" lines even while the person was moving.
  const run = (values) => {
    const d = NEW.createRepDiagnostic(0.9, 'shoulderPress'); let clock = 0; const rn = Date.now; Date.now = () => 1e12 + clock;
    try {
      d.feed('[METRIC] x value=64 top=84 rom=55'); clock = 2000;
      for (let i = 0; i < 5; i++) d.feed('[SETTLE] rejected — candidate=41.305 required>=57.900 — not a genuine starting position for this exercise, still waiting');
      for (const v of values) { clock += 300; d.feed('[METRIC] x value=' + v + ' top=84 rom=55'); }
      return d.message();
    } finally { Date.now = rn; }
  };
  const moving = run([64, 52, 40, 60, 81, 64, 45]);
  const still = run([64, 63.5, 64, 63.8, 64.1, 63.9, 64]);
  check('moving (doing reps / getting into place): never "Hold still"', moving === null, String(moving));
  check('standing still outside the start position: says where to be, not "Hold still"', still === 'Hands at shoulders', String(still));
}

// ── Part 2: return-to-start rule (mirror of the Swift logic) ────────────────
const ENTER = 68, EXIT = 72, CONFIRM = 3, START_MIN = 0.05, PEAK_MAX = 0.0;
function simulate(frames, gated) {
  let phase = 'top', inRepAt = null, gateMin = 999, confirm = 0; const counts = []; const waits = [];
  frames.forEach((f, i) => {
    if (phase === 'top') { if (f.angle < ENTER) { phase = 'rep'; gateMin = 999; confirm = 0; } return; }
    if (gated) {
      if (f.gap < gateMin) gateMin = f.gap;
      if (!(gateMin <= PEAK_MAX && f.gap >= START_MIN)) {
        if (f.angle > EXIT && !waits.includes(phase + gateMin)) waits.push(phase + gateMin); // [REP-WAIT]
        confirm = 0; return;
      }
    } else if (!(f.angle > EXIT)) { confirm = 0; return; }
    confirm++;
    if (confirm >= CONFIRM) { counts.push(i); phase = 'top'; confirm = 0; }
  });
  return { counts, waits: waits.length };
}
// One physical rep at 10 fps. elbow gap: + below shoulder. angle: undirected from vertical.
// rack (gap .30, angle 62) -> up through horizontal (gap 0, angle 90) with a pause there -> overhead (gap -.45, angle 25) -> back down.
function pressRep(opts = {}) {
  const f = [];
  const push = (n, a0, a1, g0, g1) => { for (let i = 0; i < n; i++) { const k = (i + 1) / n; f.push({ angle: a0 + (a1 - a0) * k, gap: g0 + (g1 - g0) * k }); } };
  push(6, 62, 62, 0.3, 0.3);          // rest in rack (angle already below enter)
  const top = opts.partial ? 0.12 : 0.0; // partial: elbows stop BELOW shoulder level (gap stays > peakMax)
  push(3, 62, 90, 0.3, top);          // up toward elbows level
  push(4, 90, 90, top, top);          // pause on the way up (>= 3 frames above exit)
  if (opts.partial) { push(4, 90, 90, 0.12, 0.12); push(4, 90, 62, 0.12, 0.3); push(8, 62, 62, 0.3, 0.3); return f; }
  push(4, 90, 25, 0.0, -0.45);        // overhead
  push(4, 25, 25, -0.45, -0.45);
  push(4, 25, 90, -0.45, 0.0);        // back down through horizontal
  push(3, 90, 62, 0.0, 0.3);          // down to the rack
  push(8, 62, 62, 0.3, 0.3);          // rest at the start
  return f;
}
const real = pressRep();
const oldR = simulate(real, false), newR = simulate(real, true);
const peakIdx = real.findIndex(f => f.gap <= -0.44);
const startIdx = real.length - 8; // arms back at the rack
console.log(`      one real rep (${real.length} frames, overhead at frame ${peakIdx}, back at start from frame ${startIdx - 3}): old rule counted at frames [${oldR.counts}], new rule at [${newR.counts}]`);
check('REPRODUCED: the old rule counts a rep while the arms are still going UP', oldR.counts.length >= 1 && oldR.counts[0] < peakIdx, `counted at frame ${oldR.counts[0]} < overhead frame ${peakIdx}`);
check('FIXED: the new rule counts exactly one rep per press', newR.counts.length === 1);
check('FIXED: ...and only after the arms are back down at the start', newR.counts[0] >= startIdx - 3 && real[newR.counts[0]].gap >= START_MIN, `frame ${newR.counts[0]}, elbow gap ${real[newR.counts[0]].gap.toFixed(2)}`);
const six = [].concat(...Array.from({ length: 6 }, () => pressRep()));
check('six presses count as six reps, never more', simulate(six, true).counts.length === 6, `${simulate(six, true).counts.length}`);
const part = simulate(pressRep({ partial: true }), true);
check('a press that never gets the elbows to shoulder level is not counted AND is flagged ([REP-WAIT])', part.counts.length === 0 && part.waits >= 1, `counts=${part.counts.length} waits=${part.waits}`);

// ── Part 3: shipped definitions ─────────────────────────────────────────────
const { EXERCISE_DEFINITIONS } = require('../constants/exerciseDefinitions.ts');
const GROUP = ['shoulderPress', 'overheadPress', 'arnoldPress', 'dumbbellShoulderPress', 'machineShoulderPress'];
for (const id of GROUP) {
  const d = EXERCISE_DEFINITIONS[id];
  check(`${id}: has the return-to-start gate`, !!d && d.startPositionGate && d.startPositionGate.startMin > 0 && d.startPositionGate.peakMax <= 0 && d.startPositionGate.metric.type === 'bestSide');
  check(`${id}: setup needs shoulders+elbows+wrists in view${id === 'machineShoulderPress' ? '' : ' + hips'}`,
    !!d && ['leftWrist', 'rightWrist', 'leftElbow', 'rightShoulder'].every(j => d.setupExtraJoints.includes(j)) && (id === 'machineShoulderPress' || d.setupExtraJoints.includes('leftHip')));
}
const json = JSON.parse(JSON.stringify(EXERCISE_DEFINITIONS.shoulderPress));
check('definition JSON (what native parses) carries startPositionGate + setupExtraJoints', json.startPositionGate && Array.isArray(json.setupExtraJoints));

console.log('\nDevice proof (look for these lines in latest.log after a shoulder press set):');
console.log('  [DEF-LOAD] ... startGate=yes setupExtraJoints=8');
console.log('  [SETUP] shoulderPress NOT ready: whole body not in view - missing leftWrist,... (standing too close)');
console.log('  [REP-WAIT] shoulderPress metric=88 is above exit but arms are not back at the start ...   (old rule would have counted here)');
console.log('  [REP-GATE] shoulderPress counted at the start position: gate=0.3xx ... then [REP] #n');
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
