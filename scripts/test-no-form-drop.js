#!/usr/bin/env node
/**
 * scripts/test-no-form-drop.js
 *
 * Ari 2026-11-16 evening (log scripts/fixtures/shoulder-press-2026-11-16b.log.txt, the OLD Oct 8 native build):
 *   7. standing still after Go = confidence 100 and nothing happens (fine). If no rep comes for ~6 s the Guide says "Start your reps" ONCE.
 *   8. half reps, every joint clearly visible: confidence slowly fell 100 -> 34 while the Guide said nothing. A FORM problem must not lower
 *      the camera number; only a real camera problem does, and then the Guide says why.
 *   9. a check with no stroke before it (standing and looking at the phone) must never happen.
 * BEFORE (read from the log) and AFTER (the same log through this code) are printed.
 */
const fs = require('fs');
const path = require('path');
const P = require('./lib/pipeline.js');
const GC = require('../lib/guideCoach.ts');
const CC = require('../lib/cameraConfidence.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const toMs = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+)/.exec(l); return m ? (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000 : null; };
const parse = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+) \S+ \[DEBUG\] (.*)$/.exec(l) || /^(\d\d):(\d\d):(\d\d\.\d+) \S+ (.*)$/.exec(l); return m ? { t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, line: m[4] } : null; };
const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-16b.log.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
const startRaw = raw.findIndex((l) => /READY-GATE\] Ready/.test(l));
const endRaw = raw.findIndex((l, i) => i > startRaw && /\[POST-LAG\]/.test(l));
const t0 = toMs(raw[startRaw]);

// ── BEFORE: straight from the phone's log ──
const bConf = [];
for (const l of raw.slice(startRaw, endRaw)) { const t = toMs(l); const m = /\[CONFIDENCE\] (\d+) \((.*?)\) match/.exec(l); if (m && t !== null) bConf.push({ t: t - t0, v: +m[1], why: m[2] }); }
const bHalf = bConf.filter((x) => x.t > 63000 && x.t < 80000);
console.log('--- BEFORE (the phone, from the log) ---');
console.log(`  half-rep stretch (63 to 80 s after Go): confidence ${bHalf[0].v} -> ${Math.min(...bHalf.map((x) => x.v))}, reason in the log: "${bHalf[bHalf.length - 1].why.slice(0, 80)}"`);
check('BEFORE: the old rule really lowered the number during half reps with everything visible (the bug)', Math.min(...bHalf.map((x) => x.v)) < 45 && bHalf.some((x) => /no rep counted/.test(x.why)));

// ── AFTER ──
const rows0 = raw.map(parse).filter(Boolean);
const i0 = rows0.findIndex((r) => r.t >= t0 - 8000 && /^\[METRIC\]/.test(r.line));
const endT = toMs(raw[endRaw]);
const sel = rows0.slice(i0).filter((r) => r.t <= endT);
const tt0 = sel[0].t, off = tt0 - t0, off0 = off;
const events = sel.map((r) => ({ t: r.t - tt0, line: r.line }));
// the camera's own "Step back into frame" cue, rebuilt from the phone's [GUIDE] lines (on 1.5 s before the old line, until the next line that is not about it)
const gl = [];
for (const l of raw.slice(startRaw, endRaw)) { const t = toMs(l); const m = /\[GUIDE\] says "([^"]+)" because (.*)$/.exec(l); if (m) gl.push({ t: t - t0, why: m[2] }); else if (/\[GUIDE\] says nothing/.test(l)) gl.push({ t: t - t0, why: '' }); }
const cueOn = [];
for (let k = 0; k < gl.length; k++) { if (!/Step back into frame/.test(gl[k].why)) continue; const end = (gl.slice(k + 1).find((x) => !/Step back into frame/.test(x.why)) || { t: gl[k].t + 3000 }).t; cueOn.push([gl[k].t - 1500 - off0, end - off0]); }
const cue = (t) => (cueOn.some(([a, b]) => t >= a && t <= b) ? 'Step back into frame' : null);
const res = P.run(events, { exerciseId: 'shoulderPress', trackingCue: cue });
const num = res.rows.map((r) => ({ t: r.t + off, v: r.meter, stuck: r.conf.stuck, guide: r.guide }));
const half = num.filter((x) => x.t > 63000 && x.t < 80000);
console.log('--- AFTER (this code, same log) ---');
console.log(`  half-rep stretch: number ${Math.min(...half.map((x) => x.v))} to ${Math.max(...half.map((x) => x.v))}, stuck rows ${half.filter((x) => x.stuck).length}`);
check('8: during the half reps (every joint visible) the number stays 90+ and is never "stuck"', half.length > 60 && half.every((x) => x.v >= 90 && !x.stuck), 'min ' + Math.min(...half.map((x) => x.v)));
check('8: over the whole working part (5 to 90 s after Go) the number never falls under 90', num.filter((x) => x.t > 5000 && x.t < 90000).every((x) => x.v >= 90), 'min ' + Math.min(...num.filter((x) => x.t > 5000 && x.t < 90000).map((x) => x.v)));
const standing = num.filter((x) => x.t > 38000 && x.t < 53000);
check('7: standing still for 15 s in frame (his real rest at 38 to 53 s): confidence 100-ish, no stuck, no Guide line', standing.every((x) => x.v >= 95 && !x.stuck && !x.guide), 'min ' + Math.min(...standing.map((x) => x.v)));
// a REAL camera problem still lowers it, and the Guide says why quickly (he walked out of frame at the end of the set)
const endDrop = num.filter((x) => x.t > 90000);
const dropAt = endDrop.find((x) => x.v < 80);
const guideAt = endDrop.find((x) => x.guide);
check('8: a real camera problem (he leaves the frame at the end) still lowers the number', !!dropAt && Math.min(...endDrop.map((x) => x.v)) < 60);
check('8: ...and the Guide names the reason no later than the drop below 80 (' + (dropAt && guideAt ? ((guideAt.t - dropAt.t) / 1000).toFixed(1) + ' s after' : 'n/a') + ')', !!guideAt && !!dropAt && guideAt.t - dropAt.t <= 1500, JSON.stringify({ dropAt: dropAt && dropAt.t, guideAt: guideAt && guideAt.t }));

