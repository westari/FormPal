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
  minStrokeFraction: 0.45,  // a low-to-high stroke must cover at least this much of the full range to be an attempt
  minPeriodSec: 1.0,        // two attempts closer than this are one wobble
  maxPeriodSec: 8,          // a stroke slower than this is not a rep rhythm
  stuckAttempts: 3,         // this many attempts in a row with no rep counted -> say the real blocker
  stuckSeconds: 10,         // ...or this long since the last counted rep while attempts keep happening
  cueHoldSec: 4,            // how long a blocker cue stays up
  adaptMaxShortFraction: 0.6, // adapt only when the lows (or highs) fall short of the line by at most this fraction of the range
  adaptSpreadFraction: 0.25,  // ...and the last attempts agree with each other within this fraction of the range
  adaptMargin: 0.08,          // the adapted line sits this fraction of the range beyond the person's typical extreme
  scoreCountMin: 55,        // an attempt rated at least this counts as a soft rep once adapted
};

export type Blocker = 'bottom-short' | 'top-short' | 'tracking' | 'paused' | 'angle' | 'light' | 'none';

export interface AttemptEvent {
  kind: 'attempt';
  n: number;
  score: number;
  low: number; high: number; periodSec: number;
  outcome: 'counted' | 'rejected' | 'missed' | 'soft';
  blocker: Blocker;
  /** 2-3 words for the X shown on screen for a missed attempt (never silent) */
  reason: string;
}
export interface StuckEvent { kind: 'stuck'; blocker: Blocker; cue: string; attemptsInARow: number; sinceRepSec: number }
export interface AdaptEvent { kind: 'adapt'; side: 'bottom' | 'top'; enter: number; exit: number; basedOn: number }
export type DetectorEvent = AttemptEvent | StuckEvent | AdaptEvent;

export interface Detector {
  feed(line: string): DetectorEvent[];
  /** the engine's coaching hint about camera angle / framing, if any (stats.outOfPlaneCue) */
  setAngleCue(cue: string | null): void;
  /** current blocker cue (2-3 words) while it should be on screen, else null */
  cue(): string | null;
  softReps(): number;
  adapted(): { enter: number; exit: number } | null;
  reset(): void;
}

/** 2-3 word cue per blocker for this exercise family. */
export function blockerCue(blocker: Blocker, exerciseId: string | undefined): string {
  const id = exerciseId ?? '';
  const press = /press|overhead/i.test(id), raise = /raise/i.test(id), squat = /squat|lunge|stepup|dip/i.test(id);
  const push = /pushup/i.test(id), pull = /curl|row|pull/i.test(id);
  switch (blocker) {
    case 'bottom-short': return press ? 'Elbows lower' : squat || push ? 'Go lower' : raise ? 'Arms down' : pull ? 'Arms down' : 'Go lower';
    case 'top-short':    return press ? 'Press higher' : squat ? 'Stand tall' : push ? 'Push higher' : raise ? 'Raise higher' : pull ? 'Pull higher' : 'Go higher';
    case 'tracking':     return 'Step back';
    case 'paused':       return press ? 'Hands to shoulders' : 'Reset, start over';
    case 'angle':        return 'Turn to the side';
    case 'light':        return 'More light';
    default:             return 'Bigger movement';
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
  let stuckCue: { text: string; until: number } | null = null;
  let missedLows: number[] = [], missedHighs: number[] = [], missedBlockers: Blocker[] = [];
  let adaptedLine: { enter: number; exit: number } | null = null;
  let startedAt = 0;

  const range = () => Math.max(1e-6, Math.abs(top - rom));
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  function smoothed(): number {
    const tail = samples.slice(-T.smoothN).map(p => p.v);
    return median(tail);
  }

  function blockerFor(low: number, high: number): Blocker {
    const t = now();
    if (suppressedAt && t - suppressedAt < 2500) return 'paused';
    if (lastNoPersonAt && t - lastNoPersonAt < 3000) return 'tracking';
    if (rejectKind === 'unreliable' && pendingRejectAt && t - pendingRejectAt < 6000) return rejectLightMax < 0.45 ? 'light' : 'tracking';
    if (angleCue) return 'angle';
    const bottomShort = low > enter;              // never got below the engine's entry line
    const topShort = high < exit;                 // never got back above the exit line
    if (bottomShort && (!topShort || low - enter >= exit - high)) return 'bottom-short';
    if (topShort) return 'top-short';
    return 'none';
  }

  // An attempt's outcome is decided ~1.5s after the stroke ends: the engine's [REP] line arrives a moment AFTER the person has
  // finished the stroke, so deciding at once would call every counted rep "missed".
  interface Pending { low: Pt; high: Pt; at: number; period: number; repSeen: boolean }
  let pending: Pending[] = [];
  const RESOLVE_MS = 1500;
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
      const fullyValid = low.v <= enter && low.v >= enter - 0.8 * range() && high.v >= exit; // a dip far below the person's range is a tracking glitch, not a rep
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
    }
    const ev: AttemptEvent = { kind: 'attempt', n: nAttempts, score, low: low.v, high: high.v, periodSec: period, outcome, blocker, reason: outcome === 'missed' ? blockerCue(blocker, exerciseId) : outcome === 'rejected' ? '' : '' };
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
    // an attempt completes when we are heading up after a low and have risen the minimum stroke above that low
    if (lastLow && lastHigh && dir === 'up' && lastLow.t > lastHigh.t) {
      const risen = (ext!.v - lastLow.v) / range();
      const highAhead = ext!;
      if (risen >= T.minStrokeFraction) {
        const slow = (highAhead.t - lastHigh.t) / 1000 > T.maxPeriodSec;
        const tooSoon = lastAttemptAt && (t - lastAttemptAt) / 1000 < T.minPeriodSec;
        const low = lastLow, high = highAhead;
        lastLow = null;
        if (!slow && !tooSoon) { const period = lastAttemptAt ? (t - lastAttemptAt) / 1000 : 0; lastAttemptAt = t; pending.push({ low, high, at: t, period, repSeen: false }); return []; }
      }
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
    cue() { const t = now(); if (stuckCue && t < stuckCue.until) return stuckCue.text; return null; },
    softReps() { return soft; },
    adapted() { return adaptedLine; },
    reset() {
      samples = []; lastHigh = lastLow = null; dir = null; ext = null; lastAttemptAt = 0; nAttempts = 0; missedInARow = 0;
      lastRepAt = 0; repCount = 0; soft = 0; pendingRejectAt = 0; rejectKind = ''; suppressedAt = 0; lastNoPersonAt = 0;
      stuckCue = null; missedLows = []; missedHighs = []; missedBlockers = []; adaptedLine = null; startedAt = 0; pending = [];
    },
  };
}
