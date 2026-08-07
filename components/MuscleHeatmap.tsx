/**
 * components/MuscleHeatmap.tsx
 *
 * Shared muscle-coverage body diagram — used by the progress tab (cumulative
 * only) and the recap screen (cumulative + "worked this session" overlay).
 * Wraps react-native-body-highlighter for the base body outline; does not
 * re-implement the body art.
 *
 * HEAT LAYER, v2 — REBUILT after v1 read as "random color splashes" instead
 * of a real heatmap. Root cause of that: v1 drew free-floating <Ellipse>
 * blobs positioned at approximate muscle centroids, sized by rough bounding
 * boxes — nothing clipped them to the body's actual silhouette, so the color
 * could visibly bleed outside the real muscle outline, breaking the illusion
 * that the BODY itself was glowing.
 *
 * Fix: components/muscleShapePaths.ts contains the ACTUAL SVG path shapes for
 * each muscle region, extracted directly from react-native-body-highlighter's
 * own bundled path data (not approximated) via a one-off Node script reading
 * dist/assets/body{Front,Back}.js. Each active muscle is now drawn using that
 * EXACT path as the fill shape — a soft blurred copy underneath (real
 * FeGaussianBlur, react-native-svg supports it) for the glow bleed, a crisp
 * copy on top for a defined core — so the color is always bounded by the true
 * anatomy, and reads as "this muscle is glowing" rather than a floating blob.
 * react-native-body-highlighter's own <Body> now only renders the neutral
 * outline (empty data) — this component is the single source of muscle color.
 *
 * Gender note: the library only ships gender="male" | "female" body shapes —
 * there is no neutral silhouette option, and building a custom one would mean
 * not reusing this component. "male" is hardcoded below as an accepted
 * limitation, not a guess — see CLAUDE.md investigate-first rule.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Filter, FeGaussianBlur, Path } from 'react-native-svg';
import Body from 'react-native-body-highlighter';
import type { Slug } from 'react-native-body-highlighter';
import { MuscleGroup } from '../constants/exercises';
import type { MuscleScores } from '../lib/sessionLog';
import { FRONT_MUSCLE_PATHS, BACK_MUSCLE_PATHS } from './muscleShapePaths';

const C = {
  text:    '#0b1020',
  textSub: '#9aa0ad',
};

const BODY_COLORS  = ['#FFC24B', '#FF9F0A', '#FF7A2E'] as const; // legend chip only
const TODAY_COLOR  = '#0a84ff'; // distinct overlay color for "worked this session"
const GLOW_BLUR_ID = 'muscleGlowBlur'; // one shared filter, reused by every glow layer

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

// Thermal ramp: cool (barely worked) → amber (moderate, matches the app's
// existing accent) → hot red-orange (heavily worked). Interpolated
// continuously, not in 3 hard steps, so it reads as a real gradient of
// intensity rather than flat bands.
const THERMAL_STOPS: [number, [number, number, number]][] = [
  [0.0, [56, 132, 255]],   // cool blue
  [0.5, [255, 194, 75]],   // amber
  [1.0, [255, 59, 48]],    // hot red-orange
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function thermalColor(score: number): string {
  const s = Math.max(0, Math.min(1, score));
  let lo = THERMAL_STOPS[0], hi = THERMAL_STOPS[THERMAL_STOPS.length - 1];
  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    if (s >= THERMAL_STOPS[i][0] && s <= THERMAL_STOPS[i + 1][0]) {
      lo = THERMAL_STOPS[i]; hi = THERMAL_STOPS[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const t = (s - lo[0]) / span;
  const r = Math.round(lerp(lo[1][0], hi[1][0], t));
  const g = Math.round(lerp(lo[1][1], hi[1][1], t));
  const b = Math.round(lerp(lo[1][2], hi[1][2], t));
  return `rgb(${r},${g},${b})`;
}

interface MuscleGlowSpec {
  key:     string;
  paths:   string[];
  color:   string;
  opacity: number;
}

function buildGlowSpecs(
  overallScores: MuscleScores,
  highlightGroups: Set<MuscleGroup> | undefined,
  side: 'front' | 'back',
): MuscleGlowSpec[] {
  const mapping   = side === 'front' ? GROUP_TO_FRONT_SLUGS   : GROUP_TO_BACK_SLUGS;
  const pathTable = side === 'front' ? FRONT_MUSCLE_PATHS     : BACK_MUSCLE_PATHS;
  const out: MuscleGlowSpec[] = [];
  for (const [mg, slugs] of Object.entries(mapping) as [MuscleGroup, Slug[]][]) {
    const isHighlighted = highlightGroups?.has(mg) ?? false;
    const score = overallScores[mg] ?? 0;
    if (!isHighlighted && score <= 0.05) continue;
    for (const slug of slugs) {
      const paths = pathTable[slug];
      if (!paths || paths.length === 0) continue;
      if (isHighlighted) {
        out.push({ key: `${side}-${slug}-today`, paths, color: TODAY_COLOR, opacity: 0.85 });
      } else {
        out.push({
          key: `${side}-${slug}`,
          paths,
          color: thermalColor(score),
          opacity: 0.55 + score * 0.4, // 0.55 (barely worked) → 0.95 (heavily worked)
        });
      }
    }
  }
  return out;
}

// ─── MuscleGlowLayer ───────────────────────────────────────────────────────
// A second <Svg>, the same rendered size as Body, laid directly over it.
// Each active muscle draws its OWN real path shape twice: once blurred and
// enlarged slightly underneath (the soft glow bleed) and once crisp on top
// (the defined core) — both using the exact silhouette, so color never
// floats outside the real muscle outline.

function MuscleGlowLayer({
  specs, side, scale,
}: {
  specs: MuscleGlowSpec[];
  side:  'front' | 'back';
  scale: number;
}) {
  if (specs.length === 0) return null;
  const viewBox = side === 'front' ? '0 0 724 1448' : '724 0 724 1448';
  return (
    <Svg
      width={200 * scale}
      height={400 * scale}
      viewBox={viewBox}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <Filter id={GLOW_BLUR_ID} x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation={7} />
        </Filter>
      </Defs>
      {/* Glow bleed pass — blurred, slightly larger via strokeWidth so the
          blur has real content to spread from at the shape's own edge. */}
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
      {/* Crisp core pass — the real shape, clearly defined on top of its own glow. */}
      {specs.map(spec => spec.paths.map((d, i) => (
        <Path
          key={`${spec.key}-core-${i}`}
          d={d}
          fill={spec.color}
          fillOpacity={spec.opacity}
        />
      )))}
    </Svg>
  );
}

