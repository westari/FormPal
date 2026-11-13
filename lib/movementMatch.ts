/**
 * lib/movementMatch.ts
 *
 * MOVEMENT MATCH: a 0-100 score of how much the user's motion looks like THIS exercise (are they trying it?), separate from whether a
 * rep passes. Also PATH COVERAGE: can the camera see the WHOLE rep path (a path cut at the top = hands leaving the frame at lockout).
 * Design, signals and rules: docs/movement-match.md. All numbers: lib/coachTuning.ts (placeholders).
 *
 * Generic for every exercise: every exercise streams the same `[METRIC] <id> value= enter= exit= rom= top=` line, so the model needs only
 * those numbers (each exercise's OWN, from its definition). Pure: no React, runs under node (scripts/test-movement-match.js).
 */
import { MOVEMENT_MATCH as T } from './coachTuning';

export interface MatchParts { motion: number; rhythm: number | null; range: number; position: number }
export type PathCut = 'top' | 'bottom' | 'both' | 'frame' | null;

export interface MatchResult {
  score: number;              // 0-100
  trying: boolean;            // score >= high
  notTrying: boolean;         // score < low
  haveData: boolean;          // false: the metric is not arriving (the camera cannot see the joints at all)
  parts: MatchParts;          // each 0-100 (rhythm null = not enough data yet)
  spreadR: number;            // 10-90 percentile spread of the on-path values, in rep spans
  inBandFrac: number;         // share of samples on the exercise's path
  periodSec: number | null;   // the rep rhythm found, if any
  samples: number;
  cut: PathCut;               // where the path is cut off from the camera, if it is
  topCuts: number; bottomCuts: number; frameCuts: number;
  tryingForSec: number;       // how long it has been HIGH without a break
  /** the path moved in the last ~2.5 s. The 10 s score remembers reps after the user stops; this does not. Stuck / Guide / Coach use it so a rest is never read as "trying". */
  movingNow: boolean;
}

export interface MovementMatch {
  /** Feed every native debug-log line. */
  feed(line: string): void;
  /** A rep was counted now (native [REP] lines are seen by feed; use this for reps the app counts itself). */
  noteRep(): void;
  result(): MatchResult;
  reset(): void;
}

interface Pt { t: number; v: number }
type Cut = { t: number; where: 'top' | 'bottom' | 'frame'; weight: number };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (sorted: number[], p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))] : 0;

