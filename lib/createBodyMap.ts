/**
 * lib/createBodyMap.ts
 *
 * The tappable body map on Create workout ("Start from a muscle group"). It is THE muscle map, one shared drawing (lib/bodyMapSvg.ts: bodyMapParts, also
 * used by the Progress tab and the after-workout screens): pale silhouette, outlines on everything (dark ink), front and back, with every muscle fragment
 * carrying the muscle group it belongs to (data-grp), so a tap on a muscle starts from that group.
 *
 * The groups are the six Create workout already has (chest, back, legs, shoulders, arms, core), so the lists are the same real catalogue lists:
 *   chest -> chest          shoulders -> shoulders, rear delts      arms -> biceps, triceps, forearms
 *   back  -> lats, traps, lower back                                core -> abs
 *   legs  -> quads, hamstrings, glutes, calves
 */
import { bodyMapTappableSvg, MAP_INK } from './bodyMapSvg';

/** fragment id (without its "-2" style number, lower case) -> Create workout group */
export const GROUP_OF_FRAGMENT: Record<string, string> = {
  chest: 'chest', shoulders: 'shoulders', reardelts: 'shoulders', biceps: 'arms', triceps: 'arms', forearms: 'arms',
  lats: 'back', traps: 'back', lowerback: 'back', abs: 'core', quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs',
};
export const groupOfId = (id: string): string | null => GROUP_OF_FRAGMENT[id.replace(/-\d+$/, '').toLowerCase()] ?? null;

/** The SAME muscle map as the Progress tab and the after-workout screens (lib/bodyMapSvg.ts), outlined, every muscle tappable. Dark outlines on everything. */
export const CREATE_MAP_INK = MAP_INK; // (shared with the Progress tab's map: one ink)
export function createBodyMapSvg(side: 'front' | 'back'): string {
  return bodyMapTappableSvg(side, { groupOf: groupOfId, ink: CREATE_MAP_INK });
}
