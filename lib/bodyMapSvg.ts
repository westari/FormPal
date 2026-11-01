/**
 * lib/bodyMapSvg.ts
 *
 * Muscle body-map as a plain SVG string, for the Progress tab's WebView
 * (inside the "Your Rank" card + the Muscle Map page). Same path data and
 * muscle->region table the native MuscleTierMap already uses
 * (components/muscleMapPaths.generated.ts) — just emitted as markup instead
 * of react-native-svg elements, since the design artboard is HTML.
 *
 * Ranked muscles are tinted with their tier's palette colour; muscles with
 * no rank yet (and the other side's fragments of a muscle ranked on the
 * opposite side) stay neutral grey — the same convention as the native map.
 */
import { Muscle } from '../constants/exercises';
import {
  MUSCLE_MAP_FRONT_PATHS, MUSCLE_MAP_BACK_PATHS, MUSCLE_MAP_REGIONS, MUSCLE_MAP_VIEWBOX,
} from '../components/muscleMapPaths.generated';
import { TIER_META } from '../constants/tierPalette';
import type { MuscleTiers } from './sessionLog';

const NEUTRAL = '#E3E4EA';
const SILHOUETTE_FILL = '#F1F2F6';
const SILHOUETTE_STROKE = '#D5D7DF';
const OUTLINE_STROKE = 'rgba(40,44,60,0.5)';

// Tier `lo` alone is too pale on the white silhouette for Silver/Platinum/etc, so
// pull it 30% toward the tier's ink colour — still clearly that tier's hue.
function muscleFill(lo: string, ink: string): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(lo), b = p(ink);
  const c = a.map((v, i) => Math.round(v * 0.7 + b[i] * 0.3));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

// Inner markup (silhouette + muscle paths) for one side, shared by the single
// and the side-by-side renderers below.
function bodyMapParts(tiers: MuscleTiers, side: 'front' | 'back', outlined = false): string {
  const table = side === 'front' ? MUSCLE_MAP_FRONT_PATHS : MUSCLE_MAP_BACK_PATHS;
  // fragment id -> fill colour, for muscles ranked on THIS side
  const fillById: Record<string, string> = {};
  for (const m of Object.keys(MUSCLE_MAP_REGIONS) as Muscle[]) {
    const region = MUSCLE_MAP_REGIONS[m]!;
    if (region.side !== side) continue;
    const info = tiers[m];
    if (!info) continue;
    const meta = TIER_META[info.tier];
    for (const id of region.ids) fillById[id] = muscleFill(meta.lo, meta.ink);
  }
  const parts: string[] = [];
  const silhouette = table.silhouette;
  if (silhouette) {
    // outlined: a thin, subtle dark outline so the figure reads on the white
    // card (the default pale stroke nearly disappears there).
    const stroke = outlined ? OUTLINE_STROKE : SILHOUETTE_STROKE;
    const sw = outlined ? 2.4 : 1.4;
    parts.push(`<path d="${silhouette}" fill="${SILHOUETTE_FILL}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`);
  }
  for (const id of Object.keys(table)) {
    if (id === 'silhouette') continue;
    const fill = fillById[id] ?? NEUTRAL;
    parts.push(`<path d="${table[id]}" fill="${fill}" stroke="#ffffff" stroke-width="0.9" stroke-linejoin="round"/>`);
  }
  return parts.join('');
}

export function bodyMapSvg(tiers: MuscleTiers, side: 'front' | 'back'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MUSCLE_MAP_VIEWBOX[side]}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;">${bodyMapParts(tiers, side)}</svg>`;
}

const vb = (side: 'front' | 'back') => MUSCLE_MAP_VIEWBOX[side].split(' ').map(Number);

// Front + back figures side by side as ONE image (a data: URI usable as an
// <img src>), with only the given muscles coloured (bronze — "muscles you just
// trained") and everything else neutral. Same path data / region table as the
// Progress tab and the native MuscleTierMap, so it's the app's real body map.
export function bodyMapPairSvg(worked: Muscle[]): string {
  const tiers: MuscleTiers = {};
  for (const m of worked) tiers[m] = { tier: 'bronze', peakTier: 'bronze', volume: 0, goodRatio: 0 };
  const [, , fw, fh] = vb('front');
  const [, , bw, bh] = vb('back');
  const gap = 56;
  const H = Math.max(fh, bh);
  const W = fw + gap + bw;
  const fig = (side: 'front' | 'back', x: number, w: number, h: number) =>
    `<svg x="${x}" y="${(H - h) / 2}" width="${w}" height="${h}" viewBox="${MUSCLE_MAP_VIEWBOX[side]}">${bodyMapParts(tiers, side, true)}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${fig('front', 0, fw, fh)}${fig('back', fw + gap, bw, bh)}</svg>`;
}

export function bodyMapPairDataUri(worked: Muscle[]): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(bodyMapPairSvg(worked));
}
