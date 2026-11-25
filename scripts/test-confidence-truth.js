#!/usr/bin/env node
/**
 * scripts/test-confidence-truth.js
 *
 * Ari 2026-11-16 (log scripts/fixtures/shoulder-press-2026-11-16.log.txt): he stood still and Camera confidence went 100 -> 35 -> 100 -> 35, and it dropped to 35
 * while reps were being counted. The Guide said "Lower your hands" while his hands were down and "Keep your hands in view" while they were in view; reaching for
 * the phone at the end counted a "rep" (bottom=1.0) and got a check. BEFORE (what the phone did, read from this log) and AFTER (this code, replayed on the same
 * log) are printed side by side.
 *
 *   2. the number comes ONLY from what the camera sees; a hint never sets it; it cannot move more than a few points a second
 *   3. when it does drop, the Guide says why within about 1.5 s; reps counting = 90+
 *   4. a Guide line needs evidence for about 1 s and is hidden when the evidence is gone
 *   6. a rep far below the exercise's path (reaching for the phone) gets no check
 */
const fs = require('fs');
const path = require('path');
const P = require('./lib/pipeline.js');
const { signature, build } = require('./lib/rep-synth.js');
const GC = require('../lib/guideCoach.ts');
const LT = require('../lib/liveTracking.ts');
const DEFS = require('../constants/exerciseDefinitions.ts').EXERCISE_DEFINITIONS;
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const toMs = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+)/.exec(l); return m ? (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000 : null; };
const rawLines = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-16.log.txt'), 'utf8').split(/\r?\n/).filter(Boolean);

// ── BEFORE: read straight from the log (these are the numbers and lines the phone really produced) ──
const startIdx = rawLines.findIndex((l) => /READY-GATE\] Ready/.test(l));
const stopIdx = rawLines.findIndex((l) => /Stop pressed|\[REP\] #7/.test(l));
const t0 = toMs(rawLines[startIdx]);
const before = { conf: [], guide: [], verdicts: [] };
for (const l of rawLines.slice(startIdx)) {
  const t = toMs(l); if (t === null) continue;
  let m = /\[CONFIDENCE\] (\d+) \(the camera sees (\d+)\)/.exec(l); if (m) before.conf.push({ t: t - t0, v: +m[1] });
  m = /\[GUIDE\] says "([^"]+)" because (.*)$/.exec(l); if (m) before.guide.push({ t: t - t0, line: m[1], why: m[2] });
  if (/\[GUIDE\] says nothing/.test(l)) before.guide.push({ t: t - t0, line: null });
  m = /\[COACH\] (CHECK|X "[^"]*")/.exec(l); if (m) before.verdicts.push({ t: t - t0, v: m[1] });
}
const steps = (series) => { let worst = 0; for (let i = 0; i < series.length; i++) for (let j = i + 1; j < series.length && series[j].t - series[i].t <= 1000; j++) worst = Math.max(worst, Math.abs(series[j].v - series[i].v)); return worst; };
const bConf = before.conf;
console.log('--- BEFORE (the phone, from the log) ---');
console.log(`  number: ${bConf.length} readings, min ${Math.min(...bConf.map((x) => x.v))}, biggest move in 1 s: ${steps(bConf)} points; it fell below 50 ${bConf.filter((x, i) => x.v < 50 && (i === 0 || bConf[i - 1].v >= 50)).length} times while he mostly stood still`);
console.log('  Guide: ' + [...new Set(before.guide.filter((g) => g.line).map((g) => g.line + ' (' + g.why.slice(0, 40) + ')'))].join(' | '));
console.log('  verdicts: ' + before.verdicts.map((v) => (v.t / 1000).toFixed(0) + 's ' + v.v).join(', '));

