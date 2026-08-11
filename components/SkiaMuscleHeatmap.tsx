/**
 * components/SkiaMuscleHeatmap.tsx — EXPERIMENTAL real continuous Skia
 * thermal heatmap. Reached ONLY via the isolated /skia-heatmap-test route
 * (app/skia-heatmap-test.tsx) until it's been confirmed not to crash on a
 * real device — it is NOT wired into recap.tsx or the progress tab.
 *
 * WHY THIS EXISTS: the shipped components/MuscleHeatmap.tsx (react-native-svg)
 * is proven-safe but each muscle glows independently — adjacent regions don't
 * blend into each other, so it isn't a true continuous thermal field. A prior
 * Skia attempt (v3, reverted — see MuscleHeatmap.tsx's header comment) used
 * Mask + Group(layer=...) + Blur and crashed on device; none of those three
 * APIs are used anywhere else in this app.
 *
 * WHAT THIS VERSION USES INSTEAD (deliberately restricted to the smallest
 * API surface that can produce real cross-shape blending):
 *   - Canvas, Path, BlurMask, LinearGradient — already used safely in
 *     components/Ring.tsx and components/SpeedoGauge.tsx.
 *   - Group WITHOUT a `layer` prop (a plain grouping container, not an
 *     offscreen-composited layer) — also already used in SpeedoGauge.tsx.
 *   - Group's `matrix` prop, given a flat 9-number array (not a `transform`
 *     op list) — this is the one genuinely new-to-this-app primitive: a
 *     direct, unambiguous 3x3 matrix (no composition-order guesswork), used
 *     purely to map the shared 724x1448 muscle-path coordinate space (see
 *     components/muscleShapePaths.ts) down to canvas pixels.
 *   - Skia.Path.MakeFromSVGString — a pure path-data parser, not a
 *     masking/layering primitive.
 *
 * NO Mask, NO Group(layer=...), NO Blur (the full-canvas filter node) are
 * used anywhere in this file. The "continuous" look instead comes from many
 * overlapping BlurMask-softened shapes alpha-blending where they overlap —
 * ordinary Porter-Duff src-over compositing, the same thing that happens
 * when two semi-transparent React Native Views overlap.
 *
 * SILHOUETTE: rather than clipping the canvas to the body outline (which
 * would need Skia's Mask or a clip primitive not yet proven in this app),
 * the outline is drawn as its own filled Skia Path first, underneath the
 * heat, and blur radii are kept modest relative to body size. Heat can
 * bleed a few px past the silhouette edge in extreme cases — an accepted
 * tradeoff for staying inside the known-safe API set.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Group, Path, BlurMask, Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { MuscleGroup } from '../constants/exercises';
import type { MuscleScores } from '../lib/sessionLog';
import { FRONT_BODY_OUTLINE, BACK_BODY_OUTLINE } from './muscleShapePaths';
import { buildGlowSpecs, type MuscleGlowSpec } from './MuscleHeatmap';

const VIEW_W = 724;
const VIEW_H = 1448;
const OUTLINE_FILL = 'rgba(200,210,228,0.35)'; // matches MuscleHeatmap's defaultFill

function useParsedPath(d: string | null): SkPath | null {
  return useMemo(() => (d ? Skia.Path.MakeFromSVGString(d) : null), [d]);
}

function SideCanvas({
  specs, outlineD, side, scale,
}: {
  specs:    MuscleGlowSpec[];
  outlineD: string;
  side:     'front' | 'back';
  scale:    number;
}) {
  const width  = 200 * scale;
  const height = 400 * scale;
  const factor = width / VIEW_W;
  const xOffset = side === 'back' ? VIEW_W : 0; // back viewBox starts at x=724

  // Flat 9-number row-major 3x3 matrix — unambiguous, no transform-order
  // guessing. x' = factor*x - xOffset*factor ; y' = factor*y
  const matrix = useMemo(
    () => [factor, 0, -xOffset * factor, 0, factor, 0, 0, 0, 1],
    [factor, xOffset],
  );

  const outlinePath = useParsedPath(outlineD);

  const parsedSpecs = useMemo(
    () => specs.map(spec => ({
      ...spec,
      skPaths: spec.paths.map(d => Skia.Path.MakeFromSVGString(d)).filter((p): p is SkPath => p !== null),
    })),
    [specs],
  );

  return (
    <Canvas style={{ width, height }}>
      <Group matrix={matrix as any}>
        {outlinePath && <Path path={outlinePath} color={OUTLINE_FILL} style="fill" />}

        {/* Glow pass — blurred, blends continuously where adjacent muscles overlap */}
        {parsedSpecs.map(spec => spec.skPaths.map((p, i) => (
          <Path key={`${spec.key}-glow-${i}`} path={p} color={spec.color} style="fill" opacity={spec.opacity * 0.75}>
            <BlurMask blur={16} style="normal" />
          </Path>
        )))}

        {/* Crisp core pass — keeps each shape legible on top of its own glow */}
        {parsedSpecs.map(spec => spec.skPaths.map((p, i) => (
          <Path key={`${spec.key}-core-${i}`} path={p} color={spec.color} style="fill" opacity={spec.opacity} />
        )))}
      </Group>
    </Canvas>
  );
}

export function SkiaMuscleHeatmap({
  overallScores,
  highlightGroups,
  scale = 0.72,
}: {
  overallScores:    MuscleScores;
  highlightGroups?: Set<MuscleGroup>;
  scale?:           number;
}) {
  const frontGlow = useMemo(
    () => buildGlowSpecs(overallScores, highlightGroups, 'front'),
    [overallScores, highlightGroups],
  );
  const backGlow = useMemo(
    () => buildGlowSpecs(overallScores, highlightGroups, 'back'),
    [overallScores, highlightGroups],
  );

  return (
    <View style={s.row}>
      <SideCanvas specs={frontGlow} outlineD={FRONT_BODY_OUTLINE} side="front" scale={scale} />
      <SideCanvas specs={backGlow} outlineD={BACK_BODY_OUTLINE} side="back" scale={scale} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 16 },
});
