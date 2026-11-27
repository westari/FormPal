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
const OUTLINE_STROKE = '#454B5C';
const MUSCLE_OUTLINE_STROKE = '#69708A';
// Round 12: outline widths are SCREEN pixels (vector-effect: non-scaling-stroke), so every line is the same even thickness whatever size the map is drawn at.
const MUSCLE_OUTLINE_PX = 1.1; // each muscle: a thin, even line
const OUTLINE_PX = 1.8;        // the body: one slightly heavier, even line
const NS = ' vector-effect="non-scaling-stroke"';

// ── Clean shapes (round 12) ───────────────────────────────────────────────────────────────────────────────────────────
// The generated path data is a straight-line polygon per fragment (a simplified trace of a raster image): drawn with an outline, its
// corners and the tiny noise slivers along the edges looked hand-drawn. Here, once per side (cached): every closed polygon becomes a
// smooth curve through the same points (a closed Catmull-Rom spline as cubic beziers), and slivers smaller than SLIVER_AREA
// (2-5 point specks of a few px, mostly along the thighs and the delts) are left out. The shapes, their place and the muscle table
// are unchanged, so the Progress map and Create workout's map (both drawn here) stay the same drawing.
const SLIVER_AREA = 100; // units^2 (the figure is ~830 units tall); the smallest real muscle piece is ~270
type Pt = [number, number];
function polys(d: string): Pt[][] {
  return d.split('M').filter((x) => x.trim()).map((sub) => [...sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]] as Pt));
}
function area(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return Math.abs(a / 2);
}
const r2 = (n: number) => Math.round(n * 100) / 100;
function smoothClosed(p: Pt[]): string {
  // drop a repeated closing point
  if (p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
  const n = p.length;
  let out = `M ${r2(p[0][0])},${r2(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    out += ` C ${r2(c1[0])},${r2(c1[1])} ${r2(c2[0])},${r2(c2[1])} ${r2(p2[0])},${r2(p2[1])}`;
  }
  return out + ' Z';
}
/** the clean version of one fragment's path data ('' = only slivers, not drawn); the silhouette keeps every piece */
export function cleanPath(d: string, keepSmall = false): string {
  return polys(d).filter((p) => p.length >= 3 && (keepSmall || (p.length >= 4 && area(p) >= SLIVER_AREA))).map((p) => smoothClosed(keepSmall ? relax(p) : p)).join(' ');
}
// The body outline has many close points with a little trace jitter (the head and shoulders looked wobbly): one gentle pass that moves
// each point a quarter of the way toward its neighbours' middle, then the curve. Long straight-ish runs and the real corners stay put.
function relax(p: Pt[]): Pt[] {
  const n = p.length;
  if (n < 8) return p;
  return p.map((q, i) => {
    const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
    const near = Math.hypot(a[0] - q[0], a[1] - q[1]) < 18 && Math.hypot(b[0] - q[0], b[1] - q[1]) < 18;
    return near ? [q[0] * 0.5 + (a[0] + b[0]) * 0.25, q[1] * 0.5 + (a[1] + b[1]) * 0.25] as Pt : q;
  });
}
const CLEAN: Record<string, Record<string, string>> = {};
function cleanTable(side: 'front' | 'back'): Record<string, string> {
  if (CLEAN[side]) return CLEAN[side];
  const raw = side === 'front' ? MUSCLE_MAP_FRONT_PATHS : MUSCLE_MAP_BACK_PATHS;
  const t: Record<string, string> = {};
  for (const id of Object.keys(raw)) t[id] = cleanPath(raw[id], id === 'silhouette');
  return (CLEAN[side] = t);
}

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
export interface MapOpts {
  /** Create workout: tag every muscle fragment with the group it belongs to (data-grp) so a tap can pick it, and make it clickable */
  groupOf?: (fragmentId: string) => string | null;
  /** one dark ink for every outline (the body and each muscle); default the after-workout map's own two blue-greys */
  ink?: string;
}
// THE ONE MUSCLE MAP (round 10): the Progress tab, the after-workout screens and Create workout all draw it with this function (bodyMapSvg / bodyMapPairSvg
// below are thin wrappers). Create workout passes `groupOf` (its muscles are tappable) and `ink` (dark outlines on everything).
export function bodyMapParts(tiers: MuscleTiers, side: 'front' | 'back', outlined = false, opts: MapOpts = {}): string {
  const table = cleanTable(side);
  // fragment id -> fill colour, for muscles ranked on THIS side
  const fillById: Record<string, string> = {};
  const muscleById: Record<string, string> = {};   // fragment id -> muscle name (only for the lit ones): the page lights them one by one
  for (const m of Object.keys(MUSCLE_MAP_REGIONS) as Muscle[]) {
    const region = MUSCLE_MAP_REGIONS[m]!;
    if (region.side !== side) continue;
    const info = tiers[m];
    if (!info) continue;
    const meta = TIER_META[info.tier];
    for (const id of region.ids) { fillById[id] = muscleFill(meta.lo, meta.ink); muscleById[id] = m; }
  }
  const parts: string[] = [];
  const silhouette = table.silhouette;
  if (silhouette) {
    // outlined: a clear dark outline so the figure reads on the white card (the
    // default pale stroke nearly disappears there). The figure is drawn ~830
    // units tall into a ~218px box, so 6 units is ~1.6px on screen (the first
    // try, 2.4 units at 50% alpha, was ~0.6px and still too faint).
    // Outlined figures draw the outline AGAIN as the very last layer (below):
    // the muscle fragments are painted after the silhouette and their white
    // strokes would otherwise cover the inner half of it along most of the edge.
    parts.push(`<path d="${silhouette}" fill="${SILHOUETTE_FILL}" stroke="${SILHOUETTE_STROKE}" stroke-width="${outlined ? 0 : 1.4}" stroke-linejoin="round"/>`);
  }
  for (const id of Object.keys(table)) {
    if (id === 'silhouette' || !table[id]) continue;
    const fill = fillById[id] ?? NEUTRAL;
    // Outlined figures give every muscle its OWN thin outline too (a soft
    // blue-grey, thinner than the body outline); plain maps keep the white seam.
    const mStroke = outlined ? (opts.ink ?? MUSCLE_OUTLINE_STROKE) : '#ffffff';
    const mWidth = outlined ? MUSCLE_OUTLINE_PX : 0.9;
    const g = opts.groupOf ? opts.groupOf(id) : null;
    // round 12: no fill transition on a tap (it made the tap look slow): the colour changes in the same frame
    const dm = (muscleById[id] ? ` data-m="${muscleById[id]}"` : '') + (g ? ` data-grp="${g}" style="cursor:pointer"` : '');
    parts.push(`<path d="${table[id]}" fill="${fill}"${dm} stroke="${mStroke}" stroke-width="${mWidth}"${outlined ? NS : ''} stroke-linejoin="round"/>`);
  }
  if (silhouette && outlined) {
    parts.push(`<path d="${silhouette}" fill="none" stroke="${opts.ink ?? OUTLINE_STROKE}" stroke-width="${OUTLINE_PX}"${NS} stroke-linejoin="round" style="pointer-events:none"/>`);
  }
  return parts.join('');
}

/** Create workout's tappable map: the SAME drawing, outlined, one side. */
export function bodyMapTappableSvg(side: 'front' | 'back', opts: MapOpts): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MUSCLE_MAP_VIEWBOX[side]}" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" style="display:block;width:100%;height:100%;">${bodyMapParts({}, side, true, opts)}</svg>`;
}

/** The ink of the outlines on the app's two big muscle maps (Progress tab and Create workout): the same dark outline on the body and on every muscle. */
export const MAP_INK = '#23262f';

/** The Progress tab's map (round 11): the same drawing as Create workout's, outlined in the shared ink; ranked muscles keep their tier colours. */
export function bodyMapOutlinedSvg(tiers: MuscleTiers, side: 'front' | 'back'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MUSCLE_MAP_VIEWBOX[side]}" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" style="display:block;width:100%;height:100%;">${bodyMapParts(tiers, side, true, { ink: MAP_INK })}</svg>`;
}

export function bodyMapSvg(tiers: MuscleTiers, side: 'front' | 'back'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MUSCLE_MAP_VIEWBOX[side]}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;">${bodyMapParts(tiers, side)}</svg>`;
}

