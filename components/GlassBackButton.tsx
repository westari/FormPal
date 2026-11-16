/**
 * components/GlassBackButton.tsx
 *
 * The shared round back button: real Liquid Glass (components/LiquidGlass.tsx, the same material as the tab bar and the + button) with a
 * chevron. Where the system has no glass it is an honest flat translucent circle. Used by the workout preview; any native screen that needs a
 * back button should use this one.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { LiquidGlassButton } from './LiquidGlass';

export const GLASS_BACK_SIZE = 40;
export const BACK_ARROW = { d: 'M8.2 1.8 1.8 8.5l6.4 6.7', w: 10, h: 17 };

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
      {/* the exact arrow every back button in the app uses (the design files' own): a 10 x 17 chevron, 2.4 stroke, round ends */}
      <Svg width={BACK_ARROW.w} height={BACK_ARROW.h} viewBox="0 0 10 17" fill="none">
        <Path d={BACK_ARROW.d} stroke={dark ? '#ffffff' : '#111114'} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </LiquidGlassButton>
  );
}
