/**
 * components/onboarding/SpaceBackground.tsx
 *
 * A dark "space" backdrop for the Save your progress screen (Ari's reference: a night sky with stars and the bright curved edge of a planet, with a glint
 * of light on the rim). Drawn with react-native-svg only (no image file): a near-black sky, a seeded field of stars (the same stars every time), a dark
 * planet whose top edge curves across the screen about a third of the way down, a warm rim light that is brightest at the glint, a soft glow and a thin
 * horizontal flare through the glint. The bottom of the planet fades into the screen's own near-black so the buttons sit on a calm dark area.
 */
import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Circle, Ellipse } from 'react-native-svg';

export const SPACE_BG = '#0d0d11';

// a tiny seeded generator, so the stars are the same on every launch
function rng(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export default function SpaceBackground() {
  const { width: W, height: H } = useWindowDimensions();
  const horizonY = Math.round(H * 0.3);            // where the top of the planet's edge is (at its middle)
  const R = W * 1.45;                               // the planet's radius: a gentle curve across the screen
  const cx = W / 2, cy = horizonY + R;
  const sunX = W * 0.72;
  const sunY = cy - Math.sqrt(Math.max(0, R * R - (sunX - cx) * (sunX - cx))); // the rim's height at the glint
  const rnd = rng(20260525);
  const stars = Array.from({ length: 80 }, () => ({ x: rnd() * W, y: rnd() * (horizonY + 10), r: 0.5 + rnd() * 1.0, o: 0.25 + rnd() * 0.65 }))
    .filter((st) => { const rimY = cy - Math.sqrt(Math.max(0, R * R - (st.x - cx) * (st.x - cx))); return st.y < rimY - 6; });
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#04050a" />
          <Stop offset="0.4" stopColor="#0a0b12" />
          <Stop offset="1" stopColor={SPACE_BG} />
        </LinearGradient>
        <LinearGradient id="planet" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#242021" />
          <Stop offset="0.16" stopColor="#141315" />
          <Stop offset="0.4" stopColor={SPACE_BG} />
          <Stop offset="1" stopColor={SPACE_BG} />
        </LinearGradient>
        {/* the rim light: dim at both ends, brightest near the glint */}
        <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#d9c9ad" stopOpacity="0.55" />
          <Stop offset="0.45" stopColor="#f3e3c6" stopOpacity="0.8" />
          <Stop offset="0.72" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="1" stopColor="#d9c9ad" stopOpacity="0.45" />
        </LinearGradient>
        <RadialGradient id="glint" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="0.25" stopColor="#fff2dc" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="flare" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#ffe9c8" stopOpacity="0" />
          <Stop offset="0.72" stopColor="#fff4e0" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#ffe9c8" stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id="haze" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor="#ffe2b8" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#ffe2b8" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#sky)" />
      {stars.map((st, i) => <Circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#ffffff" opacity={st.o} />)}
      {/* a thin haze above the horizon */}
      <Ellipse cx={sunX} cy={sunY - 6} rx={W * 0.55} ry={46} fill="url(#haze)" />
      {/* the planet, its soft outer glow and its bright edge */}
      <Circle cx={cx} cy={cy} r={R} fill="url(#planet)" />
      <Circle cx={cx} cy={cy} r={R + 3} fill="none" stroke="url(#rim)" strokeWidth={7} opacity={0.18} />
      <Circle cx={cx} cy={cy} r={R} fill="none" stroke="url(#rim)" strokeWidth={2} />
      {/* the glint and the flare through it */}
      <Rect x={0} y={sunY - 0.75} width={W} height={1.5} fill="url(#flare)" />
      <Ellipse cx={sunX} cy={sunY} rx={64} ry={14} fill="url(#glint)" />
      <Circle cx={sunX} cy={sunY} r={3} fill="#ffffff" />
    </Svg>
  );
}
