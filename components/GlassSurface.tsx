/**
 * components/GlassSurface.tsx
 *
 * The light frosted-glass panel from app/recap.tsx ("after workout" screen),
 * extracted so other screens (the Train tab, the exercise picker) can use the
 * exact same treatment. Same rationale as components/AppBackground.tsx:
 * NOT rewired into recap.tsx — that file keeps its own local copy; the tokens
 * below are copied verbatim so the two render identically.
 *
 * Shadow lives on the OUTER (unclipped) wrapper — shadow + overflow:hidden on
 * one view silently clips the shadow away on iOS, so the rounded-corner clip
 * happens on an inner view instead.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const GLASS_FILL_HI  = 'rgba(255,255,255,0.62)';
const GLASS_FILL_LO  = 'rgba(255,255,255,0.34)';
const GLASS_HIGHLIGHT = 'rgba(255,255,255,0.95)';
const GLASS_EDGE     = 'rgba(255,255,255,0.7)';
const GLASS_SHADOW   = 'rgba(28,44,110,0.30)';

export default function GlassSurface({
  style, radius, children, shadow = true, fillOpacity = 'high',
}: {
  style?:  any;
  radius:  number;
  children: React.ReactNode;
  shadow?:  boolean;
  fillOpacity?: 'high' | 'low';
}) {
  const outerFlex = style?.flex != null ? { flex: style.flex } : undefined;
  return (
    <View style={shadow ? [gs.shadowWrap, { borderRadius: radius, shadowColor: GLASS_SHADOW }, outerFlex] : outerFlex}>
      <View style={[{ borderRadius: radius, borderCurve: 'continuous', overflow: 'hidden' }, style]}>
        <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={[fillOpacity === 'high' ? GLASS_FILL_HI : GLASS_FILL_LO, GLASS_FILL_LO]}
          start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[GLASS_HIGHLIGHT, 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          style={[StyleSheet.absoluteFill, { borderRadius: radius, borderCurve: 'continuous', borderWidth: 1, borderColor: GLASS_EDGE }]}
          pointerEvents="none"
        />
        {children}
      </View>
    </View>
  );
}

const gs = StyleSheet.create({
  shadowWrap: {
    shadowOffset: { width: 0, height: 14 }, shadowOpacity: 1, shadowRadius: 26, elevation: 8,
  },
});
