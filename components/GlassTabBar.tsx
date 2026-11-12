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
 * Like the iOS 26 bar: ONE glass lens marks the open tab. Press the bar and the lens lifts (bigger, the "selection bubble"),
 * follows your finger across the tabs (rubber band at the ends, a stretch with speed), each tab it crosses lights up with a
 * selection tick, and the tab you let go on opens. A quick tap is the same gesture. The maths is in lib/tabDrag.ts.
 *
 * The "+" opens the menu (components/PlusMenu.tsx): the page behind is blurred and the actions float above the "+", which
 * turns into an "x". The bar stays above the blur.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from '../lib/haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import LiquidGlass, { LiquidGlassButton } from './LiquidGlass';
import PlusMenu from './PlusMenu';
import { TAB_BAR_H, PLUS_SIZE, TAB_BAR_SIDE, TAB_BAR_GAP, tabBarBottom } from '../lib/tabBarMetrics';
import { tapClock } from '../lib/tabLag';
import { tabIndexAt, lensLeft, lensStretch, releaseTarget, LENS_SCALE_X, LENS_SCALE_Y, LIFT_SPRING, SETTLE_SPRING } from '../lib/tabDrag';

// ONE-LINE SWITCH: true = the new Train (dumbbell) and Progress (bars) icons; false = the previous ones (strength figure, line chart).
const NEW_TAB_ICONS = true;

export const TABS = [
  { name: 'index',    label: 'Home',     on: 'house.fill',                           off: 'house' },
  { name: 'train',    label: 'Train',    ...(NEW_TAB_ICONS ? { on: 'dumbbell.fill',   off: 'dumbbell' }  : { on: 'figure.strengthtraining.traditional', off: 'figure.strengthtraining.traditional' }) },
  { name: 'progress', label: 'Progress', ...(NEW_TAB_ICONS ? { on: 'chart.bar.fill',   off: 'chart.bar' } : { on: 'chart.line.uptrend.xyaxis',           off: 'chart.line.uptrend.xyaxis' }) },
  { name: 'profile',  label: 'Profile',  on: 'person.fill',                          off: 'person' },
] as const;

const INK = '#111114';
const ITEMS_PAD = 6;
const PILL_H = TAB_BAR_H - 12;
const MUTED = '#6e6e77';

let warmedUp = false;
const WARM_STEP_MS = 110;

