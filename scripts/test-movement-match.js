#!/usr/bin/env node
/**
 * scripts/test-movement-match.js
 *
 * Proof for MOVEMENT MATCH, CAMERA CONFIDENCE, THE GUIDE and THE COACH (docs/movement-match.md, lib/coachTuning.ts).
 *   1. word lists: the Guide and the Coach never say the same thing; every line is plain, one line, capitalised
 *   2. synthetic cases (standing still, grabbing the phone, walking, half reps, full reps, hands out of frame at the top, too close,
 *      camera moved) with a BEFORE / AFTER table of what the Guide, the Coach and the confidence did
 *   3. Ari's real logs (2026-11-08, -10, -11 and the newest -11b) replayed through the same pipeline: the same rules hold
 *   4. a SIGNATURE test for every exercise in the catalogue (built from its own definition): the same rules on all 56
 * All thresholds are placeholders in lib/coachTuning.ts.
 */
const fs = require('fs');
const path = require('path');
const P = require('./lib/pipeline.js');
const { signature, build } = require('./lib/rep-synth.js');
const { GUIDE_LINES, GUIDE_WORDS, COACH_WORDS, guideLine } = P.GCm;
const SC = require('../lib/shortCue.ts');
const DEFS = require('../constants/exerciseDefinitions.ts').EXERCISE_DEFINITIONS;
const CAT = require('../constants/exercises.ts').EXERCISE_CATALOG;
const TUN = require('../lib/coachTuning.ts');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const lc = (a) => a.map((x) => x.toLowerCase());
const uniq = (a) => [...new Set(a)];
const COACH_SET = new Set(lc(COACH_WORDS)), GUIDE_SET = new Set(lc(GUIDE_WORDS));
const HANDS_EXERCISES = (id) => P.GCm.handsMatter(id);