const vb = (side: 'front' | 'back') => MUSCLE_MAP_VIEWBOX[side].split(' ').map(Number);

// Front + back figures side by side as ONE image (a data: URI usable as an
// <img src>), with only the given muscles coloured (bronze — "muscles you just
// trained") and everything else neutral. Same path data / region table as the
// Progress tab and the native MuscleTierMap, so it's the app's real body map.
export function bodyMapPairSvg(worked: Muscle[], tierOf?: MuscleTiers): string {
  const tiers: MuscleTiers = {};
  // trained muscles are bright in THEIR OWN rank colour when the ranks are given (else bronze); every other muscle stays grey
  for (const m of worked) tiers[m] = { tier: tierOf?.[m]?.tier ?? 'bronze', peakTier: 'bronze', volume: 0, goodRatio: 0 };
  const [, , fw, fh] = vb('front');
  const [, , bw, bh] = vb('back');
  const gap = 56;
  const H = Math.max(fh, bh);
  const W = fw + gap + bw;
  const fig = (side: 'front' | 'back', x: number, w: number, h: number) =>
    `<svg x="${x}" y="${(H - h) / 2}" width="${w}" height="${h}" viewBox="${MUSCLE_MAP_VIEWBOX[side]}">${bodyMapParts(tiers, side, true)}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${fig('front', 0, fw, fh)}${fig('back', fw + gap, bw, bh)}</svg>`;
}

export function bodyMapPairDataUri(worked: Muscle[], tierOf?: MuscleTiers): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(bodyMapPairSvg(worked, tierOf));
}
