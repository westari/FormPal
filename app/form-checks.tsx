/**
 * app/form-checks.tsx
 *
 * All form checks (practice sets, not workouts), newest first: opened from the "View all" row under the 2 newest on the Progress tab (round 12). Same look as that
 * list (a white rounded card of rows: the exercise, when, reps and form). A row opens that form check's recap (its video and rep feedback), the same way a past
 * workout does. The back button and the title scroll away with the page (like the goal pages). Data: lib/progressData.ts formCheckRows (the Progress list's own rows).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import GlassBackButton from '../components/GlassBackButton';
import { getAllSessions } from '../lib/sessionLog';
import { formCheckRows } from '../lib/progressData';
import { openRecap } from '../lib/openRecap';
import * as Haptics from '../lib/haptics';
import { FONT } from '../constants/theme';

const INK = '#111114';
const SUB = '#5f5f69';

export default function FormChecksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<{ ts: number; name: string; when: string; meta: string }[] | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    getAllSessions().then((s) => { if (alive) setRows(formCheckRows(s)); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []));
  return (
    <View style={s.root}>
      <LinearGradient colors={['#ebebef', '#f4f4f6', '#fafafb', '#ffffff']} locations={[0, 0.26, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} testID="form-checks-scroll">
        <View style={[s.header, { paddingTop: Math.max(insets.top, 47) + 14 }]}>
          <GlassBackButton onPress={() => router.back()} />
          <Text style={s.title}>Form checks</Text>
        </View>
        <Text style={s.sub}>Practice sets. They are not workouts.</Text>
        {rows && rows.length > 0 ? (
          <View style={s.card} testID="form-checks-list">
            {rows.map((r, i) => (
              <Pressable key={r.ts} onPress={() => { Haptics.selectionAsync(); openRecap(router, r.ts); }} style={[s.row, i > 0 && s.line]} accessibilityLabel={r.name + ', ' + r.when}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.name} numberOfLines={1}>{r.name}</Text>
                  <Text style={s.meta} numberOfLines={1}>{r.when} · {r.meta}</Text>
                </View>
                <SymbolView name={'chevron.right' as any} size={13} weight="semibold" tintColor="#9a9aa2" type="monochrome" style={{ width: 13, height: 13 }} />
              </Pressable>
            ))}
          </View>
        ) : rows ? (
          <Text style={s.empty}>No form checks yet.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const CARD_SHADOW = '0 0 0 1px rgba(17,17,20,0.04), 0 14px 34px -16px rgba(40,50,90,0.22)';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafb' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 15 },
  title: { fontFamily: FONT.displayBold, fontSize: 34, lineHeight: 40, letterSpacing: -1, color: INK },
  sub: { fontFamily: FONT.displaySemi, fontSize: 14, color: SUB, paddingHorizontal: 22, paddingTop: 10 },
  card: { marginHorizontal: 14, marginTop: 16, borderRadius: 26, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#ffffff', boxShadow: CARD_SHADOW } as any,
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(17,17,20,0.12)' },
  name: { fontFamily: FONT.displaySemi, fontSize: 15, letterSpacing: -0.2, color: INK },
  meta: { fontFamily: FONT.display, fontSize: 12.5, color: SUB, paddingTop: 1 },
  empty: { fontFamily: FONT.displaySemi, fontSize: 15, color: SUB, textAlign: 'center', paddingTop: 40 },
});
