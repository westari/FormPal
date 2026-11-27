#!/usr/bin/env node
/**
 * scripts/test-setup-too-close.js  (Ari 2026-11-27: '"Hold still" showed for 5 seconds at 25% confidence before "Step back further". When the camera sees he is too
 * close, say "Move back" right away.')
 * Replays the setup part of the real 2026-11-27 log (scripts/fixtures/shoulder-press-2026-11-27b.log.txt, 20:22:15 to the first rep) through the setup Guide the
 * way app/formcheck.tsx feeds it every 200 ms: Vision's "person IN / NOT in the picture", the native setup's "[SETUP] NOT ready: whole body not in view - missing
 * ...", the metric samples. BEFORE = without the native setup's answer and with the calm delay; AFTER = this round.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'); const path = require('path');
const SG = require('../lib/setupGuide.ts');
const GC = require('../lib/guideCoach.ts');
const LT = require('../lib/liveTracking.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const all = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-27b.log.txt'), 'utf8').split(/\r?\n/).map(parse).filter(Boolean);
const a = all.findIndex((r) => /\[SETUP-GUIDE\]/.test(r.line)), b = all.findIndex((r) => /READY-GATE\] Ready/.test(r.line));
const ev = all.slice(a, b);
const clock = (t) => { const s = t / 1000; return `${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

function run(after) {
  const g = SG.createSetupGuide(), calm = GC.createCalmLine(), counter = LT.createCounterSignal();
  let seen, missingAt = 0, okAt = 0, i = 0; const out = [];
  for (let t = ev[0].t; t <= ev[ev.length - 1].t; t += 200) {
    while (i < ev.length && ev[i].t <= t) {
      const l = ev[i].line; counter.feedLog(l, ev[i].t);
      if (/\[SETUP-SEEN\] Vision says a person is IN/.test(l)) seen = true;
      if (/\[SETUP-SEEN\] Vision says a person is NOT/.test(l)) seen = false;
      if (/^\[SETUP\] \S+ NOT ready: whole body not in view/.test(l)) missingAt = ev[i].t;
      if (/^\[SETUP\] \S+ (ready|holding|PASS)/i.test(l)) okAt = ev[i].t;
      i++;
    }
    const jointsMissing = after && seen === true && missingAt > 0 && t - missingAt < 1000 && missingAt > okAt;
    const dec = g.update({ now: t, seen: counter.seen(), healthy: counter.healthy(t, 1200, 3), frameHint: seen === false, hintLine: seen === false ? GC.GUIDE_LINES.intoPicture : null, handsExercise: true, expectSamples: true, jointsMissing });
    const shown = calm.feed(t, dec.text, after ? dec.urgent : false);
    out.push({ t, shown, wanted: dec.text, jointsMissing: seen === true && missingAt > 0 && t - missingAt < 1000 && missingAt > okAt });
  }
  return out;
}
const B = run(false), A = run(true);
const holdWhileMissing = (rows) => rows.filter((r) => r.jointsMissing && r.shown === GC.GUIDE_LINES.holdStill);
const firstMissing = A.find((r) => r.jointsMissing);
const sec = (n) => (n * 0.2).toFixed(1);
console.log(`  the native setup said joints were NOT in view from ${clock(firstMissing.t)} (wrists, hips missing: too close), while Vision saw him`);
console.log(`  BEFORE: "Hold still" was on screen for ${sec(holdWhileMissing(B).length)} s of that; AFTER: ${sec(holdWhileMissing(A).length)} s`);
check('BEFORE reproduces it: "Hold still" for seconds while the camera said he was too close (joints out of view)', holdWhileMissing(B).length * 0.2 >= 2, sec(holdWhileMissing(B).length));
check('AFTER: never "Hold still" while joints are out of view', holdWhileMissing(A).length === 0, holdWhileMissing(A).map((r) => clock(r.t)).join(', '));
const lag = (() => { const r = A.findIndex((x) => x.jointsMissing); const s = A.findIndex((x, k) => k >= r && x.shown === GC.GUIDE_LINES.backUp); return (A[s].t - A[r].t); })();
check('AFTER: "Move back" shows at once (within one 200 ms tick of the camera saying so)', lag <= 200, lag + ' ms');
check('AFTER: once every joint is in view the line goes back to "Hold still" (Go still comes)', A.some((r, k) => k > 0 && !r.jointsMissing && r.wanted === GC.GUIDE_LINES.holdStill));
const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
check('the camera screen feeds the native setup answer in and shows an urgent line at once', fc.includes('jointsMissing: setupPersonRef.current.seen === true') && fc.includes('setupCalm.feed(now, dec.text, dec.urgent)'));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
