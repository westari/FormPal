/**
 * components/MuscleHeatmap.tsx
 *
 * Shared muscle-coverage body diagram — used by the progress tab (cumulative
 * only) and the recap screen (cumulative + "worked this session" overlay).
 * Wraps react-native-body-highlighter; does not re-implement the body art.
 *
 * HEAT GLOW LAYER: react-native-body-highlighter only supports flat per-region
 * SVG fills (confirmed by reading its source — getColorToFill() returns a
 * plain color string passed straight into a <Path fill={...}>) — no built-in
 * gradient or glow. It also renders its own self-contained <Svg> internally
 * with no slot to inject external <Defs>, so a true gradient-FILL per muscle
 * shape isn't reachable without forking the library. What IS reachable: an
 * external glow, drawn with react-native-svg (already a project dependency)
 * as a separate <Svg> layered on top of the flat Body diagram, using
 * <RadialGradient> blobs positioned at real per-muscle coordinates — not
 * guessed anatomical proportions. Those coordinates were computed by parsing
 * the library's own bundled SVG path data (node_modules/react-native-body-
 * highlighter/dist/assets/body{Front,Back}.js) for each slug's bounding-box
 * centroid, so the glow should align with the actual artwork rather than an
 * approximation. The flat Body diagram is kept underneath as the precise,
 * legible base layer — the glow adds the "thermal" feel on top of it, so an
 * imperfect glow alignment degrades gracefully rather than breaking the map.
 *
 * Gender note: the library only ships gender="male" | "female" body shapes —
 * there is no neutral silhouette option, and building a custom one would mean
 * not reusing this component. "male" is hardcoded below as an accepted
 * limitation, not a guess — see CLAUDE.md investigate-first rule.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import Body from 'react-native-body-highlighter';
import type { ExtendedBodyPart, Slug } from 'react-native-body-highlighter';
import { MuscleGroup } from '../constants/exercises';
import type { MuscleScores } from '../lib/sessionLog';

const C = {
  text:    '#0b1020',
  textSub: '#9aa0ad',
};

const BODY_COLORS  = ['#FFC24B', '#FF9F0A', '#FF7A2E'] as const; // legend chip only now
const TODAY_COLOR  = '#0a84ff'; // distinct overlay color for "worked this session"

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

function scoreToIntensity(score: number): 1 | 2 | 3 {
  if (score < 0.3) return 1;
  if (score < 0.65) return 2;
  return 3;
}

// ─── Glow geometry ────────────────────────────────────────────────────────────
// Bounding-box centroid + half-extents per slug, in the SAME viewBox coordinate
// space Body itself uses (front: "0 0 724 1448", back: "724 0 724 1448" — see
// SvgMaleWrapper.js). Computed once from the library's actual bundled path
// data (dist/assets/bodyFront.js / bodyBack.js), not estimated — see the file
// header. rx/ry include a small padding multiplier so the glow softly
// overspills the flat region instead of clipping exactly to its edge.
interface GlowRect { cx: number; cy: number; rx: number; ry: number }

const FRONT_GLOW: Partial<Record<Slug, GlowRect>> = {
  chest:       { cx: 364, cy: 377, rx: 130, ry: 78  },
  deltoids:    { cx: 368, cy: 347, rx: 200, ry: 66  },
  biceps:      { cx: 364, cy: 451, rx: 210, ry: 62  },
  forearm:     { cx: 362, cy: 592, rx: 275, ry: 120 },
  abs:         { cx: 342, cy: 571, rx: 95,  ry: 168 },
  obliques:    { cx: 358, cy: 537, rx: 130, ry: 140 },
  quadriceps:  { cx: 364, cy: 809, rx: 142, ry: 165 },
  adductors:   { cx: 364, cy: 773, rx: 104, ry: 146 },
};

const BACK_GLOW: Partial<Record<Slug, GlowRect>> = {
  deltoids:    { cx: 1117, cy: 357, rx: 157, ry: 52  },
  forearm:     { cx: 1012, cy: 586, rx: 347, ry: 118 },
  trapezius:   { cx: 1078, cy: 375, rx: 100, ry: 112 },
  'upper-back':{ cx: 1083, cy: 442, rx: 148, ry: 163 },
  triceps:     { cx: 1085, cy: 458, rx: 211, ry: 88  },
  'lower-back':{ cx: 1082, cy: 557, rx: 119, ry: 82  },
  hamstring:   { cx: 1083, cy: 874, rx: 138, ry: 154 },
  gluteal:     { cx: 1064, cy: 699, rx: 149, ry: 93  },
  calves:      { cx: 1084, cy: 1131, rx: 133, ry: 184 },
};

// Thermal ramp: cool (barely worked) → amber (moderate, matches the app's
// existing accent) → hot red-orange with the most glow (heavily worked).
// Interpolated continuously rather than in 3 hard steps, so the glow reads
// as an actual gradient of intensity rather than flat bands.
const THERMAL_STOPS: [number, [number, number, number]][] = [
  [0.0, [56, 132, 255]],   // cool blue
  [0.5, [255, 194, 75]],   // amber (BODY_COLORS mid)
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

interface GlowSpec { key: string; rect: GlowRect; color: string; opacity: number; scale: number }

function buildGlowSpecs(
  overallScores: MuscleScores,
  highlightGroups: Set<MuscleGroup> | undefined,
  side: 'front' | 'back',
): GlowSpec[] {
  const mapping = side === 'front' ? GROUP_TO_FRONT_SLUGS : GROUP_TO_BACK_SLUGS;
  const glowTable = side === 'front' ? FRONT_GLOW : BACK_GLOW;
  const out: GlowSpec[] = [];
  for (const [mg, slugs] of Object.entries(mapping) as [MuscleGroup, Slug[]][]) {
    const isHighlighted = highlightGroups?.has(mg) ?? false;
    const score = overallScores[mg] ?? 0;
    if (!isHighlighted && score <= 0.05) continue;
    for (const slug of slugs) {
      const rect = glowTable[slug];
      if (!rect) continue;
      if (isHighlighted) {
        out.push({ key: `${side}-${slug}-today`, rect, color: TODAY_COLOR, opacity: 0.55, scale: 1.15 });
      } else {
        out.push({
          key: `${side}-${slug}`,
          rect,
          color: thermalColor(score),
          opacity: 0.30 + score * 0.35, // 0.30 (barely worked) → 0.65 (heavily worked)
          scale: 0.85 + score * 0.35,   // bigger glow for more volume, per spec ("more intense", not "bigger region")
        });
      }
    }
  }
  return out;
}

function buildBodyData(
  overallScores: MuscleScores,
  highlightGroups: Set<MuscleGroup> | undefined,
  side: 'front' | 'back',
): ExtendedBodyPart[] {
  const mapping = side === 'front' ? GROUP_TO_FRONT_SLUGS : GROUP_TO_BACK_SLUGS;
  const out: ExtendedBodyPart[] = [];
  for (const [mg, slugs] of Object.entries(mapping) as [MuscleGroup, Slug[]][]) {
    const isHighlighted = highlightGroups?.has(mg) ?? false;
    if (isHighlighted) {
      for (const slug of slugs) out.push({ slug, intensity: 3, color: TODAY_COLOR });
      continue;
    }
    const score = overallScores[mg] ?? 0;
    if (score > 0.05) {
      for (const slug of slugs) out.push({ slug, intensity: scoreToIntensity(score) });
    }
  }
  return out;
}

// ─── GlowLayer ────────────────────────────────────────────────────────────────
// A second <Svg> the same rendered size as Body, absolutely positioned over
// it. Each glow is its own <RadialGradient> (full color center → transparent
// edge) so this reads as soft light, not a flat colored disc.

function GlowLayer({ specs, side, scale }: { specs: GlowSpec[]; side: 'front' | 'back'; scale: number }) {
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
        {specs.map(s => (
          <RadialGradient key={s.key} id={s.key} cx="50%" cy="50%" r="50%">
            <Stop offset="0%"  stopColor={s.color} stopOpacity={s.opacity} />
            <Stop offset="55%" stopColor={s.color} stopOpacity={s.opacity * 0.55} />
            <Stop offset="100%" stopColor={s.color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {specs.map(s => (
        <Ellipse
          key={s.key}
          cx={s.rect.cx}
          cy={s.rect.cy}
          rx={s.rect.rx * s.scale}
          ry={s.rect.ry * s.scale}
          fill={`url(#${s.key})`}
        />
      ))}
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

  const frontData = useMemo(
    () => buildBodyData(overallScores, highlightGroups, 'front'),
    [overallScores, highlightGroups],
  );
  const backData = useMemo(
    () => buildBodyData(overallScores, highlightGroups, 'back'),
    [overallScores, highlightGroups],
  );
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
                data={frontData}
                side="front"
                gender="male"
                scale={scale}
                colors={BODY_COLORS}
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
                data={backData}
                side="back"
                gender="male"
                scale={scale}
                colors={BODY_COLORS}
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