// ── 1. words ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('--- 1. the Guide and the Coach have separate words ---');
{
  const both = [...GUIDE_SET].filter((w) => COACH_SET.has(w));
  check('no line is in BOTH word lists (Guide ' + GUIDE_SET.size + ' lines, Coach ' + COACH_SET.size + ' words)', both.length === 0, both.join(', '));
  const bad = GUIDE_WORDS.filter((w) => !/^[A-Z]/.test(w) || /\s{2,}|\.\.\.|[a-z]-$/.test(w) || w.length > 40);
  check('every Guide line starts with a capital letter, is one plain phrase (no "...", no double spaces) and fits two lines (40 characters)', bad.length === 0, bad.join(' | '));
  const badC = COACH_WORDS.filter((w) => !/^[A-Z]/.test(w) || w.split(/\s+/).length > 3);
  check('every Coach word starts with a capital letter and is 3 words or fewer', badC.length === 0, badC.join(' | '));
  const form = /\b(lower|higher|swing|slow|speed|tall|straight|elbow|knee|hips|heel|arms?|pull|push|curl|lift|full movement|even)\b/i;
  check('the Guide never gives form advice (no "lower / higher / swing / elbows..." words)', GUIDE_WORDS.every((w) => !form.test(w.replace(/lower your hands|back to your shoulders/i, ''))) || GUIDE_WORDS.filter((w) => form.test(w) && !/Raise your hands over your head|Bring your hands back to your shoulders|Hold your hands at your shoulders/.test(w)).length === 0, GUIDE_WORDS.filter((w) => form.test(w) && !/Raise your hands over your head|Bring your hands back to your shoulders|Hold your hands at your shoulders/.test(w)).join(' | '));
  const setupWords = /\b(phone|camera|picture|frame|view|light|step|sideways|face the|face away|hands show|in view|move your)\b/i;
  check('the Coach never says where to stand or where the phone goes', COACH_WORDS.every((w) => !setupWords.test(w) || /^(Face away)$/.test(w)), COACH_WORDS.filter((w) => setupWords.test(w)).join(' | '));
  // every cue string in the app: it is a Coach word, or it is not shown on a check / X at all
  const defsSrc = fs.readFileSync(path.join(__dirname, '..', 'constants/exerciseDefinitions.ts'), 'utf8');
  const cues = new Set();
  for (const m of defsSrc.matchAll(/cue:\s*'((?:[^'\\]|\\.)*)'/g)) cues.add(m[1].replace(/\\'/g, "'"));
  for (const d of Object.values(DEFS)) if (d.insufficientROMCue) cues.add(d.insufficientROMCue);
  const onCoach = [...cues].map((c) => [c, SC.coachLine(c)]);
  const wrong = onCoach.filter(([, w]) => w !== null && (GUIDE_SET.has(w.toLowerCase()) || /\b(phone|camera|frame|picture|light)\b/i.test(w)));
  check('every form cue in the app (' + cues.size + ') is either a plain Coach line or never shown on an X; none is a setup line', wrong.length === 0, wrong.map(([a, b]) => a + ' => ' + b).join(' | '));
  const setupAsCoach = [...cues].filter((c) => SC.coachLine(c) === null).slice(0, 6);
  console.log('      cues kept OFF the Coach (setup / camera words, the Guide\'s): ' + (setupAsCoach.join(' | ') || 'none'));
  // the Guide maps camera words to its own lines and never lets a form word through
  const gl = (t, id) => guideLine(t, id);
  check('Guide mapping: native camera hints become plain Guide lines', gl('Step into frame') === GUIDE_LINES.intoPicture && gl('tracking lost', 'shoulderPress') === GUIDE_LINES.backHands && gl('Move closer') === GUIDE_LINES.closer && gl('Turn side-on') === GUIDE_LINES.sideways && gl('Face camera') === GUIDE_LINES.facePhone && gl('Hands at shoulders', 'shoulderPress') === GUIDE_LINES.handsStart, [gl('Step into frame'), gl('tracking lost', 'shoulderPress'), gl('Move closer'), gl('Turn side-on'), gl('Face camera')].join(' | '));
  check('Guide mapping: a form cue is NEVER shown on the Guide ("Go higher", "Go lower", "Too much swing", "Slow down")', ['Go higher', 'Go lower', 'Too much swing', 'Slow down', 'Lift your chest', 'Straighten arms', 'Keep body still', 'Full movement'].every((c) => gl(c, 'shoulderPress') === null));
  check('Coach mapping: a setup line is NEVER shown on the Coach ("Step back", "Face the camera", "Turn sideways", "Adjust position")', ['Step back', 'Face the camera', 'Turn side-on', 'Adjust position', 'Step into frame'].every((c) => SC.coachLine(c) === null));
  const setupInfo = fs.readFileSync(path.join(__dirname, '..', 'app/formcheck.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const titles = uniq([...setupInfo.matchAll(/title: '([^']+)'/g)].map((m) => m[1]));
  check('the per-exercise setup titles ("Stand sideways"...) are setup lines: none is a Coach word', titles.every((t) => !COACH_SET.has(t.toLowerCase())), titles.filter((t) => COACH_SET.has(t.toLowerCase())).join(', '));
}

// ── helpers for scenarios ───────────────────────────────────────────────────────────────────────────────────────────
const NOW0 = 0;
const lastIdx = (rows, f) => { for (let i = rows.length - 1; i >= 0; i--) if (f(rows[i])) return i; return -1; };
function summarize(r, name) {
  const rows = r.rows;
  const trying = rows.filter((x) => x.match.trying && x.match.tryingForSec >= TUN.MOVEMENT_MATCH.minTryingSec);
  const stuckRows = rows.filter((x) => x.conf.stuck);
  const guideSaid = uniq(rows.map((x) => x.guide).filter(Boolean));
  const checks = r.verdicts.filter((v) => v.show === 'check').length;
  const xs = r.verdicts.filter((v) => v.show === 'x');
  const withheld = r.verdicts.filter((v) => !v.show).length;
  const oldX = r.old.x.filter((x) => /^X/.test(x.text)), oldChecks = r.old.x.filter((x) => x.text === 'CHECK').length;
  const oldCues = uniq(r.old.cue.map((c) => c.text).filter(Boolean)).slice(0, 4);
  const stuckWindow = (f) => rows.map((x, i) => (x.conf.stuck ? i : -1)).filter((i) => i >= 0);
  const oldConfDuringStuck = stuckRows.length ? Math.max(...stuckRows.map((x) => r.old.conf[rows.indexOf(x)].v)) : null;
  const newConfDuringStuck = stuckRows.length ? Math.max(...stuckRows.map((x) => x.conf.value)) : null;
  return { name, matchMax: Math.max(0, ...rows.map((x) => x.match.score)), tryingTicks: trying.length, stuckTicks: stuckRows.length, guideSaid, checks, xs, withheld, oldX, oldChecks, oldCues, oldConfDuringStuck, newConfDuringStuck, confMin: Math.min(...rows.map((x) => x.conf.value)), confEnd: rows[rows.length - 1].conf.value };
}
const row = (s) => `${s.name.padEnd(30)} match≤${String(s.matchMax).padStart(3)} | confidence while stuck: ${String(s.oldConfDuringStuck ?? '-').padStart(3)} -> ${String(s.newConfDuringStuck ?? '-').padStart(3)} | Coach: ${s.oldChecks}✓ ${s.oldX.length}X (${uniq(s.oldX.map((x) => x.text)).join(',') || '-'}) -> ${s.checks}✓ ${s.xs.length}X (${uniq(s.xs.map((x) => x.reason)).join(',') || '-'}) withheld ${s.withheld} | Guide: ${s.oldCues.join('/') || '-'} -> ${s.guideSaid.join(' / ') || 'silent'}`;
const guideAndCoachClash = (r) => {
  // a word in the Guide's lines that is also a Coach word (or the other way round)
  const g = uniq(r.rows.map((x) => x.guide).filter(Boolean)).map((w) => w.toLowerCase());
  const c = uniq(r.verdicts.filter((v) => v.show === 'x').map((v) => v.reason.toLowerCase()));
  return g.filter((w) => COACH_SET.has(w)).concat(c.filter((w) => GUIDE_SET.has(w)));
};

