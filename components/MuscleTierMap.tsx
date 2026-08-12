/**
 * components/MuscleTierMap.tsx
 *
 * REPLACES components/MuscleHeatmap.tsx and the Skia thermal-heatmap attempt
 * entirely (both retired — see git history if the continuous-heatmap idea is
 * ever revisited). A muscle "rank card": each muscle group gets a game-style
 * tier (Bronze -> Silver -> Gold -> Platinum -> Diamond) computed from BOTH
 * training volume AND form quality (see computeMuscleTiers in lib/sessionLog.ts)
 * — the tier calculation, not this file, is where "trained hard WITH good
 * form" actually happens; this file just renders the result.
 *
 * Reuses the same proven-safe rendering approach as the old MuscleHeatmap:
 * react-native-body-highlighter's neutral <Body> outline underneath, plus a
 * second <Svg> overlay drawing each muscle's REAL extracted path (from
 * muscleShapePaths.ts) twice — a blurred glow pass, then a crisp core pass —
 * colored by tier instead of a continuous thermal score. No Skia, no
 * masking/layering primitives, same plain react-native-svg used everywhere
 * else in this app.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, Filter, FeGaussianBlur, Path } from 'react-native-svg';
import Body from 'react-native-body-highlighter';
import type { Slug } from 'react-native-body-highlighter';
import { MuscleGroup } from '../constants/exercises';
import type { MuscleTiers, Tier } from '../lib/sessionLog';
import { TIER_ORDER } from '../lib/sessionLog';
import { FRONT_MUSCLE_PATHS, BACK_MUSCLE_PATHS } from './muscleShapePaths';

const C = {
  text:    '#0b1020',
  textSub: '#9aa0ad',
};

const GLOW_BLUR_ID = 'muscleTierGlowBlur';

// ─── Tier colors ────────────────────────────────────────────────────────────
// Standard game-rank progression, warm/neutral metals climbing to cool bright
// gem tones — deliberately reads as "climbing," not just 5 arbitrary colors.
export const TIER_COLORS: Record<Tier, string> = {
  bronze:   '#CD7F32',
  silver:   '#B8BEC7',
  gold:     '#FFCA45',
  platinum: '#7FE8D2',
  diamond:  '#4FD1FF',
};
export const TIER_LABELS: Record<Tier, string> = {
  bronze:   'Bronze',
  silver:   'Silver',
  gold:     'Gold',
  platinum: 'Platinum',
  diamond:  'Diamond',
};
// Opacity climbs with tier too — reinforces "more solid/vivid = higher rank"
// on top of the color change alone.
const TIER_OPACITY: Record<Tier, number> = {
  bronze:   0.65,
  silver:   0.72,
  gold:     0.80,
  platinum: 0.88,
  diamond:  0.96,
};

const GROUP_TO_FRONT_SLUGS: Partial<Record<MuscleGroup, Slug[]>> = {
  [MuscleGroup.Chest]:     ['chest'],
  [MuscleGroup.Shoulders]: ['deltoids'],
  [MuscleGroup.Arms]:      ['biceps', 'forearm'],
  [MuscleGroup.Core]:      ['abs', 'obliques'],
  [MuscleGroup.Legs]:      ['quadriceps', 'adductors'],
};
const GROUP_TO_BACK_SLUGS: Partial<Record<MuscleGroup, Slug[]>> = {
  [MuscleGroup.Back]:      ['trapezius', 'upper-back'],
  [MuscleGroup.Shoulders]: ['deltoids'],
  [MuscleGroup.Arms]:      ['triceps'],
  [MuscleGroup.Core]:      ['lower-back'],
  [MuscleGroup.Legs]:      ['hamstring', 'gluteal', 'calves'],
};

const GROUP_LABELS: Record<MuscleGroup, string> = {
  [MuscleGroup.Chest]:     'Chest',
  [MuscleGroup.Back]:      'Back',
  [MuscleGroup.Shoulders]: 'Shoulders',
  [MuscleGroup.Arms]:      'Arms',
  [MuscleGroup.Core]:      'Core',
  [MuscleGroup.Legs]:      'Legs',
};
// Display order — roughly top-to-bottom on the body, reads more naturally
// than enum declaration order (which puts Legs first).
const GROUP_DISPLAY_ORDER: MuscleGroup[] = [
  MuscleGroup.Shoulders, MuscleGroup.Chest, MuscleGroup.Back,
  MuscleGroup.Arms, MuscleGroup.Core, MuscleGroup.Legs,
];

interface TierGlowSpec {
  key:     string;
  paths:   string[];
  color:   string;
  opacity: number;
}

function buildTierGlowSpecs(tiers: MuscleTiers, side: 'front' | 'back'): TierGlowSpec[] {
  const mapping   = side === 'front' ? GROUP_TO_FRONT_SLUGS : GROUP_TO_BACK_SLUGS;
  const pathTable = side === 'front' ? FRONT_MUSCLE_PATHS   : BACK_MUSCLE_PATHS;
  const out: TierGlowSpec[] = [];
  for (const [mg, slugs] of Object.entries(mapping) as [MuscleGroup, Slug[]][]) {
    const info = tiers[mg];
    if (!info) continue; // untrained — no fabricated tier
    for (const slug of slugs) {
      const paths = pathTable[slug];
      if (!paths || paths.length === 0) continue;
      out.push({
        key:     `${side}-${slug}`,
        paths,
        color:   TIER_COLORS[info.tier],
        opacity: TIER_OPACITY[info.tier],
      });
    }
  }
  return out;
}

// Same blur-bleed + crisp-core two-pass technique as the old MuscleHeatmap —
// see that file's git history for why this is the proven-safe approach.
function GlowLayer({ specs, side, scale }: { specs: TierGlowSpec[]; side: 'front' | 'back'; scale: number }) {
  if (specs.length === 0) return null;
  const viewBox = side === 'front' ? '0 0 724 1448' : '724 0 724 1448';
  return (
    <Svg width={200 * scale} height={400 * scale} viewBox={viewBox} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Filter id={GLOW_BLUR_ID} x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation={7} />
        </Filter>
      </Defs>
      {specs.map(spec => spec.paths.map((d, i) => (
        <Path
          key={`${spec.key}-glow-${i}`}
          d={d}
          fill={spec.color}
          fillOpacity={spec.opacity * 0.65}
          stroke={spec.color}
          strokeOpacity={spec.opacity * 0.5}
          strokeWidth={10}
          filter={`url(#${GLOW_BLUR_ID})`}
        />
      )))}
      {specs.map(spec => spec.paths.map((d, i) => (
        <Path key={`${spec.key}-core-${i}`} d={d} fill={spec.color} fillOpacity={spec.opacity} />
      )))}
    </Svg>
  );
}

export function MuscleTierMap({
  tiers,
  scale = 0.72,
  showLegend = true,
  showList = true,
  showLabels = true,
  emptyMessage = 'Log a session to start earning muscle ranks.',
}: {
  tiers:         MuscleTiers;
  scale?:        number;
  showLegend?:   boolean;
  showList?:     boolean;
  showLabels?:   boolean;
  emptyMessage?: string;
}) {
  const isEmpty = Object.keys(tiers).length === 0;

  const frontGlow = useMemo(() => buildTierGlowSpecs(tiers, 'front'), [tiers]);
  const backGlow  = useMemo(() => buildTierGlowSpecs(tiers, 'back'),  [tiers]);

  return (
    <View style={{ gap: 14 }}>
      {showLegend && !isEmpty && (
        <View style={mh.legendRow}>
          {TIER_ORDER.map(t => (
            <View key={t} style={mh.legendItem}>
              <View style={[mh.legendDot, { backgroundColor: TIER_COLORS[t] }]} />
              <Text style={mh.legendLbl}>{TIER_LABELS[t]}</Text>
            </View>
          ))}
        </View>
      )}

      {isEmpty ? (
        <View style={mh.emptyState}>
          <Text style={mh.emptyTxt}>{emptyMessage}</Text>
        </View>
      ) : (
        <View style={mh.diagramsRow}>
          <View style={mh.diagramCol}>
            <View>
              <Body data={[]} side="front" gender="male" scale={scale} defaultFill="rgba(200,210,228,0.35)" border="none" />
              <GlowLayer specs={frontGlow} side="front" scale={scale} />
            </View>
            {showLabels && <Text style={mh.diagramLabel}>Front</Text>}
          </View>

          <View style={mh.diagramDivider} />

          <View style={mh.diagramCol}>
            <View>
              <Body data={[]} side="back" gender="male" scale={scale} defaultFill="rgba(200,210,228,0.35)" border="none" />
              <GlowLayer specs={backGlow} side="back" scale={scale} />
            </View>
            {showLabels && <Text style={mh.diagramLabel}>Back</Text>}
          </View>
        </View>
      )}

      {showList && !isEmpty && (
        <View style={mh.list}>
          {GROUP_DISPLAY_ORDER.map(mg => {
            const info = tiers[mg];
            return (
              <View key={mg} style={mh.listRow}>
                <Text style={mh.listName}>{GROUP_LABELS[mg]}</Text>
                {info ? (
                  <View style={mh.listPill}>
                    <View style={[mh.listPillDot, { backgroundColor: TIER_COLORS[info.tier] }]} />
                    <Text style={[mh.listPillTxt, { color: TIER_COLORS[info.tier] }]}>{TIER_LABELS[info.tier]}</Text>
                  </View>
                ) : (
                  <Text style={mh.listUntrained}>Untrained</Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const mh = StyleSheet.create({
  legendRow:  { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 9, height: 9, borderRadius: 4.5 },
  legendLbl:  { fontSize: 11, fontWeight: '600', color: C.textSub },

  emptyState: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
  emptyTxt:   { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 19 },

  diagramsRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  diagramCol:     { flex: 1, alignItems: 'center', gap: 8 },
  diagramDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(17,24,39,0.07)', marginHorizontal: 18 },
  diagramLabel:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: C.textSub },

  list:    { gap: 2, marginTop: 2 },
  listRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  listName:      { fontSize: 13.5, fontWeight: '600', color: C.text },
  listPill:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listPillDot:   { width: 8, height: 8, borderRadius: 4 },
  listPillTxt:   { fontSize: 12.5, fontWeight: '700' },
  listUntrained: { fontSize: 12.5, fontWeight: '500', color: C.textSub },
});
