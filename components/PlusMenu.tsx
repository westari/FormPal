/**
 * components/PlusMenu.tsx
 *
 * The menu the "+" opens. Clean on purpose:
 *  - the page behind is BLURRED (a real native blur of the page itself, nothing painted on top, no new background)
 *  - every action is a real Liquid Glass button (components/LiquidGlass.tsx)
 *  - Cue has no button at all: just its orb (components/CueOrb.tsx), the same orb as everywhere else
 * It is drawn by GlassTabBar, below the bar, so the bar and its "+" (now an "x") stay on top of the blur.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { LiquidGlassButton } from './LiquidGlass';
import CueOrb from './CueOrb';
import { PLUS_SIZE, TAB_BAR_SIDE } from '../lib/tabBarMetrics';

const BTN = 60;
const ORB = 76; // the orb's drawing has a halo around the 78% body: this box shows the body at about 60

export const PLUS_ACTIONS = [
  { id: 'form',    label: 'Quick form check', symbol: 'camera.fill',                         route: '/exercise-picker' },
  { id: 'analyze', label: 'Analyze a video',  symbol: 'video.badge.plus',                    route: '/analyze-video' },
  { id: 'workout', label: 'Start workout',    symbol: 'figure.strengthtraining.traditional', route: '/workout' },
  { id: 'log',     label: 'Log a session',    symbol: 'square.and.pencil',                   route: '/log-session' },
  { id: 'cue',     label: 'Ask Cue',          symbol: null,                                  route: '/cue' },
] as const;

export default function PlusMenu({ open, onClose, bottom }: { open: boolean; onClose: () => void; bottom: number }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const t = useRef(new Animated.Value(0)).current;
  const items = useRef(PLUS_ACTIONS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(t, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      // bottom item first, like the buttons rising out of the "+"
      PLUS_ACTIONS.forEach((_, i) => {
        items[i].setValue(0);
        Animated.spring(items[i], { toValue: 1, delay: (PLUS_ACTIONS.length - 1 - i) * 45, damping: 17, stiffness: 300, mass: 0.9, useNativeDriver: true }).start();
      });
    } else if (mounted) {
      Animated.timing(t, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [open, mounted, t, items]);

  if (!mounted) return null;

  const go = (route: string) => {
    Haptics.selectionAsync();
    onClose();
    router.push(route as any);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu">
          <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />
        </Pressable>
      </Animated.View>
      <View style={[s.col, { bottom, right: TAB_BAR_SIDE + (PLUS_SIZE - BTN) / 2 }]} pointerEvents="box-none">
        {PLUS_ACTIONS.map((a, i) => (
          <Animated.View
            key={a.id}
            style={[s.row, { opacity: items[i], transform: [{ translateY: items[i].interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }, { scale: items[i].interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}
          >
            <Text style={s.label}>{a.label}</Text>
            {a.symbol ? (
              <LiquidGlassButton radius={BTN / 2} colorScheme="light" fallbackColor="rgba(255,255,255,0.82)" onPress={() => go(a.route)} accessibilityLabel={a.label} style={s.btn}>
                <SymbolView name={a.symbol as any} size={26} tintColor="#111114" type="monochrome" style={{ width: 26, height: 26 }} />
              </LiquidGlassButton>
            ) : (
              <Pressable onPress={() => go(a.route)} accessibilityLabel={a.label} style={s.orb} hitSlop={4}>
                <CueOrb size={ORB} />
              </Pressable>
            )}
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  col:   { position: 'absolute', alignItems: 'flex-end', gap: 14 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  label: { fontSize: 16.5, fontWeight: '700', color: '#111114', letterSpacing: -0.2 },
  btn:   { width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center' },
  // same footprint as a glass button, so the column lines up; the orb needs no frame
  orb:   { width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
});
