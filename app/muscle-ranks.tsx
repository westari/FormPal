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
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';

import { Col, Sp, Sz, W, R, Elev } from '../constants/theme';
import ScreenBackground from '../components/ScreenBackground';
import { MuscleTierMap } from '../components/MuscleTierMap';
import { getAllSessions, computeMuscleTiers, type MuscleTiers } from '../lib/sessionLog';

const SHADOW_MED = Platform.OS === 'ios' ? { boxShadow: Elev.medium.shadow } as any : { elevation: Elev.medium.android };
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

  return (
    <>
      <StatusBar style="dark" />
      <ScreenBackground>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60, paddingHorizontal: Sp.md }}
        >
          <View style={s.header}>
            <Pressable onPress={() => router.back()} style={[s.backBtn, SHADOW_LOW]} hitSlop={10}>
              <SymbolView name="chevron.left" size={18} tintColor={Col.text} type="monochrome" style={{ width: 18, height: 18 }} />
            </Pressable>
            <View style={{ gap: 2 }}>
              <Text style={s.title}>Muscle ranks</Text>
              <Text style={s.sub}>Trained volume AND form quality, decayed over 14 days</Text>
            </View>
          </View>

          <View style={[s.card, SHADOW_MED]}>
            <MuscleTierMap tiers={tiers} scale={0.9} />
          </View>

          <View style={s.noteCard}>
            <Text style={s.noteTitle}>How ranks are earned</Text>
            <Text style={s.noteBody}>
              Each muscle group gets a volume rank AND a form-quality rank, independently —
              your actual rank is whichever one is LOWER. High volume alone caps out well
              short of the top: Diamond and above require the good-rep ratio to clear a real
              bar too, not just showing up. This app tracks form quality via camera, which is
              why rank can reflect more than just how many reps you did.
            </Text>
          </View>
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
  title: { fontSize: Sz.h2, fontWeight: W.bold, color: Col.text, letterSpacing: -0.3 },
  sub:   { fontSize: Sz.small, color: Col.textSub, maxWidth: 280 },

  card: {
    backgroundColor: Col.card, borderRadius: R.card,
    borderWidth: 1, borderColor: 'rgba(17,24,39,0.05)',
    padding: 20,
  },

  noteCard: {
    backgroundColor: Col.midSoft, borderRadius: R.inner,
    padding: Sp.md, marginTop: Sp.lg, marginBottom: Sp.lg, gap: 6,
  },
  noteTitle: { fontSize: Sz.small, fontWeight: W.semi, color: Col.text },
  noteBody:  { fontSize: Sz.caption, color: Col.textSub, lineHeight: 18 },
});