export default function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const rot = useRef(new Animated.Value(0)).current;
  const focusedName = state.routes[state.index]?.name;

  useEffect(() => {
    Animated.timing(rot, { toValue: menuOpen ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [menuOpen, rot]);
  const plusSpin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  const [barW, setBarW] = useState(0);
  const idx = TABS.findIndex(t => t.name === focusedName);
  const innerW = barW > 0 ? barW - ITEMS_PAD * 2 : 0;
  const itemW = innerW / TABS.length;
  const slide = useRef(new Animated.Value(0)).current;   // the lens' left edge (px from the first tab's left edge)
  const lift = useRef(new Animated.Value(0)).current;    // 0 resting, 1 lifted (held)
  const stretch = useRef(new Animated.Value(1)).current; // horizontal stretch while moving
  const placed = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const live = useRef({ itemW: 0, idx: 0, hover: null as number | null, startX: 0, dragging: false });
  live.current.itemW = itemW; live.current.idx = idx;

  // the lens follows the open tab (also when the tab changes some other way); never while a finger is on the bar
  useEffect(() => {
    if (idx < 0 || !itemW || live.current.dragging) return;
    if (!placed.current) { slide.setValue(idx * itemW); placed.current = true; return; }
    Animated.spring(slide, { toValue: idx * itemW, ...SETTLE_SPRING, useNativeDriver: true }).start();
  }, [idx, itemW, slide]);

  const openTab = useCallback((name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    setMenuOpen(false);
    if (focusedName !== name) { tapClock.at = Date.now(); tapClock.name = name === 'index' ? 'home' : name; }
    const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (focusedName !== name && !ev.defaultPrevented) navigation.navigate(route.name as never);
  }, [state.routes, navigation, focusedName]);
  const openTabRef = useRef(openTab);
  openTabRef.current = openTab;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const L = live.current;
      if (!L.itemW) return;
      L.dragging = true;
      L.startX = e.nativeEvent.locationX;
      slide.stopAnimation();
      const i = tabIndexAt(L.startX, L.itemW, ITEMS_PAD);
      L.hover = i; setHover(i);
      Animated.spring(lift, { toValue: 1, ...LIFT_SPRING, useNativeDriver: true }).start();
      // the lens glides from where it was to under the finger (it does not jump)
      Animated.spring(slide, { toValue: lensLeft(L.startX, L.itemW, ITEMS_PAD), ...LIFT_SPRING, useNativeDriver: true }).start();
      if (i !== L.idx) Haptics.selectionAsync();
    },
    onPanResponderMove: (_e, g) => {
      const L = live.current;
      if (!L.itemW) return;
      const x = L.startX + g.dx;
      slide.stopAnimation();
      slide.setValue(lensLeft(x, L.itemW, ITEMS_PAD));
      stretch.setValue(lensStretch(g.vx));
      Animated.spring(stretch, { toValue: 1, damping: 30, stiffness: 220, mass: 0.6, overshootClamping: true, useNativeDriver: true }).start();
      const i = tabIndexAt(x, L.itemW, ITEMS_PAD);
      if (i !== L.hover) { L.hover = i; setHover(i); Haptics.selectionAsync(); } // one tick per tab crossed
    },
    onPanResponderRelease: (_e, g) => {
      const L = live.current;
      L.dragging = false;
      const r = releaseTarget(L.startX + g.dx, L.itemW, ITEMS_PAD, L.idx);
      const target = r.open == null ? L.idx : r.open;
      L.hover = null; setHover(null);
      Animated.spring(lift, { toValue: 0, ...SETTLE_SPRING, useNativeDriver: true }).start();
      Animated.spring(slide, { toValue: target * L.itemW, ...SETTLE_SPRING, useNativeDriver: true }).start();
      openTabRef.current(TABS[target].name); // (a tap on the open tab still reports tabPress, for scroll-to-top handlers)
    },
    onPanResponderTerminate: () => {
      const L = live.current;
      L.dragging = false; L.hover = null; setHover(null);
      Animated.spring(lift, { toValue: 0, ...SETTLE_SPRING, useNativeDriver: true }).start();
      Animated.spring(slide, { toValue: Math.max(0, L.idx) * L.itemW, ...SETTLE_SPRING, useNativeDriver: true }).start();
    },
  })).current;

  const lensScaleX = Animated.multiply(lift.interpolate({ inputRange: [0, 1], outputRange: [1, LENS_SCALE_X] }), stretch);
  const lensScaleY = lift.interpolate({ inputRange: [0, 1], outputRange: [1, LENS_SCALE_Y] });

  // ONE time per app run: visit the other tabs once, quickly, behind a cover the colour of the pages. A tab's page only starts
  // loading when its screen is first on screen, so without this every tab's FIRST open waited ~0.4-0.6s for its page to load.
  // After this, all four pages are loaded and a tab tap only brings an already-drawn page to the front.
  const [warming, setWarming] = useState(!warmedUp);
  useEffect(() => {
    if (warmedUp) return;
    warmedUp = true;
    const start = state.routes[state.index]?.name;
    const others = TABS.map(t => t.name as string).filter(n => n !== start);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let finished = false;
    let t = 350;
    others.forEach((n) => { const at = t; timers.push(setTimeout(() => { navigation.navigate(n as never); }, at)); t += WARM_STEP_MS; });
    timers.push(setTimeout(() => { if (start) navigation.navigate(start as never); }, t)); t += 80;
    timers.push(setTimeout(() => { finished = true; setWarming(false); if (__DEV__) console.log('[TAB-LAG] all tabs loaded once at launch (' + others.length + ' visited behind the cover)'); }, t));
    timers.push(setTimeout(() => setWarming(false), 3000)); // whatever happens, the cover is never left on
    return () => { timers.forEach(clearTimeout); if (!finished) warmedUp = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bottom = tabBarBottom(insets.bottom);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <PlusMenu open={menuOpen} onClose={() => setMenuOpen(false)} bottom={bottom + PLUS_SIZE + 14} />
      <View style={[s.row, { bottom, left: TAB_BAR_SIDE, right: TAB_BAR_SIDE }]} pointerEvents="box-none">
        <View style={s.capsuleWrap} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
          <LiquidGlass radius={TAB_BAR_H / 2} variant="regular" colorScheme="light" fallbackColor="rgba(255,255,255,0.82)" style={StyleSheet.absoluteFill} />
          {/* the lens: outside the capsule so it can stand out of it while lifted */}
          {itemW > 0 && idx >= 0 && (
            <Animated.View pointerEvents="none" style={[s.pill, { width: itemW, transform: [{ translateX: slide }, { scaleX: lensScaleX }, { scaleY: lensScaleY }] }]}>
              <LiquidGlass radius={PILL_H / 2} variant="clear" colorScheme="light" fallbackColor="rgba(17,17,20,0.08)" style={s.pillGlass} />
            </Animated.View>
          )}
          {/* icons and labels sit ABOVE the lens, so the glass never smears or magnifies them (that blurred the open tab) */}
          <View style={[StyleSheet.absoluteFill, s.items]} pointerEvents="none">
            {TABS.map((t, i) => {
              // The icon and label turn dark ONLY as the lens arrives: two copies (muted, dark) cross-fade by how close the lens
              // is to this tab (native-driven opacity, so it follows the lens frame by frame, tap or drag).
              const near = itemW > 0
                ? slide.interpolate({ inputRange: [(i - 0.85) * itemW, i * itemW, (i + 0.85) * itemW], outputRange: [0, 1, 0], extrapolate: 'clamp' })
                : new Animated.Value(i === idx ? 1 : 0);
              const far = Animated.subtract(1, near);
              return (
                <View key={t.name} style={s.itemHit} accessible accessibilityRole="button" accessibilityLabel={t.label} accessibilityState={{ selected: idx === i }} onAccessibilityTap={() => openTab(t.name)}>
                  <View style={s.item}>
                    <Animated.View style={[s.layer, { opacity: far }]}>
                      <SymbolView name={t.off as any} size={20} tintColor={MUTED} type="monochrome" style={s.icon} />
                      <Text style={[s.label, { color: MUTED }]} numberOfLines={1}>{t.label}</Text>
                    </Animated.View>
                    <Animated.View style={[StyleSheet.absoluteFill, s.layer, { opacity: near }]}>
                      <SymbolView name={t.on as any} size={20} tintColor={INK} type="monochrome" style={s.icon} />
                      <Text style={[s.label, { color: INK }]} numberOfLines={1}>{t.label}</Text>
                    </Animated.View>
                  </View>
                </View>
              );
            })}
          </View>
          <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
        </View>
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
      {warming && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#eeeef1' }]} pointerEvents="auto" />}
    </View>
  );
}

const s = StyleSheet.create({
  row:     { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  capsuleWrap: { flex: 1, height: TAB_BAR_H },
  items:   { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: ITEMS_PAD },
  pill:    { position: 'absolute', left: ITEMS_PAD, top: 6, height: PILL_H },
  pillGlass: { flex: 1 },
  itemHit: { flex: 1, height: PILL_H },
  item:    { flex: 1, borderRadius: PILL_H / 2, alignItems: 'center', justifyContent: 'center' },
  layer:   { alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon:    { width: 22, height: 22 },
  // Apple's own tab bar label: the system font (SF Pro, picked by iOS because no fontFamily is set), 10pt, medium, +0.12 tracking
  label:   { fontSize: 10, fontWeight: '500', letterSpacing: 0.12 },
  plus:    { width: PLUS_SIZE, height: PLUS_SIZE, alignItems: 'center', justifyContent: 'center' },
});
