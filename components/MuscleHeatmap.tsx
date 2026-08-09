/**
 * components/MuscleHeatmap.tsx
 *
 * Shared muscle-coverage body diagram — used by the progress tab (cumulative
 * only) and the recap screen (cumulative + "worked this session" overlay).
 *
 * HEAT LAYER, v3 — genuine continuous thermal field, not discrete colored
 * shapes. v1 used floating <Ellipse> blobs at approximate centroids (color
 * visibly outside the real muscle outline). v2 (react-native-svg) fixed the
 * boundary problem by filling the EXACT extracted muscle-region paths
 * directly, but each region was still its own flat, separately-blurred SVG
 * shape — adjacent regions didn't blend into each other, so it still read as
 * "several colored patches" rather than one continuous heat field, which is
 * what was called out as "not a real heatmap, just color splashes."
 *
 * v3 fix — uses @shopify/react-native-skia (already a dependency, already
 * used elsewhere in this app: components/Ring.tsx, components/SpeedoGauge.tsx
 * — no new native module, no rebuild): the exact same muscle-region paths are
 * filled onto a Skia canvas, but the WHOLE composited layer is rasterized and
 * blurred together as pixels (Group's `layer` + `Blur` image filter) instead
 * of each SVG shape getting its own independent, contained blur. A real
 * pixel-space blur spreads and blends across shape BOUNDARIES, which is what
 * actually produces a continuous-looking gradient between adjacent regions
 * instead of separately-glowing patches — this is the genuine difference
 * between "a heatmap" and "some blurred shapes." The blurred layer is then
 * masked (Skia `Mask`, alpha mode) to the real full-body outline (also
 * extracted from the same library, see FRONT_BODY_OUTLINE/BACK_BODY_OUTLINE
 * in muscleShapePaths.ts) so the blur — which by nature spreads color beyond
 * its source shapes — can never bleed past the person's actual silhouette,
 * no matter how large the blur radius.
 *
 * react-native-body-highlighter's own <Body> renders ONLY as the neutral
 * base outline underneath (empty data) — this component is the single
 * source of muscle color, avoiding the earlier "flat fill + blob on top"
 * double-rendering.
 *
 * Gender note: the library only ships gender="male" | "female" body shapes —
 * there is no neutral silhouette option. "male" is hardcoded below as an
 * accepted limitation, not a guess — see CLAUDE.md investigate-first rule.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, Group, Mask, Path as SkiaPath, Blur } from '@shopify/react-native-skia';
import Body from 'react-native-body-highlighter';
import type { Slug } from 'react-native-body-highlighter';
import { MuscleGroup } from '../constants/exercises';
import type { MuscleScores } from '../lib/sessionLog';
import {
  FRONT_MUSCLE_PATHS, BACK_MUSCLE_PATHS,
  FRONT_BODY_OUTLINE, BACK_BODY_OUTLINE,
} from './muscleShapePaths';

const C = {
  text:    '#0b1020',
  textSub: '#9aa0ad',
};

const BODY_COLORS  = ['#FFC24B', '#FF9F0A', '#FF7A2E'] as const; // legend chip only
const TODAY_COLOR  = '#0a84ff'; // distinct overlay color for "worked this session"

// Base render size — matches react-native-body-highlighter's own fixed design
// size (200×400 at scale=1) and viewBox ('0 0 724 1448' front / '724 0 724 1448'
// back), confirmed from SvgMaleWrapper.js. The Skia canvas is drawn at the same
// 724×1448 coordinate space and scaled down to match via a transform, so the
// muscle paths (extracted in that same coordinate space) need no conversion.
const DESIGN_W = 724;
const DESIGN_H = 1448;

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

interface MuscleFillSpec {
  key:     string;
  paths:   string[];
  color:   string;
  opacity: number;
}

function buildFillSpecs(
  overallScores: MuscleScores,
  highlightGroups: Set<MuscleGroup> | undefined,
  side: 'front' | 'back',
): MuscleFillSpec[] {
  const mapping   = side === 'front' ? GROUP_TO_FRONT_SLUGS   : GROUP_TO_BACK_SLUGS;
  const pathTable = side === 'front' ? FRONT_MUSCLE_PATHS     : BACK_MUSCLE_PATHS;
  const out: MuscleFillSpec[] = [];
  for (const [mg, slugs] of Object.entries(mapping) as [MuscleGroup, Slug[]][]) {
    const isHighlighted = highlightGroups?.has(mg) ?? false;
    const score = overallScores[mg] ?? 0;
    if (!isHighlighted && score <= 0.05) continue;
    for (const slug of slugs) {
      const paths = pathTable[slug];
      if (!paths || paths.length === 0) continue;
      if (isHighlighted) {
        out.push({ key: `${side}-${slug}-today`, paths, color: TODAY_COLOR, opacity: 0.9 });
      } else {
        out.push({
          key: `${side}-${slug}`,
          paths,
          color: thermalColor(score),
          opacity: 0.6 + score * 0.35, // 0.6 (barely worked) → 0.95 (heavily worked)
        });
      }
    }
  }
  return out;
}

// ─── ThermalCanvas ─────────────────────────────────────────────────────────
// The actual heat field: every active muscle's real path filled at full
// design resolution, the whole group rasterized + blurred together (so
// adjacent regions bleed into one continuous field, not separate glowing
// patches), then masked to the real body outline so the blur can never
// escape the silhouette.

function ThermalCanvas({
  specs, outline, scale, side,
}: {
  specs:   MuscleFillSpec[];
  outline: string;
  scale:   number;
  side:    'front' | 'back';
}) {
  if (specs.length === 0) return null;
  // The back-side path data lives in x∈[724,1448] (viewBox '724 0 724 1448',
  // confirmed from SvgMaleWrapper.js) since front/back share one coordinate
  // space in the source SVG — translate it back into the canvas's own
  // 0..724 window before scaling down to the rendered size.
  const translateX = side === 'back' ? -DESIGN_W : 0;
  return (
    // PREEMPTIVE FIX: StyleSheet.absoluteFill sets top/left/right/bottom all
    // to 0, which combined with an explicit width/height in the same style
    // array is an over-constrained, platform-dependent layout combo (Yoga
    // has to decide whether right/bottom or width/height wins) — exact pixel
    // alignment matters here since this canvas has to sit precisely over
    // Body's silhouette, so removed the ambiguity: explicit position+size
    // only, no right/bottom.
    <Canvas
      style={{ position: 'absolute', top: 0, left: 0, width: DESIGN_W * scale, height: DESIGN_H * scale }}
    >
      {/* Outer group: scales the whole thing down to the rendered size.
          Inner group: shifts the back-side path data (x∈[724,1448] in the
          source SVG's shared coordinate space) into the 0..724 window BEFORE
          the outer scale is applied — nested Groups compose like nested SVG
          <g> elements, which avoids depending on any single-array transform
          multiplication order. */}
      <Group transform={[{ scale }]}>
        <Group transform={[{ translateX }]}>
          <Mask mode="alpha" mask={<SkiaPath path={outline} color="white" />}>
            <Group layer={<Blur blur={22} />}>
              {specs.map(spec => spec.paths.map((d, i) => (
                <SkiaPath
                  key={`${spec.key}-${i}`}
                  path={d}
                  color={spec.color}
                  opacity={spec.opacity}
                />
              )))}
            </Group>
          </Mask>
        </Group>
      </Group>
    </Canvas>
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

  // Body's own fixed design size is 200×400 at scale=1 (confirmed from
  // SvgMaleWrapper.js) — the Skia canvas draws at the native 724×1448 path
  // coordinate space, so it needs its OWN scale factor to end up the same
  // rendered size as Body: 200/724 per unit of the `scale` prop.
  const canvasScale = scale * (200 / DESIGN_W);

  const frontFill = useMemo(
    () => buildFillSpecs(overallScores, highlightGroups, 'front'),
    [overallScores, highlightGroups],
  );
  const backFill = useMemo(
    () => buildFillSpecs(overallScores, highlightGroups, 'back'),
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
              <ThermalCanvas specs={frontFill} outline={FRONT_BODY_OUTLINE} scale={canvasScale} side="front" />
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
              <ThermalCanvas specs={backFill} outline={BACK_BODY_OUTLINE} scale={canvasScale} side="back" />
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
