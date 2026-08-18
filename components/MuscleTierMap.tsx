/**
 * components/MuscleTierMap.tsx
 *
 * A muscle "rank card": each individual muscle gets a game-style tier
 * (Bronze -> Champion) computed from BOTH training volume AND form quality
 * (see computeMuscleTiers in lib/sessionLog.ts) — the tier calculation, not
 * this file, is where "trained hard WITH good form" actually happens; this
 * file just renders the result.
 *
 * TIER EMBLEMS are hand-drawn SVG marks, one distinct shape per tier (coin,
 * shield, medal, radiant ring, cut gem, star, crown) gradient-filled from
 * that tier's own hi/lo/ink palette — not a generic icon reused across
 * tiers, so each rank actually reads as a different material.
 *
 * MUSCLE ICONS: switched from 6 broad groups to 14 individual muscles (see
 * the Muscle enum in constants/exercises.ts). 11 of them now use real PNG
 * icons (Flaticon "cube29" muscle pack — see MUSCLE_ICON_ATTRIBUTION,
 * credited at the bottom of app/muscle-ranks.tsx), PRE-BAKED into all 7
 * tier colors per muscle (see MUSCLE_ICON_SOURCES' own comment for how) and
 * wired in below. Untrained muscles reuse the same art at the silver
 * variant + reduced opacity, not a different icon. The remaining 3
 * (Forearms/LowerBack/Calves, no art yet) fall back to the real-extracted-
 * path SVG crop this file used before (muscleShapePaths.ts) — see
 * MUSCLE_ICON_FALLBACK's comment.
 */

import React, { useMemo, useRef, useEffect, useId } from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { Image as RankEmblemImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Path, Circle, Line, G } from 'react-native-svg';
import { Muscle } from '../constants/exercises';
import type { Slug } from 'react-native-body-highlighter';
import type { MuscleTiers, MuscleTierInfo, Tier } from '../lib/sessionLog';
import { TIER_ORDER, tierIndex, VOLUME_THRESHOLDS, QUALITY_THRESHOLDS } from '../lib/sessionLog';
import { FRONT_MUSCLE_PATHS, BACK_MUSCLE_PATHS } from './muscleShapePaths';
import {
  MUSCLE_MAP_FRONT_PATHS, MUSCLE_MAP_BACK_PATHS, MUSCLE_MAP_REGIONS, MUSCLE_MAP_VIEWBOX,
} from './muscleMapPaths.generated';
import { Col, FONT, W, Sp } from '../constants/theme';

// ─── Tier palette ───────────────────────────────────────────────────────────
// Each tier is a real 3-stop material gradient (highlight -> mid -> ink),
// not a flat color — used by both the emblem and the SVG-fallback icon fill.
export const TIER_META: Record<Tier, { hi: string; lo: string; ink: string; label: string }> = {
  bronze:   { hi: '#F0C9A0', lo: '#B97A42', ink: '#7A4A22', label: 'Bronze' },
  // Old values (hi #F2F5F8, lo #AEB8C4, ink #69727E) were clustered in a
  // narrow light-gray band — even ink, the darkest stop, was luminance
  // ~113, nearly double every other tier's ink. First fix widened the
  // range AND added a cool blue lean ("polished steel") — the range fix
  // was right, the blue lean wasn't wanted; reverted that part to a plain
  // grayscale silver (lo is literally CSS's own #C0C0C0 "silver"), same
  // real hi-to-ink spread as every other tier, no added hue.
  silver:   { hi: '#FFFFFF', lo: '#C0C0C0', ink: '#585858', label: 'Silver' },
  gold:     { hi: '#FFEBB0', lo: '#E3B94D', ink: '#96701A', label: 'Gold' },
  platinum: { hi: '#E2FBF3', lo: '#7FE0C9', ink: '#1C9C82', label: 'Platinum' },
  diamond:  { hi: '#E3F7FF', lo: '#6FD3FF', ink: '#1789B8', label: 'Diamond' },
  master:   { hi: '#F1E4FF', lo: '#B98CFF', ink: '#6F3FC2', label: 'Master' },
  champion: { hi: '#FFF7DE', lo: '#FFD36E', ink: '#B9820A', label: 'Champion' },
};

