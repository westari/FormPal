import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { EXERCISE_CATALOG } from '../constants/exercises';

const EXERCISE_UI: Record<string, { symbol: string; grad: [string, string] }> = {
  squat:         { symbol: 'figure.strengthtraining.traditional', grad: ['#FFC24B', '#FF7A2E'] },
  pushup:        { symbol: 'figure.core.training',               grad: ['#67CEFF', '#0A6CFF'] },
  curl:          { symbol: 'dumbbell.fill',                      grad: ['#48E08A', '#12B59A'] },
  lunge:         { symbol: 'figure.step.training',               grad: ['#C084FC', '#7C3AED'] },
  shoulderPress: { symbol: 'figure.arms.open',                   grad: ['#F97316', '#DC2626'] },
};

export default function ExercisePickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <SymbolView
            name="chevron.left"
            size={18}
            tintColor="#F0F0F2"
            type="monochrome"
            style={{ width: 18, height: 18 }}
          />
        </Pressable>
        <View style={{ gap: 2 }}>
          <Text style={s.title}>Form Check</Text>
          <Text style={s.sub}>What are you working on?</Text>
        </View>
      </View>

      <View style={s.list}>
        {EXERCISE_CATALOG.map(ex => {
          const ui = EXERCISE_UI[ex.id];
          if (!ui) return null;
          return (
            <Pressable
              key={ex.id}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.75 }]}
              onPress={() => router.push(`/formcheck?exercise=${ex.id}` as any)}
            >
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
              <View style={s.cardMid}>
                <Text style={s.cardName}>{ex.displayName}</Text>
                <Text style={s.cardSub}>{ex.muscleGroups.join(' · ')}</Text>
              </View>
              <SymbolView
                name="chevron.right"
                size={15}
                tintColor="#62626A"
                type="monochrome"
                style={{ width: 15, height: 15 }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0B0C',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0F0F2',
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 13.5,
    color: '#9A9AA2',
  },
  list: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    backgroundColor: '#15161A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMid: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#F0F0F2',
    letterSpacing: -0.2,
  },
  cardSub: {
    fontSize: 12.5,
    color: '#9A9AA2',
    textTransform: 'capitalize',
  },
});
