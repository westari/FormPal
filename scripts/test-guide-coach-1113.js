#!/usr/bin/env node
/**
 * scripts/test-guide-coach-1113.js
 *
 * Ari's phone test 2026-11-13 (log: scripts/fixtures/shoulder-press-2026-11-13.log.txt, the camera session 01:06-01:08 UTC), replayed through
 * the same pipeline the camera screen uses (scripts/lib/pipeline.js). The phone ran the OLD Oct 8 native build; Movement Match works on it
 * (the log has 78 [MOVE-MATCH] lines, TRYING while he pressed), so the same JS runs on both builds.
 *
 *   2. the camera's own "step back" signal flickers while he stands still: it only counts once it has held 1.5 s
 *   3. every counted rep gets a check (or the swing X)
 *   4. standing still never gets an X ("Go lower" at 07:02 came from a 0.37R wiggle after the reps)
 *   5. a real half rep still gets an X
 *   6. trying and nothing counts: the Guide speaks (it used to be silent for 'range-only')
 */
const fs = require('fs');
const path = require('path');
const P = require('./lib/pipeline.js');
const GC = require('../lib/guideCoach.ts');
const TUN = require('../lib/coachTuning.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const rows0 = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-13.log.txt'), 'utf8').split(/\r?\n/).filter(Boolean).map(parse).filter(Boolean);
const startI = rows0.findIndex((r) => /^\[METRIC\].*phase=(?!setup)/.test(r.line));
const rows1 = rows0.slice(Math.max(0, startI));
const t0 = rows1[0].t;
const events = rows1.map((r) => ({ t: r.t - t0, line: r.line }));
const res = P.run(events, { exerciseId: 'shoulderPress' });
const repTimes = events.filter((e) => /^\[REP\] #\d+/.test(e.line)).map((e) => e.t);
const near = (t, list, ms) => list.some((x) => Math.abs(x.t - t) <= ms);
console.log(`replayed ${events.length} lines, ${(events[events.length - 1].t / 1000).toFixed(0)}s, ${repTimes.length} engine rep lines`);

// 3. every counted rep gets a check (a rep with a form fault gets its X instead)
{
  const missing = repTimes.filter((t) => !res.verdicts.some((v) => v.src === 'native' && Math.abs(v.t - t) <= 300 && v.show));
  check('EVERY counted rep gets a check (or the form X): none withheld', missing.length === 0, missing.length ? 'withheld at ' + missing.map((t) => (t / 1000).toFixed(1) + 's').join(', ') : repTimes.length + ' of ' + repTimes.length);
}
// 4. standing still: no X
{
  const still = res.verdicts.filter((v) => v.show === 'x' && v.src === 'attempt');
  check('STANDING STILL: no "Go lower" X from the 0.37R wiggle after the first reps (the old log gave one at 07:02:35)', !still.some((v) => Math.abs(v.t - 28000) < 2000), still.map((v) => (v.t / 1000).toFixed(1) + 's ' + v.reason).join(', '));
  // an X is never shown when the path has not moved for the last 2.5 s AND Movement Match is LOW
  const bad = res.verdicts.filter((v) => v.show === 'x' && v.src === 'attempt').filter((v) => { const row = res.rows.reduce((a, b) => (Math.abs(b.t - v.t) < Math.abs(a.t - v.t) ? b : a)); return row.match.notTrying; });
  check('no X while Movement Match says he is not trying', bad.length === 0);
}
// 5. a real half rep (the 07:37 slow press, 0.4R+) gets its X
{
  const xs = res.verdicts.filter((v) => v.show === 'x' && v.src === 'attempt');
  check('HALF REP: a real half rep (low 73, high 85, a 12-degree stroke) now gets "Go lower" (before: thrown out as "stays up near the top")', xs.some((v) => v.reason === 'Go lower' && v.t > 55000 && v.t < 70000), xs.map((v) => (v.t / 1000).toFixed(1) + 's ' + v.reason).join(', '));
  const tiny = res.logs.filter((l) => /\[COACH\] withheld: the stroke was tiny/.test(l.m));
  check('the wiggle is withheld WITH a reason in the log ([COACH] withheld: the stroke was tiny)', tiny.length >= 1, tiny.length + ' line(s)');
}
// 6. trying and nothing counts -> the Guide speaks
{
  const moving = res.rows.filter((r) => r.conf.stuck && r.match.movingNow);
  let silentRun = 0, worst = 0;
  for (const r of res.rows) { if (r.conf.stuck && r.match.movingNow && !r.guide) { silentRun += 200; worst = Math.max(worst, silentRun); } else silentRun = 0; }
  check('TRYING, NOTHING COUNTS: the Guide is never silent for more than 1 second while stuck and moving', moving.length > 0 && worst <= 1000, `${moving.length} stuck+moving ticks, longest silence ${worst}ms`);
  const said = [...new Set(res.rows.filter((r) => r.conf.stuck && r.guide).map((r) => r.guide))];
  check('...with a plain Guide line (never a form word)', said.length > 0 && said.every((l) => GC.GUIDE_WORDS.includes(l)), said.join(' / '));
  const restStuck = res.rows.filter((r) => r.conf.stuck && !r.match.movingNow && !r.match.cut && r.guide && r.guideReason !== 'hint' && r.guideReason !== 'nobody');
  check('a REST is never read as trying: no stuck Guide line while the path is still', restStuck.length === 0, restStuck.length + ' ticks');
}
// 2. the camera's "step back" flicker
{
  const hold = GC.createCueHold();
  let shown = false;
  for (let t = 0; t < 1400; t += 200) shown = shown || hold.feed(t, true);          // a flicker shorter than 1.5 s
  hold.feed(1400, false);
  check('FLICKER: a "step back" signal that lasts 1.4 s never reaches the words or the number', shown === false);
  hold.reset(); let held = false;
  for (let t = 0; t <= 3000; t += 200) held = hold.feed(t, true);
  check('...but one that holds 3 s does (the camera really lost you)', held === true);
  check('the hold time is the tuned placeholder (1.5 s)', TUN.GUIDE.cuePersistSec === 1.5);
  const fc = fs.readFileSync(path.join(__dirname, '..', 'app/formcheck.tsx'), 'utf8').split('\r\n').join('\n');
  check('the camera screen uses it for BOTH the Guide line and the confidence cap', fc.includes('frameCueHold.feed(now,') && fc.includes('(!isFloor && frameCueHeld)') && fc.includes('personMissing: noPersonNow && cueHeld'));
}
// Guide calm still holds on this log
{
  let last = null, since = 0; const bad = [];
  for (const x of res.rows) if (x.guide !== last) { if (last !== null && x.guide !== null && x.t - since < 2499) bad.push(`${last} -> ${x.guide}`); last = x.guide; since = x.t; }
  check('CALM: no line on this log is replaced in under 2.5 s', bad.length === 0, bad.join(' | '));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
