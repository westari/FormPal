/**
 * components/MuscleTierMap.tsx
 *
 * A muscle "rank card": each muscle group gets a game-style tier
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
 * Each muscle tile also gets its own MuscleShapeIcon: the REAL extracted
 * muscle-region path(s) for that group (same data muscleShapePaths.ts
 * supplies, extracted from react-native-body-highlighter's own bundled SVG
 * data — not a hand-drawn approximation), rendered solo and cropped tight
 * via the SVG viewBox so it reads as a zoomed-in shot of just that body
 * part, colored in the tier's gradient. One representative side (front,
 * except Back which only exists on the back view) per group — combining
 * front+back into one icon would force the crop back out to cover both
 * halves of the body diagram at once, defeating the "zoomed in" point.
 */

import React, { useMemo, useRef, useEffect, useId } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Path, Circle, Ellipse, Line, G } from 'react-native-svg';
import { MuscleGroup } from '../constants/exercises';
import type { Slug } from 'react-native-body-highlighter';
import type { MuscleTiers, MuscleTierInfo, Tier } from '../lib/sessionLog';
import { TIER_ORDER, tierIndex, VOLUME_THRESHOLDS, QUALITY_THRESHOLDS } from '../lib/sessionLog';
import { FRONT_MUSCLE_PATHS, BACK_MUSCLE_PATHS } from './muscleShapePaths';

const C = {
  text:    '#1A1A1C',
  textSub: '#8A8A8E',
};

// ─── Tier palette ───────────────────────────────────────────────────────────
// Each tier is a real 3-stop material gradient (highlight -> mid -> ink),
// not a flat color — used by both the emblem and the body-thumbnail fill.
export const TIER_META: Record<Tier, { hi: string; lo: string; ink: string; label: string }> = {
  bronze:   { hi: '#F0C9A0', lo: '#B97A42', ink: '#7A4A22', label: 'Bronze' },
  silver:   { hi: '#F2F5F8', lo: '#AEB8C4', ink: '#69727E', label: 'Silver' },
  gold:     { hi: '#FFEBB0', lo: '#E3B94D', ink: '#96701A', label: 'Gold' },
  platinum: { hi: '#E2FBF3', lo: '#7FE0C9', ink: '#1C9C82', label: 'Platinum' },
  diamond:  { hi: '#E3F7FF', lo: '#6FD3FF', ink: '#1789B8', label: 'Diamond' },
  master:   { hi: '#F1E4FF', lo: '#B98CFF', ink: '#6F3FC2', label: 'Master' },
  champion: { hi: '#FFF7DE', lo: '#FFD36E', ink: '#B9820A', label: 'Champion' },
};

