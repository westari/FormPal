/**
 * scripts/lib/rep-synth.js
 *
 * Synthetic camera streams for ANY exercise, built from that exercise's OWN definition (its "signature": top / enter / exit / rom).
 * Every exercise streams the same `[METRIC] <id> value= enter= exit= rom= top=` line (about 3 a second), so one generator covers all of them.
 * A rep = the value starts near top, dips below the enter line (a full rep) and comes back above the exit line.
 */
function signature(def) {
  const top = def.topAngle, enter = def.repEnterThreshold, exit = def.repExitThreshold, rom = def.goodROMThreshold;
  const R = Math.abs(top - rom) || 1;
  return { id: def.id, top, enter, exit, rom, R, lowFull: Math.min(enter, rom) - 0.12 * R, highFull: top + 0.02 * R };
}
const metricLine = (sig, v) => `[METRIC] ${sig.id} value=${v.toFixed(4)} enter=${sig.enter.toFixed(4)} exit=${sig.exit.toFixed(4)} rom=${sig.rom.toFixed(4)} top=${sig.top} state=up phase=top`;

/**
 * parts: array of segments, each { kind, sec, ... }:
 *   rest      {sec}                       standing still at the top
 *   reps      {sec, period, depth, topReach, cutTop}   depth 1 = full rep, 0.45 = half rep; topReach 1 = reaches the top;
 *                                         cutTop = hands out of frame near the top (samples missing while the value is above the cut line)
 *   walk      {sec}                       small quick oscillation around the top (shuffling / walking)
 *   reach     {sec}                       one slow excursion far out of the path (reaching for the phone) and back
 *   blind     {sec}                       no samples at all (nobody there / camera moved)
 * Returns [{ t (ms from 0), line }].
 */
function build(sig, parts, step = 0.33) {
  const out = []; let t = 0, repN = 0;
  const push = (v, line) => out.push({ t: Math.round(t * 1000), line: line || metricLine(sig, v) });
  for (const p of parts) {
    const n = Math.round(p.sec / step);
    if (p.kind === 'blind') { t += p.sec; continue; }
    if (p.kind === 'lost') { out.push({ t: Math.round(t * 1000), line: '[TRACK] person lost' }); t += p.sec; out.push({ t: Math.round(t * 1000), line: '[TRACK] person back' }); continue; }
    const segStart = t;
    for (let i = 0; i < n; i++) {
      t += step;
      let v;
      if (p.kind === 'rest') v = sig.top - 0.03 * sig.R + 0.01 * sig.R * Math.sin(i);
      else if (p.kind === 'walk') v = sig.top - 0.1 * sig.R + 0.07 * sig.R * Math.sin(2 * Math.PI * (i * step) / 1.0);
      else if (p.kind === 'reach') { const ph = i / n; v = sig.top - 0.1 * sig.R - Math.sin(Math.PI * ph) * (1.9 * sig.R); }
      else {
        const ph = ((i * step) % p.period) / p.period;           // 0..1 through a rep
        const depth = p.depth ?? 1, reach = p.topReach ?? 1;
        const hi = sig.top - (1 - reach) * 0.4 * sig.R + (reach >= 1 ? 0.02 * sig.R : 0);
        const lo = p.depthR !== undefined ? hi - p.depthR * sig.R : hi - depth * (hi - sig.lowFull);
        v = hi - (hi - lo) * 0.5 * (1 - Math.cos(2 * Math.PI * ph));
        if (p.cutTop && v >= sig.top - (p.cutLevel ?? 0.5) * sig.R) continue; // hands out of frame at the top: no sample while above the cut line
      }
      push(v);
    }
    // an emulated ENGINE: a rep counts when the value dips below the enter line and comes back (that is the engine's own rule)
    if (p.kind === 'reps' && p.engine) {
      const depth = p.depth ?? 1, reach = p.topReach ?? 1;
      const hi = sig.top - (1 - reach) * 0.4 * sig.R + (reach >= 1 ? 0.02 * sig.R : 0);
      const lo = p.depthR !== undefined ? hi - p.depthR * sig.R : hi - depth * (hi - sig.lowFull);
      for (let k = 1; k * p.period <= p.sec; k++) {
        if (lo > sig.enter) continue;                         // never crossed the enter line: the engine does not count it
        const romOk = lo <= sig.rom;
        out.push({ t: Math.round((segStart + k * p.period) * 1000) - 150, line: `[REP] #${++repN} top=${hi.toFixed(1)} bottom=${lo.toFixed(1)} thr=${sig.rom} swing=0 ROM=${romOk ? 'ok' : 'short'} cue=${romOk ? 'GOOD' : (p.romCue || 'Go lower')}` });
      }
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
/** [REP] lines at the end of every full rep of a `reps` segment starting at t0 (ms). */
function repLines(startMs, sec, period, firstN = 1) {
  const out = []; let n = firstN;
  for (let k = 1; k * period <= sec; k++) out.push({ t: startMs + Math.round(k * period * 1000) - 150, line: `[REP] #${n++} top=${'0'} bottom=0 thr=0 swing=0 ROM=ok cue=GOOD` });
  return out;
}
module.exports = { signature, build, metricLine, repLines };
