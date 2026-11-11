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

/** A wall clock the pipeline reads (Date.now is what the real modules call). */
function withClock(fn) {
  const real = Date.now; let clock = 1e12; Date.now = () => clock;
  try { return fn((t) => { clock = t; }, () => clock); } finally { Date.now = real; }
}

/**
 * Runs `events` ([{ t (ms), line }]) through the NEW and the OLD pipeline.
 * opts: { exerciseId, personMissingFromTrack: true, tickMs: 200, endMs, facing, trackingCue(t)->string|null }
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

    const onEvents = (evs) => {
      const now = getClock();
      for (const ev of evs) {
        if (ev.kind !== 'attempt') continue;
        if (ev.outcome === 'soft') {
          st.soft++; st.lastCountAt = now; st.missed = 0;
          const v = coach.verdict({ now, match: mm.result(), source: 'soft' });
          verdicts.push({ t: now - 1e12, show: v.show, reason: v.reason, src: 'soft', score: mm.result().score });
        } else if (ev.outcome === 'missed' || ev.outcome === 'rejected') {
          st.missed++;
          const v = coach.verdict({ now, match: mm.result(), source: 'attempt', blocker: ev.blocker, rangeWord: ev.reason, n: ev.n });
          if (v.show) st.lastJudgedAt = now;
          verdicts.push({ t: now - 1e12, show: v.show, reason: v.reason, src: 'attempt', blocker: ev.blocker, score: mm.result().score });
        }
      }
    };
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
      const c = conf.update({ now, visibility: counter.score(now), match: m, lastCountAt: st.lastCountAt, lastJudgedAt: st.lastJudgedAt > 0 ? st.lastJudgedAt : 0, missedSinceCount: st.missed });
      const rej = det.recentReject(8000);
      const g = guide.decide({
        now, exerciseId, personMissing: st.lost, nativeCue: opts.trackingCue ? opts.trackingCue(now - 1e12) : null, outOfPlaneCue: null, diag: rd.message(),
        match: m, stuck: c.stuck, rejectedLowQuality: rej.lowQuality, rejectedDark: rej.dark, facing: opts.facing,
      });
      rows.push({ t: now - 1e12, match: m, conf: c, guide: g.line, guideWhy: g.why, guideReason: g.reason });
      // old
      counterO.setFlags({ diag: !!rdO.message(), cue: false });
      old.conf.push({ t: now - 1e12, v: counterO.score(now) });
      const oc = detO.cue();
      old.cue.push({ t: now - 1e12, text: oc || rdO.message() || null });
    };

    let i = 0, t = t0 + tickMs;
    for (; t <= endMs; t += tickMs) {
      setClock(1e12 + t);
      while (i < events.length && events[i].t <= t) {
        const line = events[i].line;
        setClock(1e12 + events[i].t);
        counter.feedLog(line, getClock()); counterO.feedLog(line, getClock());
        mm.feed(line); rd.feed(line); rdO.feed(line);
        if (/^\[TRACK\] person lost/.test(line)) st.lost = true;
        if (/^\[TRACK\] person back/.test(line)) st.lost = false;
        if (line.startsWith('[METRIC]')) st.lost = false;
        const m = /^\[REP\] #(\d+) .*?cue=(.*)$/.exec(line);
        if (m) {
          st.lastCountAt = getClock(); st.missed = 0; st.native++;
          const good = m[2].trim() === 'GOOD';
          const v = coach.verdict({ now: getClock(), match: mm.result(), source: 'native', good, reason: good ? '' : m[2].trim() });
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
    return { rows, verdicts, logs, old, state: st };
  });
}

module.exports = { run, withClock, GCm, MMm, CCm, AD };