export const GROUP_LABELS: Record<MuscleGroup, string> = {
  [MuscleGroup.Chest]:     'Chest',
  [MuscleGroup.Back]:      'Back',
  [MuscleGroup.Shoulders]: 'Shoulders',
  [MuscleGroup.Arms]:      'Arms',
  [MuscleGroup.Core]:      'Core',
  [MuscleGroup.Legs]:      'Legs',
};
// Display order — roughly top-to-bottom on the body, reads more naturally
// than enum declaration order (which puts Legs first).
export const GROUP_DISPLAY_ORDER: MuscleGroup[] = [
  MuscleGroup.Shoulders, MuscleGroup.Chest, MuscleGroup.Back,
  MuscleGroup.Arms, MuscleGroup.Core, MuscleGroup.Legs,
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

// ─── Muscle shape icon — the REAL extracted muscle path(s), cropped tight ──
// One representative side per group (front, except Back which only exists
// on the back-view data) — picked so each icon stays in a single coordinate
// space and can crop genuinely tight around it. Crop viewBoxes below are
// generous hand-measured boxes around each group's real path data in
// muscleShapePaths.ts (front canvas 0-724, back canvas 724-1448, both
// 0-1448 tall) — sized with real margin, not pixel-exact, since most of
// these paths are built from chained RELATIVE svg curve commands (no cheap
// programmatic bbox available without a native measurement pass); "meet"
// aspect-ratio below means an over-generous box just shows more padding
// around the shape, never crops it off, so the margin errs wide on purpose.
const GROUP_ICON_SLUGS: Record<MuscleGroup, { side: 'front' | 'back'; slugs: Slug[] }> = {
  [MuscleGroup.Chest]:     { side: 'front', slugs: ['chest'] },
  [MuscleGroup.Shoulders]: { side: 'front', slugs: ['deltoids'] },
  [MuscleGroup.Back]:      { side: 'back',  slugs: ['trapezius', 'upper-back'] },
  [MuscleGroup.Arms]:      { side: 'front', slugs: ['biceps', 'forearm'] },
  [MuscleGroup.Core]:      { side: 'front', slugs: ['abs', 'obliques'] },
  [MuscleGroup.Legs]:      { side: 'front', slugs: ['quadriceps', 'adductors'] },
};

const GROUP_ICON_CROP: Record<MuscleGroup, string> = {
  [MuscleGroup.Chest]:     '180 280 380 280',
  [MuscleGroup.Shoulders]: '120 220 500 260',
  [MuscleGroup.Back]:      '900 250 360 430',
  [MuscleGroup.Arms]:      '60 330 620 430',
  [MuscleGroup.Core]:      '190 360 350 420',
  [MuscleGroup.Legs]:      '180 590 370 420',
};

function groupIconPaths(group: MuscleGroup): string[] {
  const { side, slugs } = GROUP_ICON_SLUGS[group];
  const table = side === 'front' ? FRONT_MUSCLE_PATHS : BACK_MUSCLE_PATHS;
  const out: string[] = [];
  for (const slug of slugs) out.push(...(table[slug] ?? []));
  return out;
}

function MuscleShapeIcon({ group, tier, size }: { group: MuscleGroup; tier?: Tier; size: number }) {
  const uid = useId();
  const gradId = `mi-${uid}`;
  const meta = tier ? TIER_META[tier] : null;
  const paths = useMemo(() => groupIconPaths(group), [group]);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: meta ? `${meta.hi}2E` : '#EEF0F3', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={GROUP_ICON_CROP[group]} preserveAspectRatio="xMidYMid meet">
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

// Slow ambient pulse behind the hero emblem — subtle, not the CSS-blob-drift
// of the original web reference (that's web-only technique with no clean RN
// equivalent), but reads as "alive" the same way.
function usePulse() {
  const v = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1,   duration: 1700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.7, duration: 1700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return v;
}

// ─── Overall standing — the weakest-link muscle sets the headline tier, ───
// consistent with the per-muscle mechanic itself (volume tier vs quality
// tier, take the lower). Progress toward the next tier is the min of volume
// progress and quality progress — whichever stat is further behind is what's
// actually holding that muscle back.
interface OverallStanding {
  group:    MuscleGroup;
  tier:     Tier;
  progress: number;
  atTop:    boolean;
}

function computeOverallStanding(tiers: MuscleTiers): OverallStanding | null {
  const entries = Object.entries(tiers) as [MuscleGroup, MuscleTierInfo][];
  if (entries.length === 0) return null;

  let weakest = entries[0];
  for (const e of entries) {
    if (tierIndex(e[1].tier) < tierIndex(weakest[1].tier)) weakest = e;
  }
  const [group, info] = weakest;
  const idx = tierIndex(info.tier);
  if (idx === TIER_ORDER.length - 1) {
    return { group, tier: info.tier, progress: 1, atTop: true };
  }

  const nextTier    = TIER_ORDER[idx + 1];
  const curVolMin   = VOLUME_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextVolMin  = VOLUME_THRESHOLDS.find(([t]) => t === nextTier)![1];
  const curQualMin  = QUALITY_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextQualMin = QUALITY_THRESHOLDS.find(([t]) => t === nextTier)![1];

  const volProgress  = clamp01((info.volume - curVolMin) / (nextVolMin - curVolMin));
  const qualProgress = clamp01((info.goodRatio - curQualMin) / (nextQualMin - curQualMin));

  return { group, tier: info.tier, progress: Math.min(volProgress, qualProgress), atTop: false };
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
  group, info, index, scale,
}: {
  group: MuscleGroup; info?: MuscleTierInfo; index: number; scale: number;
}) {
  const meta = info ? TIER_META[info.tier] : null;
  const progress = info ? tileProgress(info) : 0;
  const thumbSize = Math.round(56 * scale);

  return (
    <FadeInView delay={index * 55} style={[mh.tile, { minHeight: Math.round(150 * scale) }]}>
      <LinearGradient
        colors={[meta ? `${meta.hi}66` : 'rgba(200,206,216,0.28)', 'rgba(255,255,255,0)']}
        start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <MuscleShapeIcon group={group} tier={info?.tier} size={thumbSize} />
      <Text style={[mh.tileName, { fontSize: Math.round(13.5 * scale) }]}>{GROUP_LABELS[group]}</Text>
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
  const pulse   = usePulse();

  if (isEmpty) {
    return (
      <View style={mh.emptyState}>
        <Text style={mh.emptyTxt}>{emptyMessage}</Text>
      </View>
    );
  }

  const heroMeta      = overall ? TIER_META[overall.tier] : null;
  const heroEmblemSize = Math.round(56 * scale);
  const nextLabel = overall && !overall.atTop ? TIER_META[TIER_ORDER[tierIndex(overall.tier) + 1]].label : null;

  return (
    <View style={{ gap: Math.round(14 * scale) }}>
      {overall && heroMeta && (
        <FadeInView>
          <View style={[mh.hero, { padding: Math.round(18 * scale) }]}>
            <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={[`${heroMeta.hi}77`, 'rgba(255,255,255,0.35)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Animated.View
              style={[
                mh.heroGlow,
                { backgroundColor: heroMeta.lo, opacity: pulse, transform: [{ scale: pulse.interpolate({ inputRange: [0.7, 1], outputRange: [0.92, 1.05] }) }] },
              ]}
              pointerEvents="none"
            />
            <View style={[mh.heroEmblemWrap, { width: heroEmblemSize + 12, height: heroEmblemSize + 12, borderRadius: (heroEmblemSize + 12) / 2 }]}>
              <TierEmblem tier={overall.tier} size={heroEmblemSize} />
            </View>
            <Text style={[mh.heroKicker, { fontSize: Math.round(10.5 * scale) }]}>OVERALL STANDING</Text>
            <Text style={[mh.heroTierName, { color: heroMeta.ink, fontSize: Math.round(21 * scale) }]}>{heroMeta.label}</Text>
            <View style={mh.heroBarTrack}>
              <View style={[mh.heroBarFill, { width: `${Math.round(overall.progress * 100)}%`, backgroundColor: heroMeta.lo }]} />
            </View>
            <Text style={[mh.heroBarLabel, { fontSize: Math.round(11.5 * scale) }]}>
              {overall.atTop ? 'Maintaining top standing' : `${Math.round(overall.progress * 100)}% to ${nextLabel}`}
            </Text>
          </View>
        </FadeInView>
      )}

      <View style={[mh.grid, { gap: Math.round(10 * scale) }]}>
        {GROUP_DISPLAY_ORDER.map((mg, i) => (
          <MuscleTile key={mg} group={mg} info={tiers[mg]} index={i} scale={scale} />
        ))}
      </View>
    </View>
  );
}

const mh = StyleSheet.create({
  emptyState: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
  emptyTxt:   { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 19 },

  hero: {
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    gap: 4,
  },
  heroGlow: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    top: -30,
  },
  heroEmblemWrap: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  heroKicker:   { fontWeight: '700', letterSpacing: 1.2, color: C.textSub },
  heroTierName: { fontWeight: '800', letterSpacing: -0.3, marginBottom: 8 },
  heroBarTrack: {
    width: '78%', height: 6, borderRadius: 3,
    backgroundColor: 'rgba(17,24,39,0.08)', overflow: 'hidden',
  },
  heroBarFill: { height: '100%', borderRadius: 3 },
  heroBarLabel: { color: C.textSub, fontWeight: '600', marginTop: 7 },

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
  tileName: { fontWeight: '700', color: C.text },
  tileTierRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileTierTxt: { fontWeight: '700' },
  tileUntrained: { color: C.textSub, fontWeight: '500' },
  tileBarTrack: {
    width: '80%', height: 4, borderRadius: 2,
    backgroundColor: 'rgba(17,24,39,0.08)', overflow: 'hidden', marginTop: 2,
  },
  tileBarFill: { height: '100%', borderRadius: 2 },
});
