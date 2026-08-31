/**
 * lib/calibLog.ts — calibration-log synthesizer
 *
 * The native engine already logs everything needed to calibrate an exercise:
 *   [METRIC] <ex> value=V enter=E exit=X rom=R top=T state=S phase=P   (every frame)
 *   [REP] #N top=MAX bottom=MIN thr=.. swing=RANGE ROM=ok|short cue=CUE  (each counted rep)
 *   [UNIV] rep #N: CALIBRATING (n/3 good)  range=R  dur=Ds  jerk=J       (each counted rep)
 *   [REP] rejected — <reason>                                            (each dropped rep)
 *
 * This turns that raw stream into clean, copy-pasteable calibration lines:
 *   [CALIB] rep 1  min=0.42 max=1.95 range=1.53 dur=1.8s  → COUNTED (rom=OK, cue=GOOD)
 *           [thr in use: enter=0.95 exit=1.30 goodROM=0.85 top=1.50]
 * and, at the end of a set, a summary + a suggested threshold set derived
 * from the REAL measured range (never guessed), with hysteresis.
 *
 * Pure/stateful: create one per session, feed it every debug line, collect
 * whatever strings it returns and append them to the log. See
 * docs/CALIBRATION.md for the workflow.
 */

interface Thr { enter: number; exit: number; rom: number; top: number }
interface RepRow { n: number; min: number; max: number; range: number; dur: number | null; counted: boolean; romOk: boolean; cue: string }

const N = (s: string | undefined): number | null => {
  if (s == null) return null;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};
const round = (v: number, p = 3) => {
  const f = Math.pow(10, p);
  return Math.round(v * f) / f;
};

export interface CalibSynth {
  /** Feed one debug-log line. Returns 0+ synthesized lines to append after it. */
  feed(line: string): string[];
  /** Call when the set ends (Stop / entering review). Returns the summary +
   *  suggested-threshold lines (empty if no reps were captured). */
  flushSummary(): string[];
  reset(): void;
}

export function createCalibSynth(): CalibSynth {
  let thr: Thr | null = null;
  const univDur = new Map<number, number>();   // rep num -> duration seconds (from [UNIV])
  const rows: RepRow[] = [];

  function feed(line: string): string[] {
    // ── thresholds: keep the latest seen ────────────────────────────────
    if (line.startsWith('[METRIC]')) {
      const e = N(line.match(/enter=([-\d.]+)/)?.[1]);
      const x = N(line.match(/exit=([-\d.]+)/)?.[1]);
      const r = N(line.match(/rom=([-\d.]+)/)?.[1]);
      const t = N(line.match(/top=([-\d.]+)/)?.[1]);
      if (e != null && x != null && r != null && t != null) thr = { enter: e, exit: x, rom: r, top: t };
      return [];
    }

    // ── [UNIV] rep #N ... dur=Xs  — stash the duration for that rep ─────
    if (line.startsWith('[UNIV] rep #')) {
      const n = N(line.match(/rep #(\d+)/)?.[1]);
      const d = N(line.match(/dur=([-\d.]+)s/)?.[1]);
      if (n != null && d != null) univDur.set(n, d);
      return [];
    }

    // ── [REP] rejected — <reason> ──────────────────────────────────────
    if (/^\[REP\] rejected/.test(line)) {
      const reason = line.replace(/^\[REP\] rejected\s*[—-]\s*/, '').split('|')[0].trim();
      return [`[CALIB] rep dropped — ${reason}`];
    }

    // ── [REP] #N top=MAX bottom=MIN swing=RANGE ROM=ok|short cue=CUE ────
    if (/^\[REP\] #\d+/.test(line)) {
      const main = line.split(' | ')[0];
      const n    = N(main.match(/#(\d+)/)?.[1]);
      const max  = N(main.match(/top=([-\d.]+)/)?.[1]);
      const min  = N(main.match(/bottom=([-\d.]+)/)?.[1]);
      let   rng  = N(main.match(/swing=([-\d.]+)/)?.[1]);
      const romOk = /ROM=ok/.test(main);
      const cue   = (main.match(/cue=(.+)$/)?.[1] || '').trim();
      if (n == null || max == null || min == null) return [];
      if (rng == null) rng = round(max - min);
      const dur = univDur.get(n) ?? null;
      rows.push({ n, min, max, range: rng, dur, counted: true, romOk, cue });
      const durTxt = dur != null ? `${dur.toFixed(2)}s` : '?';
      const thrTxt = thr
        ? `  [thr in use: enter=${thr.enter} exit=${thr.exit} goodROM=${thr.rom} top=${thr.top}]`
        : '';
      return [
        `[CALIB] rep ${n}  min=${round(min)} max=${round(max)} range=${round(rng)} dur=${durTxt}  ` +
        `→ COUNTED (rom=${romOk ? 'OK' : 'SHORT'}, cue=${cue || '?'})${thrTxt}`,
      ];
    }

    return [];
  }

  function flushSummary(): string[] {
    const counted = rows.filter(r => r.counted);
    if (counted.length === 0) return [];

    const mins   = counted.map(r => r.min);
    const maxs   = counted.map(r => r.max);
    const rngs   = counted.map(r => r.range);
    const durs   = counted.map(r => r.dur).filter((d): d is number => d != null);
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const lo  = (a: number[]) => Math.min(...a);
    const hi  = (a: number[]) => Math.max(...a);

    const avgMax = avg(maxs), avgMin = avg(mins), avgRng = avg(rngs);
    // Decreasing-at-work metric convention (value high at rest, low at the
    // bottom of the rep — every exercise in this app is set up this way):
    //   top   ≈ the low end of resting maxes, so a real rest reliably clears it
    //   enter = ~60% of the way down from rest to the bottom  (crossed going DOWN → rep starts)
    //   exit  = enter + ~18% of range                          (crossed going UP → rep completes; the gap is the hysteresis)
    //   goodROM = a bit above the deepest bottom, so a full rep passes and a shallow half-rep is flagged
    const top   = round(lo(maxs) - 0.02 * avgRng);
    const enter = round(avgMax - 0.60 * avgRng);
    const exit  = round(enter + 0.18 * avgRng);
    const rom   = round(avgMin + 0.20 * avgRng);

    return [
      `[CALIB-SUMMARY] ${counted.length} reps counted` +
        `  |  rest/max avg=${round(avgMax)} range[${round(lo(maxs))}–${round(hi(maxs))}]` +
        `  |  bottom/min avg=${round(avgMin)} range[${round(lo(mins))}–${round(hi(mins))}]` +
        `  |  swing avg=${round(avgRng)} range[${round(lo(rngs))}–${round(hi(rngs))}]` +
        (durs.length ? `  |  dur avg=${avg(durs).toFixed(2)}s` : ''),
      `[CALIB-SUGGEST] topAngle=${top}  repEnterThreshold=${enter}  repExitThreshold=${exit}  goodROMThreshold=${rom}` +
        `   (enter/exit gap = hysteresis; goodROM flags reps shallower than ~80% depth)`,
    ];
  }

  function reset() {
    thr = null;
    univDur.clear();
    rows.length = 0;
  }

  return { feed, flushSummary, reset };
}
