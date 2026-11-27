#!/usr/bin/env node
/**
 * scripts/test-setup-guide.js
 *
 * Ari's phone test 2026-11-12: it NEVER said Ready. He stood far back, fully in frame, arms out, room light on. The log shows native's
 * setup passing at 22:25:04 ("[SETUP] shoulderPress PASSED - entering ACTIVE"), yet Go never came: the old extra gates (confidence meter
 * "high", hands at the shoulders, a full reach to the top and back, a held pause) kept it away, and the meter was capped at 35 by the
 * "fit" step. New rule: Ready when every joint the exercise needs is visible (native's setup passed) and steady for about 1 second.
 *
 *   Part 1: the setup line.  Part 2: the Ready gate, replayed on the real 2026-11-12 timeline.  Part 3: calm, wording and the cue card.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const G = require('../lib/setupGuide.ts');
const LT = require('../lib/liveTracking.ts');
const GC = require('../lib/guideCoach.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const base = { now: 1000, seen: true, healthy: true, frameHint: false, hintLine: null, handsExercise: true, expectSamples: true };
const src = fs.readFileSync(path.join(__dirname, '..', 'app/formcheck.tsx'), 'utf8').split('\r\n').join('\n');

// ── Part 1: the setup line ──
{
  const g = G.createSetupGuide();
  const blind = g.update({ ...base, seen: false });
  check('no readings yet: ONE plain action ("Step back further"), not ready, confidence capped at 35', blind.stage === 'fit' && blind.text === 'Step back further' && !blind.ready && blind.cap === 35, `${blind.stage} "${blind.text}" ${blind.cap}`);
  const nobody = g.update({ ...base, seen: false, frameHint: true, hintLine: GC.GUIDE_LINES.intoPicture });
  // (Ari 2026-11-27) "Step into view" showed while he WAS in view, just too close (the camera starts with him at the phone): in setup it is "Move back"
  check('nobody found while setting up (he just tapped the phone: too close): "Move back", never "Step into view"', nobody.text === 'Move back' && !nobody.ready, nobody.text);
  const gap = g.update({ ...base, healthy: false });
  check('tracking not steady (pose gap): still "fit"', gap.stage === 'fit' && !gap.ready);
  const ok = g.update({ ...base });
  check('everything visible, ARMS OUT, hands NOT at the shoulders: Ready (no start-position or reach-to-the-top wait), confidence may read 100', ok.ready && ok.stage === 'ready' && ok.cap === 100, `${ok.stage} cap ${ok.cap}`);
  check('without debug logging (no per-frame signal) the guide never blocks Go', g.update({ ...base, seen: false, expectSamples: false }).ready);
  check('the cap rises with the step: fit < ready', G.SETUP_TUNING.capFit < G.SETUP_TUNING.capReady);
}

// ── Part 2: the Ready gate ──
{
  check('Ready needs about 1 second of steady tracking (placeholder), not 3.5s', LT.READY_STEADY_MS === 1000, String(LT.READY_STEADY_MS));
  // the real timeline (2026-11-12, 22:25:02.032 hold restarted, native PASSED at 22:25:04.114, about 2.1s later)
  const gate = LT.createSteadyGate();
  let t = 0, passedAt = 0;
  for (let k = 0; k < 21; k++) { gate.feed(true, t, k === 20); if (k === 20) passedAt = t; t += 100; }
  const goAt = (() => { for (let ms = passedAt; ms < passedAt + 5000; ms += 50) if (gate.steadyMs(ms) >= LT.READY_STEADY_MS) return ms; return null; })();
  check('REAL TIMELINE: native passed after 2.1s of hold; Ready follows within 1s of that (the old gate never came)', goAt !== null && goAt - passedAt <= 1000, `Go at +${goAt === null ? 'never' : (goAt - passedAt) + 'ms'} after the pass`);
  const gate2 = LT.createSteadyGate(); gate2.feed(true, 0, false); gate2.feed(false, 100, false);
  check('a frame with a joint missing restarts the steady count', gate2.steadyMs(200) === 0);
  const a = src.indexOf("// \"Ready. Go!\" (Ari's rule, 2026-11-12)"), b = src.indexOf('}, [readyPending, steadyGate]);');
  const eff = a >= 0 && b > a ? src.slice(a, b) : '';
  check("the Ready gate waits for: native's pass, the body steady ~1 s, AND the body on the exercise's path (the last readings inside the path band); no meter-high, hands-at-start, reach-to-the-top or guide-step wait", eff.length > 200 && !/meterHigh|guideRef|healthy\(/.test(eff) && /steadyGate\.steadyMs/.test(eff) && /matchRef\.band\(\)/.test(eff) && /counterRef\.atStartPosition\(band\.lo/.test(eff));
  {
    // 2026-11-16 REAL LOG: native setup passed at 15:19:43.756 while his arms hung at his sides (the metric read ~20; the path starts at about 30). The old rule said Go 1.0 s later.
    const LT2 = require('../lib/liveTracking.ts');
    const rows = fs.readFileSync(path.join(__dirname, 'fixtures', 'shoulder-press-2026-11-16.log.txt'), 'utf8').split(/\r?\n/);
    const toMs = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+)/.exec(l); return m ? (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000 : null; };
    const cs = LT2.createCounterSignal(); let passedAt = null, goOld = null, goNew = null; const lo = 50 - 0.7 * 29;
    for (const l of rows) {
      const t = toMs(l); if (t === null) continue; const m = /\[DEBUG\] (.*)$/.exec(l); const msg = m ? m[1] : '';
      if (/PASSED — entering ACTIVE/.test(msg) && passedAt === null) passedAt = t;
      if (msg.startsWith('[METRIC]') || msg.startsWith('[SETTLE-TRACE]')) cs.feedLog(msg, t);
      if (passedAt !== null) { if (goOld === null && t - passedAt >= 1000) goOld = t; if (goNew === null && t - passedAt >= 1000 && cs.atStartPosition(lo, t, 1200, 2)) goNew = t; }
    }
    check('REAL LOG 2026-11-16: the OLD rule said Go 1.0 s after native passed (arms at his sides, metric ~20)', goOld !== null && goOld - passedAt <= 1100, goOld === null ? 'never' : ((goOld - passedAt) / 1000).toFixed(1) + ' s');
    check('REAL LOG 2026-11-16: the NEW rule waits until his arms are on the exercise path (about 34 s later, just before his first rep)', goNew !== null && goNew - passedAt > 20000 && goNew - passedAt < 45000, goNew === null ? 'never' : ((goNew - passedAt) / 1000).toFixed(1) + ' s');
  }
  check('the setup line the user sees goes through the calm filter', src.includes('setupCalm.feed(now, dec.text)'));
}

// ── Part 3: calm, words, cue card ──
{
  const c = GC.createCalmLine(); const seen = []; let last = null;
  // Ari's 1-second flash: different lines alternating every 200ms
  const wanted = ['A', 'B', 'A', 'B', 'C', 'B', 'A', 'B', 'C', 'A'];
  for (let i = 0; i < 40; i++) { const s = c.feed(i * 200, wanted[i % wanted.length]); if (s !== last) { seen.push({ t: i * 200, s }); last = s; } }
  check('CALM: lines alternating every 200ms never reach the screen as a flash (changes at least 2.5s apart)', seen.every((x, i) => i < 2 || x.t - seen[i - 1].t >= 2500), seen.map((x) => `${x.s}@${x.t}`).join(' '));
  const c2 = GC.createCalmLine(); c2.feed(0, 'X'); c2.feed(500, 'X');
  let v = null; for (let t = 600; t <= 2400; t += 100) v = c2.feed(t, 'Y');
  check('CALM: a line stays at least 2.5s even when a different reason appears', v === 'X', String(v));
  for (let t = 2500; t <= 4200; t += 100) v = c2.feed(t, 'Y');
  check('CALM: a new reason that holds ~1.5s replaces it', v === 'Y', String(v));
  const c3 = GC.createCalmLine(); c3.feed(0, 'Z'); const blip = c3.feed(100, null);
  check('CALM: a one-frame blip never shows', blip === null);
}
{
  const L = GC.GUIDE_LINES;
  const lines = [...new Set(GC.GUIDE_WORDS)].filter((x) => x !== 'Ready. Go!');
  const bad = /so your|shoulders|bring your|show\b|picture|position/i;
  check('every Guide line is ONE simple physical action (no "so your hands show", no "Bring your hands back to your shoulders")', lines.every((t) => !bad.test(t)), lines.filter((t) => bad.test(t)).join(' | '));
  check('the Guide lines with evidence exist word for word (Step back further, Move back, Turn your side to the camera, Keep your hands in view ...); the lines the old build cannot prove are gone', L.backHands === 'Step back further' && L.backUp === 'Move back' && L.sideways === 'Turn your side to the camera' && L.handsInView === 'Keep your hands in view' && L.raiseHands === undefined && L.lowerHands === undefined && L.closer === undefined && L.chestHeight === undefined && L.handsStart === undefined && L.startPos === undefined);
  check('every line starts with a capital letter and has 2-6 words (a beginner reads it at a glance)', lines.every((t) => /^[A-Z]/.test(t) && t.split(' ').length >= 2 && t.split(' ').length <= 6), lines.filter((t) => !/^[A-Z]/.test(t) || t.split(' ').length > 6).join(' | '));
  check('every Guide line fits the card in two lines (35 characters or fewer)', lines.every((t) => t.length <= 35), lines.filter((t) => t.length > 35).join(' | '));
  const i0 = src.indexOf('trackingCueText: {');
  check('the cue card: stars keep their ORIGINAL size (22), text centred beside them, max 2 lines; content-sized, NO fixed percent width and no flex:1 text (that collapsed the text to nothing inside the setup panel: stars only)', /const icon = 22;/.test(src) && !src.includes('big ? { width: 34') && /textAlign: 'center'/.test(src.slice(i0, i0 + 250)) && !/flex: 1/.test(src.slice(i0, i0 + 250)) && src.includes("trackingCueCard:  { alignSelf: 'center', maxWidth: 340, minWidth: 230 }") && !src.includes("width: '88%'") && src.includes('numberOfLines={2}>{text}'));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
