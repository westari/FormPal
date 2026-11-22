/**
 * components/StandardGlass.tsx
 *
 * THE GLASS STANDARD (Ari 2026-11-22). The camera screen's "Finish" pill is the look he calls perfect liquid glass:
 * real Liquid Glass, variant "regular", colour scheme "dark", no tint, and (where real glass is not available) the fallback fill
 * rgba(40,41,48,0.55). That exact recipe lives here, once. Use it for ALL new glass: calendar, sheets, pills.
 * Text and icons on it are white.
 *
 * app/formcheck.tsx draws the Finish pill with the same three values (kept there as it is, it is a camera screen):
 *   colorScheme="dark"  fallbackColor="rgba(40,41,48,0.55)"  variant "regular" (the LiquidGlass default)
 */
import React from 'react';
import LiquidGlass, { LiquidGlassButton, type LiquidGlassProps, type LiquidGlassButtonProps } from './LiquidGlass';

export const STANDARD_GLASS = {
  variant: 'regular',
  colorScheme: 'dark',
  fallbackColor: 'rgba(40,41,48,0.55)',
} as const;

/** The text colour that goes on the standard glass. */
export const STANDARD_GLASS_INK = '#FFFFFF';
/** A softer white for second lines on the standard glass. */
export const STANDARD_GLASS_MUTED = 'rgba(255,255,255,0.68)';

export function StandardGlass(props: Omit<LiquidGlassProps, 'variant' | 'colorScheme' | 'fallbackColor' | 'tintColor'>) {
  return <LiquidGlass {...props} variant={STANDARD_GLASS.variant} colorScheme={STANDARD_GLASS.colorScheme} fallbackColor={STANDARD_GLASS.fallbackColor} />;
}

export function StandardGlassButton(props: Omit<LiquidGlassButtonProps, 'variant' | 'colorScheme' | 'fallbackColor' | 'tintColor'>) {
  return <LiquidGlassButton {...props} variant={STANDARD_GLASS.variant} colorScheme={STANDARD_GLASS.colorScheme} fallbackColor={STANDARD_GLASS.fallbackColor} />;
}

export default StandardGlass;