export function MuscleHeatmap({
  overallScores,
  highlightGroups,
  highlightLabel = 'Today',
  scale = 0.72,
  showLegend = true,
  showLabels = true,
  emptyMessage = 'Log a session to fill in your muscle map.',
}: {
  overallScores:    MuscleScores;
  highlightGroups?: Set<MuscleGroup>;
  highlightLabel?:  string;
  scale?:           number;
  showLegend?:      boolean;
  showLabels?:      boolean;
  emptyMessage?:    string;
}) {
  const isEmpty = Object.keys(overallScores).length === 0 && (!highlightGroups || highlightGroups.size === 0);

  const frontGlow = useMemo(
    () => buildGlowSpecs(overallScores, highlightGroups, 'front'),
    [overallScores, highlightGroups],
  );
  const backGlow = useMemo(
    () => buildGlowSpecs(overallScores, highlightGroups, 'back'),
    [overallScores, highlightGroups],
  );

  return (
    <View style={{ gap: 14 }}>
      {showLegend && !isEmpty && (
        <View style={mh.legendRow}>
          {highlightGroups && highlightGroups.size > 0 && (
            <View style={mh.legendItem}>
              <View style={[mh.legendDot, { backgroundColor: TODAY_COLOR }]} />
              <Text style={mh.legendLbl}>{highlightLabel}</Text>
            </View>
          )}
          <View style={mh.legendItem}>
            <LinearGradient
              colors={BODY_COLORS}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={mh.legendGrad}
            />
            <Text style={mh.legendLbl}>Overall</Text>
          </View>
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
              <Body
                data={[]}
                side="front"
                gender="male"
                scale={scale}
                defaultFill="rgba(200,210,228,0.35)"
                border="none"
              />
              <MuscleGlowLayer specs={frontGlow} side="front" scale={scale} />
            </View>
            {showLabels && <Text style={mh.diagramLabel}>Front</Text>}
          </View>

          <View style={mh.diagramDivider} />

          <View style={mh.diagramCol}>
            <View>
              <Body
                data={[]}
                side="back"
                gender="male"
                scale={scale}
                defaultFill="rgba(200,210,228,0.35)"
                border="none"
              />
              <MuscleGlowLayer specs={backGlow} side="back" scale={scale} />
            </View>
            {showLabels && <Text style={mh.diagramLabel}>Back</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

const mh = StyleSheet.create({
  legendRow:      { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:      { width: 9, height: 9, borderRadius: 4.5 },
  legendGrad:     { width: 22, height: 9, borderRadius: 4.5 },
  legendLbl:      { fontSize: 11, fontWeight: '600', color: C.textSub },
  emptyState:     { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
  emptyTxt:       { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 19 },
  diagramsRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  diagramCol:     { flex: 1, alignItems: 'center', gap: 8 },
  diagramDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(17,24,39,0.07)', marginHorizontal: 8 },
  diagramLabel:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: C.textSub },
});
