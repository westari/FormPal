#!/usr/bin/env node
/**
 * scripts/test-attempts.js
 *
 * The attempt detector (lib/attemptDetector.ts) replayed over Ari's newest real log (2026-11-11 shoulder press: 4 reps counted,
 * then about two minutes of nothing while he kept pressing). The old diagnostic said "Press higher" the whole time. Here:
 *   - REPRODUCED: the old rule says "Press higher" (a fixed cue, for the wrong side of the movement)
 *   - FIXED: the stuck period gets the REAL blocker in 2-3 words, every attempt is rated and logged as [ATTEMPT], standing
 *     still produces no attempts, and an adapted range counts soft reps.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const AD = require('../lib/attemptDetector.ts');
const RD = require('../lib/repDiagnostics.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const lines = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-11.log.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, text: m[4] } : null; };
const rows = lines.map(parse).filter(Boolean);

function replay(make, startAtSec = 0, endAtSec = 1e9) {
  const realNow = Date.now; let clock = 0; Date.now = () => clock;
  const logs = [], events = [], cues = [];
  const det = make(() => clock, (m) => logs.push(`${((clock / 1000) % 86400).toFixed(1)} ${m}`));
  const t0 = rows[0].t;
  try {
    for (const r of rows) {
      clock = r.t;
      const rel = (r.t - t0) / 1000;
      if (rel < startAtSec || rel > endAtSec) continue;
      for (const ev of (det.feed ? det.feed(r.text) : [])) events.push({ at: rel, ev });
      cues.push({ at: rel, cue: det.cue ? det.cue() : det.message() });
    }
  } finally { Date.now = realNow; }
  return { det, logs, events, cues };
}

// REP #4 is the last counted rep; the stuck period starts right after
const rep4 = rows.findIndex((r) => /\[REP\] #4 /.test(r.text));
const t0 = rows[0].t, stuckFrom = (rows[rep4].t - t0) / 1000, endSec = (rows[rows.length - 1].t - t0) / 1000;
console.log(`  log: ${rows.length} lines, rep #4 counted at +${stuckFrom.toFixed(1)}s, the stuck period runs to +${endSec.toFixed(1)}s (${(endSec - stuckFrom).toFixed(0)}s)`);

// ── REPRODUCE: the old diagnostic ──────────────────────────────────────────────────────────────────────────────
function oldReplay() {
  const realNow = Date.now; let clock = 0; Date.now = () => clock; const seen = new Map();
  try {
    // the diagnostic as it was before the fixed fallback was removed (commit fd65d42)
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'olddiag-'));
    fs.writeFileSync(path.join(tmp, 'repDiagnostics.ts'), require('child_process').execSync('git show fd65d42:lib/repDiagnostics.ts', { cwd: path.join(__dirname, '..'), maxBuffer: 1 << 26 }).toString('utf8').replace("from './liveTracking'", "from '" + path.join(__dirname, '..', 'lib', 'liveTracking.ts').split(path.sep).join('/') + "'"));
    const OLD = require(path.join(tmp, 'repDiagnostics.ts'));
    const d = OLD.createRepDiagnostic(0.9, 'shoulderPress');
    for (const r of rows) { clock = r.t; d.feed(r.text); const m = d.message(); const rel = (r.t - t0) / 1000; if (rel > stuckFrom + 1 && m) seen.set(m, (seen.get(m) || 0) + 1); }
  } finally { Date.now = realNow; }
  return seen;
}
const oldSeen = oldReplay();
const oldTop = [...oldSeen.entries()].sort((a, b) => b[1] - a[1])[0];
console.log(`  old diagnostic during the stuck period: ${[...oldSeen.entries()].map(([k, v]) => `"${k}" x${v}`).join(', ')}`);
check('REPRODUCED (old rule from git): sat on "Press higher" for the stuck period (the user was pressing higher)', !!oldTop && oldTop[0] === 'Press higher', oldTop && oldTop[0]);

const newSeen = (() => { const realNow = Date.now; let clock = 0; Date.now = () => clock; const seen = new Map(); try { const d = RD.createRepDiagnostic(0.9, 'shoulderPress'); for (const r of rows) { clock = r.t; d.feed(r.text); const m = d.message(); if ((r.t - t0) / 1000 > stuckFrom + 1 && m) seen.set(m, (seen.get(m) || 0) + 1); } } finally { Date.now = realNow; } return seen; })();
check('the diagnostic no longer says "Press higher" during the stuck period', !newSeen.has('Press higher'), [...newSeen.keys()].join(', '));
// ── the detector ──────────────────────────────────────────────────────────────────────────────────────────────
const run = replay((now, log) => AD.createAttemptDetector({ exerciseId: 'shoulderPress', now, log }));
const attempts = run.events.filter((e) => e.ev.kind === 'attempt').map((e) => ({ at: e.at, ...e.ev }));
const stuck = run.events.filter((e) => e.ev.kind === 'stuck').map((e) => ({ at: e.at, ...e.ev }));
const adapt = run.events.filter((e) => e.ev.kind === 'adapt').map((e) => ({ at: e.at, ...e.ev }));
console.log(`  attempts found: ${attempts.length}; outcomes: ` + ['counted', 'rejected', 'missed', 'soft'].map((o) => `${o} ${attempts.filter((a) => a.outcome === o).length}`).join(', '));
for (const l of run.logs.slice(0, 14)) console.log('    ' + l);
const before = attempts.filter((a) => a.at <= stuckFrom + 1), during = attempts.filter((a) => a.at > stuckFrom + 1);
check('the first reps of the set are seen as attempts too (the engine counted 4: at least 3 are matched as counted attempts)', attempts.filter((a) => a.outcome === 'counted').length >= 3, attempts.filter((a) => a.outcome === 'counted').length + ' counted attempts');
check('every attempt is logged as an [ATTEMPT] line with score, low/high, outcome and blocker', run.logs.filter((l) => /\[ATTEMPT\] #\d+ score=\d+ low=/.test(l)).length === attempts.length && attempts.length > 0);
check('the stuck period shows attempts that were MISSED (not counted, not rejected)', during.some((a) => a.outcome === 'missed' || a.outcome === 'soft'), `${during.length} attempts after rep #4`);
check('every attempt has a score between 0 and 100', attempts.every((a) => a.score >= 0 && a.score <= 100));
check('the real blocker is found within ~15s of rep #4 (3 attempts in a row or 10s), as a 2-3 word cue', stuck.length > 0 && stuck[0].at - stuckFrom <= 20 && stuck[0].cue.split(' ').length <= 3 && stuck[0].cue.length > 0, stuck[0] ? `+${(stuck[0].at - stuckFrom).toFixed(1)}s "${stuck[0].cue}" (${stuck[0].blocker})` : 'none');
const cueSet = new Set(stuck.map((s) => s.cue));
check('the cue is NOT the old fixed "Press higher" repeated: it names the blocker', !stuck.some((s) => s.cue === 'Press higher') || cueSet.size > 1, [...cueSet].join(', '));
const cueFrames = run.cues.filter((c) => c.at > stuckFrom + 1 && c.cue);
check('a cue is shown during the stuck period, and never longer than the hold time at a stretch', cueFrames.length > 0, `${cueFrames.length} frames with a cue`);
check('all cues are 2-3 words', [...cueSet].every((c) => c.split(' ').length <= 3));

const softs = attempts.filter((a) => a.outcome === 'soft');
check('REAL reps count: strokes that fully met the engines own lines (below 50, back above 58) while the engine had paused itself are counted', softs.length >= 2 && softs.every((a) => a.low <= 50 && a.high >= 58), softs.length + ' soft reps: ' + softs.map((a) => a.low.toFixed(0) + '->' + a.high.toFixed(0)).join(', '));
check('strokes that did NOT reach the line are not counted (lows of 61-68 stay missed)', attempts.filter((a) => a.at > stuckFrom + 1 && a.low > 52 && a.high >= 58).every((a) => a.outcome !== 'soft' || a.low <= 50));
// ── standing still never produces attempts ─────────────────────────────────────────────────────────────────────
{
  const realNow = Date.now; let clock = 1e12; Date.now = () => clock;
  const det = AD.createAttemptDetector({ exerciseId: 'shoulderPress', now: () => clock });
  const seen = [];
  const jitter = [64, 63.5, 64.4, 63.8, 64.1, 63.2, 64.6, 63.9, 64.2, 63.7, 64.3, 62.9, 64.5, 63.6, 64.0, 63.4];
  try { for (let i = 0; i < 80; i++) { clock += 330; seen.push(...det.feed(`[METRIC] shoulderPress value=${jitter[i % jitter.length]} enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top`)); } } finally { Date.now = realNow; }
  check('standing still (a hand wobbling by a degree) produces NO attempts', seen.filter((e) => e.kind === 'attempt').length === 0, `${seen.length} events`);
}
// ── a clean set: every rep is an attempt and is counted ───────────────────────────────────────────────────────
{
  const realNow = Date.now; let clock = 1e12; Date.now = () => clock;
  const det = AD.createAttemptDetector({ exerciseId: 'shoulderPress', now: () => clock });
  const evs = [];
  const feedV = (v) => { clock += 330; evs.push(...det.feed(`[METRIC] shoulderPress value=${v} enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top`)); };
  try {
    for (let rep = 1; rep <= 5; rep++) {
      for (const v of [84, 80, 70, 55, 42, 40, 52, 66, 78, 86, 87]) feedV(v);
      clock += 100; det.feed(`[REP] #${rep} top=87 bottom=40 thr=55.0 swing=47 ROM=ok cue=GOOD`);
    }
  } finally { Date.now = realNow; }
  const at = evs.filter((e) => e.kind === 'attempt');
  check('a clean set of 5 real reps: attempts are found and are mostly counted ones', at.length >= 3 && at.filter((a) => a.outcome === 'counted').length >= at.length - 1, at.map((a) => a.outcome).join(','));
  check('a clean set never gets a stuck cue', !evs.some((e) => e.kind === 'stuck'));
}
// ── adaptation: the same low again and again just short of the line -> the range is adapted, then those reps count ──
{
  const realNow = Date.now; let clock = 1e12; Date.now = () => clock;
  const logs = [];
  const det = AD.createAttemptDetector({ exerciseId: 'shoulderPress', now: () => clock, log: (m) => logs.push(m) });
  const evs = [];
  const feedV = (v) => { clock += 330; evs.push(...det.feed(`[METRIC] shoulderPress value=${v} enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top`)); };
  try { for (let rep = 0; rep < 8; rep++) for (const v of [86, 80, 72, 62, 57, 56, 63, 72, 80, 86, 87]) feedV(v); } finally { Date.now = realNow; }
  const adaptEv = evs.find((e) => e.kind === 'adapt');
  const atts = evs.filter((e) => e.kind === 'attempt');
  console.log('    outcomes: ' + atts.map((a) => a.outcome).join(', '));
  check('lows that keep stopping at ~56 (line 50) are recognised as a consistent range and ADAPTED to (logged as placeholder)', !!adaptEv && adaptEv.side === 'bottom' && logs.some((l) => /ADAPT bottom/.test(l) && /PLACEHOLDER/.test(l)), adaptEv ? `enter ${adaptEv.enter.toFixed(1)}` : 'none');
  check('after adapting, those attempts count as soft reps (so the person is not stuck forever)', det.softReps() >= 1 && atts.some((a) => a.outcome === 'soft'), `soft ${det.softReps()}`);
  check('before adapting, each missed attempt carried a reason (never silent)', atts.filter((a) => a.outcome === 'missed').every((a) => a.reason && a.reason.split(' ').length <= 3), atts.filter((a) => a.outcome === 'missed').map((a) => a.reason).join(','));
}
// ── a far-off range is NOT adapted (that is form, not camera angle): the real cue is given instead ─────────────────
{
  const realNow = Date.now; let clock = 1e12; Date.now = () => clock;
  const det = AD.createAttemptDetector({ exerciseId: 'shoulderPress', now: () => clock });
  const evs = [];
  const feedV = (v) => { clock += 330; evs.push(...det.feed(`[METRIC] shoulderPress value=${v} enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top`)); };
  try { for (let rep = 0; rep < 6; rep++) for (const v of [86, 84, 80, 76, 74, 75, 80, 84, 86, 87]) feedV(v); } finally { Date.now = realNow; }
  check('a tiny wiggle at the top is not an attempt, so nothing is adapted and no wrong cue is shown', !evs.some((e) => e.kind === 'adapt') && !evs.some((e) => e.kind === 'stuck'));
}
// ── every attempt gets a check or an X with a plain reason (half reps included) ────────────────────────────────
function feedSeq(det, values, startAt, stepMs = 330) {
  const realNow = Date.now; let clock = startAt; Date.now = () => clock; const evs = [];
  try { for (const v of values) { clock += stepMs; evs.push(...det.feed('[METRIC] shoulderPress value=' + v + ' enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top')); } } finally { Date.now = realNow; }
  return { evs, t: clock };
}
{
  const t0 = 2e12; let clock = t0; const det = AD.createAttemptDetector({ exerciseId: 'shoulderPress', now: () => clock });
  const mkNow = () => clock;
  // half presses: from the shoulders up only part of the way (never near lockout 79)
  const half = []; for (let r = 0; r < 4; r++) half.push(62, 58, 55, 60, 66, 72, 74, 72, 66, 61);
  const realNow = Date.now; const evs = []; Date.now = () => clock;
  try { for (const v of half) { clock += 330; evs.push(...det.feed('[METRIC] shoulderPress value=' + v + ' enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top')); } clock += 3000; evs.push(...det.feed('[METRIC] shoulderPress value=62 enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top')); } finally { Date.now = realNow; }
  const at = evs.filter((e) => e.kind === 'attempt');
  console.log('    half presses: ' + at.map((a) => a.outcome + '/' + a.blocker + '/"' + a.reason + '"').join(', '));
  check('HALF REPS get a reaction: every half press (not high enough) is an attempt, missed, with the reason "Go higher"', at.length >= 3 && at.every((a) => a.outcome === 'missed' && a.blocker === 'top-short' && a.reason === 'Go higher'), at.map((a) => a.reason).join(','));
}
{
  let clock = 2e12; const det = AD.createAttemptDetector({ exerciseId: 'shoulderPress', now: () => clock });
  const realNow = Date.now; const evs = []; Date.now = () => clock;
  try { for (let r = 0; r < 3; r++) for (const v of [86, 82, 74, 66, 61, 60, 63, 72, 82, 86, 87]) { clock += 330; evs.push(...det.feed('[METRIC] shoulderPress value=' + v + ' enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top')); } clock += 3000; evs.push(...det.feed('[METRIC] shoulderPress value=86 enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top')); } finally { Date.now = realNow; }
  const at = evs.filter((e) => e.kind === 'attempt' && e.outcome === 'missed');
  check('a rep that tops out fine but does not come down far enough gets "Go lower"', at.length >= 2 && at.every((a) => a.blocker === 'bottom-short' && a.reason === 'Go lower'), at.map((a) => a.reason).join(','));
  check('every missed attempt has a 1-3 word reason (never silent)', at.every((a) => a.reason && a.reason.split(' ').length <= 3));
}
// ── reaching for the phone / fumbling is not an attempt ───────────────────────────────────────────────────────────
{
  let clock = 2e12; const det = AD.createAttemptDetector({ exerciseId: 'shoulderPress', now: () => clock });
  const realNow = Date.now; const evs = []; Date.now = () => clock;
  const f = (v) => { clock += 330; evs.push(...det.feed('[METRIC] shoulderPress value=' + v + ' enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top')); };
  try {
    for (const v of [64, 63, 64, 64, 63]) f(v);                                  // resting at the shoulders
    for (const v of [58, 50, 42, 34, 26, 20, 18, 22, 30, 44, 58, 66]) f(v);      // arm drops toward the table (slow, far below this exercise's path) and comes back
    clock += 4000; f(64);
    for (const v of [64, 60, 52, 40, 30, 22, 15, 12, 16, 26, 40, 52]) f(v);      // reaching down and out to the table, a second time
    clock += 4000; f(64);
  } finally { Date.now = realNow; }
  const bad = evs.filter((e) => e.kind === 'attempt');
  const ign = evs.filter((e) => e.kind === 'ignored');
  console.log('    reaching / fumbling: ' + bad.length + ' attempts, ' + ign.length + ' ignored (' + ign.map((e) => e.why.slice(0, 38)).join(' | ') + ')');
  check('REACHING FOR THE PHONE: no attempt, so no check and no X (the movement does not match the exercise path)', bad.length === 0 && ign.length >= 1, bad.length + ' attempts');
  check('the detector remembers it saw a non-exercise movement, so a rep the engine counted at that moment can be taken back', det.recentlyIgnored(60000));
  const real = []; { let c2 = 2e12; const d2 = AD.createAttemptDetector({ exerciseId: 'shoulderPress', now: () => c2 }); const rn = Date.now; Date.now = () => c2; try { for (let r = 0; r < 3; r++) for (const v of [64, 60, 52, 44, 42, 50, 62, 74, 84, 87, 84, 74, 66]) { c2 += 330; real.push(...d2.feed('[METRIC] shoulderPress value=' + v + ' enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top')); } c2 += 3000; real.push(...d2.feed('[METRIC] shoulderPress value=64 enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=up phase=top')); } finally { Date.now = rn; } }
  check('a real press path is NOT ignored (the filter does not eat real reps)', real.filter((e) => e.kind === 'attempt').length >= 2 && real.filter((e) => e.kind === 'ignored').length === 0, real.filter((e) => e.kind === 'attempt').length + ' attempts, ' + real.filter((e) => e.kind === 'ignored').length + ' ignored');
}
// ── every cue a beginner can see is plain words, 2-3 of them ──────────────────────────────────────────────────────
{
  const { shortCue } = require('../lib/shortCue.ts');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const defs = read('constants/exerciseDefinitions.ts'), sents = read('lib/repFeedbackSentences.ts');
  const cues = new Set();
  for (const mm of defs.matchAll(/cue:\s*'((?:[^'\\]|\\.)*)'/g)) cues.add(mm[1].replace(/\\'/g, "'"));
  for (const mm of sents.matchAll(/^ {2,4}'([A-Z][^'\n]*)': \[/gm)) cues.add(mm[1]);
  const jargon = /compensation|baseline|parallel|lockout|flexion|torso|contraction|extension|concentric|eccentric|lateral|elbow flexion/i;
  const list = [...cues].filter((c) => c.length > 2);
  const out = list.map((c) => [c, shortCue(c)]);
  const tooLong = out.filter(([, o]) => o.split(/\s+/).length > 3), hard = out.filter(([, o]) => jargon.test(o));
  const AD2 = require('../lib/attemptDetector.ts'), RD2 = require('../lib/repDiagnostics.ts');
  const own = [];
  for (const b of ['bottom-short', 'top-short', 'tracking', 'paused', 'angle', 'light', 'none']) for (const ex of ['shoulderPress', 'squat', 'curl', 'lateralRaise', 'pushup']) own.push(AD2.blockerCue(b, ex));
  for (const ex of ['shoulderPress', 'squat', 'curl', 'lateralRaise', 'pushup', 'x']) own.push(RD2.shortMovementReason(ex), RD2.startHint(ex));
  own.push(RD2.CANT_SEE_REASON);
  const ownBad = [...new Set(own)].filter((o) => o.split(/\s+/).length > 3 || jargon.test(o));
  console.log('    ' + list.length + ' cue strings from the app + ' + new Set(own).size + ' of the detector / diagnostic: every one is shown in plain 2-3 words');
  check('every cue string in the app (' + list.length + ') is shown as 1-3 plain words', tooLong.length === 0, tooLong.slice(0, 4).map(([a, b]) => a + ' => ' + b).join(' | '));
  check('none of them uses gym jargon (compensation, baseline, parallel, lockout, flexion, torso...)', hard.length === 0, hard.slice(0, 4).map(([a, b]) => a + ' => ' + b).join(' | '));
  check('the detector and diagnostic cues are plain 2-3 words too ("Elbows lower" is gone)', ownBad.length === 0 && ![...own].some((o) => /^elbows lower$/i.test(o)), ownBad.join(', '));
  check('the words used for a short rep are exactly "Go higher" / "Go lower"', AD2.blockerCue('top-short', 'shoulderPress') === 'Go higher' && AD2.blockerCue('bottom-short', 'shoulderPress') === 'Go lower');
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
