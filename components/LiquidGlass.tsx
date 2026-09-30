/**
 * components/LiquidGlass.tsx
 *
 * The REAL Apple Liquid Glass material — iOS 26's UIGlassEffect /
 * UIVisualEffectView — via Callstack's `@callstack/liquid-glass` native
 * module (LiquidGlassView). This is the same underlying system material the
 * bottom tab bar gets for free (app/(tabs)/_layout.tsx uses expo-router's
 * NativeTabs, which renders a genuine native UITabBar — iOS itself draws
 * real Liquid Glass on it, no library involved there).
 *
 * `@callstack/liquid-glass` is the ONE liquid-glass dependency for this
 * project from now on. Do NOT reintroduce `expo-glass-effect` — this file
 * used to wrap it; it's been replaced and is now unused.
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
 * BUILD NOTE — the native module is only linked once an EAS build that
 * includes it is made (requires Xcode >= 26, RN 0.80+). `@callstack/liquid-glass`
 * reads a TurboModule constant at import time, which THROWS when the module
 * isn't in the current binary — so it's pulled in with require() inside a
 * try/catch below. Until that build exists, GLASS_SUPPORTED is false and
 * every LiquidGlass uses the plain fallback automatically. No code changes
 * needed on either side of that build; real glass just starts rendering
 * once the binary has it.
 */

import React from 'react';
import {
  Platform, Pressable, View,
  type PressableProps, type StyleProp, type ViewProps, type ViewStyle,
} from 'react-native';

// require() inside try/catch on purpose: @callstack/liquid-glass reads a
// TurboModule constant at import time (TurboModuleRegistry.getEnforcing),
// which throws when the native module isn't linked into the current build.
// A top-level `import` would crash the app before that build exists; this
// keeps every LiquidGlass safe to ship immediately.
let NativeLiquidGlassView: React.ComponentType<any> | null = null;
let nativeGlassSupported = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lib = require('@callstack/liquid-glass');
  NativeLiquidGlassView = lib.LiquidGlassView ?? null;
  nativeGlassSupported = lib.isLiquidGlassSupported === true;
} catch {
  NativeLiquidGlassView = null;
  nativeGlassSupported = false;
}

export const GLASS_SUPPORTED =
  Platform.OS === 'ios' && nativeGlassSupported && NativeLiquidGlassView != null;

export type LiquidGlassVariant = 'regular' | 'clear' | 'none';
export type LiquidGlassColorScheme = 'auto' | 'light' | 'dark' | 'system';

// @callstack/liquid-glass uses 'system'; keep 'auto' as our public default
// (existing call sites rely on it) and map it through.
function mapScheme(s: LiquidGlassColorScheme): 'light' | 'dark' | 'system' {
  return s === 'auto' ? 'system' : s;
}

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
  colorScheme?: LiquidGlassColorScheme;
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
  if (!GLASS_SUPPORTED || !NativeLiquidGlassView) {
    return (
      <View
        style={[
          {
            borderRadius: radius,
            overflow: 'hidden',
            backgroundColor:
              fallbackColor ??
              (mapScheme(colorScheme) === 'dark' ? 'rgba(28,28,30,0.72)' : 'rgba(255,255,255,0.72)'),
          },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }
  const Glass = NativeLiquidGlassView;
  return (
    <Glass
      effect={variant}
      tintColor={tintColor}
      interactive={interactive}
      colorScheme={mapScheme(colorScheme)}
      style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
      {...rest}
    >
      {children}
    </Glass>
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
  colorScheme?: LiquidGlassColorScheme;
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

export function isLiquidGlassAvailable() {
  return GLASS_SUPPORTED;
}
