/**
 * components/onboarding/GymBackground.tsx
 *
 * A dark gym backdrop for the Save your progress screen: the back wall of a gym in low light, drawn with react-native-svg only (no image file). A warm
 * spotlight from above, a two-shelf dumbbell rack across the wall, a barbell with plates on a stand at each side, kettlebells on the floor, and a rubber floor
 * with soft perspective lines that fades into the screen's own near-black so the logo and the buttons sit on a calm dark area. Everything is a quiet
 * dark-on-dark silhouette with a thin light edge, so the white logo and the buttons stay the loudest things on screen.
 */
import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Circle, Ellipse, Line, G, Path } from 'react-native-svg';

export const GYM_BG = '#0c0c10';
const BODY = '#23232a';
const EDGE = 'rgba(255,255,255,0.17)';
const PLATE = '#2a2a32';

// one dumbbell: a handle with a heavy head at each end (sizes in a small grid so the rack reads as a real set from light to heavy)
function Dumbbell({ x, y, s }: { x: number; y: number; s: number }) {
  const hw = 9 + s * 2, hh = 26 + s * 5; // head width and height grow with the weight
  return (
    <G>
      <Rect x={x - hw - 9} y={y - 3.5} width={(hw + 9) * 2} height={7} rx={3} fill={BODY} />
      <Rect x={x - hw - 9} y={y - hh / 2} width={hw} height={hh} rx={4.5} fill={BODY} stroke={EDGE} strokeWidth={0.8} />
      <Rect x={x + 9} y={y - hh / 2} width={hw} height={hh} rx={4.5} fill={BODY} stroke={EDGE} strokeWidth={0.8} />
    </G>
  );
}

function Kettlebell({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <G>
      <Path d={`M ${x - r * 0.55} ${y - r * 0.7} C ${x - r * 0.55} ${y - r * 1.75}, ${x + r * 0.55} ${y - r * 1.75}, ${x + r * 0.55} ${y - r * 0.7}`} fill="none" stroke={BODY} strokeWidth={r * 0.28} strokeLinecap="round" />
      <Circle cx={x} cy={y} r={r} fill={BODY} stroke={EDGE} strokeWidth={0.8} />
    </G>
  );
}

export default function GymBackground() {
  const { width: W, height: H } = useWindowDimensions();
  const wallBottom = Math.round(H * 0.5);            // where the floor starts
  const shelfY = [Math.round(H * 0.3), Math.round(H * 0.415)]; // the two shelves of the dumbbell rack
  const STEP = 58, n = Math.floor((W - 60) / STEP);   // dumbbells per shelf
  const x0 = (W - (n - 1) * STEP) / 2;
  const standH = Math.round(H * 0.2);
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0a0a0d" />
          <Stop offset="1" stopColor="#15151a" />
        </LinearGradient>
        <LinearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1a1a1f" />
          <Stop offset="0.5" stopColor="#101014" />
          <Stop offset="1" stopColor={GYM_BG} />
        </LinearGradient>
        <RadialGradient id="spot" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor="#ffe3b8" stopOpacity="0.30" />
          <Stop offset="0.55" stopColor="#ffd9a0" stopOpacity="0.10" />
          <Stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GYM_BG} stopOpacity="0" />
          <Stop offset="1" stopColor={GYM_BG} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      {/* the back wall and the floor */}
      <Rect x={0} y={0} width={W} height={wallBottom} fill="url(#wall)" />
      <Rect x={0} y={wallBottom} width={W} height={H - wallBottom} fill="url(#floor)" />
      <Line x1={0} y1={wallBottom} x2={W} y2={wallBottom} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
      {/* a warm spotlight from above onto the rack */}
      <Ellipse cx={W / 2} cy={H * 0.22} rx={W * 0.8} ry={H * 0.26} fill="url(#spot)" />
      {/* the rack: two shelves with a post at each end, a set of dumbbells on each */}
      {shelfY.map((y, r) => (
        <G key={r}>
          {Array.from({ length: n }, (_, i) => <Dumbbell key={i} x={x0 + i * STEP} y={y - 27} s={r === 0 ? i % 6 : (i + 3) % 6} />)}
          <Rect x={10} y={y} width={W - 20} height={9} rx={4} fill={BODY} stroke={EDGE} strokeWidth={0.9} />
        </G>
      ))}
      <Rect x={10} y={shelfY[0] - 14} width={9} height={shelfY[1] - shelfY[0] + 60} rx={4} fill={BODY} stroke={EDGE} strokeWidth={0.9} />
      <Rect x={W - 19} y={shelfY[0] - 14} width={9} height={shelfY[1] - shelfY[0] + 60} rx={4} fill={BODY} stroke={EDGE} strokeWidth={0.9} />
      {/* weight plates stacked at each side of the wall, half off the screen */}
      {[0, 1].map((side) => {
        const px = side === 0 ? 4 : W - 4;
        return (
          <G key={side}>
            {[64, 54, 44].map((r, k) => (
              <G key={k}>
                <Circle cx={px + (side === 0 ? -10 : 10) * k} cy={wallBottom - 70 + k * 6} r={r} fill={PLATE} stroke={EDGE} strokeWidth={1} />
                <Circle cx={px + (side === 0 ? -10 : 10) * k} cy={wallBottom - 70 + k * 6} r={r * 0.62} fill="none" stroke={EDGE} strokeWidth={0.9} />
                <Circle cx={px + (side === 0 ? -10 : 10) * k} cy={wallBottom - 70 + k * 6} r={r * 0.16} fill={BODY} stroke={EDGE} strokeWidth={0.9} />
              </G>
            ))}
          </G>
        );
      })}
      {/* kettlebells on the floor */}
      <Kettlebell x={W * 0.2} y={wallBottom + 44} r={26} />
      <Kettlebell x={W * 0.2 + 58} y={wallBottom + 50} r={20} />
      <Kettlebell x={W * 0.8} y={wallBottom + 46} r={23} />
      {/* soft floor lines (rubber mats) */}
      {[0.12, 0.3, 0.5, 0.7, 0.88].map((f, i) => (
        <Line key={i} x1={W * f} y1={wallBottom} x2={W * (0.5 + (f - 0.5) * 2.4)} y2={H} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
      ))}
      <Line x1={0} y1={wallBottom + (H - wallBottom) * 0.22} x2={W} y2={wallBottom + (H - wallBottom) * 0.22} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      <Line x1={0} y1={wallBottom + (H - wallBottom) * 0.5} x2={W} y2={wallBottom + (H - wallBottom) * 0.5} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      {/* everything below the middle fades into the screen's own dark */}
      <Rect x={0} y={H * 0.5} width={W} height={H * 0.5} fill="url(#fade)" />
    </Svg>
  );
}
