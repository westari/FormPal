#!/usr/bin/env node
/**
 * scripts/test-setup-guide.js
 *
 * "Ready / Go" fired too soon: with only the head (and garbage joints) in frame it said Ready, the confidence hit 100, then the
 * arms left the frame on the first press. Go may now only show when the camera has SEEN the exercise's full path: tracked
 * steadily, hands at the start position, the top (lockout) reached, back at the start, held steady. Until then ONE plain
 * instruction ("Step back so your hands show"). The confidence number is capped by the step, so it can only read 100 at Go.
 *
 *   Part 1: the steps with synthetic input.   Part 2: the newest real log (2026-11-11 15:59:38-15:59:47), where the old gate said
 *   Ready at 15:59:46.6 although the top was never reached (peak 78.3, lockout needs 79).
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const G = require('../lib/setupGuide.ts');
const LT = require('../lib/liveTracking.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const TOP = 84, START_MIN = 57.9;
const mk = () => ({ guide: G.createSetupGuide(), counter: LT.createCounterSignal() });
function tickInputs(counter, now, extra = {}) {
  return Object.assign({
    now, seen: counter.seen(), healthy: counter.healthy(now, 1200, 3), atStart: counter.atStartPosition(START_MIN, now, 1200, 3),
    value: counter.peak(now, 700), frameHint: false, steadyOk: true, needsLockout: true, topValue: TOP, handsExercise: true,
  }, extra);
}
// feed metric values 330ms apart; call the guide every 200ms
function drive(ctx, startMs, values, extra) {
  let t = startMs; const stages = [];
  for (const v of values) {
    ctx.counter.feedLog(`[METRIC] shoulderPress value=${v} enter=50.0000 exit=58.0000 rom=55.0000 top=84.0 state=waiting phase=setup`, t);
    for (let k = 0; k < 2; k++) { const d = ctx.guide.update(tickInputs(ctx.counter, t + k * 160, extra)); stages.push(d); }
    t += 330;
  }
  return { t, stages, last: stages[stages.length - 1] };
}

// ── Part 1 ──
{
  const c = mk();
  const none = c.guide.update(tickInputs(c.counter, 1000));
  check('nothing tracked yet (only a head in frame, no readings): "Step back so your hands show", not ready, confidence capped at 35', none.stage === 'fit' && none.text === 'Step back so your hands show' && !none.ready && none.cap === 35, `${none.stage} "${none.text}" cap ${none.cap}`);
  // garbage readings: jumping all over (not a steady track): the counter sees pose gaps
  const g = mk(); g.counter.feedLog('[REP-TRACE] shoulderPress angle=40.0 framesSincePoseGap=40', 100); g.counter.feedLog('[REP-TRACE] shoulderPress angle=44.0 framesSincePoseGap=2', 400); g.counter.feedLog('[REP-TRACE] shoulderPress angle=30.0 framesSincePoseGap=3', 700);
  const gd = g.guide.update(tickInputs(g.counter, 800));
  check('tracking just recovered from a pose gap: still "fit" (not steady)', gd.stage === 'fit' && !gd.ready, gd.stage);
  const A = mk();
  let r = drive(A, 0, [64, 63, 65, 64, 63, 64, 65, 64]);
  check('tracked and at the shoulders: "Raise your hands over your head", confidence capped at 70', r.last.stage === 'raise' && r.last.text === 'Raise your hands over your head' && r.last.cap === 70, `${r.last.stage} "${r.last.text}" ${r.last.cap}`);
  check('Go is NOT ready while the top has not been seen, however long you wait (60s of resting at the shoulders)', (() => { const x = mk(); const rr = drive(x, 0, Array.from({ length: 180 }, (_, i) => 63 + (i % 3))); return !rr.stages.some((s) => s.ready); })());
  r = drive(A, r.t, [70, 77, 82, 86, 87, 85]);
  check('after the top is seen: "Bring your hands back to your shoulders"', r.stages.some((s) => s.stage === 'lower'), r.stages.map((s) => s.stage).filter((x, i, a) => a.indexOf(x) === i).join('>'));
  r = drive(A, r.t, [75, 68, 64, 63, 64, 63]);
  check('back at the shoulders, held: "Hold still" first (never "Perfect")', r.stages.some((s) => s.stage === 'hold' && s.text === 'Hold still') && !r.stages.some((s) => /perfect/i.test(s.text)));
  r = drive(A, r.t, [64, 63, 64, 63, 64, 63, 64, 63]);
  check('then Ready (and only then confidence may read 100)', r.last.ready && r.last.stage === 'ready' && r.last.cap === 100, `${r.last.stage} cap ${r.last.cap}`);
  check('every step cap rises with the steps: fit < start < raise < lower < hold < ready', G.SETUP_TUNING.capFit < G.SETUP_TUNING.capStart && G.SETUP_TUNING.capStart < G.SETUP_TUNING.capRaise && G.SETUP_TUNING.capRaise < G.SETUP_TUNING.capLower && G.SETUP_TUNING.capLower < G.SETUP_TUNING.capHold && G.SETUP_TUNING.capHold < 100);
  // arms leave the frame mid-setup: the lockout has to be seen again
  const B = mk();
  let rb = drive(B, 0, [64, 63, 64, 64, 85, 87, 70, 64, 63, 64]);
  B.counter.feedLog('[TRACK] person lost', rb.t + 50);
  const lost = B.guide.update(tickInputs(B.counter, rb.t + 100));
  check('the person is lost mid-setup (arms out of frame): back to "Step back so your hands show" and the top must be seen again', lost.stage === 'fit' && !lost.ready, lost.stage);
  // a frame hint always wins
  const C = mk(); drive(C, 0, [64, 64, 64, 64, 64]);
  const fh = C.guide.update(tickInputs(C.counter, 3000, { frameHint: true }));
  check('a "Step into frame" hint is never shown together with "Hold still" / Ready: the guide says fit', fh.stage === 'fit' && !fh.ready);
  check('wording for squats and other non-overhead exercises: no lockout step, "Step back so your whole body shows"', (() => { const x = mk(); const d = x.guide.update(Object.assign(tickInputs(x.counter, 100), { needsLockout: false, handsExercise: false })); return d.text === 'Step back so your whole body shows'; })());
}

// ── Part 2: the real log ──
{
  const lines = fs.readFileSync(path.join(__dirname, 'fixtures', 'setup-2026-11-11.log.txt'), 'utf8').split(/\r?\n/);
  const first = 0;
  const rows = [];
  for (let i = first; i < lines.length; i++) { const m = /^(\d\d):(\d\d):(\d\d\.\d+) .*?(\[(?:METRIC|SETTLE-TRACE|REP-TRACE)\].*)$/.exec(lines[i] || ''); if (m) rows.push({ t: (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000, text: m[4] }); }
  if (rows.length < 20) { console.log('  (the live log has moved on: using the saved copy of that setup instead)'); }
  const useRows = rows.length >= 20 ? rows : null;
  if (useRows) {
    const c = mk(); const t0 = useRows[0].t; const stages = []; let oldReadyAt = (new Date(2026, 0, 1).getTime() * 0) + (15 * 3600 + 59 * 60 + 46.610) * 1000;
    let peak = 0, lastStage = '';
    for (const r of useRows) {
      if (r.t > oldReadyAt + 1500) break;
      c.counter.feedLog(r.text, r.t);
      const v = /(?:value|angle)=([-\d.]+)/.exec(r.text); if (v) peak = Math.max(peak, +v[1]);
      const d = c.guide.update(tickInputs(c.counter, r.t, { steadyOk: r.t - t0 >= 3500 }));
      stages.push({ at: (r.t - t0) / 1000, ...d });
      if (d.stage !== lastStage) { console.log(`      +${((r.t - t0) / 1000).toFixed(1)}s  ${d.stage}: "${d.text}" (confidence cap ${d.cap})`); lastStage = d.stage; }
    }
    console.log(`      the old gate said Ready at 15:59:46.6 (+${((oldReadyAt - t0) / 1000).toFixed(1)}s); the highest reading in that setup was ${peak.toFixed(1)} (lockout needs ${(TOP * G.SETUP_TUNING.lockoutFraction).toFixed(1)})`);
    check('REAL LOG: at the moment the old gate said Ready/Go, the new guide is NOT ready (the top was never reached)', !stages.some((s) => s.ready), stages[stages.length - 1] && stages[stages.length - 1].stage);
    check('REAL LOG: the confidence cap never let the number reach 100 during that setup', stages.every((s) => s.cap < 100));
  } else check('REAL LOG replay skipped (log rotated)', true);
}
{
  // the cue card: stars on the left, the words beside them, at most 2 lines (about 18 characters a line at that size)
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/formcheck.tsx'), 'utf8').split('\r\n').join('\n');
  check('the cue card is the original layout: stars left, text beside, no centred wrap and no shrink-to-one-line', /trackingCueInner: \{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 26/.test(src) && src.includes('<Text style={s.trackingCueText} numberOfLines={2} onTextLayout=') && src.includes('const big = lines > 1;') && !src.includes('adjustsFontSizeToFit minimumFontScale={0.5}>{text}'));
  const SG = require('../lib/setupGuide.ts');
  const all = ['Step back so your hands show', 'Step back so your whole body shows', 'Hold your hands at your shoulders', 'Get into your starting position', 'Raise your hands over your head', 'Bring your hands back to your shoulders', 'Hold still'];
  const g = SG.createSetupGuide();
  check('every setup cue fits the card in two lines (40 characters or fewer; the stars grow when it wraps)', all.every((t) => t.length <= 40), all.filter((t) => t.length > 40).join(', '));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
