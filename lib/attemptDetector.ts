/**
 * lib/attemptDetector.ts
 *
 * Tells apart "the person is clearly TRYING the movement" from "the rep passed". Fed with the engine's own log lines (the
 * same stream lib/repDiagnostics.ts reads), it follows the measured value of the exercise's main joint path and finds
 * ATTEMPTS: a down-and-up stroke of real size, at a rep rhythm, whether or not the engine counted it.
 *
 * Why: the old "moved but nothing counted" rule said one fixed thing ("Press higher") for as long as nothing counted, even
 * when the person WAS pressing higher. The real log (2026-11-11, shoulder press): the engine counted 4 reps, then for two
 * minutes counted nothing while the person kept pressing. The value never dipped below the engine's entry line (50) on the
 * way down (lows around 60-66) and later the engine's own "inactivity" pause turned counting off. Repeating "Press higher"
 * could never help.
 *
 * What it does:
 *   - every attempt is rated (score 0-100) and gets an outcome: counted / rejected / missed, and when missed, the check that
 *     blocked it (bottom not low enough, top not high enough, tracking, engine paused). One [ATTEMPT] log line each.
 *   - when attempts keep happening but nothing counts (3 attempts in a row, or ~10s) it stops repeating one cue and says the
 *     REAL blocker in 2-3 words, with something the person can do.
 *   - when the person keeps reaching nearly the same low / high and falls just short of the line (camera angles differ),
 *     it ADAPTS to that range and counts those attempts itself ("soft reps"), instead of nagging forever.
 *
 * ALL THE NUMBERS BELOW ARE PLACEHOLDERS (from one real log), labelled as such, to be tuned from the [ATTEMPT] lines.
 */

// ── placeholders ──────────────────────────────────────────────────────────────────────────────────────────────────
export const ATTEMPT_TUNING = {
  smoothN: 3,               // median of the last N samples (the log gives a value about every 0.33s)
  swingHysteresis: 0.22,    // a turn is real when the value moved this fraction of the exercise's full range
  minStrokeFraction: 0.3,   // a low-to-high stroke (and the drop before it) must cover at least this much of the full range to be an attempt
  minStrokeSec: 0.5,        // a real stroke (down and up) takes at least this long; a flick is not a rep
  maxLowAboveEnter: 0.95,   // a stroke whose low stays further above the entry line than this (fraction of the range) is a wiggle at the top. (Was 0.75; the 2026-11-13 log: Ari's deliberate half reps bottomed at 62-73 with the line at 50 and were thrown out)
  lowRangeBelowEnter: 0.7,  // a low further under the entry line than this (fraction of the range) is not this exercise's path (arms dropped to the side)
  lockoutFraction: 0.94,    // for the "Go higher" side: the top reading counts as full when it reaches this fraction of the top value
  minPeriodSec: 1.0,        // two attempts closer than this are one wobble
  maxPeriodSec: 8,          // a stroke slower than this is not a rep rhythm
  stuckAttempts: 3,         // this many attempts in a row with no rep counted -> say the real blocker
  stuckSeconds: 10,         // ...or this long since the last counted rep while attempts keep happening
  cueHoldSec: 4,            // how long a blocker cue stays up
  adaptMaxShortFraction: 0,   // ADAPTING IS OFF (2026-11-11): a half rep must always get an X, never become a counted rep. (Was 0.6.)
  adaptSpreadFraction: 0.25,  // ...and the last attempts agree with each other within this fraction of the range
  adaptMargin: 0.08,          // the adapted line sits this fraction of the range beyond the person's typical extreme
  scoreCountMin: 55,        // an attempt rated at least this counts as a soft rep once adapted
};

export type Blocker = 'bottom-short' | 'top-short' | 'tracking' | 'paused' | 'angle' | 'light' | 'cut' | 'none';