export function createMovementMatch(opts: { now?: () => number; log?: (m: string) => void } = {}): MovementMatch {
  const now = opts.now ?? (() => Date.now());
  let enter = 0, exit = 0, rom = 0, top = 0, haveDef = false;
  let samples: Pt[] = [];
  let cuts: Cut[] = [];
  let lastLostAt = 0, lastBackAt = 0;
  let tryStart = 0, lowSince = 0;
  let lastLogAt = 0, lastLogScore = -100, lastLogCut = '';
  let lastRepAt = 0;

  const R = () => Math.max(1e-6, Math.abs(top - rom));

  function addSample(t: number, v: number) {
    const last = samples[samples.length - 1];
    if (last && t - last.t < 100) return; // several log lines for one frame
    if (last && haveDef && t - last.t >= T.cutGapSec * 1000) {
      const r = R();
      const gapSec = (t - last.t) / 1000;
      {
        const upper = last.v >= top - T.cutTopZoneR * r;
        const lower = !upper && last.v <= Math.min(enter, rom) + T.cutBottomZoneR * r;
        if (upper || lower) cuts.push({ t, where: upper ? 'top' : 'bottom', weight: gapSec >= T.cutLongSec ? 2 : 1 });
      }
    }
    samples.push({ t, v });
    const cutoff = t - (T.windowSec + 4) * 1000;
    while (samples.length && samples[0].t < cutoff) samples.shift();
    if (samples.length > 400) samples = samples.slice(-400);
  }

  function feed(line: string) {
    const t = now();
    if (line.startsWith('[METRIC]')) {
      const g = (k: string) => { const m = new RegExp(k + '=([-\\d.]+)').exec(line); return m ? parseFloat(m[1]) : NaN; };
      const v = g('value'), e = g('enter'), x = g('exit'), r = g('rom'), tp = g('top');
      if (!isNaN(e) && !isNaN(x) && !isNaN(r) && !isNaN(tp)) { enter = e; exit = x; rom = r; top = tp; haveDef = true; }
      if (!isNaN(v)) addSample(t, v);
      return;
    }
    let m = /^\[REP-TRACE\][^\n]*?angle=([-\d.]+)/.exec(line);
    if (m) { addSample(t, parseFloat(m[1])); return; }
    m = /^\[ACTIVITY\] suppressed[^\n]*?metric=([-\d.]+)/.exec(line);
    if (m) { addSample(t, parseFloat(m[1])); return; }
    if (/^\[REP\] #[0-9]+/.test(line)) { lastRepAt = t; return; }
    if (/^\[TRACK\] person lost/.test(line)) { lastLostAt = t; cuts.push({ t, where: 'frame', weight: 1 }); return; }
    if (/^\[TRACK\] person back/.test(line)) { lastBackAt = t; return; }
  }

  function grid(t1: number): (number | null)[] {
    const out: (number | null)[] = [];
    const step = T.gridSec * 1000, t0 = t1 - T.windowSec * 1000;
    let j = 0;
    const s = samples;
    for (let g = t0; g <= t1 + 1; g += step) {
      while (j + 1 < s.length && s[j + 1].t <= g) j++;
      const a = s[j] && s[j].t <= g ? s[j] : null;
      const b = a ? (s[j + 1] ?? null) : (s[0] && s[0].t >= g ? s[0] : null);
      let v: number | null = null;
      if (a && b && b.t > a.t && b.t - a.t <= T.maxInterpSec * 1000) v = a.v + (b.v - a.v) * ((g - a.t) / (b.t - a.t));
      else if (a && Math.abs(g - a.t) <= 200) v = a.v;
      else if (b && Math.abs(b.t - g) <= 200) v = b.v;
      out.push(v);
    }
    return out;
  }

  function acfBest(xs: (number | null)[], mu: number): { acf: number; lagSec: number } | null {
    const lagMin = Math.round(T.rhythmLagMinSec / T.gridSec), lagMax = Math.round(T.rhythmLagMaxSec / T.gridSec);
    const acf: (number | null)[] = [];
    for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
      let num = 0, da = 0, db = 0, pairs = 0;
      for (let i = 0; i + lag < xs.length; i++) {
        const a = xs[i], b = xs[i + lag];
        if (a === null || b === null) continue;
        num += (a - mu) * (b - mu); da += (a - mu) ** 2; db += (b - mu) ** 2; pairs++;
      }
      acf.push(pairs >= T.rhythmMinPairs && da > 0 && db > 0 ? num / Math.sqrt(da * db) : null);
    }
    let best: { acf: number; lagSec: number } | null = null;
    for (let k = 1; k < acf.length - 1; k++) {
      const c = acf[k], p = acf[k - 1], n = acf[k + 1];
      if (c === null) continue;
      if ((p === null || c >= p) && (n === null || c >= n)) { if (!best || c > best.acf) best = { acf: c, lagSec: (lagMin - 1 + k) * T.gridSec }; }
    }
    return best;
  }

  function cutState(t: number): { cut: PathCut; top: number; bottom: number; frame: number } {
    cuts = cuts.filter(c => t - c.t <= T.cutWindowSec * 1000);
    let topN = 0, botN = 0, frameN = 0;
    for (const c of cuts) { if (c.where === 'top') topN += c.weight; else if (c.where === 'bottom') botN += c.weight; else frameN += c.weight; }
    // hands / feet that have not come back yet: the gap is still open
    const last = samples[samples.length - 1];
    if (last && haveDef && t - last.t >= T.cutGapSec * 1500 && t - lastLostAt > 1500) {
      const r = R();
      if (last.v >= top - T.cutTopZoneR * r) topN += 1; else if (last.v <= Math.min(enter, rom) + T.cutBottomZoneR * r) botN += 1;
    }
    const cutTop = topN >= T.cutMinEvents, cutBot = botN >= T.cutMinEvents;
    const cut: PathCut = cutTop && cutBot ? 'both' : cutTop ? 'top' : cutBot ? 'bottom' : frameN >= 1 ? 'frame' : null;
    return { cut, top: topN, bottom: botN, frame: frameN };
  }

  const empty = (t: number, cs: ReturnType<typeof cutState>, n: number): MatchResult => ({
    score: 0, trying: false, notTrying: true, haveData: false,
    parts: { motion: 0, rhythm: null, range: 0, position: 0 }, spreadR: 0, inBandFrac: 0, periodSec: null, samples: n,
    cut: cs.cut, topCuts: cs.top, bottomCuts: cs.bottom, frameCuts: cs.frame, tryingForSec: 0, movingNow: false,
  });

  function result(): MatchResult {
    const t = now();
    const cs = cutState(t);
    const win = samples.filter(p => t - p.t <= T.windowSec * 1000);
    if (!haveDef || win.length < T.minSamples) { tryStart = 0; return empty(t, cs, win.length); }
    const r = R();
    const lo = Math.min(enter, rom) - T.bandBelowLow * r, hi = top + T.bandAboveTop * r;
    const xs0 = grid(t);
    const vals = xs0.filter((v): v is number => v !== null);
    if (vals.length < 4) { tryStart = 0; return empty(t, cs, win.length); }
    const inBand = (v: number) => v >= lo && v <= hi;
    const inVals = vals.filter(inBand);
    const inFrac = inVals.length / vals.length;

    // motion: real swings inside the path band
    let swing = 0;
    {
      const H = T.swingHysteresis * r, minS = T.swingMin * r;
      let pivot: number | null = null, ext = 0, dir = 0;
      const add = (from: number, to: number) => { const d = Math.abs(to - from); if (d >= minS) swing += d; };
      for (const v of xs0) {
        if (v === null || !inBand(v)) continue;
        if (pivot === null) { pivot = v; ext = v; continue; }
        if (dir === 0) { if (v - pivot >= H) { dir = 1; ext = v; } else if (pivot - v >= H) { dir = -1; ext = v; } }
        else if (dir === 1) { if (v > ext) ext = v; else if (ext - v >= H) { add(pivot, ext); pivot = ext; dir = -1; ext = v; } }
        else { if (v < ext) ext = v; else if (v - ext >= H) { add(pivot, ext); pivot = ext; dir = 1; ext = v; } }
      }
      if (pivot !== null && dir !== 0) add(pivot, ext);
    }
    const motion = clamp01(swing / (T.motionFullR * r));

    // range
    const sortedIn = [...inVals].sort((a, b) => a - b);
    const spread = inVals.length >= 3 ? pct(sortedIn, 0.9) - pct(sortedIn, 0.1) : 0;
    const spreadR = spread / r;
    const range = clamp01(spreadR / T.rangeFullR);

    // rhythm
    let rhythm: number | null = null, periodSec: number | null = null;
    const span = (win[win.length - 1].t - win[0].t) / 1000;
    if (span >= T.rhythmMinSec && vals.length >= 16) {
      const xs = xs0.map(v => (v === null ? null : Math.max(lo, Math.min(hi, v))));
      const nn = xs.filter((v): v is number => v !== null);
      const mu = nn.reduce((a, b) => a + b, 0) / nn.length;
      const sd = Math.sqrt(nn.reduce((a, b) => a + (b - mu) ** 2, 0) / nn.length);
      if (sd < 0.12 * r) rhythm = 0;
      else { const b = acfBest(xs, mu); if (b) { rhythm = clamp01((b.acf - T.rhythmAcfLow) / (T.rhythmAcfHigh - T.rhythmAcfLow)); periodSec = b.lagSec; } else rhythm = 0; }
    }

    // position: on the path, visits the start zone, a person is there
    const visits = Math.max(...vals) >= exit ? 1 : 0;
    const present = (t - samples[samples.length - 1].t <= 1500) && !(lastLostAt > lastBackAt && t - lastLostAt < 2000) ? 1 : 0;
    const position = clamp01(0.5 * inFrac + 0.3 * visits + 0.2 * present);

    let wM = T.wMotion, wR = T.wRhythm, wG = T.wRange, wP = T.wPosition;
    let base: number;
    if (rhythm === null) { const s = wM + wG + wP; base = (wM * motion + wG * range + wP * position) / s; }
    else base = wM * motion + wR * rhythm + wG * range + wP * position;
    const gateAmp = clamp01((spreadR - T.ampGateLowR) / (T.ampGateHighR - T.ampGateLowR));
    const gatePath = clamp01(1 - ((1 - inFrac) - T.outGateFree) / (T.outGateZero - T.outGateFree));
    let score = Math.round(100 * base * gateAmp * gatePath);
    // a rep the engine really counted is evidence of this exercise (see repEvidenceFloor)
    if (lastRepAt && t - lastRepAt <= T.windowSec * 1000 && score < T.repEvidenceFloor) score = T.repEvidenceFloor;

    const trying = score >= T.high, notTrying = score < T.low;
    if (trying) { lowSince = 0; if (!tryStart) tryStart = t; }
    else if (notTrying) { if (!lowSince) lowSince = t; if (t - lowSince > 1500) tryStart = 0; }
    const res: MatchResult = {
      score, trying, notTrying, haveData: true,
      parts: { motion: Math.round(motion * 100), rhythm: rhythm === null ? null : Math.round(rhythm * 100), range: Math.round(range * 100), position: Math.round(position * 100) },
      spreadR, inBandFrac: inFrac, periodSec, samples: win.length,
      cut: cs.cut, topCuts: cs.top, bottomCuts: cs.bottom, frameCuts: cs.frame,
      tryingForSec: tryStart ? (t - tryStart) / 1000 : 0,
      movingNow: (() => {
        const rec = samples.filter(p => t - p.t <= T.moveNowSec * 1000).map(p => p.v).sort((a, b) => a - b);
        return rec.length >= 3 && (pct(rec, 0.75) - pct(rec, 0.25)) >= T.moveNowIqrR * r;
      })(),
    };
    // [MOVE-MATCH]: when it moves by logDelta or every logEverySec
    if (opts.log && (Math.abs(score - lastLogScore) >= T.logDelta || (res.cut ?? '') !== lastLogCut || t - lastLogAt >= T.logEverySec * 1000)) {
      lastLogAt = t; lastLogScore = score; lastLogCut = res.cut ?? '';
      opts.log(`[MOVE-MATCH] score=${score} ${trying ? 'TRYING' : notTrying ? 'not trying' : 'unsure'} (motion ${res.parts.motion}, rhythm ${res.parts.rhythm === null ? 'n/a' : res.parts.rhythm}, range ${res.parts.range}, position ${res.parts.position}) spread=${spreadR.toFixed(2)}R onPath=${Math.round(inFrac * 100)}% period=${periodSec === null ? 'n/a' : periodSec.toFixed(1) + 's'} cut=${res.cut ?? 'none'} (top ${cs.top}, bottom ${cs.bottom}, frame ${cs.frame}) samples=${win.length} (PLACEHOLDER numbers)`);
    }
    return res;
  }

  return {
    feed,
    noteRep() { lastRepAt = now(); },
    result,
    reset() { samples = []; cuts = []; lastLostAt = 0; lastBackAt = 0; tryStart = 0; lowSince = 0; lastLogAt = 0; lastLogScore = -100; lastLogCut = ''; lastRepAt = 0; haveDef = false; },
  };
}
