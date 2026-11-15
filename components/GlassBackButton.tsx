/**
 * components/GlassBackButton.tsx
 *
 * The shared round back button: real Liquid Glass (components/LiquidGlass.tsx, the same material as the tab bar and the + button) with a
 * chevron. Where the system has no glass it is an honest flat translucent circle. Used by the workout preview; any native screen that needs a
 * back button should use this one.
 */
import React from 'react';
import { SymbolView } from 'expo-symbols';
import { LiquidGlassButton } from './LiquidGlass';

export const GLASS_BACK_SIZE = 40;

export default function GlassBackButton({ onPress, scheme = 'light' }: { onPress: () => void; scheme?: 'light' | 'dark' }) {
  const dark = scheme === 'dark';
  return (
    <LiquidGlassButton
      onPress={onPress}
      radius={GLASS_BACK_SIZE / 2}
      colorScheme={scheme}
      fallbackColor={dark ? 'rgba(60,62,72,0.55)' : 'rgba(255,255,255,0.82)'}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={{ width: GLASS_BACK_SIZE, height: GLASS_BACK_SIZE, alignItems: 'center', justifyContent: 'center' }}
    >
      <SymbolView name="chevron.left" size={17} weight="semibold" tintColor={dark ? '#ffffff' : '#111114'} type="monochrome" style={{ width: 17, height: 17 }} />
    </LiquidGlassButton>
  );
}
