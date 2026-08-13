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
 * credited at the bottom of app/muscle-ranks.tsx) wired in via
 * MUSCLE_ICON_SOURCES below. The remaining 3 (Forearms/LowerBack/Calves, no
 * art yet) fall back to the real-extracted-path SVG crop this file used
 * before (muscleShapePaths.ts) — see MUSCLE_ICON_FALLBACK's comment. Each
 * PNG's own highlighted region is recolored per-tier via an SVG hueRotate
 * filter (see TIER_HUE_ROTATE) rather than always showing the source art's
 * fixed red.
 */

import React, { useMemo, useRef, useEffect, useId } from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Path, Circle, Ellipse, Line, G } from 'react-native-svg';
import { Muscle } from '../constants/exercises';
import type { Slug } from 'react-native-body-highlighter';
import type { MuscleTiers, MuscleTierInfo, Tier } from '../lib/sessionLog';
import { TIER_ORDER, tierIndex, VOLUME_THRESHOLDS, QUALITY_THRESHOLDS } from '../lib/sessionLog';
import { FRONT_MUSCLE_PATHS, BACK_MUSCLE_PATHS } from './muscleShapePaths';
import { Col, FONT, W, Sp } from '../constants/theme';

// ─── Tier palette ───────────────────────────────────────────────────────────
// Each tier is a real 3-stop material gradient (highlight -> mid -> ink),
// not a flat color — used by both the emblem and the SVG-fallback icon fill.
export const TIER_META: Record<Tier, { hi: string; lo: string; ink: string; label: string }> = {
  bronze:   { hi: '#F0C9A0', lo: '#B97A42', ink: '#7A4A22', label: 'Bronze' },
  silver:   { hi: '#F2F5F8', lo: '#AEB8C4', ink: '#69727E', label: 'Silver' },
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

// ─── Tier emblems — one distinct hand-drawn mark per tier ──────────────────

function renderTierMark(tier: Tier, fill: string, meta: { hi: string; lo: string; ink: string }) {
  switch (tier) {
    case 'bronze':
      return (
        <G>
          <Circle cx={16} cy={16} r={12} fill={fill} stroke={meta.ink} strokeWidth={1.2} />
          <Path d="M10,18 L16,12 L22,18" fill="none" stroke={meta.hi} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <Ellipse cx={12} cy={11} rx={5.5} ry={3} fill="rgba(255,255,255,0.38)" />
        </G>
      );
    case 'silver':
      return (
        <G>
          <Path d="M16,4 L26,9 L26,18 Q26,25 16,29 Q6,25 6,18 L6,9 Z" fill={fill} stroke={meta.ink} strokeWidth={1.2} />
          <Line x1={16} y1={5} x2={16} y2={28} stroke={meta.hi} strokeWidth={1} opacity={0.45} />
          <Ellipse cx={12.5} cy={10.5} rx={4.5} ry={2.4} fill="rgba(255,255,255,0.36)" />
        </G>
      );
    case 'gold':
      return (
        <G>
          <Path d="M9,10 L13,10 L10,2 Z" fill={meta.lo} />
          <Path d="M23,10 L19,10 L22,2 Z" fill={meta.lo} />
          <Circle cx={16} cy={19} r={10} fill={fill} stroke={meta.ink} strokeWidth={1.2} />
          <Path d="M16,13 L19.5,21 L12.5,21 Z" fill={meta.hi} opacity={0.55} />
          <Ellipse cx={12.5} cy={15.5} rx={4.5} ry={2.6} fill="rgba(255,255,255,0.35)" />
        </G>
      );
    case 'platinum': {
      const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
        const rad = (deg * Math.PI) / 180;
        return {
          x1: 16 + 10.5 * Math.cos(rad), y1: 16 + 10.5 * Math.sin(rad),
          x2: 16 + 14   * Math.cos(rad), y2: 16 + 14   * Math.sin(rad),
        };
      });
      return (
        <G>
          <Circle cx={16} cy={16} r={8.5} fill="none" stroke={fill} strokeWidth={3} />
          {rays.map((r, i) => (
            <Line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={meta.lo} strokeWidth={1.6} strokeLinecap="round" />
          ))}
          <Circle cx={16} cy={16} r={4} fill={meta.hi} />
        </G>
      );
    }
    case 'diamond':
      return (
        <G>
          <Path d="M8,12 L24,12 L18,6 L14,6 Z" fill={meta.hi} stroke={meta.ink} strokeWidth={0.6} />
          <Path d="M8,12 L24,12 L16,28 Z" fill={fill} stroke={meta.ink} strokeWidth={1} />
          <Line x1={14} y1={6} x2={16} y2={12} stroke={meta.ink} strokeWidth={0.5} opacity={0.5} />
          <Line x1={18} y1={6} x2={16} y2={12} stroke={meta.ink} strokeWidth={0.5} opacity={0.5} />
          <Line x1={16} y1={12} x2={16} y2={28} stroke={meta.ink} strokeWidth={0.5} opacity={0.4} />
          <Ellipse cx={13} cy={10} rx={2.6} ry={1.4} fill="rgba(255,255,255,0.5)" />
        </G>
      );
    case 'master':
      return (
        <G>
          <Path
            d="M16,3 L19.4,12.6 L29.5,12.6 L21.3,18.6 L24.4,28.5 L16,22.3 L7.6,28.5 L10.7,18.6 L2.5,12.6 L12.6,12.6 Z"
            fill={fill}
            stroke={meta.ink}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <Ellipse cx={13} cy={11} rx={3.2} ry={1.8} fill="rgba(255,255,255,0.4)" />
        </G>
      );
    case 'champion':
      return (
        <G>
          <Path d="M6,22 L26,22 L26,26 Q16,28.5 6,26 Z" fill={meta.lo} stroke={meta.ink} strokeWidth={0.8} />
          <Path d="M6,22 L6,13 L10.5,17.5 L16,9 L21.5,17.5 L26,13 L26,22 Z" fill={fill} stroke={meta.ink} strokeWidth={1} strokeLinejoin="round" />
          <Circle cx={6} cy={13} r={1.6} fill={meta.hi} />
          <Circle cx={16} cy={9} r={1.8} fill={meta.hi} />
          <Circle cx={26} cy={13} r={1.6} fill={meta.hi} />
        </G>
      );
  }
}