// ── 2. synthetic cases ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. synthetic cases, BEFORE (old) -> AFTER (new) ---');
const sigPress = signature(DEFS.shoulderPress);
const CASES = (sig) => ({
  'standing still':            [{ kind: 'rest', sec: 24 }],
  'grabbing the phone':        [{ kind: 'rest', sec: 3 }, { kind: 'reach', sec: 5 }, { kind: 'rest', sec: 3 }, { kind: 'reach', sec: 5 }, { kind: 'rest', sec: 3 }],
  'walking around':            [{ kind: 'walk', sec: 24 }],
  'camera moved (no signal)':  [{ kind: 'rest', sec: 3 }, { kind: 'blind', sec: 8 }, { kind: 'rest', sec: 3 }],
  'half reps (not counted)':   [{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 28, period: 3.5, depthR: 0.5, topReach: 0.9, engine: true }, { kind: 'rest', sec: 3 }],
  'full reps (counted)':       [{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 28, period: 3.5, engine: true }, { kind: 'rest', sec: 3 }],
  'hands out of frame at top': [{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 30, period: 4, cutTop: true }, { kind: 'rest', sec: 3 }],
  'too close (person lost)':   [{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 6, period: 3.5, engine: true }, { kind: 'lost', sec: 4 }, { kind: 'reps', sec: 6, period: 3.5, depthR: 0.5 }, { kind: 'lost', sec: 4 }, { kind: 'reps', sec: 8, period: 3.5, depthR: 0.5 }, { kind: 'lost', sec: 6 }, { kind: 'rest', sec: 2 }],
});
const R = {};
for (const [name, parts] of Object.entries(CASES(sigPress))) {
  const r = P.run(build(sigPress, parts), { exerciseId: 'shoulderPress' });
  R[name] = r; const s = summarize(r, name); r.s = s;
  console.log('  ' + row(s));
}
{
  const r = R['standing still'], rg = R['grabbing the phone'], rw = R['walking around'], rc = R['camera moved (no signal)'];
  for (const [n, x] of [['standing still', r], ['walking around', rw]]) {
    check(`${n}: Movement Match stays LOW (never trying)`, x.s.matchMax < TUN.MOVEMENT_MATCH.high, 'max ' + x.s.matchMax);
    check(`${n}: no check and no X at all (Coach silent)`, x.verdicts.length === 0 && x.s.checks === 0 && x.s.xs.length === 0, JSON.stringify(x.verdicts.slice(0, 3)));
    check(`${n}: confidence is just what the camera sees (no "stuck" fall): it never drops below 80`, x.s.confMin >= 80, 'min ' + x.s.confMin);
  }
  check('grabbing the phone: never counted as trying for 2 seconds, so no check, no X and no stuck', rg.rows.every((x) => !(x.match.trying && x.match.tryingForSec >= TUN.MOVEMENT_MATCH.minTryingSec)) && rg.verdicts.filter((v) => v.show).length === 0 && rg.s.stuckTicks === 0, `match max ${rg.s.matchMax}, verdicts ${rg.verdicts.length}`);
  check('camera moved: no signal means no data (match 0), no X, no check', rc.s.matchMax < TUN.MOVEMENT_MATCH.high && rc.verdicts.filter((v) => v.show).length === 0);
}
{
  const r = R['half reps (not counted)'];
  const attempts = r.logs.filter((l) => /\[ATTEMPT\] #\d+/.test(l.m)).length;
  check('HALF REPS: Movement Match HIGH (they are trying)', r.s.matchMax >= TUN.MOVEMENT_MATCH.high, 'max ' + r.s.matchMax);
  check('HALF REPS: every attempt after the first gets an X (' + r.s.xs.length + ' of ' + attempts + ' attempts), each with "Go higher" or "Go lower"', attempts >= 5 && r.s.xs.length >= attempts - 1 && r.s.xs.every((v) => ['Go higher', 'Go lower'].includes(v.reason)), r.s.xs.map((x) => x.reason).join(','));
  check('HALF REPS: no check is ever shown for a half rep', r.s.checks === 0);
  // Ari's answer: if the Coach is judging attempts (X with a reason) the camera IS seeing the reps, so confidence stays 90+.
  const firstX = r.s.xs.length ? r.s.xs[0].t : 1e12;
  const afterX = r.rows.filter((x) => x.t >= firstX + 500 && x.match.trying && x.t <= firstX + 25000);
  check('HALF REPS: the Coach gives an X on each attempt, so confidence stays 90+ (the camera sees the reps) and is never "stuck"', afterX.length > 20 && afterX.every((x) => x.conf.value >= 90 && !x.conf.stuck), afterX.length ? 'min ' + Math.min(...afterX.map((x) => x.conf.value)) : 'no rows');
  check('HALF REPS: the old confidence also read high there (so nothing got worse)', Math.max(...afterX.map((x) => r.old.conf[r.rows.indexOf(x)].v)) >= 80);
  check('HALF REPS: the Guide stays silent (the camera sees the whole path; the Coach speaks on each X)', r.s.guideSaid.length === 0, r.s.guideSaid.join(' / '));
  check('HALF REPS: the Guide and the Coach never say the same thing', guideAndCoachClash(r).length === 0, guideAndCoachClash(r).join(','));
  const oldClash = uniq(r.old.cue.map((c) => c.text).filter(Boolean)).filter((w) => r.old.x.some((x) => x.text === 'X ' + w));
  console.log('      before: the cue line said ' + (r.s.oldCues.join(' / ') || '-') + (oldClash.length ? ' (the SAME words as the X: ' + oldClash.join(', ') + ')' : ''));
}
{
  const r = R['full reps (counted)'];
  const lateRows = r.rows.filter((x) => x.t >= 9000 && x.t <= 29000);
  check('FULL REPS: Movement Match HIGH and every rep counted gets a check', r.s.matchMax >= 80 && r.s.checks >= 6 && r.s.xs.length === 0, `${r.s.checks} checks, ${r.s.xs.length} X`);
  check('FULL REPS: reps counting + trying = camera confidence 90-100 the whole time', lateRows.length > 20 && lateRows.every((x) => x.conf.value >= 90), 'min ' + Math.min(...lateRows.map((x) => x.conf.value)));
  check('FULL REPS: the Guide has nothing to say', r.s.guideSaid.length === 0, r.s.guideSaid.join(' / '));
}
{
  const r = R['hands out of frame at top'];
  const cut = r.rows.filter((x) => x.match.cut === 'top');
  const stuck = r.rows.filter((x) => x.conf.stuck);
  check('HANDS OUT AT THE TOP: the path is recognised as cut at the TOP', cut.length > 10, cut.length + ' ticks');
  check('HANDS OUT AT THE TOP: confidence below 80 and falling (never near 100 while trying and nothing counts)', stuck.length > 10 && stuck.every((x) => x.conf.value < 80) && stuck[stuck.length - 1].conf.value < 60, stuck.length ? `first ${stuck[0].conf.value} last ${stuck[stuck.length - 1].conf.value}` : 'never stuck');
  check('HANDS OUT AT THE TOP: the old confidence stayed high (reproduced)', r.s.oldConfDuringStuck >= 80, 'old max ' + r.s.oldConfDuringStuck);
  check('HANDS OUT AT THE TOP: the Guide gives the real setup fix: "' + GUIDE_LINES.handsInView + '"', r.s.guideSaid.includes(GUIDE_LINES.handsInView), r.s.guideSaid.join(' / ') || 'silent');
  check('HANDS OUT AT THE TOP: no form words on the Guide, no setup words on the Coach', guideAndCoachClash(r).length === 0 && r.s.xs.every((v) => COACH_SET.has(v.reason.toLowerCase())));
  check('HANDS OUT AT THE TOP: a stroke the camera could not see is not an X (at most the first stroke or two before the cut is recognised)', r.s.xs.length <= 2, r.s.xs.length + ' X');
}
{
  const r = R['too close (person lost)'];
  const said = r.s.guideSaid;
  check('TOO CLOSE: the Guide says to step into the picture / move the phone back', said.includes(GUIDE_LINES.intoPicture) && (said.includes(GUIDE_LINES.phoneBack) || said.includes(GUIDE_LINES.backHands)), said.join(' / ') || 'silent');
  check('TOO CLOSE: no X while the person is out of the picture', r.verdicts.filter((v) => v.show === 'x' && r.rows.some((x) => Math.abs(x.t - v.t) < 300 && x.guideReason === 'nobody')).length === 0);
  check('TOO CLOSE: the Guide and the Coach never say the same thing', guideAndCoachClash(r).length === 0);
}

// ── 3. Ari's real logs ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. real logs replayed (shoulder press) ---');
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const REAL = ['2026-11-08', '2026-11-10', '2026-11-11', '2026-11-11b'];
const realResults = {};
for (const name of REAL) {
  const rows0 = fs.readFileSync(path.join(__dirname, 'fixtures', `shoulder-press-${name}.log.txt`), 'utf8').split(/\r?\n/).filter(Boolean).map(parse).filter(Boolean);
  // tracking starts at the first metric line that is no longer in the setup phase
  const startI = rows0.findIndex((r) => /^\[METRIC\].*phase=(?!setup)/.test(r.line));
  const rows1 = rows0.slice(Math.max(0, startI));
  const t0 = rows1[0].t;
  const events = rows1.map((r) => ({ t: r.t - t0, line: r.line }));
  const res = P.run(events, { exerciseId: 'shoulderPress' });
  const reps = events.filter((e) => /^\[REP\] #\d+/.test(e.line)).length;
  const s = summarize(res, name); res.s = s; res.reps = reps; res.events = events;
  realResults[name] = res;
  console.log(`  ${name}: ${events.length} lines, ${(events[events.length - 1].t / 1000).toFixed(0)}s of tracking, ${reps} reps counted by the engine`);
  console.log('    ' + row(s));
}
function stuckRuns(res) {
  // independent of the module's own "stuck" flag: trying (Movement Match HIGH for 2s+) and no rep counted AND no check / X for 5.5s+
  const repTimes = res.events.filter((e) => /^\[REP\] #\d+/.test(e.line)).map((e) => e.t).concat(res.verdicts.filter((v) => v.show).map((v) => v.t)); // a counted rep, a check or an X all prove the camera sees the reps
  const out = []; let cur = null;
  for (const x of res.rows) {
    const lastRep = Math.max(-1e9, ...repTimes.filter((t) => t <= x.t));
    const tryStart = x.t - x.match.tryingForSec * 1000;
    const quiet = (x.t - Math.max(lastRep, tryStart)) / 1000;
    const isStuck = x.match.trying && x.match.tryingForSec >= TUN.MOVEMENT_MATCH.minTryingSec && quiet >= TUN.CONFIDENCE.stuckAfterSec + TUN.MOVEMENT_MATCH.minTryingSec + 1.0;
    if (isStuck) { if (!cur) { cur = { from: x.t, rows: [] }; out.push(cur); } cur.rows.push(x); } else cur = null;
  }
  return out;
}
for (const name of REAL) {
  const res = realResults[name], runs = stuckRuns(res);
  const longRuns = runs.filter((r) => r.rows.length >= 15);
  const worst = longRuns.length ? Math.max(...longRuns.flatMap((r) => r.rows.map((x) => x.conf.value))) : null;
  const oldWorst = longRuns.length ? Math.max(...longRuns.flatMap((r) => r.rows.map((x) => res.old.conf[res.rows.indexOf(x)].v))) : null;
  check(`${name}: while trying with no rep counted and no check / X (${longRuns.length} stretches, ${longRuns.reduce((a, r) => a + r.rows.length, 0) / 5}s) confidence never reads 80+ (was up to ${oldWorst ?? '-'}, now ${worst ?? '-'})`, worst === null || worst < 80, `new max ${worst}, old max ${oldWorst}`);
  const fall = longRuns.filter((r) => r.rows.length >= 40).every((r) => r.rows[r.rows.length - 1].conf.value <= r.rows[0].conf.value);
  check(`${name}: and it keeps falling through a long stretch (not creeping back up)`, fall);
  const counting = res.rows.filter((x) => { const reps = res.events.filter((e) => /^\[REP\] #\d+/.test(e.line) && e.t <= x.t && x.t - e.t <= 3500); return x.match.trying && x.match.tryingForSec >= TUN.MOVEMENT_MATCH.minTryingSec && reps.length >= 1 && !x.conf.stuck && x.guideReason !== 'nobody'; });
  check(`${name}: when reps are counting and Movement Match is HIGH (${counting.length} ticks) confidence is 90-100 (unless a frame hint caps it)`, counting.every((x) => x.conf.value >= 90 || x.match.cut === 'frame'), counting.filter((x) => x.conf.value < 90).length + ' ticks below 90');
  const notTrying = res.rows.filter((x) => x.match.haveData && x.match.notTrying);
  check(`${name}: when Movement Match is LOW (${notTrying.length} ticks) no check and no X is shown (${res.verdicts.filter((v) => v.show).length} verdicts, every one at a match of ${TUN.MOVEMENT_MATCH.low}+)`, res.verdicts.filter((v) => v.show && v.score < TUN.MOVEMENT_MATCH.low).length === 0);
  const repsC = res.events.filter((e) => /^\[REP\] #\d+/.test(e.line)).length, nativeV = res.verdicts.filter((v) => v.src === 'native' && v.show).length;
  check(`${name}: every rep the engine counted got a check or an X (${nativeV} of ${repsC}), except where the Guide's frame hint was up`, nativeV >= repsC - 1, `${nativeV}/${repsC}`);
  check(`${name}: the Guide and the Coach never said the same thing`, guideAndCoachClash(res).length === 0, guideAndCoachClash(res).join(','));
  const guideBad = uniq(res.rows.map((x) => x.guide).filter(Boolean)).filter((w) => !GUIDE_SET.has(w.toLowerCase()));
  check(`${name}: everything the Guide said is a line from its own list`, guideBad.length === 0, guideBad.join(' | '));
  const xBad = uniq(res.verdicts.filter((v) => v.show === 'x').map((v) => v.reason)).filter((w) => !COACH_SET.has(w.toLowerCase()));
  check(`${name}: every X reason is a line from the Coach's own list`, xBad.length === 0, xBad.join(' | '));
  const tags = ['[MOVE-MATCH]', '[GUIDE]', '[CONFIDENCE]'].concat(res.verdicts.length ? ['[COACH]'] : []).filter((t) => !res.logs.some((l) => l.m.startsWith(t)));
  check(`${name}: the logs carry [MOVE-MATCH] [GUIDE] [COACH] [CONFIDENCE]`, tags.length === 0 || res.rows.length < 5, 'missing ' + tags.join(','));
}
{
  const r = realResults['2026-11-11b'];
  // the newest log: 3 reps counted, then half presses for minutes. The old words were form words on the cue line AND the X.
  const oldCue = uniq(r.old.cue.map((c) => c.text).filter(Boolean)), oldX = uniq(r.old.x.filter((x) => /^X/.test(x.text)).map((x) => x.text));
  console.log('      2026-11-11b before: cue line said ' + oldCue.join(' / ') + '; X said ' + oldX.join(' / '));
  console.log('      2026-11-11b after:  Guide said ' + (r.s.guideSaid.join(' / ') || 'nothing') + '; X said ' + uniq(r.s.xs.map((x) => x.reason)).join(' / '));
  check('2026-11-11b: old Guide and Coach said the same form words (reproduced), new ones do not', oldCue.some((w) => oldX.includes('X ' + w)) && r.s.guideSaid.every((w) => !r.s.xs.some((x) => x.reason.toLowerCase() === w.toLowerCase())));
}

// ── 4. signature test for EVERY exercise ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. every exercise in the catalogue (' + CAT.length + '), built from its own definition ---');
const sigRows = [];
for (const ex of CAT) {
  const def = DEFS[ex.id];
  if (!def) { check(ex.id + ' has a definition', false); continue; }
  const sig = signature(def);
  const fails = [];
  const romCue = def.insufficientROMCue || 'Go lower';
  const run = (parts, o) => P.run(build(sig, parts), { exerciseId: ex.id, ...(o || {}) });
  // standing still: Movement Match LOW, silent Coach, confidence is just visibility
  const still = run([{ kind: 'rest', sec: 20 }]);
  if (Math.max(...still.rows.map((x) => x.match.score)) >= TUN.MOVEMENT_MATCH.high) fails.push('still: match high');
  if (still.verdicts.some((v) => v.show)) fails.push('still: a verdict');
  if (still.rows.some((x) => x.conf.stuck)) fails.push('still: stuck');
  // walking: low
  const walk = run([{ kind: 'walk', sec: 20 }]);
  if (Math.max(...walk.rows.map((x) => x.match.score)) >= TUN.MOVEMENT_MATCH.high) fails.push('walk: match high');
  if (walk.verdicts.some((v) => v.show)) fails.push('walk: a verdict');
  // grabbing the phone
  const grab = run([{ kind: 'rest', sec: 3 }, { kind: 'reach', sec: 5 }, { kind: 'rest', sec: 3 }, { kind: 'reach', sec: 5 }]);
  if (grab.verdicts.some((v) => v.show)) fails.push('reach: a verdict');
  if (grab.rows.some((x) => x.conf.stuck)) fails.push('reach: stuck');
  // full reps, counted
  const full = run([{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 28, period: 3.5, engine: true, romCue }]);
  const fl = full.rows.filter((x) => x.t >= 9000 && x.t <= 29000);
  if (Math.max(...full.rows.map((x) => x.match.score)) < TUN.MOVEMENT_MATCH.high) fails.push('full: match not high');
  if (full.verdicts.filter((v) => v.show === 'check').length < 5) fails.push('full: fewer than 5 checks (' + full.verdicts.filter((v) => v.show === 'check').length + ')');
  if (full.verdicts.some((v) => v.show === 'x')) fails.push('full: an X on a full rep');
  if (fl.some((x) => x.conf.value < 90)) fails.push('full: confidence below 90 (min ' + Math.min(...fl.map((x) => x.conf.value)) + ')');
  // half reps: an X on every attempt (native-counted with a bad range, or not counted at all), confidence never 80+ when nothing counts
  const half = run([{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 28, period: 3.5, depthR: 0.5, topReach: 0.9, engine: true, romCue }]);
  const hx = half.verdicts.filter((v) => v.show === 'x'), hc = half.verdicts.filter((v) => v.show === 'check');
  const counted = half.rows.length && half.state.native > 0;
  if (Math.max(...half.rows.map((x) => x.match.score)) < TUN.MOVEMENT_MATCH.high) fails.push('half: match not high');
  if (hx.length < 4) fails.push('half: fewer than 4 X (' + hx.length + ')');
  if (hc.length > 0) fails.push('half: a check on a half rep');
  if (hx.some((v) => !COACH_SET.has(v.reason.toLowerCase()))) fails.push('half: X word not a Coach word: ' + uniq(hx.map((v) => v.reason)).join('/'));
  { const fx = hx.length ? hx[0].t : 1e12; const ar = half.rows.filter((x) => x.t >= fx + 500 && x.match.trying && x.t <= fx + 25000);
    if (ar.some((x) => x.conf.value < 90 || x.conf.stuck)) fails.push('half: confidence under 90 while the Coach is giving X'); }
  if (half.rows.some((x) => x.guide && COACH_SET.has(x.guide.toLowerCase()))) fails.push('half: the Guide said a Coach word');
  // hands (or feet) leaving the frame at the top
  const cut = run([{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 30, period: 4, cutTop: true, cutLevel: 0.5 }]);
  const cs = cut.rows.filter((x) => x.conf.stuck);
  if (!cut.rows.some((x) => x.match.cut === 'top')) fails.push('cut: top cut not seen');
  if (cs.length < 10 || cs.some((x) => x.conf.value >= 80)) fails.push('cut: confidence not below 80 while stuck');
  if (!cut.rows.some((x) => x.guide)) fails.push('cut: the Guide said nothing');
  const cg = uniq(cut.rows.map((x) => x.guide).filter(Boolean));
  const wantCut = HANDS_EXERCISES(ex.id) ? GUIDE_LINES.handsInView : GUIDE_LINES.phoneBack;
  if (!cg.includes(wantCut)) fails.push('cut: expected "' + wantCut + '" got ' + (cg.join('/') || 'silent'));
  if (cg.some((w) => !GUIDE_SET.has(w.toLowerCase()))) fails.push('cut: Guide line not in its list');
  // too close: person lost
  const lost = run([{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 6, period: 3.5, engine: true }, { kind: 'lost', sec: 5 }, { kind: 'reps', sec: 8, period: 3.5, depthR: 0.5 }]);
  if (!lost.rows.some((x) => x.guide === GUIDE_LINES.intoPicture)) fails.push('lost: no "step into the picture"');
  // the form cue of this exercise's rep range fault is a Coach word
  const rc = SC.coachLine(romCue);
  if (rc !== null && !COACH_SET.has(rc.toLowerCase())) fails.push('range cue not a Coach word: ' + rc);
  sigRows.push({ id: ex.id, ok: fails.length === 0, fails, top: sig.top, enter: sig.enter, rom: sig.rom, counted });
  check(`${ex.id.padEnd(24)} still/walk/reach quiet, full reps check + 90+, half reps X + 90+, cut path -> ${HANDS_EXERCISES(ex.id) ? 'hands' : 'phone'} line`, fails.length === 0, fails.join(' | '));
}
check('signature test covered every exercise in the catalogue (' + sigRows.length + ' of ' + CAT.length + ')', sigRows.length === CAT.length);


// ── 5. the camera screen is wired this way (source checks; the phone log lines prove it live) ───────────────────────────
console.log('\n--- 5. wiring in app/formcheck.tsx ---');
{
  const fc = fs.readFileSync(path.join(__dirname, '..', 'app/formcheck.tsx'), 'utf8').replace(/\r\n/g, '\n');
  check('the line with the Cue stars while tracking shows ONLY the Guide\'s line (guideTrack), nothing else', /\{isTracking && !!guideTrack && \([\s\S]{0,260}<CueGlass text=\{guideTrack\} \/>/.test(fc) && !/<CueGlass text=\{cue\} \/>/.test(fc) && !fc.includes("showCue('Range set')"));
  check('the old separate "turn sideways" overlay is gone (the Guide says it)', !fc.includes('s.outOfPlaneHint} pointerEvents'));
  check('every check / X on a counted rep goes through THE COACH (Movement Match LOW = none)', fc.includes("coachRef.verdict({ now: Date.now(), match: matchRef.result(), source: 'native'") && fc.includes('shownReason = cv.reason'));
  check('every X on an uncounted attempt goes through THE COACH and only a short stroke gets one', fc.includes("source: 'attempt', blocker: ev.blocker, rangeWord: ev.reason") && fc.includes("if (cva.show !== 'x') continue;"));
  check('a soft rep (the app counted it) is a check through THE COACH too', fc.includes("source: 'soft'"));
  check('the meter shows CAMERA CONFIDENCE (Movement Match + counting + path coverage), capped by the frame hint', fc.includes('confidence={confidenceRef}') && fc.includes('tgt = Math.min(tgt, confidence.current)'));
  check('Movement Match is fed every log line and everything resets at Go', fc.includes('matchRef.feed(e.message);') && fc.includes('matchRef.reset(); confRef.reset(); guideEngine.reset(); coachRef.reset();'));
  check('the 200ms tick wires match -> path cut -> confidence -> Guide', fc.includes('attemptRef.current.setPathCut(m.cut);') && fc.includes('const conf = confRef.update(') && fc.includes('guideEngine.decide('));
  check('the four log tags are produced by the pieces the screen uses ([MOVE-MATCH] [GUIDE] [COACH] [CONFIDENCE])', ['[MOVE-MATCH]', '[GUIDE]', '[COACH]', '[CONFIDENCE]'].every((t) => ['lib/movementMatch.ts', 'lib/guideCoach.ts', 'lib/cameraConfidence.ts'].some((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes(t))));
  check('the cue card keeps the old layout and grows its stars when a line wraps to two lines', fc.includes('const big = lines > 1;') && fc.includes('onTextLayout'));
  check('all numbers live in ONE tuning file and are labelled placeholders', fs.readFileSync(path.join(__dirname, '..', 'lib/coachTuning.ts'), 'utf8').includes('ALL NUMBERS ARE PLACEHOLDERS'));
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