export const MUSCLE_LABELS: Record<Muscle, string> = {
  [Muscle.Chest]:      'Chest',
  [Muscle.Shoulders]:  'Shoulders',
  [Muscle.RearDelts]:  'Rear Delts',
  [Muscle.Biceps]:     'Biceps',
  [Muscle.Triceps]:    'Triceps',
  [Muscle.Forearms]:   'Forearms',
  [Muscle.Lats]:       'Lats',
  [Muscle.Traps]:      'Traps',
  [Muscle.LowerBack]:  'Lower Back',
  [Muscle.Abs]:        'Abs',
  [Muscle.Quads]:      'Quads',
  [Muscle.Hamstrings]: 'Hamstrings',
  [Muscle.Glutes]:     'Glutes',
  [Muscle.Calves]:     'Calves',
};
// Display order — SCOPED to the 11 muscles with a real supplied icon (see
// MUSCLE_ICON_SOURCES above). Forearms/LowerBack/Calves are still tracked
// (real exercises really do train them — see constants/exercises.ts) and
// computeMuscleTiers still returns tier info for them, this array just
// doesn't surface them in the UI yet. Add them back here the moment their
// icons land; roughly top-to-bottom on the body otherwise.
export const MUSCLE_DISPLAY_ORDER: Muscle[] = [
  Muscle.Chest, Muscle.Shoulders, Muscle.RearDelts, Muscle.Traps,
  Muscle.Biceps, Muscle.Triceps, Muscle.Abs,
  Muscle.Lats,
  Muscle.Quads, Muscle.Hamstrings, Muscle.Glutes,
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ─── Tier emblems — real art (assets/ranks/<tier>.png), one per tier ───────
// Was hand-drawn SVG (a distinct shape + gradient per tier via
// renderTierMark) — replaced with real emblem art the same way the muscle
// tile icons already moved from code-drawn shapes to real PNGs. Filename
// maps directly to Tier, so this table is the only place a new tier's art
// needs registering.
const RANK_EMBLEM_SOURCES: Record<Tier, ImageSourcePropType> = {
  bronze:   require('../assets/ranks/bronze.png'),
  silver:   require('../assets/ranks/silver.png'),
  gold:     require('../assets/ranks/gold.png'),
  platinum: require('../assets/ranks/platinum.png'),
  diamond:  require('../assets/ranks/diamond.png'),
  master:   require('../assets/ranks/master.png'),
  champion: require('../assets/ranks/champion.png'),
};

// Champion's source art carries more transparent padding than the other 6
// (measured: content fills ~67% of the canvas width vs ~73-76% for
// bronze/silver/gold/platinum/diamond/master — the crown needed extra
// headroom so it doesn't clip at the canvas edge), so the SAME requested
// size renders visibly smaller than every other tier. Compensate with a
// size-only multiplier, not a layout change — every wrapping container
// TierEmblem renders inside centers it without clipping, so scaling just
// the image up to match its siblings' apparent size is safe.
// Champion's source art is genuinely a different SHAPE than the other 6 (a
// crown, cropped tight to content: 226x320px, aspect ratio ~0.706), not
// just smaller-with-more-padding the way it first looked — the other 6 are
// all roughly square. A uniform width=height=size*scale box (the previous
// fix) forced it into a SQUARE box anyway, making its container taller
// than its siblings' and pushing its legend label down below the rest.
// Locking HEIGHT to the same `size` every other tier gets, and computing
// width from this real aspect ratio, keeps every emblem's height (and
// therefore anything laid out below it, like a legend label) aligned,
// while still rendering champion at a comparable visual scale — no
// distortion, no wasted transparent padding.
const CHAMPION_ASPECT_RATIO = 226 / 320;

export function TierEmblem({ tier, size = 20, style }: { tier: Tier; size?: number; style?: any }) {
  const isChampion = tier === 'champion';
  const height = size;
  const width = isChampion ? Math.round(size * CHAMPION_ASPECT_RATIO) : size;
  // expo-image (already a dependency, not previously used in this file),
  // not the core Image also used below for muscle icons — reported "rank
  // icons load in very late," i.e. a visible blank-then-pop-in flash. Core
  // Image has no built-in local-asset warm cache; expo-image decodes once
  // and serves every subsequent mount (there are up to ~9 of these on
  // screen at once — hero, 11 tile badges, legend row) from its own
  // memory/disk cache instead of each one re-decoding independently.
  // transition={0} additionally kills expo-image's own default fade-in,
  // since the ask was "immediately load in," not a smoother pop-in.
  return (
    <RankEmblemImage
      source={RANK_EMBLEM_SOURCES[tier]}
      style={[{ width, height }, style]}
      contentFit="contain"
      cachePolicy="memory-disk"
      priority="high"
      transition={0}
    />
  );
}

// ─── Muscle icons ───────────────────────────────────────────────────────────
//
// PNG SOURCES — real Flaticon icons (cube29 pack, see MUSCLE_ICON_ATTRIBUTION
// below). Each muscle has 7 PRE-BAKED variants, one per tier — generated by a
// one-off pixel-replace script (not checked in) that swapped the source
// art's flat highlight color (#FF004F, sampled directly from the PNG pixels)
// for each tier's real hex (bronze #CD7F32, silver #C0C0C0, gold #FFD700,
// platinum #E5E4E2, diamond #4FC3F7, master #9C27B0, champion #DC143C).
// The base body silhouette (originally two-tone navy/slate-blue) and the
// separate orange secondary-muscle accent (present in quads/hamstrings/
// biceps) were ORIGINALLY left untouched by that bake, which read as "blue
// and orange body, one muscle in rank color" instead of "neutral body, one
// muscle highlighted." Fixed with a second one-off script (also not
// checked in): for each muscle, diffed all 7 tier PNGs pixel-by-pixel —
// any pixel identical across all 7 files is base art (the bake never
// touched it, tier-independent by construction) and got luminance-
// desaturated to gray in place; any pixel that differs between tiers is
// the actual rank-color swap and was left completely alone. No hardcoded
// colors or hue ranges needed, so it can't accidentally desaturate a
// tier's own color even where a tier is itself blue (diamond) or orange
// (bronze). This replaced an earlier SVG hueRotate-filter approach, which
// rotated the WHOLE image's hue uniformly — fine for champion (already
// reddish) but wrong for desaturated tiers like silver/platinum, which
// came out as vivid green/blue/purple instead of muted metal. Pixel-level
// pre-bake is exact and has no runtime cost. Still needed, no art yet:
// forearms, lower back, calves.
const MUSCLE_ICON_SOURCES: Partial<Record<Muscle, Record<Tier, ImageSourcePropType>>> = {
  [Muscle.Chest]: {
    bronze: require('../assets/images/muscle-icons/chest-bronze.png'),
    silver: require('../assets/images/muscle-icons/chest-silver.png'),
    gold: require('../assets/images/muscle-icons/chest-gold.png'),
    platinum: require('../assets/images/muscle-icons/chest-platinum.png'),
    diamond: require('../assets/images/muscle-icons/chest-diamond.png'),
    master: require('../assets/images/muscle-icons/chest-master.png'),
    champion: require('../assets/images/muscle-icons/chest-champion.png'),
  },
  [Muscle.Shoulders]: {
    bronze: require('../assets/images/muscle-icons/shoulders-bronze.png'),
    silver: require('../assets/images/muscle-icons/shoulders-silver.png'),
    gold: require('../assets/images/muscle-icons/shoulders-gold.png'),
    platinum: require('../assets/images/muscle-icons/shoulders-platinum.png'),
    diamond: require('../assets/images/muscle-icons/shoulders-diamond.png'),
    master: require('../assets/images/muscle-icons/shoulders-master.png'),
    champion: require('../assets/images/muscle-icons/shoulders-champion.png'),
  },
  [Muscle.RearDelts]: {
    bronze: require('../assets/images/muscle-icons/rear-delts-bronze.png'),
    silver: require('../assets/images/muscle-icons/rear-delts-silver.png'),
    gold: require('../assets/images/muscle-icons/rear-delts-gold.png'),
    platinum: require('../assets/images/muscle-icons/rear-delts-platinum.png'),
    diamond: require('../assets/images/muscle-icons/rear-delts-diamond.png'),
    master: require('../assets/images/muscle-icons/rear-delts-master.png'),
    champion: require('../assets/images/muscle-icons/rear-delts-champion.png'),
  },
  [Muscle.Biceps]: {
    bronze: require('../assets/images/muscle-icons/biceps-bronze.png'),
    silver: require('../assets/images/muscle-icons/biceps-silver.png'),
    gold: require('../assets/images/muscle-icons/biceps-gold.png'),
    platinum: require('../assets/images/muscle-icons/biceps-platinum.png'),
    diamond: require('../assets/images/muscle-icons/biceps-diamond.png'),
    master: require('../assets/images/muscle-icons/biceps-master.png'),
    champion: require('../assets/images/muscle-icons/biceps-champion.png'),
  },
  [Muscle.Triceps]: {
    bronze: require('../assets/images/muscle-icons/triceps-bronze.png'),
    silver: require('../assets/images/muscle-icons/triceps-silver.png'),
    gold: require('../assets/images/muscle-icons/triceps-gold.png'),
    platinum: require('../assets/images/muscle-icons/triceps-platinum.png'),
    diamond: require('../assets/images/muscle-icons/triceps-diamond.png'),
    master: require('../assets/images/muscle-icons/triceps-master.png'),
    champion: require('../assets/images/muscle-icons/triceps-champion.png'),
  },
  [Muscle.Lats]: {
    bronze: require('../assets/images/muscle-icons/lats-bronze.png'),
    silver: require('../assets/images/muscle-icons/lats-silver.png'),
    gold: require('../assets/images/muscle-icons/lats-gold.png'),
    platinum: require('../assets/images/muscle-icons/lats-platinum.png'),
    diamond: require('../assets/images/muscle-icons/lats-diamond.png'),
    master: require('../assets/images/muscle-icons/lats-master.png'),
    champion: require('../assets/images/muscle-icons/lats-champion.png'),
  },
  [Muscle.Traps]: {
    bronze: require('../assets/images/muscle-icons/traps-bronze.png'),
    silver: require('../assets/images/muscle-icons/traps-silver.png'),
    gold: require('../assets/images/muscle-icons/traps-gold.png'),
    platinum: require('../assets/images/muscle-icons/traps-platinum.png'),
    diamond: require('../assets/images/muscle-icons/traps-diamond.png'),
    master: require('../assets/images/muscle-icons/traps-master.png'),
    champion: require('../assets/images/muscle-icons/traps-champion.png'),
  },
  [Muscle.Abs]: {
    bronze: require('../assets/images/muscle-icons/abs-bronze.png'),
    silver: require('../assets/images/muscle-icons/abs-silver.png'),
    gold: require('../assets/images/muscle-icons/abs-gold.png'),
    platinum: require('../assets/images/muscle-icons/abs-platinum.png'),
    diamond: require('../assets/images/muscle-icons/abs-diamond.png'),
    master: require('../assets/images/muscle-icons/abs-master.png'),
    champion: require('../assets/images/muscle-icons/abs-champion.png'),
  },
  [Muscle.Quads]: {
    bronze: require('../assets/images/muscle-icons/quads-bronze.png'),
    silver: require('../assets/images/muscle-icons/quads-silver.png'),
    gold: require('../assets/images/muscle-icons/quads-gold.png'),
    platinum: require('../assets/images/muscle-icons/quads-platinum.png'),
    diamond: require('../assets/images/muscle-icons/quads-diamond.png'),
    master: require('../assets/images/muscle-icons/quads-master.png'),
    champion: require('../assets/images/muscle-icons/quads-champion.png'),
  },
  [Muscle.Hamstrings]: {
    bronze: require('../assets/images/muscle-icons/hamstrings-bronze.png'),
    silver: require('../assets/images/muscle-icons/hamstrings-silver.png'),
    gold: require('../assets/images/muscle-icons/hamstrings-gold.png'),
    platinum: require('../assets/images/muscle-icons/hamstrings-platinum.png'),
    diamond: require('../assets/images/muscle-icons/hamstrings-diamond.png'),
    master: require('../assets/images/muscle-icons/hamstrings-master.png'),
    champion: require('../assets/images/muscle-icons/hamstrings-champion.png'),
  },
  [Muscle.Glutes]: {
    bronze: require('../assets/images/muscle-icons/glutes-bronze.png'),
    silver: require('../assets/images/muscle-icons/glutes-silver.png'),
    gold: require('../assets/images/muscle-icons/glutes-gold.png'),
    platinum: require('../assets/images/muscle-icons/glutes-platinum.png'),
    diamond: require('../assets/images/muscle-icons/glutes-diamond.png'),
    master: require('../assets/images/muscle-icons/glutes-master.png'),
    champion: require('../assets/images/muscle-icons/glutes-champion.png'),
  },
};

// Flaticon free-tier license requires attribution — shown as a small credit
// link at the bottom of the muscle-ranks page (app/muscle-ranks.tsx).
export const MUSCLE_ICON_ATTRIBUTION = {
  text: 'Muscle icons by cube29 — Flaticon',
  url:  'https://www.flaticon.com/free-icons/muscle',
};

// SVG fallback (used for every muscle until its PNG lands) — the real
// extracted muscle-region path(s) from muscleShapePaths.ts, cropped tight
// via viewBox. One representative side per muscle, since combining front+
// back would force the crop back out and defeat the "zoomed in" point.
// LATS has no dedicated slug in the underlying data (react-native-body-
// highlighter bundles it into "upper-back") — approximated with that
// region until the real lats.png lands; every other entry is a direct 1:1
// match to a real slug.
const MUSCLE_ICON_FALLBACK: Record<Muscle, { side: 'front' | 'back'; slugs: Slug[]; crop: string }> = {
  [Muscle.Chest]:      { side: 'front', slugs: ['chest'],                  crop: '180 280 380 280' },
  [Muscle.Shoulders]:  { side: 'front', slugs: ['deltoids'],               crop: '120 220 500 260' },
  [Muscle.RearDelts]:  { side: 'back',  slugs: ['deltoids'],               crop: '900 260 400 220' },
  [Muscle.Biceps]:     { side: 'front', slugs: ['biceps'],                 crop: '130 440 460 120' },
  [Muscle.Triceps]:    { side: 'back',  slugs: ['triceps'],                crop: '860 380 450 220' },
  [Muscle.Forearms]:   { side: 'front', slugs: ['forearm'],                crop: '80 490 560 230' },
  [Muscle.Lats]:       { side: 'back',  slugs: ['upper-back'],             crop: '900 250 360 430' },
  [Muscle.Traps]:      { side: 'back',  slugs: ['trapezius'],              crop: '970 260 260 300' },
  [Muscle.LowerBack]:  { side: 'back',  slugs: ['lower-back'],             crop: '930 540 300 180' },
  [Muscle.Abs]:        { side: 'front', slugs: ['abs'],                    crop: '260 380 200 380' },
  [Muscle.Quads]:      { side: 'front', slugs: ['quadriceps'],             crop: '180 700 370 300' },
  [Muscle.Hamstrings]: { side: 'back',  slugs: ['hamstring'],              crop: '900 700 370 420' },
  [Muscle.Glutes]:     { side: 'back',  slugs: ['gluteal'],                crop: '960 580 260 260' },
  [Muscle.Calves]:     { side: 'back',  slugs: ['calves'],                 crop: '930 1100 320 280' },
};

function muscleFallbackPaths(muscle: Muscle): string[] {
  const { side, slugs } = MUSCLE_ICON_FALLBACK[muscle];
  const table = side === 'front' ? FRONT_MUSCLE_PATHS : BACK_MUSCLE_PATHS;
  const out: string[] = [];
  for (const slug of slugs) out.push(...(table[slug] ?? []));
  return out;
}

function MuscleIcon({ muscle, tier, size }: { muscle: Muscle; tier?: Tier; size: number }) {
  const uid = useId();
  const gradId = `mi-${uid}`;
  const meta = tier ? TIER_META[tier] : null;
  const iconSet = MUSCLE_ICON_SOURCES[muscle];
  // Untrained muscles still use the SAME Flaticon art, not a different icon
  // — just the silver-tier file (already a neutral gray) at reduced
  // opacity, standing in for "no rank yet" instead of falling back to the
  // crude SVG crop. The SVG fallback is now ONLY for the 3 muscles with no
  // Flaticon coverage at all (Forearms/LowerBack/Calves), trained or not.
  const pngSource = iconSet ? (tier ? iconSet[tier] : iconSet.silver) : undefined;
  const paths = useMemo(() => muscleFallbackPaths(muscle), [muscle]);

  if (pngSource) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={pngSource} style={{ width: size, height: size, opacity: meta ? 1 : 0.45 }} resizeMode="contain" />
      </View>
    );
  }

  const { crop } = MUSCLE_ICON_FALLBACK[muscle];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: meta ? `${meta.hi}2E` : '#EEF0F3', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={crop} preserveAspectRatio="xMidYMid meet">
        {meta && (
          <Defs>
            <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={meta.hi} />
              <Stop offset="55%" stopColor={meta.lo} />
              <Stop offset="100%" stopColor={meta.ink} />
            </SvgLinearGradient>
          </Defs>
        )}
        <G fill={meta ? `url(#${gradId})` : 'rgba(140,148,160,0.38)'}>
          {paths.map((d, i) => <Path key={i} d={d} />)}
        </G>
      </Svg>
    </View>
  );
}

