import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  BlurMask,
  Group,
  vec,
  SweepGradient,
} from '@shopify/react-native-skia';
import { Col, W, Sz } from '../constants/theme';

interface RingProps {
  /** 0–1 fill fraction */
  progress:     number;
  /** Two-stop gradient [from, to]. Use Col.ringA / ringB / ringC. */
  colors:       [string, string];
  /** Kept for API compat with SVG version — unused in Skia */
  gradientId:   string;
  /** Center value, e.g. "82" or "--" */
  value:        string;
  /** Below-ring label, e.g. "Form Score" */
  label:        string;
  /** Unit inside ring, e.g. "%" */
  unit?:        string;
  /** Outer pixel dimension. Default: 80 */
  size?:        number;
  /** Stroke thickness. Default: 9 */
  strokeWidth?: number;
}

/**
 * Builds a SkPath arc via PathBuilder (Skia 2.x API).
 * startDeg: 0 = 3 o'clock, clockwise. -90 = 12 o'clock.
 */
function makeArc(
  cx: number, cy: number, r: number,
  startDeg: number, sweepDeg: number,
) {
  return Skia.Path.Make()
    .addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, startDeg, sweepDeg);
}

export default function Ring({
  progress,
  colors,
  gradientId: _,   // consumed for compat; Skia needs no IDs
  value,
  label,
  unit,
  size        = 80,
  strokeWidth = 9,
}: RingProps) {
  const r   = (size - strokeWidth) / 2;
  const cx  = size / 2;
  const cy  = size / 2;
  const pct = Math.min(1, Math.max(0, progress));
  const sweepDeg = pct * 360;
  const sw  = strokeWidth;

  // Build all paths once; recompute only when geometry or progress changes.
  const { track, progress: prog, glint, shadow, shine } = useMemo(() => ({
    // Full 360° grey track — the carved channel
    track:    makeArc(cx, cy, r, -90, 360),
    // Progress fill — starts at 12 o'clock, sweeps clockwise
    progress: pct > 0 ? makeArc(cx, cy, r, -90, Math.max(sweepDeg, 2)) : null,
    // Gloss highlight — leading portion of the progress arc (top-left arc)
    glint:    pct > 0.08 ? makeArc(cx, cy, r, -90, Math.min(sweepDeg * 0.5, 110)) : null,
    // Bottom-half of track — where shadow accumulates in the channel
    shadow:   makeArc(cx, cy, r, 60, 240),
    // Top-left arc — ambient light reflected off the track lip
    shine:    makeArc(cx, cy, r, -120, 90),
  }), [cx, cy, r, pct, sweepDeg]);

  return (
    <View style={s.wrap}>
      <View style={{ width: size, height: size }}>
        {/*
         * Canvas is absoluteFill. RN Text floats above it via a separate
         * absoluteFill View — this avoids mixing Skia text and RN text.
         */}
        <Canvas style={StyleSheet.absoluteFill}>

          {/* ── TRACK — recessed / carved-channel look ─────────── */}

          {/* 1. Dark halo behind track → track appears pressed into surface */}
          <Path
            path={track}
            style="stroke"
            strokeWidth={sw + 4}
            color="rgba(0,0,0,0.10)"
            strokeCap="round"
          >
            <BlurMask blur={4} style="normal" />
          </Path>

          {/* 2. Base grey track */}
          <Path
            path={track}
            style="stroke"
            strokeWidth={sw}
            color={Col.ringTrack}
            strokeCap="round"
          />

          {/* 3. Blurred dark shadow at bottom of channel → depth of the trough */}
          <Path
            path={shadow}
            style="stroke"
            strokeWidth={sw - 2}
            color="rgba(0,0,0,0.10)"
            strokeCap="butt"
          >
            <BlurMask blur={2} style="normal" />
          </Path>

          {/* 4. Bright highlight on top-left lip → ambient light from above-left */}
          <Path
            path={shine}
            style="stroke"
            strokeWidth={Math.max(sw - 5, 2)}
            color="rgba(255,255,255,0.55)"
            strokeCap="butt"
          >
            <BlurMask blur={1.5} style="normal" />
          </Path>

          {/* ── PROGRESS ARC — raised, glowing, glossy ──────────── */}

          {prog && (
            <Group>
              {/* 5. Colored glow behind arc → arc appears physically lifted off track */}
              <Path
                path={prog}
                style="stroke"
                strokeWidth={sw + 6}
                color={colors[0] + '30'}
                strokeCap="round"
              >
                <BlurMask blur={7} style="normal" />
              </Path>

              {/* 6. Main arc — SweepGradient travels along the arc's angular range */}
              <Path
                path={prog}
                style="stroke"
                strokeWidth={sw}
                strokeCap="round"
              >
                <SweepGradient
                  c={vec(cx, cy)}
                  colors={[colors[0], colors[1]]}
                  start={-90}
                  end={-90 + sweepDeg}
                />
              </Path>

              {/* 7. Gloss highlight — thin bright arc on leading portion → convex sheen */}
              {glint && (
                <Path
                  path={glint}
                  style="stroke"
                  strokeWidth={Math.max(sw * 0.26, 2)}
                  color="rgba(255,255,255,0.38)"
                  strokeCap="round"
                >
                  <BlurMask blur={1.2} style="normal" />
                </Path>
              )}
            </Group>
          )}

        </Canvas>

        {/* Center value + unit — RN Text overlaid on top of Canvas */}
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <Text style={s.value}>{value}</Text>
          {unit ? <Text style={s.unit}>{unit}</Text> : null}
        </View>
      </View>

      <Text style={s.label} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:   { alignItems: 'center', gap: 8 },
  center: { alignItems: 'center', justifyContent: 'center' },
  value: {
    fontSize:      Sz.h3,
    fontWeight:    W.bold,
    color:         Col.text,
    letterSpacing: -0.6,
    lineHeight:    22,
  },
  unit: {
    fontSize:   Sz.caption - 1,
    fontWeight: W.semi,
    color:      Col.textSub,
    lineHeight: 13,
  },
  label: {
    fontSize:      Sz.caption,
    fontWeight:    W.medium,
    color:         Col.textSub,
    textAlign:     'center',
    lineHeight:    15,
    letterSpacing: 0.1,
  },
});
