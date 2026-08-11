/**
 * components/SkiaMuscleHeatmap.tsx — EXPERIMENTAL continuous Skia thermal
 * heatmap. Reached ONLY via the isolated /skia-heatmap-test route
 * (app/skia-heatmap-test.tsx) until confirmed not to crash on a real device
 * — NOT wired into recap.tsx or the progress tab.
 *
 * ── TECHNIQUE — scattered points + Gaussian blur, same family as heatmap.js ──
 *
 * Instead of filling each muscle's SHAPE with one flat color (the previous
 * version, and the shipped SVG MuscleHeatmap), this scatters many small soft
 * dots across each muscle's area — density/count driven by how much that
 * muscle was trained — and lets their blurred edges overlap and stack. Where
 * many dots cluster (heavily worked muscle, or the shared boundary between
 * two adjacent worked muscles) the overlapping alpha makes that region read
 * hotter/more solid; where dots are sparse it stays faint. That's what
 * produces a field that blends across muscle boundaries instead of looking
 * like discrete glowing shapes.
 *
 * ── HONEST GAP vs. a textbook heatmap.js implementation ─────────────────────
 *
 * The textbook version is a genuine TWO-PASS technique: (1) render every
 * point as grayscale ADDITIVE intensity into an offscreen buffer, so
 * overlapping points literally SUM past 1.0, then (2) remap that summed
 * buffer through a 1D color gradient (a lookup table) so color comes from
 * the FINAL accumulated value at each pixel. Doing that for real in Skia
 * needs an offscreen `Group layer={...}` with an additive blend mode for
 * pass 1, and either a `ColorFilter` or a custom `Shader`/RuntimeEffect for
 * pass 2 — none of which are used anywhere else in this app, and `layer`
 * specifically is the SAME primitive already confirmed to have crashed this
 * exact component once before (see the old header comment, preserved in git
 * history: the reverted v3 used Mask + Group(layer=...) + Blur).
 *
 * This version deliberately stays OUTSIDE that risk: every dot is drawn with
 * its OWN pre-computed color (from the existing thermalColor() ramp, keyed
 * to that muscle's score) at low, fixed opacity, composited with Skia's
 * default (normal/src-over) blending — no layer, no blend modes, no
 * ColorFilter, no Shader. Overlapping same-colored dots still visibly
 * intensify (more opaque stacked alpha reads as "hotter"), and overlapping
 * DIFFERENT-colored dots from adjacent muscles blend into a genuine
 * transitional color at the seam — both of the visual goals — but this is
 * alpha-stacking approximating accumulation, not literal per-pixel summed
 * intensity remapped through a gradient. Color resolution is per-muscle
 * (continuous 0–1 via thermalColor, same as before), not per-pixel.
 *
 * If the real two-pass version is wanted after this is confirmed stable, it
 * is a deliberate, separate, higher-risk follow-up — not attempted here
 * given this round's explicit priority ("NOT crashing over speed").
 *
 * ── SAFE API SURFACE USED ────────────────────────────────────────────────
 * Canvas, Path (+ Skia.Path.MakeFromSVGString, .getBounds(), .contains() —
 * plain path-data/hit-test utilities, not masking/layering), BlurMask, plain
 * Group (no `layer` prop — already used in components/SpeedoGauge.tsx), and
 * Group's `matrix` prop given a flat 9-number array (unambiguous, no
 * transform-order guessing) to map the shared 724x1448 muscle-path
 * coordinate space (components/muscleShapePaths.ts) to canvas pixels.
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

// ─── Point scatter (density-weighted, rejection-sampled inside the real
// muscle path — not just its bounding box) ──────────────────────────────────

interface ScatterPoint { x: number; y: number; r: number }

// Visual-design constants, not CV thresholds — freely tunable by eye on the
// test screen, not subject to the exercise-definition investigate-first rule.
//
// RETUNED (reported "looks really bad" with no screenshot to iterate from —
// this is a reasoned blind pass, not a verified fix; a screenshot next time
// would let this actually be tuned precisely instead of guessed at twice).
// Root-cause reasoning: 8-32 points at radius 20-34 with blur 24 means, for
// a typical muscle region maybe 60-150 units across in this 724x1448 space,
// each dot's visible spread (radius+blur ≈ 44-58 units) covers a LARGE
// fraction of the whole region on its own — with so few of them, that reads
// as a handful of overlapping giant blotches, not a smooth graduated field.
// MANY smaller, more numerous dots blend far more continuously than a few
// huge ones (the same reason a real heatmap.js point cloud uses hundreds of
// small points, not a dozen large ones) — density up, individual size down.
const MIN_POINTS       = 20;
const MAX_EXTRA_POINTS = 40;  // + MIN_POINTS at opacity's top end
const POINT_R_MIN      = 10;  // path-space units (724x1448 coord system)
const POINT_R_MAX      = 16;
const BLUR_RADIUS       = 14; // path-space units — scales down with the Group matrix like everything else
const DOT_OPACITY_MULT  = 0.38; // fraction of the spec's own opacity per dot — a bit higher since more, smaller dots need less individual weight to accumulate to a solid-looking core

function scatterInPath(path: SkPath, count: number): ScatterPoint[] {
  const bounds = path.getBounds();
  const pts: ScatterPoint[] = [];
  const maxAttempts = count * 40;
  let attempts = 0;
  while (pts.length < count && attempts < maxAttempts) {
    attempts++;
    const x = bounds.x + Math.random() * bounds.width;
    const y = bounds.y + Math.random() * bounds.height;
    if (path.contains(x, y)) {
      pts.push({ x, y, r: POINT_R_MIN + Math.random() * (POINT_R_MAX - POINT_R_MIN) });
    }
  }
  return pts;
}

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

  // Scatter points per spec, per sub-path — density (count) and radius are
  // driven by the spec's own opacity (already a monotonic function of that
  // muscle's score — see buildGlowSpecs in MuscleHeatmap.tsx), color comes
  // straight from the spec (thermalColor(score) or TODAY_COLOR).
  const dotGroups = useMemo(
    () => specs.map(spec => {
      const count = Math.round(MIN_POINTS + spec.opacity * MAX_EXTRA_POINTS);
      const dotOpacity = spec.opacity * DOT_OPACITY_MULT;
      const points = spec.paths.flatMap(d => {
        const p = Skia.Path.MakeFromSVGString(d);
        return p ? scatterInPath(p, count) : [];
      });
      return { key: spec.key, color: spec.color, dotOpacity, points };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [specs],
  );

  return (
    <Canvas style={{ width, height }}>
      <Group matrix={matrix as any}>
        {outlinePath && <Path path={outlinePath} color={OUTLINE_FILL} style="fill" />}

        {dotGroups.map(g => g.points.map((pt, i) => (
          <Path
            key={`${g.key}-${i}`}
            path={Skia.Path.Make().addCircle(pt.x, pt.y, pt.r)}
            color={g.color}
            style="fill"
            opacity={g.dotOpacity}
          >
            <BlurMask blur={BLUR_RADIUS} style="normal" />
          </Path>
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
  // gap 16→20 — extra explicit separation between the two canvases, matching
  // the same "make it unmistakable" bump applied to the SVG version's own
  // divider spacing (components/MuscleHeatmap.tsx). Each canvas is a plain
  // fixed-size View (not GlassSurface, not flex-dependent), so this is a
  // straightforward, reliable gap — no other layout mechanism between them.
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 20 },
});
