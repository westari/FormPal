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

import { Col, Sp, Sz, FONT, Elev } from '../constants/theme';
import ScreenBackground from '../components/ScreenBackground';
import { MuscleTierMap, MuscleRankBackdrop, computeOverallStanding, MUSCLE_ICON_ATTRIBUTION } from '../components/MuscleTierMap';
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

  return (
    <>
      <StatusBar style="dark" />
      <ScreenBackground>
        <MuscleRankBackdrop tier={overall?.tier ?? 'bronze'} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60, paddingHorizontal: Sp.md }}
        >
          <View style={s.header}>
            <Pressable onPress={() => router.back()} style={[s.backBtn, SHADOW_LOW]} hitSlop={10}>
              <SymbolView name="chevron.left" size={18} tintColor={Col.text} type="monochrome" style={{ width: 18, height: 18 }} />
            </Pressable>
            <View style={{ gap: 2 }}>
              <Text style={s.title}>Standing</Text>
              <Text style={s.sub}>Trained volume AND form quality, decayed over 14 days</Text>
            </View>
          </View>

          <MuscleTierMap tiers={tiers} scale={0.9} />

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
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: Sp.lg,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Col.card,
  },
  title: { fontFamily: FONT.displayBold, fontSize: Sz.h2, color: Col.text, letterSpacing: -0.3 },
  sub:   { fontSize: Sz.small, color: Col.textSub, maxWidth: 280 },

  attribution:    { alignItems: 'center', marginTop: Sp.lg, paddingVertical: 6 },
  attributionTxt: { fontSize: Sz.caption, color: Col.textSub, textDecorationLine: 'underline' },
});
