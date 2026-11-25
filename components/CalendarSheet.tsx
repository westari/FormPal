/**
 * components/CalendarSheet.tsx
 *
 * Home's calendar. Tap the date: ONE panel of real Liquid Glass slides DOWN from the top of the screen with the month grid, today in a circle centred
 * in its cell, a dot under every day you trained. Tap a day, the area below, or the date again and it slides back up. Month arrows go to the
 * previous / next month.
 *
 * THE GLASS: the same native view as the Finish pill (@callstack/liquid-glass through components/LiquidGlass.tsx, Apple's UIGlassEffect). Round 10: it
 * uses the LIGHT colour scheme (no dark tint), because dark glass over the white Home page read as gray; a soft shadow lifts it off the page. The month
 * grid is INSIDE the glass view. Nothing sits above it that could turn the glass flat: no opacity, no clipping (overflow) and no mask on any parent (a
 * native glass view inside a faded or clipped parent draws as a plain colour). It is always mounted, parked above the screen, so the native view
 * already exists and has painted when it is first opened.
 * The month maths is in lib/calendarMonth.ts.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LiquidGlass from './LiquidGlass';

// Round 10 (Ari): dark glass over the white Home page read as gray. The calendar now uses the LIGHT glass: the same native view (LiquidGlassView through
// components/LiquidGlass.tsx), colour scheme "light", no dark tint (the tab bar's glass settings), with a soft shadow so the panel stands out from the page.
export const CAL_GLASS = { variant: 'regular', colorScheme: 'light', fallbackColor: 'rgba(255,255,255,0.82)' } as const;
const INK = '#111114';
const MUTED = '#5c5c66';
import { monthGrid, trainedDays, MONTH_NAMES, WEEKDAY_LETTERS } from '../lib/calendarMonth';

const SYS = Platform.select({ ios: 'System', default: undefined }); // SF Pro
const ACCENT = '#f2701c';
export const CAL_OPEN_MS = 340;
export const CAL_CLOSE_MS = 260;
const BLEED = 60; // the panel reaches this far ABOVE the screen so its top corners are never seen: only the bottom corners are round
const RADIUS = 30;

export default function CalendarSheet({ open, onClose, timestamps }: { open: boolean; onClose: () => void; timestamps: number[]; anchor?: unknown }) {
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [h, setH] = useState(720);            // the panel's real height (measured); the guess is taller than it will be
  const prog = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (open) {
      const n = new Date(); setYm({ y: n.getFullYear(), m: n.getMonth() });
      Animated.timing(prog, { toValue: 1, duration: CAL_OPEN_MS, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
    } else {
      Animated.timing(prog, { toValue: 0, duration: CAL_CLOSE_MS, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }).start();
    }
  }, [open, prog]);
  const trained = useMemo(() => trainedDays(timestamps), [timestamps]);
  const weeks = useMemo(() => monthGrid(ym.y, ym.m, trained, new Date()), [ym, trained]);
  const step = (d: number) => setYm((c) => { const t = new Date(c.y, c.m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  const monthCount = weeks.flat().filter((c) => c.trained).length;
  const slide = prog.interpolate({ inputRange: [0, 1], outputRange: [-h, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      {open && <StatusBar style="dark" animated />}
      {/* Nothing is dimmed. This invisible layer only catches a tap outside the panel. */}
      <Pressable style={s.outside} onPress={onClose} accessibilityLabel="Close calendar" testID="calendar-outside" pointerEvents={open ? 'auto' : 'none'} />
      <Animated.View
        testID="calendar-drop"
        onLayout={(e) => { const hh = Math.round(e.nativeEvent.layout.height); if (hh > 0 && hh !== h) setH(hh); }}
        style={[s.panel, { top: -BLEED, transform: [{ translateY: slide }] }]}
      >
        {/* The glass standard (the Finish pill's glass). It is the panel itself, with the month inside it. Its top corners are above the screen. */}
        <LiquidGlass radius={RADIUS} variant={CAL_GLASS.variant} colorScheme={CAL_GLASS.colorScheme} fallbackColor={CAL_GLASS.fallbackColor} style={[s.inner, { paddingTop: BLEED + insets.top + 10 }]}>
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
                <Pressable key={ci} style={s.cell} onPress={c.day != null ? onClose : undefined} disabled={c.day == null} accessibilityLabel={c.day != null ? 'Day ' + c.day : undefined}>
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
        </LiquidGlass>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  outside: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'transparent' },
  // no opacity, no overflow, no clip here: a native glass view inside a faded or clipped parent draws flat. The rounded bottom corners and the soft shadow
  // are only the SHAPE OF THE SHADOW (a box shadow is drawn outside the box and never clips what is inside it).
  panel: { position: 'absolute', left: 0, right: 0, borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS, boxShadow: '0 16px 32px -10px rgba(40,50,90,0.34), 0 3px 8px rgba(40,50,90,0.12)' } as any,
  inner: { paddingHorizontal: 18, paddingBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 8 },
  title: { fontFamily: SYS, fontSize: 20, fontWeight: '700', color: INK },
  sub: { fontFamily: SYS, fontSize: 13, fontWeight: '500', color: MUTED, marginTop: 2 },
  arrows: { flexDirection: 'row', gap: 8 },
  arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(17,17,20,0.07)', alignItems: 'center', justifyContent: 'center' },
  sym: { width: 15, height: 15 },
  row: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontFamily: SYS, fontSize: 12, fontWeight: '600', color: MUTED, paddingVertical: 5 },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  // today's circle: the cell is centred both ways and the circle is the same size both ways, so the circle sits exactly on the cell's middle
  dayWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  todayCircle: { backgroundColor: INK },
  day: { fontFamily: SYS, fontSize: 17, lineHeight: 22, fontWeight: '500', color: INK, textAlign: 'center' },
  todayText: { color: '#ffffff', fontWeight: '700' },
  dot: { position: 'absolute', bottom: 3, width: 5, height: 5, borderRadius: 2.5 },
});
