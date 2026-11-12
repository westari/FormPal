/**
 * components/RingLight.tsx
 *
 * The front-camera "flash": a ring light. An even, soft white glow hugs the whole screen edge (top, sides, bottom) and stays solid white for a good way in, then fades
 * to nothing toward the middle, so it lights the face but never covers the body or the framing guide (the guide box sits
 * further in than RING_LIGHT.depth, and the glow is already almost clear by then). It cannot be touched.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RING_LIGHT } from '../lib/screenFlash';

const stopsOf = () => RING_LIGHT.stops.map(s => `rgba(255,255,255,${s.a})`) as [string, string, ...string[]];
const locs = () => RING_LIGHT.stops.map(s => s.at) as [number, number, ...number[]];

export default function RingLight() {
  const d = RING_LIGHT.depth, dv = RING_LIGHT.depthTopBottom;
  const c = stopsOf(), l = locs();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={c} locations={l} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: dv }} />
      <LinearGradient colors={c} locations={l} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0 }} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: dv }} />
      <LinearGradient colors={c} locations={l} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: d }} />
      <LinearGradient colors={c} locations={l} start={{ x: 1, y: 0.5 }} end={{ x: 0, y: 0.5 }} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: d }} />
    </View>
  );
}
