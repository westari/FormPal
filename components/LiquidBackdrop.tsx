/**
 * components/LiquidBackdrop.tsx
 *
 * The muscle-ranks page's "liquid glass" ambience, generalised: solid
 * saturated colour circles drifting in a slow loop, with a real native
 * BlurView laid OVER them (not just low opacity) so colour diffuses through
 * a frosted surface the way it does on the ranks screen. Glass cards
 * (components/GlassSurface) sit on top of this and pick up the moving colour.
 *
 * Drop-in replacement for <AppBackground /> on any light-theme screen that
 * should read as Liquid Glass rather than a flat wash.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

function useDrift(duration: number, delay = 0, reverse = false) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, delay, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: reverse ? [18, -18] : [-18, 18] }) },
      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: reverse ? [-12, 12] : [12, -12] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
    ],
  };
}

export default function LiquidBackdrop() {
  const d1 = useDrift(9500);
  const d2 = useDrift(11500, 500, true);
  const d3 = useDrift(13500, 900);
  const d4 = useDrift(10500, 300, true);
  const d5 = useDrift(12500, 1200);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* soft base so the frost has a light ground even where no blob sits */}
      <LinearGradient
        colors={['#EDF1FB', '#E7ECFB', '#EAF4F4', '#F6EFE9']}
        locations={[0, 0.4, 0.72, 1]}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[bd.blob, { width: 460, height: 460, borderRadius: 230, top: -190, left: -160, backgroundColor: '#5A6CFF', opacity: 0.42 }, d1]} />
      <Animated.View style={[bd.blob, { width: 360, height: 360, borderRadius: 180, top: -100, right: -130, backgroundColor: '#FF8A5C', opacity: 0.4 }, d2]} />
      <Animated.View style={[bd.blob, { width: 420, height: 420, borderRadius: 210, bottom: -180, left: -130, backgroundColor: '#2FCFC0', opacity: 0.4 }, d3]} />
      <Animated.View style={[bd.blob, { width: 340, height: 340, borderRadius: 170, bottom: -110, right: -120, backgroundColor: '#8B5CF6', opacity: 0.4 }, d4]} />
      <Animated.View style={[bd.blob, { width: 300, height: 300, borderRadius: 150, top: '40%', left: '30%', backgroundColor: '#4FC3FF', opacity: 0.3 }, d5]} />
      <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
    </View>
  );
}

const bd = StyleSheet.create({
  blob: { position: 'absolute' },
});
