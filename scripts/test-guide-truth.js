#!/usr/bin/env node
/**
 * scripts/test-guide-truth.js
 *
 * Ari 2026-11-15/16: he did half reps with his hands in the picture the whole time and the Guide said "Keep your hands in view" (wrong, and slow).
 * A Guide tip must come from EVIDENCE:
 *   "Keep your hands in view"  only when the hands / arms are really lost or poorly seen at some point of the stroke
 *   "Step back further"        only when the body is cut off or too big in the frame
 *   "Find more light"          only on low light / low joint quality overall
 *   every joint seen + strokes just short = a FORM problem: the Guide is quiet, the Coach's half-rep X handles it
 * and when there IS a real camera problem it speaks after about 3 seconds. Every [GUIDE] line carries its evidence.
 */
const fs = require('fs');
const path = require('path');
const P = require('./lib/pipeline.js');
const { signature, build } = require('./lib/rep-synth.js');
const GC = require('../lib/guideCoach.ts');
const DEFS = require('../constants/exerciseDefinitions.ts').EXERCISE_DEFINITIONS;
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const L = GC.GUIDE_LINES;

// ── 1. Ari's real logs: hands in view all the time, strokes short ──
console.log('--- 1. the real logs: half reps, every joint seen ---');
for (const name of ['2026-11-15', '2026-11-15b']) {
  const rows0 = fs.readFileSync(path.join(__dirname, 'fixtures', `shoulder-press-${name}.log.txt`), 'utf8').split(/\r?\n/).filter(Boolean).map(parse).filter(Boolean);
  const i0 = rows0.findIndex((r) => /^\[METRIC\].*phase=(?!setup)/.test(r.line));
  const rows1 = rows0.slice(Math.max(0, i0)); const t0 = rows1[0].t;
  const events = rows1.map((r) => ({ t: r.t - t0, line: r.line }));
  const res = P.run(events, { exerciseId: 'shoulderPress' });
  const setRows = res.rows.filter((r) => r.t < (name === "2026-11-15" ? 46000 : 70000));   // the set itself (after it he drops his arms and walks to the phone to stop: that is a real "step back")
  const said = [...new Set(setRows.filter((r) => r.guide && r.guideReason !== 'nobody').map((r) => r.guide))];
  const half = res.verdicts.filter((v) => v.src === 'missed').length;
  console.log(`  ${name}: ${(events[events.length - 1].t / 1000).toFixed(0)} s, ${half} half-rep strokes, Guide said: ${said.join(' / ') || '(nothing)'}`);
  check(`${name}: with every joint seen, the Guide never says "Keep your hands in view", "Step back further" or "Find more light" during the half reps`, !said.some((l) => [L.handsInView, L.backHands, L.moreLight, L.bodyInView, L.phoneBack].includes(l)), said.join(' / '));
  const stuckTicks = setRows.filter((r) => r.guideReason === 'range-only' && r.guide);
  check(`${name}: "range-only" (strokes just short, camera fine) produces NO Guide line at all`, stuckTicks.length === 0);
  check(`${name}: the decision explains itself: the evidence says every joint is seen (a form problem, the Coach's job)`, res.rows.some((r) => /every joint is seen/.test(r.guideEvidence || '')));
}

