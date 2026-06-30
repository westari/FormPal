import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import type { ViewStyle } from 'react-native';
import { Col, Elev, R } from '../constants/theme';

type ElevationTier = 'low' | 'medium' | 'high';

interface CardProps {
  children:  React.ReactNode;
  elevation?: ElevationTier;
  radius?:    number;
  style?:     ViewStyle;
}

/**
 * White floating card with a multi-layer shadow system.
 *
 * Shadow recipe (Ahlin/Comeau layered approach):
 *   - contact layer:  tight, ~0.07–0.10 opacity — sharp base definition
 *   - body layer:     medium blur, ~0.05–0.09  — main volume
 *   - ambient layer:  wide, ~0.03–0.05         — soft diffusion
 *   - wash (high only): very wide, ~0.04       — atmospheric bloom
 *
 * Shadow tint: rgba(20,20,40,…) — cool blue cast, not pure black.
 * Uses RN `boxShadow` (new arch, enabled) on iOS; native elevation on Android.
 *
 * Usage:
 *   <Card>…</Card>                    ← medium (default)
 *   <Card elevation="low">…</Card>   ← subtle inner section
 *   <Card elevation="high">…</Card>  ← hero / leading card
 */
export default function Card({
  children,
  elevation = 'medium',
  radius    = R.card,
  style,
}: CardProps) {
  const tier = Elev[elevation];

  const shadowStyle = Platform.OS === 'ios'
    ? ({ boxShadow: tier.shadow } as unknown as ViewStyle)
    : ({ elevation: tier.android, backgroundColor: Col.card } as ViewStyle);

  return (
    <View style={[styles.base, { borderRadius: radius }, shadowStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Col.card,
  },
});
