/**
 * scripts/lib/pipeline.js
 *
 * The camera screen's live pipeline as pure functions on a fake clock, wired the SAME way app/formcheck.tsx wires it:
 *   NEW:  debug-log lines -> Movement Match + attempt detector -> Camera confidence -> THE GUIDE (the line with the Cue stars)
 *                                                                -> THE COACH (the check / X)
 *   OLD:  (before this round) debug-log lines -> counter signal (confidence) + the old attempt detector (its reasons were shown on the
 *         X AND its stuck cue on the cue line, so one word could appear in both places)
 * Used by scripts/test-movement-match.js for the real-log replays, the synthetic cases and the per-exercise signature tests.
 */
require('./ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const LT = require('../../lib/liveTracking.ts');
const MMm = require('../../lib/movementMatch.ts');
const CCm = require('../../lib/cameraConfidence.ts');
const GCm = require('../../lib/guideCoach.ts');
const AD = require('../../lib/attemptDetector.ts');
const AD_OLD = require(path.join(__dirname, '..', 'fixtures', 'legacy-2026-11-11', 'attemptDetector.ts'));
const RD = require('../../lib/repDiagnostics.ts');
const MIRROR = require('./missed-attempt-mirror.js');
const VT = require('../../lib/verdictTiming.ts');
const NS = require('../../lib/noSilentReps.ts');

/** A wall clock the pipeline reads (Date.now is what the real modules call). */
function withClock(fn) {
  const real = Date.now; let clock = 1e12; Date.now = () => clock;
  try { return fn((t) => { clock = t; }, () => clock); } finally { Date.now = real; }
}

/**
 * Runs `events` ([{ t (ms), line }]) through the NEW and the OLD pipeline.
 * opts: { exerciseId, personMissingFromTrack: true, tickMs: 200, endMs, facing, trackingCue(t)->string|null,
 *         engineFromLog: true = the engine's half-rep events are the REAL [ATTEMPT-MISSED] lines of the log (a log from the new native build) instead of the mirror,
 *         round11: true = the round-11 flow (BEFORE the 2026-11-27 fixes: no start-zone filter, a stroke answered only after it was reported, judging out of position) }
 * Returns { rows: [{ t, match, conf, guide, ... }], verdicts: [{ t, show, reason }], old: { conf: [{t, v}], x: [...], cue: [...] } }
 */
function run(events, opts = {}) {
  const exerciseId = opts.exerciseId || 'shoulderPress';
  const tickMs = opts.tickMs || 200;
  const t0 = events.length ? events[0].t : 0;
  const endMs = opts.endMs ?? (events.length ? events[events.length - 1].t : 0);
  return withClock((setClock, getClock) => {
    // ── new ──
    const logs = [];
    const log = (m) => logs.push({ t: getClock() - 1e12, m });
    const counter = LT.createCounterSignal();
    const mm = MMm.createMovementMatch({ log });
    const conf = CCm.createCameraConfidence({ log });
    const guide = GCm.createGuide({ log });
    const cueHold = GCm.createCueHold();             // the screen holds the camera's own cue (GUIDE.cuePersistSec) and checks it against the metric stream
    let meterPrimed = false;
    const meterS = LT.createMeterSmoother();         // the number on screen: slew-limited, evidence only
    const coach = GCm.createCoach({ log });
    const det = AD.createAttemptDetector({ exerciseId, log: (m) => log(m) });
    const rd = RD.createRepDiagnostic(undefined, exerciseId);
    const st = { lastCountAt: 0, missed: 0, soft: 0, native: 0, lost: false, lastJudgedAt: 0 };
    const rows = [], verdicts = [];
    // ── old ──
    const counterO = LT.createCounterSignal();
    const detO = AD_OLD.createAttemptDetector({ exerciseId, log: () => {} });
    const rdO = RD.createRepDiagnostic(undefined, exerciseId);
    const old = { conf: [], x: [], cue: [], stuck: [] };

    // ONE JUDGE (2026-11-15): the attempt detector (det) feeds Movement Match / logs only. A half rep is judged by the MIRROR of the engine's own
    // missed-attempt tracker (scripts/lib/missed-attempt-mirror.js = ExerciseEngine.swift trackAttempt), through the same Coach path as a counted rep.
    // (2026-11-25) the same flow as app/formcheck.tsx: a half rep's cross is HELD until the arms are back at the start position (lib/verdictTiming.ts), and a stroke the
    // engine gave no verdict at all gets its cross from the screen (lib/noSilentReps.ts)
    const silent = NS.createSilentWatch();
    const r12 = opts.round11 !== true;
    const pos = NS.createPositionWatch();
    const ignored = [], positionLog = [];
    let pendingCross = null, lastMetric = null, lines = null, unreliableAt = -1e12;
    const deliverCross = (reason, at, why, val, src, strokeOnPath) => {
      const now = getClock();
      silent.noteAnswered(now);
      // (2026-11-27) out of position (walking to the phone, not clearly seen): nothing is judged, the same rule as app/formcheck.tsx deliverCross
      if (r12 && st.out) { verdicts.push({ t: now - 1e12, show: null, reason: '', src: src || 'missed', why: 'out of position: nothing is judged', eventAt: at - 1e12, metric: val }); return; }
      // the camera cannot judge it while the Guide says so (the number is already capped): the same rule as app/formcheck.tsx deliverCross
      if (st.guideProblem) { verdicts.push({ t: now - 1e12, show: null, reason: '', src: src || 'missed', why: 'the Guide shows a camera problem: the camera cannot judge it', eventAt: at - 1e12, heldMs: now - at, metric: val }); return; }
      const v = coach.verdict({ now, match: mm.result(), source: 'missed', missedReason: reason, strokeOnPath: r12 ? strokeOnPath : undefined, exerciseId: opts.oldWords ? undefined : exerciseId });
      if (v.show) st.lastJudgedAt = now;
      verdicts.push({ t: now - 1e12, show: v.show, reason: v.reason, src: src || 'missed', score: mm.result().score, eventAt: at - 1e12, heldMs: now - at, why, metric: val });
    };
    const flushCross = (why) => { if (pendingCross) { const p = pendingCross; pendingCross = null; deliverCross(p.reason, p.at, why, lastMetric ? lastMetric.v : null); } };
    const startLines = () => lines;   // { topAngle, repExitThreshold } from the [METRIC] lines (the same numbers app/formcheck.tsx reads from the definition)
    const handleMissed = (m) => {
      const now = getClock();
      // (2026-11-27) a half rep that never left the start zone is barely moving: no result, nothing changes (app/formcheck.tsx missed listener)
      if (r12 && m.reason === 'short_bottom' && startLines() && !VT.leftStartZone(m.reached, startLines())) { ignored.push({ t: now - 1e12, src: 'engine', reached: m.reached }); return; }
      st.missed++;
      flushCross('a newer stroke arrived');
      if (opts.immediateCross) { deliverCross(m.reason, now, 'immediate (the old behaviour)', lastMetric ? lastMetric.v : null); return; }
      pendingCross = { reason: m.reason, at: now, size: m.size, reached: m.reached, onPath: m.reason === 'short_bottom' && !!startLines() && VT.deepHalfRep(m.reached, startLines()) };
    };
    const mirror = MIRROR.createMissedAttemptMirror({ onMissed: (m) => { if (!opts.engineFromLog) handleMissed(m); } });
    const attempts = [];
    const onEvents = (evs) => { for (const ev of evs || []) if (ev.kind === 'attempt') {
      attempts.push({ t: getClock() - 1e12, n: ev.n, outcome: ev.outcome, low: ev.low, lowAt: ev.lowAt - 1e12 });
      if (r12 && (ev.outcome === 'missed' || ev.outcome === 'rejected') && startLines() && !VT.leftStartZone(ev.low, startLines())) { ignored.push({ t: getClock() - 1e12, src: 'detector', n: ev.n, low: ev.low }); continue; }
      silent.noteAttempt({ n: ev.n, outcome: ev.outcome, blocker: ev.blocker, lowAt: r12 ? ev.lowAt : undefined }, getClock(), getClock() - unreliableAt < 3000);
    } };
    const oldEvents = (evs) => {
      for (const ev of evs) {
        if (ev.kind === 'attempt' && (ev.outcome === 'missed' || ev.outcome === 'rejected')) old.x.push({ t: getClock() - 1e12, text: 'X ' + ev.reason, src: 'attempt' });
        if (ev.kind === 'attempt' && ev.outcome === 'soft') old.x.push({ t: getClock() - 1e12, text: 'CHECK', src: 'soft' });
        if (ev.kind === 'stuck') old.stuck.push({ t: getClock() - 1e12, text: ev.cue });
      }
    };
    const tick = () => {
      const now = getClock();
      const m = mm.result();
      det.setPathCut(m.cut);
      counter.setFlags({ diag: !!rd.message(), cue: false });
      const rej = det.recentReject(8000);
      const vis = counter.score(now);
      if (r12) { const pw = pos.update(now, { visibility: vis, personMissing: st.lost, recentGaps: counter.gapsWithin(now, NS.POSITION_GAP_WINDOW_MS) }); st.out = pw.out; if (pw.changed) positionLog.push({ t: now - 1e12, out: pw.out, why: pw.why }); }
      const c = conf.update({ now, visibility: vis, match: m, lastCountAt: st.lastCountAt, lastJudgedAt: st.lastJudgedAt > 0 ? st.lastJudgedAt : 0, missedSinceCount: st.missed, unreliableRecently: rej.lowQuality });
      if (pendingCross) {
        const val = lastMetric && now - lastMetric.t < 700 && (opts.round11 === true || lastMetric.t >= pendingCross.at - 30) ? lastMetric.v : null;
        // opts.timing === 'r12': the round-12 timing (BEFORE this round: no expected return time, a held cross only checked on the 200 ms tick)
        const oldHold = (opts.round11 || opts.timing === 'r12') && !(val !== null && VT.backAtStart(val, lines || { topAngle: 84, repExitThreshold: 58 })) && now - pendingCross.at < VT.CROSS_MAX_WAIT_MS;
        const d = oldHold ? { due: false } : lines ? VT.crossDue(pendingCross, now, val, lines) : { due: true, why: 'no start line' };
        const mLow = m.haveData && m.notTrying;
        if (d.due && pendingCross.onPath && mLow && val === null && /about back/.test(d.why || '')) { /* wait for a reading (the same rule as app/formcheck.tsx) */ }
        else if (d.due) { const p = pendingCross; pendingCross = null; deliverCross(p.reason, p.at, d.why, val, undefined, p.onPath && !!lines && VT.backAtStart(val, lines)); }
      }
      if (!opts.immediateCross) {
        const sil = silent.tick(now, { notTrying: m.haveData && m.notTrying, engineRejectedUnreliable: now - unreliableAt < 8000 || !!m.cut, lastPoseGapAt: r12 ? counter.lastGapAt() : 0 });
        if (sil && sil.kind === 'cross') deliverCross(sil.reason, now - 1300, 'no verdict came for stroke #' + sil.n, null, 'silent');
        else if (sil && sil.kind === 'camera') verdicts.push({ t: now - 1e12, show: null, reason: '', src: 'camera', why: 'tracking unreliable: the camera cannot judge stroke #' + sil.n });
      }
      // the same evidence rule as app/formcheck.tsx: the camera's cue becomes words only when the metric stream backs it up
      const rawCue = opts.trackingCue ? opts.trackingCue(now - 1e12) : null;
      const cueHeld = cueHold.feed(now, !!rawCue || st.lost);
      const streamHealthy = counter.seen() && counter.healthy(now, 1500, 2);
      const cueProven = cueHeld && !streamHealthy;
      let meter = 0;   // (on the phone the setup meter is already high when tracking starts)
      const g = guide.decide({
        now, exerciseId, personMissing: st.lost && cueProven, nativeCue: cueProven ? rawCue : null, outOfPlaneCue: null, diag: rd.message(),
        match: m, stuck: c.stuck, rejectedLowQuality: rej.lowQuality, rejectedDark: rej.dark, rejectedJoints: rej.joints, facing: opts.facing,
      });
      meter = meterS.tick(LT.capForGuide(c.value, !!g.line && g.reason !== 'none'), now, meterPrimed ? (!!g.line && g.reason !== 'none' ? LT.METER_GUIDE_RATE : LT.METER_MAX_RATE) : 1e6);   // the Guide and the number agree (a camera-problem line caps it)
      meterPrimed = true;
      st.guideProblem = !!g.line && g.reason !== 'none';
      rows.push({ t: now - 1e12, meter, cueRaw: rawCue, cueHeld, cueProven, match: m, conf: c, guide: g.line, guideWhy: g.why, guideReason: g.reason, guideEvidence: g.evidence });
      // old
      counterO.setFlags({ diag: !!rdO.message(), cue: false });
      old.conf.push({ t: now - 1e12, v: counterO.score(now) });
      const oc = detO.cue();
      old.cue.push({ t: now - 1e12, text: oc || rdO.message() || null });
    };

    // The frames the ENGINE would have seen. A device log only has the [METRIC] line about 2.5 times a second, so a rep's real bottom is usually not in it;
    // the [REP] line carries the engine's own bottom (bottom=38.5), which is added as a frame 600 ms before the [REP] line (the line comes after the rep has risen back above the exit line), so a counted rep is
    // never mistaken for a half rep. [REP-TRACE] lines (10 a second while a rep is in progress) are frames too.
    const mirrorFrames = [];
    if (opts.nativeMissed !== false && !opts.engineFromLog) {
      for (const ev of events) {
        const mx = /^\[METRIC\].*?value=([-\d.]+) enter=([-\d.]+) exit=([-\d.]+) rom=([-\d.]+) top=([-\d.]+)/.exec(ev.line);
        if (mx) mirrorFrames.push({ t: ev.t, v: +mx[1], lines: { enter: +mx[2], exit: +mx[3], rom: +mx[4], top: +mx[5] } });
        const tr = /^\[REP-TRACE\][^\n]*?angle=([-\d.]+)/.exec(ev.line);
        if (tr) mirrorFrames.push({ t: ev.t, v: +tr[1] });
        const rp = /^\[REP\] #\d+ .*?bottom=([-\d.]+)/.exec(ev.line);
        if (rp) mirrorFrames.push({ t: ev.t - 600, v: +rp[1] });
      }
      mirrorFrames.sort((x, y) => x.t - y.t);
    }
    let mi = 0;
    let i = 0, t = t0 + tickMs;
    for (; t <= endMs; t += tickMs) {
      while (mi < mirrorFrames.length && mirrorFrames[mi].t <= t) {
        const fr = mirrorFrames[mi++];
        setClock(1e12 + fr.t);
        if (fr.lines) mirror.setLines(fr.lines);
        mirror.frame(fr.v, getClock());
      }
      setClock(1e12 + t);
      while (i < events.length && events[i].t <= t) {
        const line = events[i].line;
        setClock(1e12 + events[i].t);
        counter.feedLog(line, getClock()); counterO.feedLog(line, getClock());
        mm.feed(line); rd.feed(line); rdO.feed(line);
        { const mv = /^\[METRIC\][^\n]*? value=([-\d.]+)/.exec(line) || /^\[REP-TRACE\][^\n]*?angle=([-\d.]+)/.exec(line); if (mv) { lastMetric = { v: parseFloat(mv[1]), t: getClock() }; if (!opts.round11 && pendingCross && lines && opts.timing !== 'r12') { const val = lastMetric.v; if (VT.backAtStart(val, lines) && lastMetric.t >= pendingCross.at - 30) { const p = pendingCross; pendingCross = null; deliverCross(p.reason, p.at, 'the arms are back at the start position', val, undefined, p.onPath && VT.backAtStart(val, lines)); } } }
          const ml = /^\[METRIC\].*? enter=([-\d.]+) exit=([-\d.]+) .*? top=([-\d.]+)/.exec(line); if (ml) lines = { repEnterThreshold: parseFloat(ml[1]), repExitThreshold: parseFloat(ml[2]), topAngle: parseFloat(ml[3]) };
          if (/^\[REP\] rejected .{1,3} tracking unreliable/.test(line)) unreliableAt = getClock(); }
        { const em = opts.engineFromLog && /^\[ATTEMPT-MISSED\] (?!from )\S+ (short_\w+) reached=([-\d.]+) needed=([-\d.]+)/.exec(line); if (em) handleMissed({ reason: em[1], reached: parseFloat(em[2]), needed: parseFloat(em[3]) }); }
        if (/^\[TRACK\] person lost/.test(line)) st.lost = true;
        if (/^\[TRACK\] person back/.test(line)) st.lost = false;
        if (line.startsWith('[METRIC]')) st.lost = false;
        const m = /^\[REP\] #(\d+) .*?cue=(.*)$/.exec(line);
        if (m) {
          st.lastCountAt = getClock(); st.missed = 0; st.native++;
          const good = m[2].trim() === 'GOOD';
          silent.noteAnswered(getClock()); flushCross('a counted rep arrived');
          if (r12 && st.out) { verdicts.push({ t: getClock() - 1e12, show: null, reason: '', src: 'native', why: 'out of position: the rep counts, nothing is judged' }); old.x.push({ t: getClock() - 1e12, text: good ? 'CHECK' : 'X ' + m[2].trim(), src: 'native' }); onEvents(det.feed(line)); oldEvents(detO.feed(line)); i++; continue; }
          const bm = /bottom=([-\d.]+)/.exec(line);
          const v = coach.verdict({ now: getClock(), match: mm.result(), source: 'native', exerciseId: opts.oldWords ? undefined : exerciseId, good, reason: good ? '' : m[2].trim(), onPath: mm.repOnPath(bm ? parseFloat(bm[1]) : undefined) });
          verdicts.push({ t: getClock() - 1e12, show: v.show, reason: v.reason, src: 'native', score: mm.result().score });
          // old: a counted rep got a check, a bad one the old reason
          old.x.push({ t: getClock() - 1e12, text: good ? 'CHECK' : 'X ' + m[2].trim(), src: 'native' });
        }
        onEvents(det.feed(line));
        oldEvents(detO.feed(line));
        i++;
      }
      setClock(1e12 + t);
      onEvents(det.feed(''));   // an empty line lets pending attempts resolve on time (the real screen feeds a line every few frames)
      oldEvents(detO.feed(''));
      tick();
    }
    return { rows, verdicts, logs, old, state: st, ignored, positionLog, attempts };
  });
}

module.exports = { run, withClock, GCm, MMm, CCm, AD };