// ── AFTER: the same log through this code ──
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const rows0 = rawLines.map(parse).filter(Boolean);
const i0 = rows0.findIndex((r) => /^\[METRIC\].*phase=(?!setup)/.test(r.line));
const rows1 = rows0.slice(Math.max(0, i0)); const tt0 = rows1[0].t;
const events = rows1.map((r) => ({ t: r.t - tt0, line: r.line }));
// the camera's own cue, rebuilt from the old [GUIDE] lines: on from 1.5 s before the old line (the old hold) until the next "says nothing"
const cueOn = [];
for (let k = 0; k < before.guide.length; k++) {
  const g = before.guide[k]; if (!g.line || !/Step back into frame/.test(g.why)) continue;
  const end = (before.guide.slice(k + 1).find((x) => !x.line || !/Step back into frame/.test(x.why)) || { t: g.t + 3000 }).t;
  cueOn.push([g.t - 1500 - (tt0 - t0), end - (tt0 - t0)]);
}
const cue = (t) => (cueOn.some(([a, b]) => t >= a && t <= b) ? 'Step back into frame' : null);
const res = P.run(events, { exerciseId: 'shoulderPress', trackingCue: cue });
const meter = res.rows.map((r) => ({ t: r.t, v: r.meter }));
const reps = events.filter((e) => /^\[REP\] #\d+/.test(e.line));
console.log('\n--- AFTER (this code on the same log) ---');
console.log(`  the camera's own cue was on for ${cueOn.length} periods (rebuilt from the old Guide lines): ${cueOn.map(([a, b]) => (a / 1000).toFixed(0) + '-' + (b / 1000).toFixed(0) + 's').join(' ')}`);
console.log(`  number: min ${Math.min(...meter.map((x) => x.v))}, biggest move in 1 s: ${steps(meter)} points; Guide: ${[...new Set(res.rows.filter((r) => r.guide).map((r) => r.guide))].join(' | ') || '(nothing)'}`);
console.log('  verdicts: ' + res.verdicts.filter((v) => v.src === 'native').map((v) => (v.t / 1000).toFixed(0) + 's ' + (v.show || 'WITHHELD')).join(', '));
const ignored = res.rows.filter((r) => r.cueHeld && !r.cueProven).length;
if (process.env.DBG) {
  console.log('  low points: ' + meter.filter((x) => x.v < 90).map((x) => (x.t / 1000).toFixed(1) + ':' + x.v).join(' '));
  console.log('  guide: ' + res.rows.filter((r) => r.guide).map((r) => (r.t / 1000).toFixed(1) + ' ' + r.guide + ' [' + r.guideReason + ']').filter((x, i, a) => i === 0 || x.slice(x.indexOf(' ')) !== a[i - 1].slice(a[i - 1].indexOf(' '))).join(' | '));
}

// 2. confidence
check('BEFORE really was the bug: it fell below 50 several times and moved 40+ points in a second (this is the log)', steps(bConf) >= 40 && bConf.filter((x, i) => x.v < 50 && (i === 0 || bConf[i - 1].v >= 50)).length >= 2);
check('AFTER: the number never moves more than 14 points in a second (6 a second normally, 12 a second while a camera-problem Guide line is up: it follows the line down, never a cliff)', steps(meter) <= 14, steps(meter) + ' points');
check('AFTER: standing still in view, the number stays high (90+) the whole time: the camera sees him the whole time (the metric arrived every 0.4 s)', Math.min(...meter.filter((x) => x.t > 3000 && x.t < 62000).map((x) => x.v)) >= 90, 'min ' + Math.min(...meter.filter((x) => x.t > 3000 && x.t < 62000).map((x) => x.v)));
check('3. AFTER: while reps are counting the number is 90+ (every reading within 7 s of a counted rep)', res.rows.every((r) => !reps.some((e) => r.t >= e.t && r.t - e.t <= 7000) || r.conf.value >= 90), 'min ' + Math.min(...res.rows.filter((r) => reps.some((e) => r.t >= e.t && r.t - e.t <= 7000)).map((r) => r.conf.value)));
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');
const fc = src('app/formcheck.tsx'), lt = src('lib/liveTracking.ts');
check('a hint never sets the number: no cap by a hint on the screen (capMeterTarget unused), no hint penalty in the counter score, no 35 / 55 caps in meterTarget', !fc.includes('capMeterTarget(') && !fc.includes('counter.setFlags') && /void flagVal;/.test(lt) && !/if \(i\.repDiag\) t = 35/.test(lt));
check('the shown number is slew-limited while tracking (METER_MAX_RATE, or METER_GUIDE_RATE while a camera-problem Guide line is up) and the number and the hint come from the same evidence (the same counter, the same metric stream)', fc.includes('smoother.tick(tgt, now, activeRef.current ? (guideProblem.current ? METER_GUIDE_RATE : METER_MAX_RATE) : METER_SETUP_RATE)') && LT.METER_MAX_RATE <= 8 && LT.METER_GUIDE_RATE <= 14);
// the old rule still caps the number if someone brings it back: proof the test sees the difference
check('(control) the OLD rule, replayed on the same cue periods, WOULD have slammed the number: a 35 cap while the cue is on', cueOn.length > 0 && LT.capMeterTarget(100, null, true) === 35);

// 3. when it does drop, the Guide says why within about 1.5 s
{
  const sig = signature(DEFS.shoulderPress);
  const ev = build(sig, [{ kind: 'rest', sec: 2 }, { kind: 'reps', sec: 8, period: 3.5, engine: true }, { kind: 'lost', sec: 6 }, { kind: 'rest', sec: 3 }]);
  const lostAt = (ev.find((e) => /person lost/.test(e.line)) || { t: 10000 }).t;
  const r = P.run(ev, { exerciseId: 'shoulderPress', trackingCue: (t) => (t >= lostAt && t < lostAt + 6000 ? 'Step back into frame' : null) });
  const drop = r.rows.find((x) => x.t > lostAt && x.meter < 100 - 1) || null;
  const say = r.rows.find((x) => x.t > lostAt && x.guide);
  console.log(`  synthetic: person lost at ${(lostAt / 1000).toFixed(1)} s; the number starts to fall at ${drop ? (drop.t / 1000).toFixed(1) : '-'} s; the Guide speaks at ${say ? (say.t / 1000).toFixed(1) : 'never'} s ("${say ? say.guide : ''}")`);
  check('a REAL loss of the person: the number falls slowly (never a cliff) and the Guide says why within about 1.5 s of the loss', !!say && say.t - lostAt <= 1700 && steps(r.rows.map((x) => ({ t: x.t, v: x.meter }))) <= 14, say ? ((say.t - lostAt) / 1000).toFixed(1) + ' s' : 'never');
  check('...and it says "Back up" (the person was in the picture and is lost), not "Step into view"', !!say && say.guide === GC.GUIDE_LINES.backUp, say && say.guide);
  const back = r.rows.filter((x) => x.t >= lostAt + 6000 + 1800);
  check('...and the line is HIDDEN again within about 1.8 s of the person coming back (the evidence is gone)', back.length > 0 && !back[back.length - 1].guide && back.some((x) => !x.guide), `${back.filter((x) => x.guide).length} of ${back.length} readings after that still showed a line`);
}

// 4. Guide: evidence only
{
  const said = res.rows.filter((r) => r.guide && r.t < 62000);   // the set itself (after 62 s he walks to the phone to stop: a real step back)
  const lines = [...new Set(said.map((r) => r.guide))];
  check('AFTER: "Lower your hands" is gone (it said so while his hands were down: the counter was waiting for a start position, not a camera problem)', !lines.includes('Lower your hands') && GC.GUIDE_LINES.handsStart === undefined && GC.guideLine('Hands at shoulders', 'shoulderPress') === null);
  check('AFTER: "Keep your hands in view" does not show: every joint was seen the whole time', !lines.includes(GC.GUIDE_LINES.handsInView));
  check('AFTER: the camera cue "Step back into frame" was shown on the old build while the metric kept flowing: it is IGNORED now, with a log line (no evidence for "Step back further")', ignored > 0 && !lines.includes(GC.GUIDE_LINES.backHands) && /ignoring the camera cue/.test(fc), `${ignored} readings where the cue was held but the stream said the person is seen`);
  check('every Guide line a reading showed has an entry in the evidence table', lines.every((l) => GC.GUIDE_EVIDENCE[l]), lines.join(' / '));
  check('every line in the table is one the OLD build can prove (oldBuild: true), and the lines it cannot prove are gone from GUIDE_LINES', Object.values(GC.GUIDE_EVIDENCE).every((e) => e.oldBuild === true) && !['Step closer', 'Put your phone at chest height', 'Lower your hands', 'Raise your hands overhead', 'Get ready to start'].some((l) => GC.GUIDE_WORDS.includes(l)));
  check('every [GUIDE] log line that says something carries its evidence', res.logs.filter((l) => /\[GUIDE\] says "/.test(l.m)).every((l) => /evidence/.test(l.m)));
}

// 6. verdicts
{
  const nat = res.verdicts.filter((v) => v.src === 'native');
  const last = nat[nat.length - 1];
  console.log('  engine reps: ' + reps.map((e) => (e.t / 1000).toFixed(0) + 's').join(' '));
  check('BEFORE: all 7 counted reps got a check, including #7 (bottom=1.0: his arms dropped to the side, reaching for the phone)', before.verdicts.length >= 7);
  check('AFTER: reps 1 to 6 (on the exercise path) each get ONE check', nat.slice(0, 6).every((v) => v.show === 'check') && nat.slice(0, 6).length === 6);
  check('AFTER: rep #7 (bottom=1.0, far below the path) gets NO check and no X, and the log says why', !!last && !last.show && res.logs.some((l) => /went far below the exercise path/.test(l.m)));
  const mm = P.MMm.createMovementMatch({}); mm.feed('[METRIC] shoulderPress value=60 enter=50 exit=58 rom=55 top=84 state=up phase=top');
  check('Movement Match: a rep far below the path does not raise the score floor; one on the path does', mm.repOnPath(1.0) === false && mm.repOnPath(35.5) === true && mm.band().lo > 25 && mm.band().lo < 35, JSON.stringify(mm.band()));
  check('the Coach is told whether each rep stayed on the path (onPath) from the rep event on the phone', fc.includes("onPath: matchRef.repOnPath(rep.depthAngle)") && fc.includes('matchRef.noteRep(rep.depthAngle)'));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