// ─── Body map — full front/back diagram, every trained muscle lit up at ───
// once in its own tier's gradient. Path data now comes from
// muscleMapPaths.generated.ts (traced from the real muscle-map.svg.svg
// artwork, all 14 muscles present — the old body-muscles-package dataset
// only had regions for 11), rendered with the same flat TIER_META 3-stop
// gradient fill the tile icons and hero ring already use.
interface BodyMapSpec { key: string; d: string; gradId: string; tier: Tier; meta: { hi: string; lo: string; ink: string } }

function buildBodyMapSpecs(tiers: MuscleTiers, side: 'front' | 'back', uid: string): BodyMapSpec[] {
  const table = side === 'front' ? MUSCLE_MAP_FRONT_PATHS : MUSCLE_MAP_BACK_PATHS;
  const out: BodyMapSpec[] = [];
  for (const m of Object.keys(MUSCLE_MAP_REGIONS) as Muscle[]) {
    const region = MUSCLE_MAP_REGIONS[m]!;
    if (region.side !== side) continue;
    const info = tiers[m];
    if (!info) continue; // untrained — not shown, not fabricated
    const meta = TIER_META[info.tier];
    for (const id of region.ids) {
      const d = table[id];
      if (!d) continue;
      out.push({ key: `${m}-${id}`, d, gradId: `bm-${uid}-${m}-${id}`, tier: info.tier, meta });
    }
  }
  return out;
}

