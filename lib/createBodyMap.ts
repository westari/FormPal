/**
 * lib/createBodyMap.ts
 *
 * The small tappable body map on Create workout ("Start from a muscle group"). It is the Progress tab's muscle map (lib/progressBodyMap.ts: a pale
 * silhouette, a clear dark body outline drawn again as the top layer, every muscle with its own thin outline), front and back, with one change:
 * every muscle fragment carries the muscle group it belongs to (data-grp), so a tap on a muscle starts from that group.
 *
 * The groups are the six Create workout already has (chest, back, legs, shoulders, arms, core), so the lists are the same real catalogue lists:
 *   chest -> chest          shoulders -> shoulders, rear delts      arms -> biceps, triceps, forearms
 *   back  -> lats, traps, lower back                                core -> abs
 *   legs  -> quads, hamstrings, glutes, calves
 */
import {
  MUSCLE_MAP_FRONT_PATHS, MUSCLE_MAP_BACK_PATHS, MUSCLE_MAP_VIEWBOX,
} from '../components/muscleMapPaths.generated';

const NEUTRAL = '#E3E4EA';
const SILHOUETTE_FILL = '#F1F2F6';
const SILHOUETTE_STROKE = '#D5D7DF';
const OUTLINE_STROKE = '#454B5C';
const MUSCLE_OUTLINE_STROKE = '#69708A';
const NS = 'vector-effect="non-scaling-stroke"';

/** fragment id (without its "-2" style number, lower case) -> Create workout group */
export const GROUP_OF_FRAGMENT: Record<string, string> = {
  chest: 'chest', shoulders: 'shoulders', reardelts: 'shoulders', biceps: 'arms', triceps: 'arms', forearms: 'arms',
  lats: 'back', traps: 'back', lowerback: 'back', abs: 'core', quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs',
};
export const groupOfId = (id: string): string | null => GROUP_OF_FRAGMENT[id.replace(/-\d+$/, '').toLowerCase()] ?? null;

export function createBodyMapSvg(side: 'front' | 'back'): string {
  const table = side === 'front' ? MUSCLE_MAP_FRONT_PATHS : MUSCLE_MAP_BACK_PATHS;
  const parts: string[] = [];
  const silhouette = table.silhouette;
  if (silhouette) parts.push(`<path d="${silhouette}" fill="${SILHOUETTE_FILL}" stroke="${SILHOUETTE_STROKE}" stroke-width="1" stroke-linejoin="round" ${NS}/>`);
  for (const id of Object.keys(table)) {
    if (id === 'silhouette') continue;
    const g = groupOfId(id);
    parts.push(`<path d="${table[id]}" fill="${NEUTRAL}"${g ? ` data-grp="${g}" style="cursor:pointer"` : ''} stroke="${MUSCLE_OUTLINE_STROKE}" stroke-width="0.9" stroke-linejoin="round" ${NS}/>`);
  }
  if (silhouette) parts.push(`<path d="${silhouette}" fill="none" stroke="${OUTLINE_STROKE}" stroke-width="1.6" stroke-linejoin="round" ${NS} style="pointer-events:none"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MUSCLE_MAP_VIEWBOX[side]}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;">${parts.join('')}</svg>`;
}
