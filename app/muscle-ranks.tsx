/**
 * app/muscle-ranks.tsx — full muscle rank page.
 *
 * Reached by tapping the compact preview at the top of the progress tab
 * (app/(tabs)/progress.tsx) — REPLACES the old crammed-onto-the-progress-tab
 * MuscleMapCard placement. The progress tab now shows only a small preview
 * row; this page is where the real body diagram, legend, and per-muscle
 * tier list actually live.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Linking } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';

import { Col, Sp, Sz, FONT, Elev, W } from '../constants/theme';
import ScreenBackground from '../components/ScreenBackground';
import { MuscleTierMap, MuscleRankBackdrop, computeOverallStanding, computeOverallPeak, MUSCLE_ICON_ATTRIBUTION } from '../components/MuscleTierMap';
import RankUpBanner from '../components/RankUpBanner';
import { getAllSessions, computeMuscleTiers, type MuscleTiers } from '../lib/sessionLog';

const SHADOW_LOW  = Platform.OS === 'ios' ? { boxShadow: Elev.low.shadow } as any : { elevation: Elev.low.android };

export default function MuscleRanksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tiers, setTiers] = useState<MuscleTiers>({});

  useFocusEffect(
    useCallback(() => {
      getAllSessions().then(all => setTiers(computeMuscleTiers(all)));
    }, []),
  );

  const overall = computeOverallStanding(tiers);
  const peakTier = computeOverallPeak(tiers);

  return (
    <>
      <StatusBar style="dark" />
      <ScreenBackground>
        <MuscleRankBackdrop tier={overall?.tier ?? 'bronze'} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60, paddingHorizontal: Sp.md, gap: Sp.md }}
        >
          <View style={s.header}>
            <Pressable onPress={() => router.back()} style={[s.backBtn, SHADOW_LOW]} hitSlop={10}>
              <SymbolView name="chevron.left" size={18} tintColor={Col.text} type="monochrome" style={{ width: 18, height: 18 }} />
            </Pressable>
            <Text style={s.title}>Standing</Text>
            <Pressable onPress={() => router.push('/customize' as any)} style={[s.customizeBtn, SHADOW_LOW]} hitSlop={8}>
              <SymbolView name="paintpalette.fill" size={14} tintColor={Col.text} type="monochrome" style={{ width: 14, height: 14 }} />
              <Text style={s.customizeTxt}>Customize</Text>
            </Pressable>
          </View>

          <RankUpBanner peakTier={peakTier} />

          <MuscleTierMap tiers={tiers} scale={1.0} />

          <Pressable onPress={() => Linking.openURL(MUSCLE_ICON_ATTRIBUTION.url)} style={s.attribution} hitSlop={8}>
            <Text style={s.attributionTxt}>{MUSCLE_ICON_ATTRIBUTION.text}</Text>
          </Pressable>
        </ScrollView>
      </ScreenBackground>
    </>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: Sp.md,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Col.card,
  },
  customizeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: Col.card,
  },
  customizeTxt: { fontSize: 13, fontWeight: W.semi, color: Col.text },
  // FONT.displayLight, not displayBold — matches the app's own "greeting
  // header" convention (see DESIGN.md's FONT table: displayLight is for
  // screen titles like "Welcome back.", not section headings). Dropped the
  // subtitle entirely, per explicit ask — it read as clutter under a title
  // this size; the card below already makes the "volume AND form" point.
  title: { flex: 1, fontFamily: FONT.displayLight, fontSize: Sz.h1, color: Col.text, letterSpacing: -0.5 },

  attribution:    { alignItems: 'center', marginTop: Sp.lg, paddingVertical: 6 },
  attributionTxt: { fontSize: Sz.caption, color: Col.textSub, textDecorationLine: 'underline' },
});
