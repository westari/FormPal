/**
 * components/PlusMenu.tsx
 *
 * The menu the "+" opens. Clean on purpose:
 *  - the page behind is BLURRED (a real native blur of the page itself, nothing painted on top, no new background)
 *  - every action is a real Liquid Glass button (components/LiquidGlass.tsx); Cue, at the top, is just its moving orb
 *  - short names, regular weight, the system font
 *  - it fades in AND out: tapping outside fades the blur and the actions away smoothly (reverse of how they appear)
 * Drawn by GlassTabBar, below the bar, so the bar and its "+" (now an "x") stay on top of the blur.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from '../lib/haptics';
import { LiquidGlassButton } from './LiquidGlass';
import CueOrb from './CueOrb';
import { PLUS_SIZE, TAB_BAR_SIDE } from '../lib/tabBarMetrics';

const BTN = 60;
const ORB = 48; // the orb itself (no halo): about the size of the glyph circles around it, centred in the same 60 box

// Top to bottom. Cue on top (the assistant, set apart), then the three things you do, the main one nearest the "+".
export const PLUS_ACTIONS = [
  { id: 'cue',     label: 'Ask Cue',       symbol: null,                                  route: '/cue' },
  { id: 'form',    label: 'Form check',    symbol: 'camera.viewfinder',                   route: '/exercise-picker' },
  { id: 'create',  label: 'Create workout', symbol: 'plus.rectangle.on.rectangle',        route: '/create-workout' },
  { id: 'log',     label: 'Log session',   symbol: 'square.and.pencil',                   route: '/log-session' },
  { id: 'workout', label: 'Start workout', symbol: 'figure.strengthtraining.traditional', route: '/workout' },
] as const;

const OPEN_MS = 240, CLOSE_MS = 200;

export default function PlusMenu({ open, onClose, bottom }: { open: boolean; onClose: () => void; bottom: number }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const t = useRef(new Animated.Value(0)).current;                           // the blur + everything's overall fade
  const items = useRef(PLUS_ACTIONS.map(() => new Animated.Value(0))).current; // each action rising out of the "+"

  useEffect(() => {
    const n = PLUS_ACTIONS.length;
    if (open) {
      setMounted(true);
      Animated.timing(t, { toValue: 1, duration: OPEN_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      items.forEach((v, i) => {
        v.setValue(0);
        // nearest the "+" first
        Animated.spring(v, { toValue: 1, delay: (n - 1 - i) * 45, damping: 17, stiffness: 300, mass: 0.9, useNativeDriver: true }).start();
      });
    } else if (mounted) {
      // the reverse: the far ones leave first, everything fades together with the blur, THEN it is removed
      items.forEach((v, i) => {
        Animated.timing(v, { toValue: 0, duration: CLOSE_MS - 40, delay: i * 20, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
      });
      Animated.timing(t, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [open, mounted, t, items]);

  if (!mounted) return null;

  const go = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft); // a row that opens something
    onClose();
    router.push(route as any);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu">
          <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />
        </Pressable>
      </Animated.View>
      <Animated.View style={[s.col, { bottom, right: TAB_BAR_SIDE + (PLUS_SIZE - BTN) / 2, opacity: t }]} pointerEvents="box-none">
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
                <CueOrb size={ORB} halo={false} />
              </Pressable>
            )}
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  col:   { position: 'absolute', alignItems: 'flex-end', gap: 14 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // regular weight, the system font (SF Pro): no fontFamily, so iOS picks it
  label: { fontSize: 17, fontWeight: '400', color: '#111114', letterSpacing: -0.4 },
  btn:   { width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center' },
  // same footprint as a glass button, so the column lines up; the orb needs no frame
  orb:   { width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
});
