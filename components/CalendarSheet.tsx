/**
 * components/CalendarSheet.tsx
 *
 * Home's calendar. It drops DOWN from the header, attached to the little arrow beside the date (not a sheet from the bottom):
 * a real Liquid Glass card under the date that grows out of the arrow (scale + fade from the arrow's x), one month at a time
 * (small arrows go to the previous / next month), today in a dark circle, a dot under every day you trained. Tap the arrow again
 * (the page reports it) or the dim area below to close. The month maths is in lib/calendarMonth.ts.
 * `anchor` is where the page says the date block ends (top, screen points) and where its arrow is (cx).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import LiquidGlass from './LiquidGlass';
import { monthGrid, trainedDays, MONTH_NAMES, WEEKDAY_LETTERS } from '../lib/calendarMonth';

const INK = '#111114';
const MUTED = '#7b7b85';
const ACCENT = '#f2701c';
const SIDE = 14;
export const CAL_OPEN_MS = 200;
export const CAL_CLOSE_MS = 150;
const CARET = 18; // the little pointer on the top edge, pointing up at the date's arrow

export interface CalendarAnchor { top: number; cx: number }

export default function CalendarSheet({ open, onClose, timestamps, anchor }: { open: boolean; onClose: () => void; timestamps: number[]; anchor: CalendarAnchor | null }) {
  const { width } = useWindowDimensions();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [mounted, setMounted] = useState(open);
  const prog = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (open) {
      const n = new Date(); setYm({ y: n.getFullYear(), m: n.getMonth() });
      setMounted(true);
      Animated.timing(prog, { toValue: 1, duration: CAL_OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(prog, { toValue: 0, duration: CAL_CLOSE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [open, prog]);
  const trained = useMemo(() => trainedDays(timestamps), [timestamps]);
  const weeks = useMemo(() => monthGrid(ym.y, ym.m, trained, new Date()), [ym, trained]);
  const step = (d: number) => setYm((c) => { const t = new Date(c.y, c.m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  const monthCount = weeks.flat().filter((c) => c.trained).length;
  if (!mounted || !anchor) return null;

  const top = anchor.top + 12; // leaves room for the pointer between the arrow and the card
  const cardW = width - SIDE * 2;
  const caretX = Math.max(26, Math.min(cardW - 26, anchor.cx - SIDE)); // the pointer sits right under the arrow
  const scale = prog.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const slide = prog.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Nothing is dimmed or blurred. This invisible layer under the calendar only catches a tap outside it (the header stays tappable). */}
      <Pressable style={[s.outside, { top }]} onPress={onClose} accessibilityLabel="Close calendar" testID="calendar-outside" />
      <Animated.View
        style={[s.pop, { top, left: SIDE, width: cardW, opacity: prog, transform: [{ translateY: slide }, { scale }], transformOrigin: `${caretX}px 0px` } as any]}
        testID="calendar-drop"
      >
        {/* the pointer: a small rounded diamond whose top half stands out above the card, centred under the arrow */}
        <View style={[s.caret, { left: caretX - CARET / 2 }]} testID="calendar-caret" pointerEvents="none" />
        <View style={s.card}>
          {/* Real Liquid Glass (the same material as the tab bar), frosted with a white tint so the numbers stay readable over the page. */}
          <View style={[StyleSheet.absoluteFill, s.base]} testID="calendar-base" />
          <LiquidGlass radius={28} variant="regular" colorScheme="light" tintColor="rgba(255,255,255,0.55)" fallbackColor="rgba(255,255,255,0)" style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={s.inner}>
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
                <View key={ci} style={s.cell}>
                  {c.day != null && (
                    <View style={[s.dayWrap, c.today && s.todayCircle]}>
                      <Text style={[s.day, c.today && s.todayText]}>{c.day}</Text>
                      <View style={[s.dot, { opacity: c.trained ? 1 : 0, backgroundColor: c.today ? '#fff' : ACCENT }]} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  outside: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' },
  pop: { position: 'absolute', shadowColor: '#28325a', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  card: { borderRadius: 28, overflow: 'hidden' },
  caret: { position: 'absolute', top: -CARET / 2 + 2, width: CARET, height: CARET, borderRadius: 4, backgroundColor: 'rgba(250,250,252,0.94)', transform: [{ rotate: '45deg' }] },
  base: { backgroundColor: 'rgba(250,250,252,0.84)', borderRadius: 28 },
  inner: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: -0.4 },
  sub: { fontSize: 12.5, fontWeight: '500', color: MUTED, marginTop: 2 },
  arrows: { flexDirection: 'row', gap: 8 },
  arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(17,17,20,0.06)', alignItems: 'center', justifyContent: 'center' },
  sym: { width: 15, height: 15 },
  row: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: MUTED, paddingVertical: 5 },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  dayWrap: { width: 38, height: 40, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  todayCircle: { backgroundColor: INK },
  day: { fontSize: 15.5, fontWeight: '600', color: INK },
  todayText: { color: '#fff', fontWeight: '800' },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
});
