/**
 * components/GlassTabBar.tsx
 *
 * The app's tab bar, built from REAL Liquid Glass (components/LiquidGlass.tsx, which is Apple's UIGlassEffect through
 * @callstack/liquid-glass; where the system has no glass it is an honest flat surface, never a blur imitation).
 *
 *   [ Home  Train  Progress  Profile ]   gap   ( + )
 *     one glass capsule, 4 tabs           one glass circle, bigger, on its own
 *
 * Why not NativeTabs: its only way to put one item apart on the right is role="search", which is Apple's system search
 * item. Its icon and title are fixed by the system (a magnifying glass, "Search"), so it can never be a "+".
 *
 * The "+" opens the menu (components/PlusMenu.tsx): the page behind is blurred (a real native blur of the page itself, no
 * new background) and the actions float above the "+", which turns into an "x". The bar stays above the blur.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from '../lib/haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import LiquidGlass, { LiquidGlassButton } from './LiquidGlass';
import PlusMenu from './PlusMenu';
import { TAB_BAR_H, PLUS_SIZE, TAB_BAR_SIDE, TAB_BAR_GAP, tabBarBottom } from '../lib/tabBarMetrics';

export const TABS = [
  { name: 'index',    label: 'Home',     on: 'house.fill',                           off: 'house' },
  { name: 'train',    label: 'Train',    on: 'figure.strengthtraining.traditional',  off: 'figure.strengthtraining.traditional' },
  { name: 'progress', label: 'Progress', on: 'chart.line.uptrend.xyaxis',            off: 'chart.line.uptrend.xyaxis' },
  { name: 'profile',  label: 'Profile',  on: 'person.fill',                          off: 'person' },
] as const;

const INK = '#111114';
const ITEMS_PAD = 6;
const PILL_H = TAB_BAR_H - 12;
const MUTED = '#6e6e77';

export default function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const rot = useRef(new Animated.Value(0)).current;
  const focusedName = state.routes[state.index]?.name;

  useEffect(() => {
    Animated.timing(rot, { toValue: menuOpen ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [menuOpen, rot]);
  const plusSpin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  // The highlight is ONE glass pill that slides from the old tab to the new one (a spring), instead of each tab painting its
  // own square that jumps.
  const [itemsW, setItemsW] = useState(0);
  const idx = TABS.findIndex(t => t.name === focusedName);
  const itemW = itemsW > 0 ? (itemsW - ITEMS_PAD * 2) / TABS.length : 0;
  const slide = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  useEffect(() => {
    if (idx < 0 || !itemW) return;
    if (!placed.current) { slide.setValue(idx * itemW); placed.current = true; return; }
    Animated.spring(slide, { toValue: idx * itemW, damping: 19, stiffness: 230, mass: 0.9, useNativeDriver: true }).start();
  }, [idx, itemW, slide]);

  const press = useCallback((name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    Haptics.selectionAsync();
    setMenuOpen(false);
    const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (focusedName !== name && !ev.defaultPrevented) navigation.navigate(route.name as never);
  }, [state.routes, navigation, focusedName]);

  const bottom = tabBarBottom(insets.bottom);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <PlusMenu open={menuOpen} onClose={() => setMenuOpen(false)} bottom={bottom + PLUS_SIZE + 14} />
      <View style={[s.row, { bottom, left: TAB_BAR_SIDE, right: TAB_BAR_SIDE }]} pointerEvents="box-none">
        <LiquidGlass radius={TAB_BAR_H / 2} variant="regular" colorScheme="light" fallbackColor="rgba(255,255,255,0.82)" style={s.capsule}>
          <View style={s.items} onLayout={(e) => setItemsW(e.nativeEvent.layout.width)}>
            {itemW > 0 && idx >= 0 && (
              <Animated.View pointerEvents="none" style={[s.pill, { width: itemW, transform: [{ translateX: slide }] }]}>
                <LiquidGlass radius={PILL_H / 2} variant="clear" colorScheme="light" fallbackColor="rgba(17,17,20,0.08)" style={s.pillGlass} />
              </Animated.View>
            )}
            {TABS.map(t => {
              const on = focusedName === t.name;
              return (
                <Pressable key={t.name} onPress={() => press(t.name)} style={s.itemHit} accessibilityRole="button" accessibilityLabel={t.label} accessibilityState={{ selected: on }}>
                  <View style={s.item}>
                    <SymbolView name={(on ? t.on : t.off) as any} size={20} tintColor={on ? INK : MUTED} type="monochrome" style={s.icon} />
                    <Text style={[s.label, { color: on ? INK : MUTED }]} numberOfLines={1}>{t.label}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </LiquidGlass>
        <View style={{ width: TAB_BAR_GAP }} />
        <LiquidGlassButton
          radius={PLUS_SIZE / 2}
          colorScheme="light"
          fallbackColor="rgba(255,255,255,0.82)"
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMenuOpen(o => !o); }}
          accessibilityLabel={menuOpen ? 'Close menu' : 'Open menu'}
          style={s.plus}
        >
          <Animated.View style={{ transform: [{ rotate: plusSpin }] }}>
            <SymbolView name={'plus' as any} size={26} weight="light" tintColor={INK} type="monochrome" style={{ width: 26, height: 26 }} />
          </Animated.View>
        </LiquidGlassButton>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row:     { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  capsule: { flex: 1, height: TAB_BAR_H },
  items:   { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: ITEMS_PAD },
  pill:    { position: 'absolute', left: ITEMS_PAD, top: 6, height: PILL_H },
  pillGlass: { flex: 1 },
  itemHit: { flex: 1, height: PILL_H },
  item:    { flex: 1, borderRadius: PILL_H / 2, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon:    { width: 22, height: 22 },
  // Apple's own tab bar label: the system font (SF Pro, picked by iOS because no fontFamily is set), 10pt, medium, +0.12 tracking
  label:   { fontSize: 10, fontWeight: '500', letterSpacing: 0.12 },
  plus:    { width: PLUS_SIZE, height: PLUS_SIZE, alignItems: 'center', justifyContent: 'center' },
});
