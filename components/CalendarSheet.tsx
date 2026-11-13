/**
 * components/CalendarSheet.tsx
 *
 * Home's full calendar: opens when the date at the top of Home is tapped. A white sheet with one month at a time (arrows go
 * to the previous / next month), today ringed, and a dot under every day you trained (from the saved workouts). Tap the dim
 * area or Done to close. The month maths is in lib/calendarMonth.ts.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { monthGrid, trainedDays, MONTH_NAMES, WEEKDAY_LETTERS } from '../lib/calendarMonth';

const INK = '#111114';
const MUTED = '#6e6e77';
const ACCENT = '#f2701c';

export default function CalendarSheet({ open, onClose, timestamps }: { open: boolean; onClose: () => void; timestamps: number[] }) {
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  useEffect(() => { if (open) { const n = new Date(); setYm({ y: n.getFullYear(), m: n.getMonth() }); } }, [open]);
  const trained = useMemo(() => trainedDays(timestamps), [timestamps]);
  const weeks = useMemo(() => monthGrid(ym.y, ym.m, trained, new Date()), [ym, trained]);
  const step = (d: number) => setYm((c) => { const t = new Date(c.y, c.m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  const monthCount = weeks.flat().filter((c) => c.trained).length;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.dim} onPress={onClose} accessibilityLabel="Close calendar" />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} pointerEvents="box-none">
        <View style={s.grab} />
        <View style={s.head}>
          <Pressable onPress={() => step(-1)} hitSlop={14} style={s.arrow} accessibilityLabel="Previous month">
            <SymbolView name={'chevron.left' as any} size={18} weight="semibold" tintColor={INK} type="monochrome" style={s.sym} />
          </Pressable>
          <View style={s.titleWrap}>
            <Text style={s.title}>{MONTH_NAMES[ym.m]} {ym.y}</Text>
            <Text style={s.sub}>{monthCount === 0 ? 'No workouts this month' : monthCount + (monthCount === 1 ? ' day trained' : ' days trained')}</Text>
          </View>
          <Pressable onPress={() => step(1)} hitSlop={14} style={s.arrow} accessibilityLabel="Next month">
            <SymbolView name={'chevron.right' as any} size={18} weight="semibold" tintColor={INK} type="monochrome" style={s.sym} />
          </Pressable>
        </View>
        <View style={s.row}>
          {WEEKDAY_LETTERS.map((l, i) => <Text key={i} style={s.wd}>{l}</Text>)}
        </View>
        {weeks.map((w, wi) => (
          <View key={wi} style={s.row}>
            {w.map((c, ci) => (
              <View key={ci} style={s.cell}>
                {c.day != null && (
                  <View style={[s.dayWrap, c.today && s.todayRing]}>
                    <Text style={[s.day, c.today && s.todayText]}>{c.day}</Text>
                    <View style={[s.dot, { opacity: c.trained ? 1 : 0 }]} />
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
        <Pressable onPress={onClose} style={s.done} accessibilityRole="button"><Text style={s.doneText}>Done</Text></Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,17,20,0.38)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 8 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: '#d7d7dd', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  arrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f2f2f5', alignItems: 'center', justifyContent: 'center' },
  sym: { width: 18, height: 18 },
  titleWrap: { alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: INK, letterSpacing: -0.4 },
  sub: { fontSize: 13, fontWeight: '500', color: MUTED, marginTop: 2 },
  row: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: MUTED, paddingVertical: 6 },
  cell: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center' },
  dayWrap: { width: 42, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  todayRing: { borderWidth: 1.5, borderColor: INK },
  day: { fontSize: 16, fontWeight: '600', color: INK },
  todayText: { fontWeight: '800' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginTop: 3 },
  done: { marginTop: 14, height: 50, borderRadius: 25, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
