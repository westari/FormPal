/**
 * components/CueOrb.tsx
 *
 * Cue's orb for native screens: the same glossy orb the Home tab shows (lib/cueOrb.ts owns the web look), and it MOVES the
 * way the design's orb does: the white glow and the purple core drift around inside it (the design's hm-orb-a / hm-orb-b,
 * 6.5s and 8s), the whole orb breathes (scale 1 -> 1.045, 4.2s), the blue halo pulses (3.6s) and its shape wobbles a little
 * (the design's 7s morph). Everything runs on the native driver (transform / opacity only).
 *
 * Layers, bottom to top: halo, [clip: body gradient, drifting white glow, drifting purple core, rim shading], crisp highlight.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

const loop = (v: Animated.Value, steps: { to: number; ms: number }[]) =>
  Animated.loop(Animated.sequence(steps.map(s => Animated.timing(v, { toValue: s.to, duration: s.ms, easing: Easing.inOut(Easing.ease), useNativeDriver: true }))));

/** One drifting layer: x / y (fraction of the orb) and scale, looping through the design's keyframes. */
function useDrift(totalMs: number, frames: [number, number, number][]) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = loop(p, [{ to: 1, ms: totalMs }, { to: 0, ms: 0 }]);
    a.start();
    return () => a.stop();
  }, [p, totalMs]);
  const input = frames.map((_, i) => i / (frames.length - 1));
  return {
    x: p.interpolate({ inputRange: input, outputRange: frames.map(f => f[0]) }),
    y: p.interpolate({ inputRange: input, outputRange: frames.map(f => f[1]) }),
    s: p.interpolate({ inputRange: input, outputRange: frames.map(f => f[2]) }),
  };
}

/** halo = false: just the orb, a full clean circle (no glow disc around it). The halo's own drawing is wider than its box, so
 *  where it is on it shows as a cut-off glow, which is what the plus menu must not have. */
export default function CueOrb({ size = 28, halo: withHalo = true }: { size?: number; halo?: boolean }) {
  const breathe = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = [
      loop(breathe, [{ to: 1, ms: 2100 }, { to: 0, ms: 2100 }]),
      loop(halo, [{ to: 1, ms: 1800 }, { to: 0, ms: 1800 }]),
      loop(wobble, [{ to: 1, ms: 3500 }, { to: 0, ms: 3500 }]),
    ];
    a.forEach(x => x.start());
    return () => a.forEach(x => x.stop());
  }, [breathe, halo, wobble]);

  // the design's drift keyframes (translate % of the layer, scale), see hm-orb-a / hm-orb-b
  const white = useDrift(6500, [[-0.18, 0.22, 1], [0.24, -0.08, 1.25], [-0.06, -0.26, 0.9], [-0.18, 0.22, 1]]);
  const purple = useDrift(8000, [[0.22, -0.2, 1.1], [-0.24, 0.06, 0.85], [0.1, 0.26, 1.2], [0.22, -0.2, 1.1]]);

  const body = withHalo ? size * 0.78 : size; // the orb body inside its halo (or the whole box when there is no halo)
  const off = (size - body) / 2;
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const wobX = wobble.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] });
  const wobY = wobble.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const layer = (d: ReturnType<typeof useDrift>, w: number) => ({
    position: 'absolute' as const, left: (body - w) / 2, top: (body - w) / 2, width: w, height: w,
    transform: [{ translateX: Animated.multiply(d.x, w) }, { translateY: Animated.multiply(d.y, w) }, { scale: d.s }],
  });

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale: breatheScale }] }} pointerEvents="none">
      {/* halo */}
      {withHalo && <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, opacity: haloOpacity }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="halo" cx="50" cy="54" r="50" gradientUnits="userSpaceOnUse">
              <Stop offset="0.62" stopColor="#78a8ff" stopOpacity="0.5" /><Stop offset="1" stopColor="#78a8ff" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="54" r="50" fill="url(#halo)" />
        </Svg>
      </Animated.View>}
      {/* the body: clipped to a (slightly wobbling) circle */}
      <Animated.View style={{ position: 'absolute', left: off, top: off, width: body, height: body, borderRadius: body / 2, overflow: 'hidden', transform: [{ scaleX: wobX }, { scaleY: wobY }] }}>
        <Svg width={body} height={body} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id="body" cx="50" cy="54.2" r="74" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#b9d2ff" /><Stop offset="0.55" stopColor="#8db4ff" /><Stop offset="1" stopColor="#6a97f2" />
            </RadialGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#body)" />
        </Svg>
        <Animated.View style={layer(white, body * 0.7)}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs><RadialGradient id="white" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor="#ffffff" stopOpacity="0.95" /><Stop offset="0.68" stopColor="#ffffff" stopOpacity="0" /></RadialGradient></Defs>
            <Circle cx="50" cy="50" r="50" fill="url(#white)" />
          </Svg>
        </Animated.View>
        <Animated.View style={layer(purple, body * 0.66)}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs><RadialGradient id="purple" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor="#8460ff" stopOpacity="0.75" /><Stop offset="0.7" stopColor="#8460ff" stopOpacity="0" /></RadialGradient></Defs>
            <Circle cx="50" cy="50" r="50" fill="url(#purple)" />
          </Svg>
        </Animated.View>
        <Svg width={body} height={body} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="bottom" x1="0" y1="0" x2="0" y2="1"><Stop offset="0.6" stopColor="#4070e8" stopOpacity="0" /><Stop offset="1" stopColor="#4070e8" stopOpacity="0.32" /></LinearGradient>
            <LinearGradient id="top" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#ffffff" stopOpacity="0.5" /><Stop offset="0.22" stopColor="#ffffff" stopOpacity="0" /></LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#bottom)" />
          <Rect width="100" height="100" fill="url(#top)" />
          <Ellipse cx="38" cy="22" rx="18" ry="11" fill="#ffffff" fillOpacity="0.88" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

export const CUE_ORB_ANIMATED_LAYERS = ['halo pulse', 'breathe', 'shape wobble', 'white glow drift', 'purple core drift'];
