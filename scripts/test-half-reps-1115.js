#!/usr/bin/env node
/**
 * scripts/test-half-reps-1115.js
 *
 * Ari 2026-11-15: half reps STILL got no X (only full reps got a check). Replay of that log (scripts/fixtures/shoulder-press-2026-11-15.log.txt).
 * Why the detector missed them (found by replaying with the previous detector, which gave 0 X in 61 seconds of tracking with 9 reps):
 *   1. the median-of-3 smoothing spans 1.2 s on the 2.5-readings-a-second feed: a half rep 65, 69, 72, 61, 66, 80, 64 read as 66, 66, 66, so no stroke
 *   2. a stroke next to a real rep was "counted" because a rep had happened within 500 ms BEFORE its low (one rep could cover several strokes)
 */
const fs = require('fs');
const path = require('path');
const P = require('./lib/pipeline.js');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const rows0 = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-15.log.txt'), 'utf8').split(/\r?\n/).filter(Boolean).map(parse).filter(Boolean);
const i0 = rows0.findIndex((r) => /^\[METRIC\].*phase=(?!setup)/.test(r.line));
const rows1 = rows0.slice(Math.max(0, i0)); const t0 = rows1[0].t;
const events = rows1.map((r) => ({ t: r.t - t0, line: r.line }));
const res = P.run(events, { exerciseId: 'shoulderPress' });
const reps = events.filter((e) => /^\[REP\] #\d+/.test(e.line)).length;
const atts = res.logs.filter((l) => /\[ATTEMPT\] #\d+/.test(l.m));
const counted = atts.filter((l) => /outcome=counted/.test(l.m)).length;
const missed = atts.filter((l) => /outcome=missed/.test(l.m));
const xs = res.verdicts.filter((v) => v.show === 'x' && v.src === 'missed');
console.log(`  ${reps} engine reps, ${atts.length} strokes found (${counted} counted, ${missed.length} missed), ${xs.length} X: ` + xs.map((v) => (v.t / 1000).toFixed(1) + 's ' + v.reason).join(', '));
check('every engine rep still gets its check (none withheld)', events.filter((e) => /^\[REP\] #\d+/.test(e.line)).every((e) => res.verdicts.some((v) => v.src === 'native' && Math.abs(v.t - e.t) < 300 && v.show)));
check('a stroke is only "counted" when an engine rep really belongs to it (counted strokes never outnumber the reps)', counted <= reps, `${counted} counted vs ${reps} reps`);
check('the half reps ARE found now (3 or more strokes with no rep, where the old detector found none)', missed.length >= 3, String(missed.length));
check('every missed stroke Movement Match calls real gets an X with a reason (Go lower / Go higher)', xs.length >= 3 && xs.every((v) => ['Go lower', 'Go higher'].includes(v.reason)), xs.map((v) => v.reason).join(','));
check('a half rep that is followed by a real rep is not hidden by it (the stroke before a rep gets its X, the rep its check)', xs.some((v) => v.t > 5000 && v.t < 9500) && res.verdicts.some((v) => v.src === 'native' && v.show === 'check' && v.t > 10000));
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'attemptDetector.ts'), 'utf8');
check('the smoothing only uses readings from the last 250 ms (smoothMs)', /smoothMs: 250/.test(src) && /tNow - p\.t <= T\.smoothMs/.test(src));
check('each engine rep belongs to ONE stroke (claimRep), never to a stroke that began before it was possible', /function claimRep/.test(src) && /claimRep\(c\.low\.t - 600\)/.test(src));
// ── 3. the Guide changes its tip when it is not working ──
{
  const { GCm } = P;
  const g = GCm.createGuide({ log: () => {} });
  const match = { score: 0, trying: false, notTrying: true, haveData: true, cut: null, movingNow: false, tryingForSec: 0 };
  const seen = []; let last = null, since = 0; const times = [];
  for (let t = 0; t <= 40000; t += 200) {
    const d = g.decide({ now: t, exerciseId: 'shoulderPress', personMissing: false, nativeCue: 'Step back into frame', outOfPlaneCue: null, diag: null, match, stuck: false });
    if (d.line !== last) { if (d.line) { seen.push(d.line); times.push(t); } last = d.line; }
  }
  console.log('  the same "step back" problem for 40 s shows: ' + seen.map((l, i) => l + ' @' + (times[i] / 1000).toFixed(1) + 's').join(' -> '));
  check('TIPS ROTATE: it starts with the likely fix (Step back further), then moves to the next causes in order (Keep your hands in view, Move your phone back, Find more light)', seen[0] === 'Step back further' && seen.slice(1, 4).join('|') === 'Keep your hands in view|Move your phone back|Find more light', seen.slice(0, 4).join('|'));
  check('each tip stays about 5 seconds (not less than 4.9 s, not more than 8 s)', times.slice(1).every((t, i) => t - times[i] >= 4900 && t - times[i] <= 8000), times.map((t, i) => i ? ((t - times[i - 1]) / 1000).toFixed(1) : '').join(' '));
  check('no tip repeats before the whole ordered list has been tried', new Set(seen.slice(0, 5)).size === Math.min(5, seen.length));
  const order = GCm.tipOrder('Step back further', 'shoulderPress');
  check('every tip in every list is a plain Guide line (never a form word)', order.every((t) => GCm.GUIDE_WORDS.includes(t)));
  const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
  check('GUIDE vs CHECK: the live Guide is hidden while a check / X is on screen (feedback is set)', /isTracking && !!guideTrack && !feedback/.test(fc));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
