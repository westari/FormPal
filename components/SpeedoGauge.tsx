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

// ── Gauge geometry constants ──────────────────────────────────────────────────
const SIZE      = 96;
const STROKE    = 10;
const RADIUS    = (SIZE - STROKE) / 2;
const CX        = SIZE / 2;
const CY        = SIZE / 2;
const START_DEG = 135;   // 7:30 position — standard speedometer start (bottom-left)
const SWEEP_DEG = 270;   // 270° arc — bottom-left → top-right

function makeArc(startDeg: number, sweepDeg: number) {
  return Skia.Path.Make()
    .addArc(
      { x: CX - RADIUS, y: CY - RADIUS, width: RADIUS * 2, height: RADIUS * 2 },
      startDeg,
      sweepDeg,
    );
}

interface SpeedoGaugeProps {
  /** 0–1 fill fraction */
  progress: number;
}

/**
 * 270° speedometer-style gauge rendered with Skia.
 *
 * Track is carved/recessed. Progress arc uses a SweepGradient spanning the
 * full 270° range (red → orange → green), so the visible arc section tells
 * you where on the quality spectrum the score lands.
 *
 * Depth layers:
 *   - Dark halo behind track  → track pressed into surface
 *   - Shadow in channel bottom → carved trough
 *   - Highlight on track lip  → ambient light
 *   - Colored glow under arc  → arc lifted off track
 *   - Gloss on leading arc    → convex sheen
 */
export default function SpeedoGauge({ progress }: SpeedoGaugeProps) {
  const pct       = Math.min(1, Math.max(0, progress));
  const fillDeg   = pct * SWEEP_DEG;
  const numLabel  = pct > 0 ? String(Math.round(pct * 100)) : '--';
  const qualLabel = pct >= 0.8 ? 'High' : pct >= 0.5 ? 'Good' : pct > 0 ? 'Fair' : '--';

  const { track, prog, glint, shadow, shine } = useMemo(() => ({
    track:  makeArc(START_DEG, SWEEP_DEG),
    // Progress fill from START_DEG, sweeping clockwise
    prog:   pct > 0 ? makeArc(START_DEG, Math.max(fillDeg, 2)) : null,
    // Gloss: first half of the filled arc
    glint:  pct > 0.08 ? makeArc(START_DEG, Math.min(fillDeg * 0.5, 90)) : null,
    // Bottom 180° of track — where shadow collects in the channel
    shadow: makeArc(START_DEG + 90, SWEEP_DEG - 90),
    // Top-start portion — ambient highlight on the track lip
    shine:  makeArc(START_DEG, 55),
  }), [pct, fillDeg]);

  // Glow color tracks the current progress zone (red / orange / green tint)
  const glowColor = pct >= 0.65 ? Col.good + '28'
                  : pct >= 0.35 ? Col.mid  + '28'
                  :               Col.low  + '28';

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Canvas style={StyleSheet.absoluteFill}>

        {/* ── TRACK — recessed/carved ──────────────────────────── */}

        {/* Dark halo behind track → track appears pressed in */}
        <Path
          path={track}
          style="stroke"
          strokeWidth={STROKE + 4}
          color="rgba(0,0,0,0.10)"
          strokeCap="round"
        >
          <BlurMask blur={4} style="normal" />
        </Path>

        {/* Base grey track */}
        <Path
          path={track}
          style="stroke"
          strokeWidth={STROKE}
          color={Col.ringTrack}
          strokeCap="round"
        />

        {/* Shadow in channel bottom → depth of trough */}
        <Path
          path={shadow}
          style="stroke"
          strokeWidth={STROKE - 2}
          color="rgba(0,0,0,0.10)"
          strokeCap="butt"
        >
          <BlurMask blur={2} style="normal" />
        </Path>

        {/* Lip highlight → light from above */}
        <Path
          path={shine}
          style="stroke"
          strokeWidth={Math.max(STROKE - 5, 2)}
          color="rgba(255,255,255,0.5)"
          strokeCap="butt"
        >
          <BlurMask blur={1.5} style="normal" />
        </Path>

        {/* ── PROGRESS ARC — raised, rainbow sweep ─────────────── */}

        {prog && (
          <Group>
            {/* Glow beneath arc → physically lifts it */}
            <Path
              path={prog}
              style="stroke"
              strokeWidth={STROKE + 6}
              color={glowColor}
              strokeCap="round"
            >
              <BlurMask blur={7} style="normal" />
            </Path>

            {/*
             * Main arc — SweepGradient spans the FULL 270° range (start to end)
             * so low scores show the red zone, mid shows orange, high shows green.
             * Visually: the right edge of the filled arc tells you the quality.
             */}
            <Path
              path={prog}
              style="stroke"
              strokeWidth={STROKE}
              strokeCap="round"
            >
              <SweepGradient
                c={vec(CX, CY)}
                colors={[Col.low, Col.mid, Col.good]}
                positions={[0, 0.5, 1]}
                start={START_DEG}
                end={START_DEG + SWEEP_DEG}
              />
            </Path>

            {/* Gloss — convex sheen on leading portion */}
            {glint && (
              <Path
                path={glint}
                style="stroke"
                strokeWidth={Math.max(STROKE * 0.26, 2)}
                color="rgba(255,255,255,0.34)"
                strokeCap="round"
              >
                <BlurMask blur={1} style="normal" />
              </Path>
            )}
          </Group>
        )}

      </Canvas>

      {/* Center label — RN Text over Canvas */}
      <View style={[StyleSheet.absoluteFill, sg.center]}>
        <Text style={sg.num}>{numLabel}</Text>
        <Text style={sg.lbl}>{qualLabel}</Text>
      </View>
    </View>
  );
}

const sg = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  num:    { fontSize: Sz.h2, fontWeight: W.bold, color: Col.text, letterSpacing: -1, lineHeight: 28 },
  lbl:    { fontSize: Sz.caption, fontWeight: W.medium, color: Col.textSub },
});
