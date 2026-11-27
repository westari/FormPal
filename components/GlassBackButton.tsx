/**
 * components/GlassBackButton.tsx
 *
 * The shared round back button: real Liquid Glass (components/LiquidGlass.tsx, the same material as the tab bar and the + button) with a
 * chevron. Where the system has no glass it is an honest flat translucent circle. Used by the workout preview; any native screen that needs a
 * back button should use this one.
 *
 * (Ari 2026-11-27) The 'standard' button (onboarding and paywall) keeps its real Liquid Glass, but its arrow is BLACK so it is easy to see on those light
 * pages. Where the system has no glass, its flat fallback is a light disc for the same reason (a black arrow on the old dark fallback could not be seen).
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { LiquidGlassButton } from './LiquidGlass';
import { STANDARD_GLASS } from './StandardGlass';

export const GLASS_BACK_SIZE = 40;
export const BACK_ARROW = { d: 'M8.2 1.8 1.8 8.5l6.4 6.7', w: 10, h: 17 };
/** the standard back button's arrow (onboarding, paywall): black */
export const STANDARD_BACK_ARROW_COLOR = '#000000';
const LIGHT_FALLBACK = 'rgba(255,255,255,0.82)';

export default function GlassBackButton({ onPress, scheme = 'light' }: { onPress: () => void; /** 'standard' = THE glass standard (components/StandardGlass.tsx: the camera Finish pill's real glass) with a BLACK arrow */ scheme?: 'light' | 'dark' | 'standard' }) {
  const standard = scheme === 'standard';
  const dark = scheme === 'dark';
  const arrow = standard ? STANDARD_BACK_ARROW_COLOR : dark ? '#ffffff' : '#111114';
  return (
    <LiquidGlassButton
      onPress={onPress}
      radius={GLASS_BACK_SIZE / 2}
      colorScheme={standard ? STANDARD_GLASS.colorScheme : scheme}
      fallbackColor={standard ? LIGHT_FALLBACK : dark ? 'rgba(60,62,72,0.55)' : LIGHT_FALLBACK}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={{ width: GLASS_BACK_SIZE, height: GLASS_BACK_SIZE, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* the exact arrow every back button in the app uses (the design files' own): a 10 x 17 chevron, 2.4 stroke, round ends */}
      <Svg width={BACK_ARROW.w} height={BACK_ARROW.h} viewBox="0 0 10 17" fill="none" style={{ transform: [{ translateX: -1.5 }] }}>
        <Path d={BACK_ARROW.d} stroke={arrow} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </LiquidGlassButton>
  );
}
