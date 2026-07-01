import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  vec,
  LinearGradient as SkiaLinearGradient,
} from '@shopify/react-native-skia';
import { W } from '../constants/theme';

interface RingProps {
  progress:     number;
  colors:       [string, string];
  gradientId:   string; // kept for API compat — unused in Skia
  value:        string;
  label:        string;
  unit?:        string;
  size?:        number;
  strokeWidth?: number;
}

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
  gradientId: _,
  value,
  label,
  unit,
  size        = 80,
  strokeWidth = 9,
}: RingProps) {
  const r      = (size - strokeWidth) / 2;
  const cx     = size / 2;
  const cy     = size / 2;
  const pct    = Math.min(1, Math.max(0, progress));
  const sweep  = pct * 360;
  const sw     = strokeWidth;

  const { track, prog, shimmer } = useMemo(() => ({
    track:   makeArc(cx, cy, r, -90, 360),
    prog:    pct > 0 ? makeArc(cx, cy, r, -90, Math.max(sweep, 3)) : null,
    // Subtle white shimmer arc on the outer edge of the progress band
    shimmer: pct > 0 ? makeArc(cx, cy, r + 2, -90, Math.max(sweep * 0.55, 3)) : null,
  }), [cx, cy, r, pct, sweep]);

  return (
    <View style={s.wrap}>
      <View style={{ width: size, height: size }}>
        <Canvas style={StyleSheet.absoluteFill}>

          {/* Clean grey track — no blur, no shadow */}
          <Path
            path={track}
            style="stroke"
            strokeWidth={sw}
            color="#e5e7ed"
            strokeCap="round"
          />

          {/* Progress arc — diagonal LinearGradient avoids sweep-gradient banding */}
          {prog && (
            <Path path={prog} style="stroke" strokeWidth={sw} strokeCap="round">
              <SkiaLinearGradient
                start={vec(cx - r, cy - r)}
                end={vec(cx + r, cy + r)}
                colors={[colors[0], colors[1]]}
              />
            </Path>
          )}

          {/* White shimmer on the outer rim of the leading arc */}
          {shimmer && (
            <Path
              path={shimmer}
              style="stroke"
              strokeWidth={1.5}
              color="rgba(255,255,255,0.5)"
              strokeCap="round"
            />
          )}

        </Canvas>

        {/* Center value + unit */}
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <View style={s.valueRow}>
            <Text style={s.value}>{value}</Text>
            {unit ? <Text style={s.unit}>{unit}</Text> : null}
          </View>
        </View>
      </View>

      <Text style={s.label} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:     { alignItems: 'center', gap: 13 },
  center:   { alignItems: 'center', justifyContent: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end' },
  value: {
    fontSize:      27,
    fontWeight:    W.bold,
    color:         '#0b1020',
    letterSpacing: -1,
    lineHeight:    30,
  },
  unit: {
    fontSize:      12,
    fontWeight:    W.bold,
    color:         '#c0c5ce',
    marginLeft:    1,
    lineHeight:    16,
    paddingBottom: 2,
  },
  label: {
    fontSize:      11.5,
    fontWeight:    W.semi,
    color:         '#8a8f9c',
    textAlign:     'center',
    letterSpacing: 0.2,
  },
});