// ─── Per-tier texture, not text ─────────────────────────────────────────────
// Text labels ("SILVER", "GOLD" spelled out on the muscle) were the wrong
// read on the original ask ("distinct visual treatment," not a word) and
// looked bad on top of that — removed entirely, replaced with a material
// SHEEN: a soft diagonal highlight band laid over the same tier gradient,
// escalating in strength/complexity by rank so tiers read apart by how the
// muscle actually LOOKS (flat matte vs. bright crossed metallic sheen), not
// by reading a word. Same whole-figure userSpaceOnUse coordinate trick the
// base gradient already uses (see its own comment) — a per-fragment sheen
// would show the exact same "disjointed shard" seams that trick was built to
// avoid, so the sheen shares that one continuous coordinate space too, just
// on a different (diagonal, corner-to-corner) axis than the base gradient's
// vertical one, so it reads as a single light sweep crossing the figure.
// Escalation is a plain progression (bronze flat → champion brightest
// crossed double-sheen), not seven unrelated patterns — a rank system's
// materials getting visibly richer as you climb is the same "this is a
// nicer thing to look at than that one" reasoning tier colors already lean
// on, applied to a second dimension besides just color.
const TIER_SHEEN: Record<Tier, { opacity: number; double: boolean }> = {
  bronze:   { opacity: 0,     double: false },
  silver:   { opacity: 0.18,  double: false },
  gold:     { opacity: 0.26,  double: false },
  platinum: { opacity: 0.32,  double: false },
  diamond:  { opacity: 0.30,  double: true  },
  master:   { opacity: 0.36,  double: true  },
  champion: { opacity: 0.44,  double: true  },
};

