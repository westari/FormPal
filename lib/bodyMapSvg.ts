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

// Tier `lo` alone is too pale on the white silhouette for Silver/Platinum/etc, so
// pull it 30% toward the tier's ink colour — still clearly that tier's hue.
function muscleFill(lo: string, ink: string): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(lo), b = p(ink);
  const c = a.map((v, i) => Math.round(v * 0.7 + b[i] * 0.3));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export function bodyMapSvg(tiers: MuscleTiers, side: 'front' | 'back'): string {
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
    parts.push(`<path d="${silhouette}" fill="${SILHOUETTE_FILL}" stroke="${SILHOUETTE_STROKE}" stroke-width="1.4" stroke-linejoin="round"/>`);
  }
  for (const id of Object.keys(table)) {
    if (id === 'silhouette') continue;
    const fill = fillById[id] ?? NEUTRAL;
    parts.push(`<path d="${table[id]}" fill="${fill}" stroke="#ffffff" stroke-width="0.9" stroke-linejoin="round"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MUSCLE_MAP_VIEWBOX[side]}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;">${parts.join('')}</svg>`;
}