export function TierEmblem({ tier, size = 20 }: { tier: Tier; size?: number }) {
  const uid = useId();
  const gradId = `te-${uid}`;
  const meta = TIER_META[tier];
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={meta.hi} />
          <Stop offset="55%" stopColor={meta.lo} />
          <Stop offset="100%" stopColor={meta.ink} />
        </SvgLinearGradient>
      </Defs>
      {renderTierMark(tier, `url(#${gradId})`, meta)}
    </Svg>
  );
}

// ─── Muscle icons ───────────────────────────────────────────────────────────
//
// PNG SOURCES — real Flaticon icons (cube29 pack, see MUSCLE_ICON_ATTRIBUTION
// below). Each muscle has 7 PRE-BAKED variants, one per tier — generated by a
// one-off pixel-replace script (not checked in) that swapped the source
// art's flat highlight color (#FF004F, sampled directly from the PNG pixels)
// for each tier's real hex (bronze #CD7F32, silver #C0C0C0, gold #FFD700,
// platinum #E5E4E2, diamond #4FC3F7, master #9C27B0, champion #DC143C),
// leaving the navy/gray body silhouette AND the separate orange secondary-
// muscle accent (present in quads/hamstrings/biceps) untouched. This
// replaced an earlier SVG hueRotate-filter approach, which rotated the
// WHOLE image's hue uniformly — fine for champion (already reddish) but
// wrong for desaturated tiers like silver/platinum, which came out as
// vivid green/blue/purple instead of muted metal. Pixel-level pre-bake is
// exact and has no runtime cost. Still needed, no art yet: forearms, lower
// back, calves.
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
  // Only reachable once a real tier is known — untrained muscles have no
  // "tier" of pre-baked art to show, so they always take the SVG-fallback
  // path below (dim gray), same as muscles with no PNG coverage at all.
  const pngSource = tier ? MUSCLE_ICON_SOURCES[muscle]?.[tier] : undefined;
  const paths = useMemo(() => muscleFallbackPaths(muscle), [muscle]);

  if (pngSource) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={pngSource} style={{ width: size, height: size }} resizeMode="contain" />
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
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[bd.blob, { width: 440, height: 440, borderRadius: 220, top: -170, left: -150, backgroundColor: meta.lo, opacity: 0.42 }, d1]} />
      <Animated.View style={[bd.blob, { width: 340, height: 340, borderRadius: 170, top: -90, right: -120, backgroundColor: meta.hi, opacity: 0.5 }, d2]} />
      <Animated.View style={[bd.blob, { width: 400, height: 400, borderRadius: 200, bottom: -160, left: -120, backgroundColor: meta.ink, opacity: 0.22 }, d3]} />
      <Animated.View style={[bd.blob, { width: 320, height: 320, borderRadius: 160, bottom: -90, right: -110, backgroundColor: meta.lo, opacity: 0.3 }, d4]} />
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
      <LinearGradient
        colors={[meta ? `${meta.hi}66` : 'rgba(200,206,216,0.28)', 'rgba(255,255,255,0)']}
        start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <MuscleIcon muscle={muscle} tier={info?.tier} size={thumbSize} />
      <Text style={[mh.tileName, { fontSize: Math.round(13 * scale) }]}>{MUSCLE_LABELS[muscle]}</Text>
      {info && meta ? (
        <View style={mh.tileTierRow}>
          <TierEmblem tier={info.tier} size={Math.round(14 * scale)} />
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

  const heroMeta   = overall ? TIER_META[overall.tier] : null;
  const badgeSize  = Math.round(56 * scale);
  const heroRadius = Math.round(28 * scale);
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
            <View style={[mh.hero, { borderRadius: heroRadius, padding: Math.round(Sp.lg * scale) }]}>
              <LinearGradient
                colors={['#FDFBF8', `${heroMeta.hi}66`, `${heroMeta.lo}3D`]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <View style={mh.heroTopRow}>
                <LinearGradient
                  colors={[heroMeta.hi, heroMeta.lo]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={[mh.heroBadge, { width: badgeSize, height: badgeSize, borderRadius: Math.round(badgeSize * 0.32) }]}
                >
                  <SymbolView
                    name="chevron.up"
                    size={Math.round(badgeSize * 0.42)}
                    tintColor="#FFFFFF"
                    type="monochrome"
                    style={{ width: Math.round(badgeSize * 0.42), height: Math.round(badgeSize * 0.42) }}
                  />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[mh.heroKicker, { fontSize: Math.round(10.5 * scale) }]}>OVERALL STANDING</Text>
                  <Text style={[mh.heroTierName, { color: heroMeta.ink, fontSize: Math.round(26 * scale) }]}>{heroMeta.label}</Text>
                </View>
              </View>

              <View style={[mh.heroMeterTrack, { marginTop: Math.round(16 * scale), height: Math.round(8 * scale), borderRadius: Math.round(4 * scale) }]}>
                <LinearGradient
                  colors={[heroMeta.hi, heroMeta.lo]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ width: `${pct}%`, height: '100%', borderRadius: Math.round(4 * scale) }}
                />
              </View>
              {overall.atTop ? (
                <Text style={[mh.heroMeterLabel, { fontSize: Math.round(11.5 * scale), marginTop: 8 }]}>Maintaining top standing</Text>
              ) : (
                <View style={mh.heroMeterRow}>
                  <Text style={[mh.heroMeterLabel, { fontSize: Math.round(11.5 * scale) }]}>{pct}% to next tier</Text>
                  <Text style={[mh.heroNextName, { color: heroMeta.ink, fontSize: Math.round(12 * scale) }]}>{nextLabel}</Text>
                </View>
              )}
            </View>
          </View>
        </FadeInView>
      )}

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
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  heroBadge: {
    alignItems: 'center', justifyContent: 'center',
  },
  heroKicker: { fontWeight: W.bold, letterSpacing: 1.2, color: Col.textSub },
  // Bricolage Grotesque, per DESIGN.md — this is the one "hero CTA text"
  // moment in this card (Sz.h2/24px and up), so it gets the display font,
  // not the system font every other label in this file correctly uses.
  // Critical: never pair fontWeight with a FONT.display* family — the font
  // FILE is the weight; setting fontWeight alongside it is a no-op at best.
  heroTierName: { fontFamily: FONT.displayBlack, letterSpacing: -0.6, marginTop: 2 },
  heroMeterTrack: {
    width: '100%',
    backgroundColor: 'rgba(17,24,39,0.07)',
    overflow: 'hidden',
  },
  heroMeterRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
  },
  heroMeterLabel: { color: Col.textSub, fontWeight: W.semi },
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