function BodyMapSide({ tiers, side, width }: { tiers: MuscleTiers; side: 'front' | 'back'; width: number }) {
  const uid = useId();
  const specs = useMemo(() => buildBodyMapSpecs(tiers, side, uid), [tiers, side, uid]);
  const allPaths = side === 'front' ? MUSCLE_MAP_FRONT_PATHS : MUSCLE_MAP_BACK_PATHS;
  // Silhouette (the one whole-body outline shape) rendered as its own
  // layer, separate from every other region — it gets a bolder, wider
  // outline than individual muscles (see the stroke widths below), so the
  // body's outer edge reads as the "frame" and muscle boundaries read as
  // divisions inside it, not two things fighting at the same weight.
  const { silhouette, ...muscleRegionPaths } = allPaths;
  const viewBox = MUSCLE_MAP_VIEWBOX[side];
  const [, , vbW, vbH] = viewBox.split(' ').map(Number);
  const height = Math.round((width * vbH) / vbW);
  // ROOT CAUSE of "still looks wiry/thin" after the first stroke-width bump:
  // strokeWidth was a FIXED number in the SVG's internal viewBox coordinate
  // space (~479 units wide), but the box renders at `width` real screen
  // pixels — a fixed viewBox-unit stroke shrinks right along with whatever
  // `width` this side is drawn at, so it never actually got thicker on
  // screen, it just moved with the shrink. `shrink` converts a REAL target
  // screen-pixel thickness into the matching viewBox-unit strokeWidth, so
  // the outline reads the same bold black weight at any card size (muscle-
  // ranks' scale=1.0 card and recap's smaller scale=0.75 card alike).
  // Widths themselves DOWN from the first pass (3.5/6 → 2.6/4.5) — reported
  // "too bold." That first pass also finally exposed a SEPARATE, real bug at
  // this weight: the traced path data itself has small bezier control-point
  // noise (invisible at a thin hairline, reads as messy scribble/bumps once
  // genuinely stroked bold) — fixed at the data level in
  // muscleMapPaths.generated.ts (Ramer-Douglas-Peucker simplification), not
  // by hiding it behind a thinner line here.
  const shrink = vbW / width;
  // ROUND joins reported "too cartoonish/hand-drawn" — the path data is
  // straight-edged polygons now (RDP-simplified, see muscleMapPaths.
  // generated.ts), and a round join puts a visible little bubble at every
  // vertex of an angular shape, which is exactly a thick-marker/coloring-
  // book signature, not a clean vector one. MITER (the SVG default, sharp
  // corners) is the actual fix here, not a width change alone.
  // Width DOWN again (2.6/3 → 2.0/2.4) and color softened from solid
  // #0A0A0F to a translucent dark charcoal — pure black at full opacity is
  // the other half of "cartoon outline"; a dark-but-not-ink stroke reads as
  // a refined edge instead of a comic-panel line, while staying meaningfully
  // heavier than the original 1.1px/low-opacity hairline that was reported
  // "wiry" in the first place. Silhouette stays the visibly bolder of the
  // two (the outer "frame"), muscle regions lighter (internal divisions).
  const muscleStroke     = 2.0 * shrink;
  const silhouetteStroke = 2.4 * shrink;
  const muscleStrokeColor     = 'rgba(15,18,28,0.55)';
  const silhouetteStrokeColor = 'rgba(10,12,18,0.78)';
  return (
    <View style={{ width, height }}>
    <Svg width={width} height={height} viewBox={viewBox}>
      <Defs>
        {/* userSpaceOnUse spanning the WHOLE figure (0,0 to vbW,vbH), not
            the default objectBoundingBox (each shape's own independent 0-1
            box) — the actual root cause of "the back looks shattered/edgy"
            and "the front legs are just white." A trained muscle isn't one
            shape, it's several small path fragments (traps/lats/etc are
            each 2-6 pieces — see MUSCLE_MAP_REGIONS), and with
            objectBoundingBox every one of those pieces restarted its own
            independent hi-to-ink sweep, so adjacent fragments of the SAME
            muscle had mismatched gradient angles/positions — reads as
            separate reflective shards, not one smooth muscle. It also
            explains the all-white patches: a small/oddly-shaped fragment
            can easily have most of its actual area fall in its own
            gradient's first 0-20%, all hi/near-white, purely as an
            artifact of that shape's own bounding box, unrelated to where
            it sits on the body. One shared coordinate space across the
            whole figure means every fragment of a muscle picks up
            whichever slice of ONE continuous sweep it actually sits at —
            reads as one lit surface, and no single small piece can
            accidentally monopolize the white end. */}
        {specs.map(s => (
          <SvgLinearGradient key={s.gradId} id={s.gradId} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={vbW} y2={vbH}>
            <Stop offset="0%" stopColor={s.meta.hi} />
            <Stop offset="55%" stopColor={s.meta.lo} />
            <Stop offset="100%" stopColor={s.meta.ink} />
          </SvgLinearGradient>
        ))}
        {/* Sheen gradients — see TIER_SHEEN's own comment for why this
            replaces the text labels. Same userSpaceOnUse whole-figure space
            as the base gradient above, but a DIAGONAL axis (corner to
            corner) instead of the base gradient's vertical one, so it reads
            as one light sweep crossing the whole figure rather than the
            base tint. Narrow bright band via 4 stops (transparent → peak →
            transparent) centered at the diagonal midpoint. "double" tiers
            (diamond/master/champion) get a SECOND gradient on the counter
            diagonal at half strength, crossing the first — that crossing is
            the whole visual difference between "single metallic sheen" and
            "faceted/multi-sheen" tiers, no clipped hatch-line geometry
            needed to get there. */}
        {specs.map(s => {
          const sheen = TIER_SHEEN[s.tier];
          if (sheen.opacity <= 0) return null;
          return (
            <React.Fragment key={`${s.gradId}-sheen`}>
              <SvgLinearGradient id={`${s.gradId}-sheenA`} gradientUnits="userSpaceOnUse" x1={0} y1={vbH} x2={vbW} y2={0}>
                <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="42%" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={sheen.opacity} />
                <Stop offset="58%" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
              </SvgLinearGradient>
              {sheen.double && (
                <SvgLinearGradient id={`${s.gradId}-sheenB`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={vbW} y2={vbH}>
                  <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="42%" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={sheen.opacity * 0.55} />
                  <Stop offset="58%" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                </SvgLinearGradient>
              )}
            </React.Fragment>
          );
        })}
      </Defs>
      {/* Whole-body silhouette outline — drawn first/behind everything so
          its rim frames the whole figure. Dark charcoal, not solid black —
          see muscleStrokeColor/silhouetteStrokeColor's own comment above
          for why (reported "too cartoonish/hand-drawn"). */}
      <Path d={silhouette} fill="#E4E6EA" stroke={silhouetteStrokeColor} strokeWidth={silhouetteStroke} strokeLinejoin="miter" />
      {/* Neutral muscle regions — every region, untinted, so untrained
          muscles still read as part of one coherent body, not a gap.
          OPAQUE fill — was a translucent rgba, which looked fine for the
          single silhouette path alone but every one of the ~185 individual
          muscle-region paths on top of it ALSO used that same translucent
          fill, so every region's overlap with the silhouette double-
          stacked the alpha into a visibly darker, blotchy patch — a real
          rendering bug (reported as "the body map looks messed up"), not a
          stylistic wash. A flat opaque color can't stack this way:
          overlapping shapes just cleanly overwrite pixels instead of
          compounding tint. FLAT, not a gradient — a per-shape diagonal
          gradient (tried this round) looked fine on a few big regions but
          turned into visual noise across the ~185 small/oddly-shaped ones,
          especially where several meet in a tight cluster (lower back's
          small wedge between lats and glutes reads worst) — independent
          light/dark diagonal streaks crossing right at shape boundaries
          reads as overlapping or broken geometry even though the
          underlying shapes are correct (audited directly against the
          generated path data, no actual overlap). Flat true-neutral gray
          now — went warm/tan for a round trying to dodge Silver's own cool
          palette, but that wasn't actually what was reported broken about
          Silver on the body map, and the tan read as an unrelated,
          unwanted change on its own. #E4E6EA has no warm or cool lean
          either direction. */}
      {Object.values(muscleRegionPaths).map((d, i) => (
        <Path key={i} d={d} fill="#E4E6EA" stroke={muscleStrokeColor} strokeWidth={muscleStroke} strokeLinejoin="miter" />
      ))}
      {/* Trained regions, tier-gradient filled, on top. Same rim treatment
          as the neutral pass so a trained muscle's outline doesn't change
          weight the moment it's tinted — the outline is doing the "defined
          shape" work, independent of fill color underneath it. */}
      {specs.map(s => (
        <Path key={s.key} d={s.d} fill={`url(#${s.gradId})`} stroke={muscleStrokeColor} strokeWidth={muscleStroke} strokeLinejoin="miter" />
      ))}
      {/* Sheen overlay pass — fill only, no stroke (would double the rim
          weight for no reason). Drawn last so the highlight sits on top of
          the tier color it's modulating, same "one continuous sweep" logic
          as the base gradient. */}
      {specs.map(s => {
        const sheen = TIER_SHEEN[s.tier];
        if (sheen.opacity <= 0) return null;
        return (
          <React.Fragment key={`${s.key}-sheen`}>
            <Path d={s.d} fill={`url(#${s.gradId}-sheenA)`} />
            {sheen.double && <Path d={s.d} fill={`url(#${s.gradId}-sheenB)`} />}
          </React.Fragment>
        );
      })}
    </Svg>
    </View>
  );
}

// Tier legend — all 7 emblems in rank order, so the body map reads on its
// own (recap shows BodyMap alone, no hero card/tile grid nearby with a tier
// label on them) instead of needing the reader to already know what each
// tier looks like.
function TierLegendRow({ scale }: { scale: number }) {
  // Sized (and gapped) to reliably fit 7 items on one line.
  const emblemSize = Math.round(42 * scale);
  // FIXED-SIZE SLOT per item, not the raw emblem — champion's true
  // aspect ratio (~0.7, a crown, not a square shield like the other 6)
  // means locking its height to exactly `emblemSize` (the previous fix)
  // leaves it visibly narrower than its siblings: correctly aligned, but
  // reported as "still slightly too small" and throwing off the row's
  // even spacing (its slice of the row is narrower, so the gap around it
  // reads inconsistent). A same-size slot for every item is what actually
  // drives row layout/alignment now, so champion can render MODESTLY
  // bigger than the slot (it isn't clipped — slot has no overflow:hidden)
  // to compensate for its narrower shape, without perturbing anyone's
  // position.
  const champBoost = 1.15;
  return (
    <View style={[mh.tierLegendRow, { gap: Math.round(3 * scale) }]}>
      {TIER_ORDER.map(t => (
        <View key={t} style={mh.tierLegendItem}>
          <View style={{ width: emblemSize, height: emblemSize, alignItems: 'center', justifyContent: 'center' }}>
            {/* Crown's own visual weight sits toward its base (the points
                taper to thin peaks with little mass), so mathematically
                centering it in the slot reads slightly low/bottom-heavy
                next to the shields' more even weight distribution — a
                small optical nudge up, not another sizing change. */}
            <TierEmblem
              tier={t}
              size={t === 'champion' ? Math.round(emblemSize * champBoost) : emblemSize}
              style={t === 'champion' ? { marginTop: -Math.round(emblemSize * 0.08) } : undefined}
            />
          </View>
          <Text style={[mh.tierLegendLabel, { fontSize: Math.round(8.5 * scale) }]}>{TIER_META[t].label}</Text>
        </View>
      ))}
    </View>
  );
}

export function BodyMap({ tiers, scale }: { tiers: MuscleTiers; scale: number }) {
  // Bumped 118→160→190→175 ("make it bigger" two rounds ago, then reported
  // clipping the hands at 190 — exactly the risk flagged when 190 was set:
  // this card's overflow:hidden was cutting the SVG's own edge because
  // front+back at 190 ran wider than the actual available card width on a
  // real device, not a viewBox/content-crop problem inside the SVG itself.
  // 175 pulls back just enough to clear that. Still meaningfully bigger
  // than the original 160 baseline. If it ever clips again, the real fix is
  // making BodyMapSide measure its actual available width at runtime
  // (onLayout) instead of trusting a fixed colWidth — flag it if seen.
  const colWidth = Math.round(175 * scale);
  return (
    <View style={{ gap: Math.round(8 * scale) }}>
      <TierLegendRow scale={scale} />
      <View style={mh.sectionHeaderRow}>
        <Text style={[mh.sectionHeader, { fontSize: Math.round(11 * scale) }]}>BODY MAP</Text>
        <Text style={[mh.sectionSub, { fontSize: Math.round(11 * scale) }]}>Front · Back</Text>
      </View>
      <View style={[mh.bodyMapShadowWrap, { borderRadius: Math.round(24 * scale) }]}>
        <View style={[mh.bodyMapCard, { borderRadius: Math.round(24 * scale), padding: Math.round(Sp.md * scale) }]}>
          <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.3)']}
            start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View
            style={[StyleSheet.absoluteFill, { borderRadius: Math.round(24 * scale), borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' }]}
            pointerEvents="none"
          />
          <View style={mh.bodyMapRow}>
            <View style={mh.bodyMapCol}>
              <BodyMapSide tiers={tiers} side="front" width={colWidth} />
              <Text style={[mh.bodyMapLabel, { fontSize: Math.round(10.5 * scale) }]}>FRONT</Text>
            </View>
            <View style={mh.bodyMapCol}>
              <BodyMapSide tiers={tiers} side="back" width={colWidth} />
              <Text style={[mh.bodyMapLabel, { fontSize: Math.round(10.5 * scale) }]}>BACK</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Simple mount-fade, used by the hero card and each grid tile so the
// page doesn't just pop into existence — the "animated" half of the ask. ──
function FadeInView({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,   { toValue: 1, duration: 420, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 420, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// ─── Rank ring — circular progress ring with the tier emblem centered ─────
// inside it, used by the hero card. Built with react-native-svg's own
// stroke-dasharray technique (consistent with the rest of this file's SVG
// toolkit) rather than pulling in Skia (components/Ring.tsx's approach) —
// this file has no other Skia usage, and introducing a second rendering
// library for one element isn't worth it.
function RankRing({
  progress, meta, size, strokeWidth, children,
}: {
  progress: number; meta: { hi: string; lo: string }; size: number; strokeWidth: number; children: React.ReactNode;
}) {
  const uid = useId();
  const gradId = `rr-${uid}`;
  const r = (size - strokeWidth) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, progress)) * circumference;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={meta.hi} />
            <Stop offset="100%" stopColor={meta.lo} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={c} cy={c} r={r} fill="none"
          stroke="rgba(17,24,39,0.07)" strokeWidth={strokeWidth}
        />
        <Circle
          cx={c} cy={c} r={r} fill="none"
          stroke={`url(#${gradId})`} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${dash}, ${circumference}`}
          rotation={-90} origin={`${c}, ${c}`}
        />
      </Svg>
      {children}
    </View>
  );
}

// ─── Backdrop blobs ─────────────────────────────────────────────────────────
// RN port of the reference mockup's animated CSS blob background: solid
// tier-tinted circles, bled soft via a BlurView laid over them (real native
// blur, not just opacity) and drifted in a slow loop so the page doesn't sit
// static behind the glass cards. Rendered ONCE at page level (muscle-ranks.tsx),
// not per-card, since it's a whole-screen ambience layer.
function useDrift(duration: number, delay = 0, reverse = false) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, delay, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return {
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: reverse ? [16, -16] : [-16, 16] }) },
      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: reverse ? [-10, 10] : [10, -10] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) },
    ],
  };
}

export function MuscleRankBackdrop({ tier }: { tier: Tier }) {
  const meta = TIER_META[tier];
  const d1 = useDrift(9500);
  const d2 = useDrift(11500, 500, true);
  const d3 = useDrift(13500, 900);
  const d4 = useDrift(10500, 300, true);
  // Was 4 blobs all drawn from ONE tier's own hi/lo/ink — reads fine for a
  // vivid tier, but for Silver (or any of the naturally desaturated tiers)
  // every blob is some shade of gray, so the whole page read as colorless
  // ("the overall ranking page still just has no color") even after the
  // body map's own fix. 3 of the 4 blobs now pull from OTHER tiers' own
  // real palette (not invented colors — gold's lo, diamond's lo, master's
  // lo) for consistent richness regardless of current rank; the 4th stays
  // tied to the user's actual tier, so it's not entirely generic.
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[bd.blob, { width: 440, height: 440, borderRadius: 220, top: -170, left: -150, backgroundColor: TIER_META.gold.lo, opacity: 0.38 }, d1]} />
      <Animated.View style={[bd.blob, { width: 340, height: 340, borderRadius: 170, top: -90, right: -120, backgroundColor: TIER_META.diamond.lo, opacity: 0.4 }, d2]} />
      <Animated.View style={[bd.blob, { width: 400, height: 400, borderRadius: 200, bottom: -160, left: -120, backgroundColor: TIER_META.master.lo, opacity: 0.3 }, d3]} />
      <Animated.View style={[bd.blob, { width: 320, height: 320, borderRadius: 160, bottom: -90, right: -110, backgroundColor: meta.lo, opacity: 0.4 }, d4]} />
      <BlurView intensity={65} tint="light" style={StyleSheet.absoluteFill} />
    </View>
  );
}

const bd = StyleSheet.create({
  blob: { position: 'absolute' },
});

// ─── Overall standing — the weakest-link muscle sets the headline tier, ───
// consistent with the per-muscle mechanic itself (volume tier vs quality
// tier, take the lower). Progress toward the next tier is the min of volume
// progress and quality progress — whichever stat is further behind is what's
// actually holding that muscle back.
export interface OverallStanding {
  muscle:   Muscle;
  tier:     Tier;
  progress: number;
  atTop:    boolean;
}

// Exported so the page shell (app/muscle-ranks.tsx) can pick the same tier
// to tint MuscleRankBackdrop with, without duplicating the weakest-link logic.
export function computeOverallStanding(tiers: MuscleTiers): OverallStanding | null {
  const entries = Object.entries(tiers) as [Muscle, MuscleTierInfo][];
  if (entries.length === 0) return null;

  let weakest = entries[0];
  for (const e of entries) {
    if (tierIndex(e[1].tier) < tierIndex(weakest[1].tier)) weakest = e;
  }
  const [muscle, info] = weakest;
  const idx = tierIndex(info.tier);
  if (idx === TIER_ORDER.length - 1) {
    return { muscle, tier: info.tier, progress: 1, atTop: true };
  }

  const nextTier    = TIER_ORDER[idx + 1];
  const curVolMin   = VOLUME_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextVolMin  = VOLUME_THRESHOLDS.find(([t]) => t === nextTier)![1];
  const curQualMin  = QUALITY_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextQualMin = QUALITY_THRESHOLDS.find(([t]) => t === nextTier)![1];

  const volProgress  = clamp01((info.volume - curVolMin) / (nextVolMin - curVolMin));
  const qualProgress = clamp01((info.goodRatio - curQualMin) / (nextQualMin - curQualMin));

  return { muscle, tier: info.tier, progress: Math.min(volProgress, qualProgress), atTop: false };
}

function tileProgress(info: MuscleTierInfo): number {
  const idx = tierIndex(info.tier);
  if (idx === TIER_ORDER.length - 1) return 1;
  const nextTier    = TIER_ORDER[idx + 1];
  const curVolMin   = VOLUME_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextVolMin  = VOLUME_THRESHOLDS.find(([t]) => t === nextTier)![1];
  const curQualMin  = QUALITY_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextQualMin = QUALITY_THRESHOLDS.find(([t]) => t === nextTier)![1];
  const volProgress  = clamp01((info.volume - curVolMin) / (nextVolMin - curVolMin));
  const qualProgress = clamp01((info.goodRatio - curQualMin) / (nextQualMin - curQualMin));
  return Math.min(volProgress, qualProgress);
}

// ─── Grid tile ──────────────────────────────────────────────────────────────

function MuscleTile({
  muscle, info, index, scale,
}: {
  muscle: Muscle; info?: MuscleTierInfo; index: number; scale: number;
}) {
  const meta = info ? TIER_META[info.tier] : null;
  const progress = info ? tileProgress(info) : 0;
  const thumbSize = Math.round(70 * scale);

  return (
    <FadeInView delay={index * 45} style={[mh.tile, { minHeight: Math.round(172 * scale) }]}>
      {/* Tier-tinted card background — hi→lo, the same 2-stop recipe (and
          same opacity, 0x70/0x30) as the hero card's own background, not a
          hi-fading-to-transparent wash. That fade let the white glass card
          underneath show through everywhere except one corner, so a
          trained tile read as basically white with a faint tint instead of
          a bronze/gold/etc. card — this keeps tier color visible across
          the whole tile while staying well under full opacity. */}
      <LinearGradient
        colors={meta ? [`${meta.hi}70`, `${meta.lo}30`] : ['rgba(200,206,216,0.28)', 'rgba(200,206,216,0.10)']}
        start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <MuscleIcon muscle={muscle} tier={info?.tier} size={thumbSize} />
      <Text style={[mh.tileName, { fontSize: Math.round(13 * scale) }]}>{MUSCLE_LABELS[muscle]}</Text>
      {info && meta ? (
        <View style={mh.tileTierRow}>
          <TierEmblem tier={info.tier} size={Math.round(32 * scale)} />
          <Text style={[mh.tileTierTxt, { color: meta.ink, fontSize: Math.round(11.5 * scale) }]}>{meta.label}</Text>
        </View>
      ) : (
        <Text style={[mh.tileUntrained, { fontSize: Math.round(11.5 * scale) }]}>Untrained</Text>
      )}
      <View style={mh.tileBarTrack}>
        <View style={[mh.tileBarFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: meta ? meta.lo : '#D5D9E0' }]} />
      </View>
    </FadeInView>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function MuscleTierMap({
  tiers,
  scale = 1,
  emptyMessage = 'Log a session to start earning muscle ranks.',
}: {
  tiers:         MuscleTiers;
  scale?:        number;
  emptyMessage?: string;
}) {
  const isEmpty = Object.keys(tiers).length === 0;
  const overall = useMemo(() => computeOverallStanding(tiers), [tiers]);

  if (isEmpty) {
    return (
      <View style={mh.emptyState}>
        <Text style={mh.emptyTxt}>{emptyMessage}</Text>
      </View>
    );
  }

  const heroMeta    = overall ? TIER_META[overall.tier] : null;
  const heroRadius  = Math.round(32 * scale);
  const ringSize    = Math.round(172 * scale);
  const ringStroke  = Math.round(14 * scale);
  const emblemSize  = Math.round(100 * scale);
  const emblemWrap  = Math.round(130 * scale);
  const nextLabel = overall && !overall.atTop ? TIER_META[TIER_ORDER[tierIndex(overall.tier) + 1]].label : null;
  const pct = overall ? Math.round(overall.progress * 100) : 0;

  return (
    <View style={{ gap: Math.round(14 * scale) }}>
      {overall && heroMeta && (
        <FadeInView>
          {/* Shadow lives on this OUTER, unclipped wrapper — putting shadow
              and overflow:hidden on the same view silently eats the shadow
              on iOS (same fix already proven in app/recap.tsx's GlassSurface). */}
          <View style={[mh.heroShadowWrap, { borderRadius: heroRadius }]}>
            <View style={[mh.hero, { borderRadius: heroRadius, paddingVertical: Math.round(Sp.xl * scale), paddingHorizontal: Math.round(Sp.lg * scale) }]}>
              {/* Glass recipe verbatim from app/recap.tsx's GlassSurface: blur
                  → diagonal tint wash → top sheen → hairline border. */}
              <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={[`${heroMeta.hi}70`, `${heroMeta.lo}30`]}
                start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <LinearGradient
                colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
                start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.6 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View
                style={[StyleSheet.absoluteFill, { borderRadius: heroRadius, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' }]}
                pointerEvents="none"
              />

              <Text style={[mh.heroKicker, { fontSize: Math.round(11 * scale) }]}>CURRENT RANK</Text>

              <RankRing progress={overall.progress} meta={heroMeta} size={ringSize} strokeWidth={ringStroke}>
                <View style={[mh.heroEmblemWrap, { width: emblemWrap, height: emblemWrap, borderRadius: emblemWrap / 2 }]}>
                  <TierEmblem tier={overall.tier} size={emblemSize} />
                </View>
              </RankRing>

              <Text style={[mh.heroTierName, { color: heroMeta.ink, fontSize: Math.round(34 * scale) }]}>{heroMeta.label}</Text>

              {overall.atTop ? (
                <Text style={[mh.heroMeterLabel, { fontSize: Math.round(12.5 * scale) }]}>Maintaining top standing</Text>
              ) : (
                <Text style={[mh.heroMeterLabel, { fontSize: Math.round(12.5 * scale) }]}>
                  {pct}% to <Text style={[mh.heroNextName, { color: heroMeta.ink, fontSize: Math.round(12.5 * scale) }]}>{nextLabel}</Text>
                </Text>
              )}
            </View>
          </View>
        </FadeInView>
      )}

      <FadeInView delay={80}>
        <BodyMap tiers={tiers} scale={scale} />
      </FadeInView>

      <View style={{ gap: Math.round(8 * scale) }}>
        <View style={mh.sectionHeaderRow}>
          <Text style={[mh.sectionHeader, { fontSize: Math.round(11 * scale) }]}>BY MUSCLE GROUP</Text>
          <Text style={[mh.sectionSub, { fontSize: Math.round(11 * scale) }]}>All-time volume × form</Text>
        </View>
        <View style={[mh.grid, { gap: Math.round(10 * scale) }]}>
          {MUSCLE_DISPLAY_ORDER.map((m, i) => (
            <MuscleTile key={m} muscle={m} info={tiers[m]} index={i} scale={scale} />
          ))}
        </View>
      </View>
    </View>
  );
}

const mh = StyleSheet.create({
  emptyState: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
  emptyTxt:   { fontSize: 13, color: Col.textSub, textAlign: 'center', lineHeight: 19 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  sectionHeader:    { fontWeight: W.bold, letterSpacing: 0.8, color: Col.textSub },
  sectionSub:       { fontWeight: W.medium, color: Col.textSub },

  // flexWrap as a safety net — 7 fixed-size emblems at the bigger size can
  // get tight on narrower phones; wrapping to two rows beats spilling past
  // the card edge. justifyContent:'center' (not 'space-between') so a
  // wrapped second row centers instead of stretching oddly.
  tierLegendRow:   { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 8, paddingHorizontal: 2 },
  tierLegendItem:  { alignItems: 'center', gap: 2 },
  tierLegendLabel: { fontWeight: W.semi, color: Col.textSub, textTransform: 'uppercase', letterSpacing: 0.3 },

  bodyMapShadowWrap: {
    shadowColor: '#1C2C6E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 3,
  },
  bodyMapCard: {
    overflow: 'hidden',
  },
  bodyMapRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  bodyMapCol: { alignItems: 'center', gap: 6 },
  bodyMapLabel: { fontWeight: W.bold, letterSpacing: 0.6, color: Col.textSub },

  // Shadow lives here (outer, unclipped) — `hero` below has overflow:hidden
  // for the rounded-corner blur/gradient clip, and shadow + overflow:hidden
  // on the same view silently eats the shadow on iOS.
  heroShadowWrap: {
    shadowColor: '#1C2C6E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 6,
  },
  hero: {
    overflow:  'hidden',
    alignItems: 'center',
  },
  heroKicker: { fontWeight: W.bold, letterSpacing: 1.6, color: Col.textSub, marginBottom: 18 },
  heroEmblemWrap: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
  },
  // Bricolage Grotesque, per DESIGN.md — this is the one "hero CTA text"
  // moment in this card (Sz.h2/24px and up), so it gets the display font,
  // not the system font every other label in this file correctly uses.
  // Critical: never pair fontWeight with a FONT.display* family — the font
  // FILE is the weight; setting fontWeight alongside it is a no-op at best.
  heroTierName:   { fontFamily: FONT.displayBlack, letterSpacing: -0.8, marginTop: 18, textAlign: 'center' },
  heroMeterLabel: { color: Col.textSub, fontWeight: W.semi, marginTop: 6, textAlign: 'center' },
  heroNextName:   { fontWeight: W.bold },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
  },
  tile: {
    flexBasis: '31.5%',
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.05)',
  },
  tileName: { fontWeight: W.bold, color: Col.text, textAlign: 'center' },
  tileTierRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileTierTxt: { fontWeight: W.bold },
  tileUntrained: { color: Col.textSub, fontWeight: W.medium },
  tileBarTrack: {
    width: '80%', height: 4, borderRadius: 2,
    backgroundColor: 'rgba(17,24,39,0.08)', overflow: 'hidden', marginTop: 2,
  },
  tileBarFill: { height: '100%', borderRadius: 2 },
});
