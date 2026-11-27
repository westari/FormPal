/**
 * components/CalendarSheet.tsx
 *
 * Home's calendar: a small POPOVER attached to the arrow beside the date ("Wednesday, November 25 ⌄"). It drops down from right under that arrow with a little
 * pointer on its top edge pointing up at the arrow, one month at a time (small arrows go to the previous / next month), today in a dark circle, a dot under every
 * day you trained. Tap a day, the area below it, or the date / arrow again and it closes. The month maths is in lib/calendarMonth.ts.
 *
 * THE GLASS: real Liquid Glass (the same native view as the Finish pill and the tab bar, components/LiquidGlass.tsx), LIGHT scheme, no dark tint, with a soft shadow.
 * Nothing above the glass fades, clips or masks it (a native glass view inside a faded or clipped parent draws as a plain colour), so the popover never uses
 * opacity: it appears and disappears by MOVING (a transform on the native driver) and is parked far above the screen when closed.
 *
 * GROWS FROM THE ARROW (round 12): scale from a tiny size at the pointer + the month fading in, 250ms, native driver (see play()).
 * INSTANT (round 11): Home no longer re-renders to open it. Home holds this component by a ref and calls toggle({ top, cx }) / close(); the animation starts in
 * that very call, on the native driver, before React has drawn anything again. The popover is always mounted (its glass exists and has painted before the first
 * open), the month only changes when you press an arrow, and the status bar is left alone.
 * The page says where the arrow is: `top` = the bottom edge of the date block, `cx` = the arrow's centre (screen points).
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import LiquidGlass from './LiquidGlass';
import { monthGrid, trainedDays, MONTH_NAMES, WEEKDAY_LETTERS } from '../lib/calendarMonth';

// The calendar's glass: the same native view as the Finish pill, LIGHT scheme (the tab bar's settings), no dark tint.
export const CAL_GLASS = { variant: 'regular', colorScheme: 'light', fallbackColor: 'rgba(255,255,255,0.86)' } as const;
const INK = '#111114';
const MUTED = '#5c5c66';
const ACCENT = '#f2701c';
const SIDE = 14;
const RADIUS = 28;
const CARET = 18;   // the little pointer on the top edge
export const CAL_OPEN_MS = 250;
export const CAL_CLOSE_MS = 180;
export const CAL_START_SCALE = 0.12; // it grows out of the arrow's point: it starts this small, AT the pointer
export const CAL_PARK = -3000; // where it waits when it is closed (above the screen)

export interface CalendarAnchor { top: number; cx: number }
export interface CalendarHandle { toggle: (anchor?: CalendarAnchor | null) => void; close: () => void; isOpen: () => boolean }

const CalendarSheet = forwardRef<CalendarHandle, { timestamps: number[]; onOpenChange?: (open: boolean) => void }>(function CalendarSheet({ timestamps, onOpenChange }, ref) {
  const { width } = useWindowDimensions();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<CalendarAnchor>({ top: 170, cx: 250 });
  const prog = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  // Round 12 (Ari: "it just spawns in"): it now GROWS out of the arrow's point. The panel and its pointer scale up from a tiny size anchored at the pointer while
  // the month inside fades in, 250ms on the native driver (60fps on the UI thread), with an iOS-like deceleration; closing is the same in reverse (180ms).
  // The fade is on the CONTENT inside the glass, never on a parent of the glass (a faded parent turns native glass flat).
  const play = useCallback((to: 0 | 1) => {
    Animated.timing(prog, { toValue: to, duration: to ? CAL_OPEN_MS : CAL_CLOSE_MS, easing: to ? Easing.bezier(0.2, 0.9, 0.25, 1) : Easing.bezier(0.4, 0, 0.7, 0.4), useNativeDriver: true }).start();
  }, [prog]);
  // The value is handed to the native side once at mount (a zero-length run), so the FIRST open does not spend its first frames setting the animation up.
  useEffect(() => { Animated.timing(prog, { toValue: 0, duration: 0, useNativeDriver: true }).start(); }, [prog]);
  const anchorRef = useRef<CalendarAnchor>({ top: 170, cx: 250 });
  const setState = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);
  useImperativeHandle(ref, () => ({
    // The animation is started FIRST, in this very call; the state that follows only turns touches on and moves the pointer to the arrow.
    toggle: (a) => {
      if (openRef.current) { play(0); setState(false); return; }
      const n = new Date(); setYm((c) => (c.y === n.getFullYear() && c.m === n.getMonth() ? c : { y: n.getFullYear(), m: n.getMonth() }));
      setState(true);
      // Same place as last time (almost always): grow at once. A new place (the first open, or the header moved): place it first, grow on the next frame,
      // so it never grows from the old spot.
      if (a && (Math.abs(a.top - anchorRef.current.top) > 0.5 || Math.abs(a.cx - anchorRef.current.cx) > 0.5)) { anchorRef.current = a; setAnchor(a); requestAnimationFrame(() => play(1)); }
      else play(1);
    },
    close: () => { if (!openRef.current) return; play(0); setState(false); },
    isOpen: () => openRef.current,
  }), [play, setState]);

  const trained = useMemo(() => trainedDays(timestamps), [timestamps]);
  const weeks = useMemo(() => monthGrid(ym.y, ym.m, trained, new Date()), [ym, trained]);
  const step = (d: number) => setYm((c) => { const t = new Date(c.y, c.m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  const monthCount = weeks.flat().filter((c) => c.trained).length;

  const top = anchor.top + 12;                 // leaves room for the pointer between the arrow and the panel
  const cardW = width - SIDE * 2;
  const caretX = Math.max(26, Math.min(cardW - 26, anchor.cx - SIDE)); // the pointer sits right under the arrow
  // Parked far above the screen while closed; the instant it starts opening it is in place (a tiny progress already puts it on screen), then it settles.
  const ty = prog.interpolate({ inputRange: [0, 0.0001, 1], outputRange: [CAL_PARK, 0, 0], extrapolate: 'clamp' });
  const sc = prog.interpolate({ inputRange: [0, 1], outputRange: [CAL_START_SCALE, 1] });
  const fadeIn = prog.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.55, 1], extrapolate: 'clamp' });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      {/* Nothing is dimmed. This invisible layer only catches a tap outside the popover. */}
      <Pressable style={s.outside} onPress={() => { play(0); setState(false); }} accessibilityLabel="Close calendar" testID="calendar-outside" pointerEvents={open ? 'auto' : 'none'} />
      <Animated.View
        testID="calendar-drop"
        style={[s.pop, { top, left: SIDE, width: cardW, transform: [{ translateY: ty }, { scale: sc }], transformOrigin: `${caretX}px 0px` } as any]}
      >
        {/* the pointer: a small rounded diamond of the same glass, its top half standing out above the panel, centred under the arrow */}
        <View style={[s.caret, { left: caretX - CARET / 2 }]} testID="calendar-caret" pointerEvents="none">
          <LiquidGlass radius={4} variant={CAL_GLASS.variant} colorScheme={CAL_GLASS.colorScheme} fallbackColor={CAL_GLASS.fallbackColor} style={StyleSheet.absoluteFill} />
        </View>
        <LiquidGlass radius={RADIUS} variant={CAL_GLASS.variant} colorScheme={CAL_GLASS.colorScheme} fallbackColor={CAL_GLASS.fallbackColor} style={s.inner}>
          <Animated.View style={{ opacity: fadeIn }} testID="calendar-content">
          <View style={s.head}>
            <View>
              <Text style={s.title}>{MONTH_NAMES[ym.m]} {ym.y}</Text>
              <Text style={s.sub}>{monthCount === 0 ? 'No workouts this month' : monthCount + (monthCount === 1 ? ' day trained' : ' days trained')}</Text>
            </View>
            <View style={s.arrows}>
              <Pressable onPress={() => step(-1)} hitSlop={10} style={s.arrow} accessibilityLabel="Previous month">
                <SymbolView name={'chevron.left' as any} size={15} weight="semibold" tintColor={INK} type="monochrome" style={s.sym} />
              </Pressable>
              <Pressable onPress={() => step(1)} hitSlop={10} style={s.arrow} accessibilityLabel="Next month">
                <SymbolView name={'chevron.right' as any} size={15} weight="semibold" tintColor={INK} type="monochrome" style={s.sym} />
              </Pressable>
            </View>
          </View>
          <View style={s.row}>
            {WEEKDAY_LETTERS.map((l, i) => <Text key={i} style={s.wd}>{l}</Text>)}
          </View>
          {weeks.map((w, wi) => (
            <View key={wi} style={s.row}>
              {w.map((c, ci) => (
                <Pressable key={ci} style={s.cell} onPress={c.day != null ? () => { play(0); setState(false); } : undefined} disabled={c.day == null} accessibilityLabel={c.day != null ? 'Day ' + c.day : undefined}>
                  {c.day != null && (
                    <View style={[s.dayWrap, c.today && s.todayCircle]} testID={c.today ? 'calendar-today' : undefined}>
                      <Text style={[s.day, c.today && s.todayText]}>{c.day}</Text>
                      <View style={[s.dot, { opacity: c.trained ? 1 : 0, backgroundColor: c.today ? '#ffffff' : ACCENT }]} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ))}
          </Animated.View>
        </LiquidGlass>
      </Animated.View>
    </View>
  );
});
export default React.memo(CalendarSheet);

const s = StyleSheet.create({
  outside: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'transparent' },
  // no opacity, no overflow, no clip here (see the note at the top). The rounded corners and the soft shadow are only the SHAPE OF THE SHADOW.
  pop: { position: 'absolute', borderRadius: RADIUS, boxShadow: '0 18px 34px -12px rgba(40,50,90,0.36), 0 4px 10px rgba(40,50,90,0.12)' } as any,
  caret: { position: 'absolute', top: -CARET / 2 + 2, width: CARET, height: CARET, borderRadius: 4, overflow: 'hidden', transform: [{ rotate: '45deg' }] },
  inner: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 8 },
  // the app's normal font: no family given, so iOS uses its own system font (SF Pro); the weight of the app's other titles (600)
  title: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.4, color: INK },
  sub: { fontSize: 13, fontWeight: '500', color: MUTED, marginTop: 2 },
  arrows: { flexDirection: 'row', gap: 8 },
  arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(17,17,20,0.07)', alignItems: 'center', justifyContent: 'center' },
  sym: { width: 15, height: 15 },
  row: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: MUTED, paddingVertical: 5 },
  cell: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  // today's circle: the cell is centred both ways and the circle is the same size both ways, so the circle sits exactly on the cell's middle
  dayWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  todayCircle: { backgroundColor: INK },
  day: { fontSize: 17, lineHeight: 22, fontWeight: '500', color: INK, textAlign: 'center' },
  todayText: { color: '#ffffff', fontWeight: '700' },
  dot: { position: 'absolute', bottom: 3, width: 5, height: 5, borderRadius: 2.5 },
});