export interface AttemptEvent {
  kind: 'attempt';
  n: number;
  score: number;
  low: number; high: number; periodSec: number;
  /** the stroke size in rep spans: (high - low) / R */
  strokeR: number;
  outcome: 'counted' | 'rejected' | 'missed' | 'soft';
  blocker: Blocker;
  /** 2-3 words for the X shown on screen for a missed attempt (never silent) */
  reason: string;
}
export interface StuckEvent { kind: 'stuck'; blocker: Blocker; cue: string; attemptsInARow: number; sinceRepSec: number }
export interface AdaptEvent { kind: 'adapt'; side: 'bottom' | 'top'; enter: number; exit: number; basedOn: number }
export interface IgnoredEvent { kind: 'ignored'; why: string; low: number; high: number; /** hard evidence it was not the exercise (the arms dropped far below the path): a rep the engine counted for it is taken back */ retract: boolean }
export type DetectorEvent = AttemptEvent | StuckEvent | AdaptEvent | IgnoredEvent;

export interface Detector {
  feed(line: string): DetectorEvent[];
  /** the engine's coaching hint about camera angle / framing, if any (stats.outOfPlaneCue) */
  setAngleCue(cue: string | null): void;
  /** where Movement Match sees the rep path cut off from the camera (hands leaving the frame at the top...) */
  setPathCut(cut: 'top' | 'bottom' | 'both' | 'frame' | null): void;
  /** the camera rejected a rep for low joint quality within the last `ms` (and how dark it was) */
  recentReject(ms: number): { lowQuality: boolean; dark: boolean };
  /** current blocker cue (2-3 words) while it should be on screen, else null */
  cue(): string | null;
  softReps(): number;
  /** true if a movement that did NOT match the exercise path (reaching for the phone, fumbling) was seen within the last `ms` */
  recentlyIgnored(ms: number): boolean;
  adapted(): { enter: number; exit: number } | null;
  reset(): void;
}

/**
 * The COACH word for a missed stroke (2-3 plain body words). Only a stroke that stayed SHORT gets one. Anything about the camera
 * (tracking, angle, light, a cut path, the engine paused) returns '' here: that is the GUIDE's business (lib/guideCoach.ts), never an X.
 */
export function blockerCue(blocker: Blocker, _exerciseId: string | undefined): string {
  switch (blocker) {
    case 'bottom-short': return 'Go lower';
    case 'top-short':    return 'Go higher';
    case 'none':         return 'Full movement';
    default:             return '';
  }
}

interface Pt { t: number; v: number }

