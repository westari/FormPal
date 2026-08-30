/**
 * app/(tabs)/train.tsx — Train tab
 *
 * Same layout as app/exercise-picker.tsx: AppBackground (gradient + blobs),
 * a header, and a 2-column grid of Liquid Glass exercise tiles. Tapping a
 * tile opens the live form check for that exercise.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';

import { EXERCISE_CATALOG } from '../../constants/exercises';
import AppBackground from '../../components/AppBackground';
import GlassSurface from '../../components/GlassSurface';
import { EXERCISE_UI } from '../exercise-picker';

const F = {
  regular: 'BricolageGrotesque_400Regular',
  bold:    'BricolageGrotesque_700Bold',
  extra:   'BricolageGrotesque_800ExtraBold',
};

export default function TrainScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <AppBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 90,
          paddingHorizontal: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={s.title}>Train</Text>
          <Text style={s.sub}>What are you working on?</Text>
        </View>

        <View style={s.grid}>
          {EXERCISE_CATALOG.map(ex => {
            const ui = EXERCISE_UI[ex.id];
            if (!ui) return null;
            return (
              <Pressable
                key={ex.id}
                style={({ pressed }) => [s.cardWrap, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={() => router.push(`/formcheck?exercise=${ex.id}` as any)}
              >
                <GlassSurface radius={22} style={s.card}>
                  <LinearGradient
                    colors={ui.grad}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.iconBox}
                  >
                    <SymbolView
                      name={ui.symbol as any}
                      type="monochrome"
                      style={{ width: 26, height: 26 }}
                      tintColor="#fff"
                    />
                  </LinearGradient>
                  <Text style={s.cardName} numberOfLines={2}>{ex.displayName}</Text>
                  <Text style={s.cardSub} numberOfLines={1}>{ex.muscleGroups.join(' · ')}</Text>
                </GlassSurface>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EDF1F8',
  },
  header: {
    gap: 2,
    marginBottom: 22,
    paddingHorizontal: 2,
  },
  title: {
    fontFamily: F.extra,
    fontSize: 28,
    color: '#16171B',
    letterSpacing: -0.6,
  },
  sub: {
    fontFamily: F.regular,
    fontSize: 13.5,
    color: '#6B6B73',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  cardWrap: { width: '48%' },
  card: {
    minHeight: 138,
    padding: 16,
    gap: 10,
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontFamily: F.bold,
    fontSize: 15.5,
    color: '#16171B',
    letterSpacing: -0.2,
  },
  cardSub: {
    fontFamily: F.regular,
    fontSize: 11.5,
    color: '#8A8A92',
    textTransform: 'capitalize',
  },
});
