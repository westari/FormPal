/**
 * components/MuscleHeatmap.tsx
 *
 * Shared muscle-coverage body diagram — used by the progress tab (cumulative
 * only) and the recap screen (cumulative + "worked this session" overlay).
 *
 * CRASH FIX — REVERTED FROM SKIA: the previous version (v3) used
 * @shopify/react-native-skia's Mask, Group(layer=...), and Blur components to
 * get a genuinely continuous, rasterized-blur thermal field. None of those
 * three APIs are used ANYWHERE else in this app — every other Skia usage
 * (components/Ring.tsx, components/SpeedoGauge.tsx) is plain Canvas + Path +
 * gradients, with no Mask/layer-Group/Blur at all. That combination was never
 * tested on a real device, and matches the reported crash exactly: recap
 * renders its background, then crashes shortly after — consistent with a
 * component further down the tree (this one, mounted inside the scrollable
 * content) throwing once it actually tries to render. This same component is
 * also used on the progress tab's muscle-coverage card, which lines up with
 * the separate "pressing on the legs/body" crash being the same root cause on
 * a second screen.
 *
 * Reverted to the prior, PROVEN-safe approach: react-native-svg (used
 * extensively elsewhere in this app without issue) filling each muscle's
 * REAL extracted path directly — no approximated blobs — with a soft glow via
 * SVG's own <Filter><FeGaussianBlur> per shape. This does not blend as
 * smoothly across adjacent muscle boundaries as the Skia raster-blur approach
 * would have (each region's glow is still its own contained shape), but it is
 * built entirely from primitives already confirmed working in this exact app,
 * so it should not crash. The genuinely-continuous-blend version can be
 * revisited later as an isolated, dedicated test — not bundled into a build
 * that also needs the crash fixed.
 *
 * react-native-body-highlighter's own <Body> renders ONLY the neutral base
 * outline underneath (empty data) — this component is the single source of
 * muscle color, avoiding "flat fill + blob on top" double-rendering.
 *
 * Gender note: the library only ships gender="male" | "female" body shapes —
 * there is no neutral silhouette option. "male" is hardcoded below as an
 * accepted limitation, not a guess — see CLAUDE.md investigate-first rule.
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
export const TODAY_COLOR  = '#0a84ff'; // distinct overlay color for "worked this session"
const GLOW_BLUR_ID = 'muscleGlowBlur'; // one shared filter, reused by every glow layer

// Exported so the experimental Skia heatmap (components/SkiaMuscleHeatmap.tsx,
// reached only via the isolated /skia-heatmap-test route) can reuse the exact
// same muscle-group → score → color logic instead of re-deriving it and
// risking the two views drifting apart.
export const GROUP_TO_FRONT_SLUGS: Partial<Record<MuscleGroup, Slug[]>> = {
  [MuscleGroup.Chest]:     ['chest'],
  [MuscleGroup.Shoulders]: ['deltoids'],
  [MuscleGroup.Arms]:      ['biceps', 'forearm'],
  [MuscleGroup.Core]:      ['abs', 'obliques'],
  [MuscleGroup.Legs]:      ['quadriceps', 'adductors'],
};
export const GROUP_TO_BACK_SLUGS: Partial<Record<MuscleGroup, Slug[]>> = {
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

export function thermalColor(score: number): string {
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

export interface MuscleGlowSpec {
  key:     string;
  paths:   string[];
  color:   string;
  opacity: number;
}

export function buildGlowSpecs(
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

function GlowLayer({
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
              <GlowLayer specs={frontGlow} side="front" scale={scale} />
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
              <GlowLayer specs={backGlow} side="back" scale={scale} />
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