export function createAttemptDetector(opts: { exerciseId?: string; now?: () => number; log?: (m: string) => void } = {}): Detector {
  const T = ATTEMPT_TUNING;
  const now = opts.now ?? (() => Date.now());
  const exerciseId = opts.exerciseId;

  let enter = 0, exit = 0, top = 0, rom = 0, haveDef = false;
  let samples: Pt[] = [];          // raw
  let lastHigh: Pt | null = null;  // latest confirmed high turn
  let lastLow: Pt | null = null;   // latest confirmed low turn since lastHigh
  let dir: 'up' | 'down' | null = null;
  let ext: Pt | null = null;       // running extreme in the current direction
  let lastAttemptAt = 0;
  let nAttempts = 0;
  let missedInARow = 0;
  let lastRepAt = 0, repCount = 0, soft = 0;
  let pendingRejectAt = 0, rejectKind: 'unreliable' | 'other' | '' = '', rejectLightMax = 1;
  let suppressedAt = 0;
  let lastNoPersonAt = 0;
  let angleCue: string | null = null;
  let pathCut: 'top' | 'bottom' | 'both' | 'frame' | null = null;
  let stuckCue: { text: string; until: number } | null = null;
  let missedLows: number[] = [], missedHighs: number[] = [], missedBlockers: Blocker[] = [];
  let adaptedLine: { enter: number; exit: number } | null = null;
  let cand: { start: Pt; low: Pt; high: Pt } | null = null;
  let ignoredAt = 0;
  let startedAt = 0;

  const range = () => Math.max(1e-6, Math.abs(top - rom));
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  function smoothed(): number {
    const tail = samples.slice(-T.smoothN).map(p => p.v);
    return median(tail);
  }

  function blockerFor(low: number, high: number): Blocker {
    const t = now();
    // Which END fell short, as the person sees it: how far the top is under full lockout, and how far the bottom is above the engine's
    // entry line.
    const lockMin = top * T.lockoutFraction;
    const topDef = Math.max(0, (lockMin - high) / range());
    const bottomDef = Math.max(0, (low - enter) / range());
    // 1) the camera could not see it (the GUIDE's business: no X, the Guide fixes the setup)
    if (lastNoPersonAt && t - lastNoPersonAt < 3000) return 'tracking';
    if (rejectKind === 'unreliable' && pendingRejectAt && t - pendingRejectAt < 6000) return rejectLightMax < 0.45 ? 'light' : 'tracking';
    if (angleCue) return 'angle';
    if (pathCut === 'frame') return 'tracking';
    if ((pathCut === 'top' || pathCut === 'both') && topDef > 0) return 'cut';
    if ((pathCut === 'bottom' || pathCut === 'both') && bottomDef > 0) return 'cut';
    // 2) the stroke stayed short (the COACH's business: an X with "Go higher" / "Go lower"). For presses a top that is not near lockout
    //    is called first: that is what a beginner can fix.
    const press = /press|overhead/i.test(exerciseId ?? '');
    if (press && topDef > 0.08) return 'top-short';
    if (bottomDef > 0 && bottomDef >= topDef) return 'bottom-short';
    if (topDef > 0) return 'top-short';
    // 3) a full stroke the engine had paused itself for (counted as a soft rep by the app)
    if (suppressedAt && t - suppressedAt < 2500) return 'paused';
    return 'none';
  }

  // An attempt's outcome is decided ~1.5s after the stroke ends: the engine's [REP] line arrives a moment AFTER the person has
  // finished the stroke, so deciding at once would call every counted rep "missed".
  interface Pending { low: Pt; high: Pt; at: number; period: number; repSeen: boolean }
  let pending: Pending[] = [];
  const RESOLVE_MS = 600;   // was 1500: the engine's [REP] line arrives at the low, BEFORE the stroke's peak has stalled (0.9s), so waiting longer only made an X late
  function flush(): DetectorEvent[] {
    const t = now(); const out: DetectorEvent[] = [];
    while (pending.length && t - pending[0].at >= RESOLVE_MS) out.push(...resolve(pending.shift()!));
    return out;
  }
  function resolve(p: Pending): DetectorEvent[] {
    return onAttempt(p.low, p.high, p.at, p.period, p.repSeen);
  }
  function onAttempt(low: Pt, high: Pt, at: number, period: number, repSeen: boolean): DetectorEvent[] {
    const out: DetectorEvent[] = [];
    const t = at;
    nAttempts++;
    const stroke = (high.v - low.v) / range();
    // score: size of the stroke (60), rhythm (25), a clear return (15)
    const size = Math.min(1, stroke / 0.9) * 60;
    const rhythm = period === 0 ? 20 : period >= T.minPeriodSec && period <= T.maxPeriodSec ? 25 : 8;
    const clear = high.v >= exit ? 15 : 5;
    const score = Math.round(size + rhythm + clear);

    // did the engine count / reject it? A [REP] line arrives within about a second of the attempt's end.
    const counted = repSeen;
    const rejected = !counted && pendingRejectAt && Math.abs(t - pendingRejectAt) < 2000;
    let outcome: AttemptEvent['outcome'] = counted ? 'counted' : rejected ? 'rejected' : 'missed';
    let blocker: Blocker = 'none';
    if (outcome === 'missed') {
      blocker = blockerFor(low.v, high.v);
      // ADAPT: the same low (or high) again and again, just short of the line -> take that as this person's real range
      // soft rep: (1) a stroke that fully meets the engine's own lines (below enter, back above exit) while the engine had paused
      // itself (its inactivity pause stopped counting real reps in the 2026-11-11 log); or (2) a stroke inside the ADAPTED range.
      const fullyValid = low.v <= enter && low.v >= Math.min(enter, rom) - 0.8 * range() && high.v >= exit; // a dip far below the person's range is a tracking glitch, not a rep
      const adaptedOk = !!adaptedLine && low.v <= adaptedLine.enter && high.v >= adaptedLine.exit && blocker !== 'paused';
      if (score >= T.scoreCountMin && ((blocker === 'paused' && fullyValid) || adaptedOk)) {
        outcome = 'soft'; soft++; blocker = 'none'; missedInARow = 0; missedLows = []; missedHighs = []; missedBlockers = [];
        lastRepAt = t;
      } else {
        missedInARow++;
        missedLows.push(low.v); missedHighs.push(high.v); missedBlockers.push(blocker);
        if (missedLows.length > 6) { missedLows.shift(); missedHighs.shift(); missedBlockers.shift(); }
        const side = blocker === 'bottom-short' ? 'bottom' : blocker === 'top-short' ? 'top' : null;
        if (!adaptedLine && side && missedInARow >= T.stuckAttempts) {
          const lastN = (side === 'bottom' ? missedLows : missedHighs).slice(-T.stuckAttempts);
          const spread = Math.max(...lastN) - Math.min(...lastN);
          const typical = median(lastN);
          const shortBy = side === 'bottom' ? typical - enter : exit - typical;
          if (spread <= T.adaptSpreadFraction * range() && shortBy > 0 && shortBy <= T.adaptMaxShortFraction * range() && missedBlockers.slice(-T.stuckAttempts).every(b => b === blocker)) {
            const m = T.adaptMargin * range();
            adaptedLine = side === 'bottom' ? { enter: typical + m, exit } : { enter, exit: typical - m };
            const ev: AdaptEvent = { kind: 'adapt', side, enter: adaptedLine.enter, exit: adaptedLine.exit, basedOn: lastN.length };
            out.push(ev);
            opts.log?.(`[ATTEMPT] ADAPT ${side}: attempts kept reaching ${typical.toFixed(1)} (line was ${side === 'bottom' ? enter : exit}); new line enter=${adaptedLine.enter.toFixed(1)} exit=${adaptedLine.exit.toFixed(1)} (PLACEHOLDER numbers)`);
          }
        }
      }
    } else {
      missedInARow = 0; missedLows = []; missedHighs = []; missedBlockers = [];
      // the engine threw it out: say which end fell short (or that it could not see you), same words as a missed one
      if (outcome === 'rejected') blocker = blockerFor(low.v, high.v);
    }
    const ev: AttemptEvent = { kind: 'attempt', n: nAttempts, score, low: low.v, high: high.v, periodSec: period, strokeR: stroke, outcome, blocker, reason: outcome === 'missed' || outcome === 'rejected' ? blockerCue(blocker === 'none' ? 'bottom-short' : blocker, exerciseId) : '' };
    out.push(ev);
    opts.log?.(`[ATTEMPT] #${nAttempts} score=${score} low=${low.v.toFixed(1)} high=${high.v.toFixed(1)} period=${period.toFixed(1)}s outcome=${outcome} blocker=${blocker} (enter=${enter} exit=${exit}${adaptedLine ? ` adapted=${adaptedLine.enter.toFixed(1)}/${adaptedLine.exit.toFixed(1)}` : ''})`);

    // stuck?
    const sinceRep = lastRepAt ? (t - lastRepAt) / 1000 : (t - startedAt) / 1000;
    if (outcome === 'missed' && (missedInARow >= T.stuckAttempts || sinceRep >= T.stuckSeconds)) {
      const counts = new Map<Blocker, number>();
      for (const b of missedBlockers) counts.set(b, (counts.get(b) ?? 0) + 1);
      let best: Blocker = blocker, bc = 0;
      counts.forEach((c, b) => { if (c > bc) { bc = c; best = b; } });
      const cue = blockerCue(best === 'none' ? 'bottom-short' : best, exerciseId);
      stuckCue = { text: cue, until: t + T.cueHoldSec * 1000 };
      out.push({ kind: 'stuck', blocker: best, cue, attemptsInARow: missedInARow, sinceRepSec: sinceRep });
      opts.log?.(`[ATTEMPT] STUCK ${missedInARow} attempts in a row / ${sinceRep.toFixed(0)}s with no rep: blocker=${best} -> "${cue}"`);
    }
    return out;
  }

  // Does this stroke follow the exercise's path? Anything else (reaching for the phone, fumbling, shaking, the arms dropping to the
  // side) is IGNORED: no attempt, no X, and a rep the engine counted at that moment gets no check.
  function finishStroke(c: { start: Pt; low: Pt; high: Pt }, t: number): DetectorEvent[] {
    const R_ = range();
    // The stroke's length is its rise (low to peak) and the drop before it. c.start is the time of the LAST peak, which can be many seconds
    // back when the arms rested before this stroke; the old code counted that rest as part of the stroke and threw real half reps out
    // as "too slow" (2026-11-13 log: 12.4 s). The drop is taken as at most 2x the rise.
    const rise = (c.high.t - c.low.t) / 1000, drop = Math.min((c.low.t - c.start.t) / 1000, 2 * rise + 0.5);
    const dur = rise + Math.max(0, drop);
    let why = '';
    if (c.low.v < Math.min(enter, rom) - T.lowRangeBelowEnter * R_) why = 'the low is far below this exercise\'s path (arms dropped)';
    else if (c.high.v < exit - 0.1 * R_) why = 'it never came back up to the start zone';
    else if (c.low.v > enter + T.maxLowAboveEnter * R_) why = 'it stays up near the top (a wiggle, not a stroke)';
    else if (dur < T.minStrokeSec) why = 'too quick to be a rep (a flick)';
    else if (dur > T.maxPeriodSec) why = 'too slow to be a rep';
    // NOTE: shaking / fumbling was tried as a rule (direction changes, big back-and-forth jumps) and removed: on the real log it fired on
    // this person's real FAST reps (1.4s apart, jumps of half the range every 0.3s are normal for them). Only hard evidence is used.
    if (why) {
      ignoredAt = t;
      opts.log?.(`[ATTEMPT] ignored low=${c.low.v.toFixed(1)} high=${c.high.v.toFixed(1)} dur=${dur.toFixed(1)}s: ${why} (not the exercise path, no check or X)`);
      return [{ kind: 'ignored', why, low: c.low.v, high: c.high.v, retract: /arms dropped/.test(why) }];
    }
    const tooSoon = lastAttemptAt && (t - lastAttemptAt) / 1000 < T.minPeriodSec;
    if (tooSoon) return [];
    const period = lastAttemptAt ? (t - lastAttemptAt) / 1000 : 0;
    lastAttemptAt = t;
    // the engine's [REP] line comes when the rep completes, i.e. before the stroke's peak has settled: it counts for this stroke if it
    // arrived after the stroke's low
    pending.push({ low: c.low, high: c.high, at: t, period, repSeen: lastRepAt > 0 && lastRepAt >= c.low.t - 500 });
    return [];
  }

  function step(v: number): DetectorEvent[] {
    const t = now();
    samples.push({ t, v });
    if (samples.length > 40) samples.shift();
    if (!haveDef || samples.length < 2) return [];
    const s: Pt = { t, v: smoothed() };
    const H = T.swingHysteresis * range();
    const out: DetectorEvent[] = [];
    if (dir === null) { dir = 'up'; ext = s; return out; }
    if (dir === 'up') {
      if (s.v > ext!.v) ext = s;
      else if (ext!.v - s.v >= H) { lastHigh = ext; dir = 'down'; ext = s; }
    } else {
      if (s.v < ext!.v) ext = s;
      else if (s.v - ext!.v >= H) {
        // a low turn confirmed; the stroke is complete when it has come back up by a real stroke from the low
        lastLow = ext; dir = 'up'; ext = s;
      }
    }
    // A stroke is complete once it has come back up by a real amount from its low AND has stopped rising (so its HIGH is the real peak,
    // not the first point that cleared the minimum).
    if (lastLow && lastHigh && dir === 'up' && lastLow.t > lastHigh.t && !cand) {
      const risen = (ext!.v - lastLow.v) / range(), dropped = (lastHigh.v - lastLow.v) / range();
      if (risen >= T.minStrokeFraction && dropped >= T.minStrokeFraction) { cand = { start: lastHigh, low: lastLow, high: ext! }; lastLow = null; }
    }
    if (cand) {
      if (dir === 'up' && ext!.v > cand.high.v) cand.high = ext!;
      const fell = dir === 'down';
      const stalled = t - cand.high.t >= 900;
      if (fell || stalled) { const c2 = cand; cand = null; return finishStroke(c2, t); }
    }
    return out;
  }

  function feed(line: string): DetectorEvent[] {
    const t = now();
    if (!startedAt) startedAt = t;
    const fl = flush();
    if (fl.length) return fl.concat(feedInner(line, t));
    return feedInner(line, t);
  }
  function feedInner(line: string, t: number): DetectorEvent[] {
    if (line.startsWith('[METRIC]')) {
      const g = (k: string) => { const m = new RegExp(k + '=([-\\d.]+)').exec(line); return m ? parseFloat(m[1]) : NaN; };
      const v = g('value'), e = g('enter'), x = g('exit'), r = g('rom'), tp = g('top');
      if (!isNaN(e) && !isNaN(x) && !isNaN(r) && !isNaN(tp)) { enter = e; exit = x; rom = r; top = tp; haveDef = true; }
      lastNoPersonAt = 0;
      if (!isNaN(v)) return step(v);
      return [];
    }
    let m = /^\[REP-TRACE\][^\n]*?angle=([-\d.]+)/.exec(line);
    if (m) return step(parseFloat(m[1]));
    m = /^\[ACTIVITY\] suppressed[^\n]*?metric=([-\d.]+)/.exec(line);
    if (m) { suppressedAt = t; return step(parseFloat(m[1])); }
    if (/^\[ACTIVITY\] state=suppressed/.test(line)) { suppressedAt = t; return []; }
    if (/^\[ACTIVITY\] state=active/.test(line)) { return []; }
    if (/^\[TRACK\] person lost/.test(line)) { lastNoPersonAt = t; return []; }
    if (/^\[REP\] #\d+/.test(line)) { const pd = pending[pending.length - 1]; if (pd && t - pd.at < RESOLVE_MS) pd.repSeen = true; lastRepAt = t; repCount++; missedInARow = 0; missedLows = []; missedHighs = []; missedBlockers = []; stuckCue = null; return []; }
    if (/^\[REP\] rejected/.test(line)) {
      pendingRejectAt = t;
      if (/tracking unreliable/i.test(line)) {
        rejectKind = 'unreliable';
        const hi = [...line.matchAll(/=\[[-\d.]+-([\d.]+)\]/g)].map(x => parseFloat(x[1]));
        rejectLightMax = hi.length ? Math.max(...hi) : 1;
      } else rejectKind = 'other';
      return [];
    }
    return [];
  }

  return {
    feed,
    setAngleCue(c) { angleCue = c && c.trim() ? c : null; },
    setPathCut(c) { pathCut = c; },
    recentReject(ms) { const recent = rejectKind === 'unreliable' && pendingRejectAt > 0 && now() - pendingRejectAt <= ms; return { lowQuality: recent, dark: recent && rejectLightMax < 0.45 }; },
    cue() { const t = now(); if (stuckCue && t < stuckCue.until) return stuckCue.text; return null; },
    softReps() { return soft; },
    recentlyIgnored(ms: number) { return ignoredAt > 0 && now() - ignoredAt <= ms; },
    adapted() { return adaptedLine; },
    reset() {
      samples = []; lastHigh = lastLow = null; dir = null; ext = null; lastAttemptAt = 0; nAttempts = 0; missedInARow = 0;
      lastRepAt = 0; repCount = 0; soft = 0; pendingRejectAt = 0; rejectKind = ''; suppressedAt = 0; lastNoPersonAt = 0;
      stuckCue = null; missedLows = []; missedHighs = []; missedBlockers = []; adaptedLine = null; startedAt = 0; pending = []; cand = null; ignoredAt = 0; pathCut = null;
    },
  };
}