// 8 (unit): the camera-problem rule itself
{
  const mk = (o) => Object.assign({ haveData: true, trying: true, tryingForSec: 10, movingNow: true, cut: null, score: 90, cutAgo: { top: Infinity, bottom: Infinity, frame: Infinity }, topCuts: 0, bottomCuts: 0, frameCuts: 0 }, o);
  const run = (visibility, cutOver) => {
    const c = CC.createCameraConfidence(); let r;
    for (let t = 0; t < 30000; t += 200) r = c.update({ now: 1e6 + t, visibility, match: mk(cutOver || {}), lastCountAt: 0, missedSinceCount: 5 });
    return r;
  };
  const fine = run(100);
  check('8 unit: trying 30 s, no rep counted, every joint clearly visible (visibility 100), path whole -> 100, not stuck', fine.value === 100 && !fine.stuck, JSON.stringify({ v: fine.value, stuck: fine.stuck }));
  const dim = run(60);
  check('8 unit: the same, but the camera sees little (visibility 60) -> it falls, stuck', dim.stuck && dim.value < 60, JSON.stringify({ v: dim.value }));
  const cut = run(100, { cut: 'top', cutAgo: { top: 0.5, bottom: Infinity, frame: Infinity } });
  check('8 unit: the path is cut at the top right now (hands leaving the frame) -> capped at 70 or less', cut.value <= 70, JSON.stringify({ v: cut.value }));
  const staleCut = run(100, { cut: 'top', cutAgo: { top: 20, bottom: Infinity, frame: Infinity } });
  check('8 unit: an OLD cut (20 s ago) is not evidence -> stays 100', staleCut.value === 100 && !staleCut.stuck, JSON.stringify({ v: staleCut.value }));
}

// ── 9: every check has a real stroke just before it; none while standing ──
const metrics = events.filter((e) => /^\[METRIC\]|^\[REP-TRACE\]/.test(e.line)).map((e) => ({ t: e.t, v: +((/(?:value|angle)=([-\d.]+)/.exec(e.line) || [])[1]) })).filter((x) => !isNaN(x.v));
const checks = res.verdicts.filter((v) => v.show === 'check' && v.t + off >= 0);
const noStroke = checks.filter((v) => { const w = metrics.filter((m) => m.t <= v.t && m.t >= v.t - 2500).map((m) => m.v); return !(w.length && Math.max(...w) - Math.min(...w) >= 25); });
console.log(`  checks after Go: ${checks.length}; with no stroke before them: ${noStroke.length}`);
check('9: every check in the log has a real stroke (25+ degrees of movement) in the 2.5 s before it', checks.length >= 8 && noStroke.length === 0);
check('9: no check at all during his 15 s of standing still (38 to 53 s after Go)', res.verdicts.every((v) => !(v.show && v.t + off > 38500 && v.t + off < 52500)));
check('9: the phone itself logged no [COACH] line during that standing time', !raw.slice(startRaw, endRaw).some((l) => { const t = toMs(l); return /\[COACH\]/.test(l) && t - t0 > 38500 && t - t0 < 52500; }));

// ── 7: Start your reps ──
const drive = (events2, total = 60000) => { const sr = GC.createStartReps(); const shown = []; let prev = null; for (let t = 0; t <= total; t += 200) { const e = events2(t); const l = sr.tick(Object.assign({ now: t, goAt: 0, repSinceGo: false, trying: false, personHere: true }, e)); if (l && !prev) shown.push(t); prev = l; } return shown; };
const still = drive(() => ({}));
check('7: standing still, fully in frame: "Start your reps" shows ONCE, at about 6 s, and never again', still.length === 1 && still[0] >= 5800 && still[0] <= 6400, JSON.stringify(still));
check('7: reps counted at 3 s, then a 40 s rest: never shown (not in a rest between sets)', drive((t) => ({ repSinceGo: t >= 3000 })).length === 0);
check('7: his real log (first rep 3.8 s after Go, a 15 s rest later): never shown', drive((t) => ({ repSinceGo: t >= 3800 })).length === 0);
check('7: a stroke is tried (not counting) at 4 s: never shown (the Coach speaks then)', drive((t) => ({ trying: t >= 4000 })).length === 0);
check('7: nobody in the picture: not shown (that is the Guide\'s other lines)', drive(() => ({ personHere: false })).length === 0);
{ const sr = GC.createStartReps(); const lines = []; for (let t = 0; t <= 20000; t += 200) lines.push(sr.tick({ now: t, goAt: 0, repSinceGo: false, trying: false, personHere: true })); const first = lines.findIndex(Boolean); const last = lines.map(Boolean).lastIndexOf(true);
  check('7: when shown it stays about 4 s (readable), then hides for good', (last - first) * 0.2 >= 3.6 && (last - first) * 0.2 <= 4.4 && lines.slice(last + 1).every((l) => !l)); }
check('7: the line is a Guide word (setup-style), not a Coach word, and has an evidence entry', GC.GUIDE_WORDS.includes('Start your reps') && !GC.COACH_WORDS.includes('Start your reps') && !!GC.GUIDE_EVIDENCE['Start your reps']);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
