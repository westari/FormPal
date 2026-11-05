/**
 * lib/progressBodyMap.ts
 *
 * The Progress tab's body map, drawn in the same style as the muscle map on the after-workout screen: a pale
 * silhouette with a clear dark body outline (drawn again as the top layer so the muscle fragments never cover
 * it), every muscle with its own thin outline, and ranked muscles filled with their tier colour.
 *
 * This is a copy of the outlined drawing in lib/bodyMapSvg.ts (that file belongs to the after-workout screens
 * and is left alone) with one change: strokes use vector-effect="non-scaling-stroke" and are given in screen
 * pixels, so the outline is the same ~1.6px on the 206px card figures and on the 292px Muscle Map page figures.
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
const OUTLINE_STROKE = '#454B5C';
const MUSCLE_OUTLINE_STROKE = '#69708A';
export const BODY_OUTLINE_PX = 1.6;
export const MUSCLE_OUTLINE_PX = 0.9;

// Tier `lo` alone is too pale on the pale silhouette for Silver/Platinum/etc, so pull it 30% toward the
// tier's ink colour (same rule as the after-workout map).
function muscleFill(lo: string, ink: string): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(lo), b = p(ink);
  const c = a.map((v, i) => Math.round(v * 0.7 + b[i] * 0.3));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

const NS = 'vector-effect="non-scaling-stroke"';

export function progressBodyMapSvg(tiers: MuscleTiers, side: 'front' | 'back'): string {
  const table = side === 'front' ? MUSCLE_MAP_FRONT_PATHS : MUSCLE_MAP_BACK_PATHS;
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
  if (silhouette) parts.push(`<path d="${silhouette}" fill="${SILHOUETTE_FILL}" stroke="${SILHOUETTE_STROKE}" stroke-width="1" stroke-linejoin="round" ${NS}/>`);
  for (const id of Object.keys(table)) {
    if (id === 'silhouette') continue;
    parts.push(`<path d="${table[id]}" fill="${fillById[id] ?? NEUTRAL}" stroke="${MUSCLE_OUTLINE_STROKE}" stroke-width="${MUSCLE_OUTLINE_PX}" stroke-linejoin="round" ${NS}/>`);
  }
  if (silhouette) parts.push(`<path d="${silhouette}" fill="none" stroke="${OUTLINE_STROKE}" stroke-width="${BODY_OUTLINE_PX}" stroke-linejoin="round" ${NS}/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MUSCLE_MAP_VIEWBOX[side]}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;">${parts.join('')}</svg>`;
}