// ── 2. real problems, proven by evidence, spoken in about 3 seconds ──
console.log('\n--- 2. real camera problems ---');
const sig = signature(DEFS.shoulderPress);
function firstSaid(res, line) { const r = res.rows.find((x) => x.guide === line); return r ? r.t : null; }
{
  // hands out of the picture near the top of every stroke: the metric samples stop there
  const parts = [{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 30, period: 4, cutTop: true }, { kind: 'rest', sec: 3 }];
  const ev = build(sig, parts);
  const res = P.run(ev, { exerciseId: 'shoulderPress' });
  const first = firstSaid(res, L.handsInView);
  const cutStart = (ev.find((e, i) => i > 0 && ev[i].t - ev[i - 1].t > 800 && ev[i].t > 2000) || { t: 2000 }).t;
  const sayRow = res.rows.find((x) => x.guide === L.handsInView);
  console.log(`  hands lost at the top: first gap at ~${(cutStart / 1000).toFixed(1)} s, the Guide speaks at ${first === null ? 'never' : (first / 1000).toFixed(1) + ' s'}; evidence: ${sayRow ? sayRow.guideEvidence : '-'}`);
  check('HANDS LOST at the top of the stroke: "Keep your hands in view"', first !== null);
  check('...and it speaks within about 3 s of the first lost-hands moment (not 5 s + 2 s as before)', first !== null && first - cutStart <= 3500, `${first === null ? 'never' : ((first - cutStart) / 1000).toFixed(1) + ' s after'}`);
  check('...with the evidence in the log line: the samples stopped near the TOP', !!sayRow && /near the TOP/.test(sayRow.guideEvidence), sayRow && sayRow.guideEvidence);
  const logLines = res.logs.filter((l) => /\[GUIDE\] says "Keep your hands in view"/.test(l.m));
  check('the [GUIDE] log line carries its evidence, and no line says "no exact cause found"', logLines.some((l) => /because real camera problem, evidence: /.test(l.m)) && !res.logs.some((l) => /no exact cause/.test(l.m)), logLines[0] && logLines[0].m.slice(0, 160));
}
{
  // person lost (too big / out of the frame): the body is cut
  const ev = build(sig, [{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 6, period: 3.5, engine: true }, { kind: 'lost', sec: 4 }, { kind: 'reps', sec: 6, period: 3.5 }, { kind: 'lost', sec: 5 }, { kind: 'rest', sec: 2 }]);
  const res = P.run(ev, { exerciseId: 'shoulderPress' });
  const said = [...new Set(res.rows.filter((r) => r.guide).map((r) => r.guide))];
  check('PERSON LOST after being seen (too close / too big): "Back up" or "Move your phone back", never "Keep your hands in view"', said.some((l) => [L.backUp, L.phoneBack, L.backHands].includes(l)) && !said.includes(L.handsInView), said.join(' / '));
}
{
  // the camera rejected a rep: low joint quality. Which joints decides the words.
  const mk = (joints) => build(sig, [{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 12, period: 3.5, engine: true }]).concat([{ t: 9000, line: `[REP] rejected — tracking unreliable for 30/40 frames (75%), not counted | joint conf (min-max over rep): ${joints}` }]).sort((a, b) => a.t - b.t);
  const arms = P.run(mk('leftShoulder=[0.80-0.95] leftElbow=[0.10-0.45] leftWrist=[0.05-0.40]'), { exerciseId: 'shoulderPress', endMs: 16000 });
  const legs = P.run(mk('leftShoulder=[0.80-0.95] leftHip=[0.05-0.30] leftKnee=[0.05-0.30]'), { exerciseId: 'shoulderPress', endMs: 16000 });
  const dark = P.run(mk('leftShoulder=[0.05-0.30] leftElbow=[0.05-0.30] leftWrist=[0.05-0.30]'), { exerciseId: 'shoulderPress', endMs: 16000 });
  const sa = [...new Set(arms.rows.filter((r) => r.guide).map((r) => r.guide))], sl = [...new Set(legs.rows.filter((r) => r.guide).map((r) => r.guide))], sd = [...new Set(dark.rows.filter((r) => r.guide).map((r) => r.guide))];
  check('LOW QUALITY on the elbow / wrist: "Keep your hands in view" (the joints are named in the evidence)', sa.includes(L.handsInView) && arms.rows.some((r) => /leftWrist/.test(r.guideEvidence || '')), sa.join(' / '));
  check('LOW QUALITY on hips / knees: "Keep your whole body in view" (NOT the hands)', sl.includes(L.bodyInView) && !sl.includes(L.handsInView), sl.join(' / '));
  check('every joint poorly seen (best under 0.45): "Find more light"', sd.includes(L.moreLight), sd.join(' / '));
  const t = arms.rows.find((r) => r.guide === L.handsInView);
  check('...and it speaks within about 3 s of the rejected rep (at 9 s)', !!t && t.t - 9000 <= 3200, t && ((t.t - 9000) / 1000).toFixed(1) + ' s after');
}
{
  // quiet unless proven: plain half reps, all joints seen
  const ev = build(sig, [{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 28, period: 3.5, depthR: 0.5, topReach: 0.9 }, { kind: 'rest', sec: 3 }]);
  const res = P.run(ev, { exerciseId: 'shoulderPress' });
  check('SYNTHETIC half reps with every joint seen: the Guide stays completely quiet', res.rows.every((r) => !r.guide), [...new Set(res.rows.filter((r) => r.guide).map((r) => r.guide))].join(' / '));
}
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'guideCoach.ts'), 'utf8');
  check('the old "general framing nudge" fallback is gone (no tip without a proven cause)', !/general framing nudge/.test(src) && /default:\s+return null;/.test(src));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
