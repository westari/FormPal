/**
 * components/LiquidGlass.tsx
 *
 * The REAL Apple Liquid Glass material — iOS 26's UIGlassEffect /
 * UIVisualEffectView, via the `expo-glass-effect` native module. This is
 * the same underlying system material the bottom tab bar gets for free
 * (app/(tabs)/_layout.tsx uses expo-router's NativeTabs, which renders a
 * genuine native UITabBar — iOS itself draws real Liquid Glass on it, no
 * library involved there). `expo-glass-effect` exposes that SAME native
 * effect as a normal view you can wrap anything in.
 *
 * This is NOT components/GlassSurface.tsx (BlurView + hand-painted
 * gradients standing in for glass — the "fake" approximation). LiquidGlass
 * renders the actual system material: real specular highlights, real
 * refraction/light-bending, and it reacts to what's underneath and (with
 * `interactive`) to touch, none of which a BlurView fake can do.
 *
 * FALLBACK — iOS <26, Android, web, or before this native module has been
 * built into the app (see BUILD NOTE) all render a plain, honestly-flat
 * translucent surface instead. No blur standing in for the real thing.
 *
 * BUILD NOTE — expo-glass-effect was already in package.json but nothing in
 * the app imports it yet, so its native module has never been compiled into
 * a build. Writing and using this component is pure JS (reload). But the
 * actual glass rendering can't turn on until the next EAS build links the
 * native module in — until then GLASS_SUPPORTED is false and every
 * LiquidGlass uses the plain fallback automatically. No code changes needed
 * on either side of that build; it just starts rendering real glass once
 * the binary has it.
 */

import React from 'react';
import {
  Platform, Pressable, View,
  type PressableProps, type StyleProp, type ViewProps, type ViewStyle,
} from 'react-native';
import { GlassView, isLiquidGlassAvailable, type GlassColorScheme, type GlassStyle } from 'expo-glass-effect';

// Computed once at module load. try/catch matters: calling into a native
// module that isn't linked into this build THROWS, it doesn't return false
// — that's what makes every LiquidGlass safe to ship immediately, before
// the build that actually links expo-glass-effect in.
function computeGlassSupported(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}
export const GLASS_SUPPORTED = computeGlassSupported();

export type LiquidGlassVariant = GlassStyle; // 'regular' | 'clear' | 'none'

export interface LiquidGlassProps extends ViewProps {
  /** Corner radius — shapes the glass material itself, not just a clip mask. */
  radius?: number;
  /** 'regular' (default — frosted) or 'clear' (more see-through; best floating over busy video/media, same as Apple uses for media-overlay controls). */
  variant?: LiquidGlassVariant;
  /** Optional tint color, e.g. your accent at low opacity. */
  tintColor?: string;
  /** Real native touch response (shimmer/morph on press). Turn on for anything tappable — LiquidGlassButton below already does this. */
  interactive?: boolean;
  /** Overrides system light/dark for the glass appearance. Default follows the system. */
  colorScheme?: GlassColorScheme;
  /** Fill used ONLY by the plain fallback (no real glass available). Default: a neutral translucent surface — deliberately not a blur fake. */
  fallbackColor?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export default function LiquidGlass({
  radius = 20,
  variant = 'regular',
  tintColor,
  interactive = false,
  colorScheme = 'auto',
  fallbackColor,
  style,
  children,
  ...rest
}: LiquidGlassProps) {
  if (!GLASS_SUPPORTED) {
    return (
      <View
        style={[
          {
            borderRadius: radius,
            overflow: 'hidden',
            backgroundColor: fallbackColor ?? (colorScheme === 'dark' ? 'rgba(28,28,30,0.72)' : 'rgba(255,255,255,0.72)'),
          },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }
  return (
    <GlassView
      glassEffectStyle={variant}
      tintColor={tintColor}
      isInteractive={interactive}
      colorScheme={colorScheme}
      style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
      {...rest}
    >
      {children}
    </GlassView>
  );
}

// ── LiquidGlassButton — drop-in tappable glass ─────────────────────────────
// A Pressable with a LiquidGlass fill, `interactive` on by default so a
// supported device gets the real native press response (shimmer/morph);
// unsupported devices get a plain opacity dim instead, so it never looks
// dead either way.

export interface LiquidGlassButtonProps extends Omit<PressableProps, 'style'> {
  radius?: number;
  variant?: LiquidGlassVariant;
  tintColor?: string;
  colorScheme?: GlassColorScheme;
  fallbackColor?: string;
  /** Style for the hit-target Pressable itself — use this for absolute positioning/placement. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Style for the glass fill (size, shape) — same slot `style` fills on LiquidGlass. */
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function LiquidGlassButton({
  radius = 22,
  variant = 'regular',
  tintColor,
  colorScheme = 'auto',
  fallbackColor,
  containerStyle,
  style,
  children,
  disabled,
  ...pressableProps
}: LiquidGlassButtonProps) {
  return (
    <Pressable disabled={disabled} style={containerStyle} {...pressableProps}>
      {({ pressed }) => (
        <LiquidGlass
          radius={radius}
          variant={variant}
          tintColor={tintColor}
          colorScheme={colorScheme}
          fallbackColor={fallbackColor}
          interactive
          style={[style, pressed && !GLASS_SUPPORTED ? { opacity: 0.7 } : null]}
        >
          {children}
        </LiquidGlass>
      )}
    </Pressable>
  );
}

export { isLiquidGlassAvailable };
