/**
 * components/onboarding/StrengthAssessmentScreen.tsx
 *
 * Native rebuild of strengthassessment2.html — "how many reps can you do"
 * for push-ups / pull-ups / squats. Was a WebView with three hand-rolled
 * drag wheels (choppy, no haptics); now three native picker wheels (smooth
 * by definition) with a selection haptic on every tick. Matches the
 * artboard: Plus Jakarta Sans, "rank" in blue, the grey rounded card, the
 * black pill CTA.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { LiquidGlassButton } from '../LiquidGlass';
import { PJS } from '../../constants/theme';
import { PUSHUP_ICON, PULLUP_ICON, SQUAT_ICON } from '../../assets/onboarding/onbIcons';

const MOVES = [
  { key: 'pushups' as const, label: 'Push-ups', icon: PUSHUP_ICON, max: 60, start: 15 },
  { key: 'pullups' as const, label: 'Pull-ups', icon: PULLUP_ICON, max: 30, start: 6 },
  { key: 'squats'  as const, label: 'Squats',   icon: SQUAT_ICON,  max: 80, start: 25 },
];

export default function StrengthAssessmentScreen({
  answers,
  topInset,
  onAdvance,
  onBack,
  onSave,
}: {
  answers: Record<string, any>;
  topInset: number;
  onAdvance: () => void;
  onBack: () => void;
  onSave: (reps: Record<string, number>) => void;
}) {
  const [reps, setReps] = useState<Record<string, number>>(() => ({
    pushups: typeof answers.pushups === 'number' ? answers.pushups : 15,
    pullups: typeof answers.pullups === 'number' ? answers.pullups : 6,
    squats: typeof answers.squats === 'number' ? answers.squats : 25,
  }));

  const set = (key: string, v: number) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    setReps((r) => ({ ...r, [key]: v }));
  };

  const cont = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    onSave(reps);
    onAdvance();
  };

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={[s.backWrap, { top: topInset + 8 }]} pointerEvents="box-none">
        <LiquidGlassButton
          onPress={() => { void Haptics.selectionAsync(); onBack(); }}
          hitSlop={12}
          radius={17}
          variant="regular"
          fallbackColor="rgba(255,255,255,0.92)"
          style={s.backBtn}
        >
          <SymbolView name="chevron.left" size={15} tintColor="#1b1f27" type="monochrome" style={{ width: 15, height: 15 }} />
        </LiquidGlassButton>
      </View>

      <View style={s.header}>
        <Text style={s.h1}>Let's set your <Text style={s.accent}>rank</Text></Text>
        <Text style={s.sub}>Select how many reps you can do in a row of each exercise.</Text>
      </View>

      <View style={s.cardWrap}>
        <View style={s.card}>
          <View style={s.cols}>
            {MOVES.map((m) => (
              <View key={m.key} style={s.col}>
                <Image source={{ uri: m.icon }} style={s.icon} resizeMode="contain" />
                <Text style={s.colLabel}>{m.label}</Text>
                <View style={s.wheel}>
                  <Picker
                    selectedValue={reps[m.key]}
                    onValueChange={(v) => set(m.key, Number(v))}
                    style={s.picker}
                    itemStyle={s.pickerItem}
                  >
                    {Array.from({ length: m.max + 1 }, (_, n) => (
                      <Picker.Item key={n} label={String(n)} value={n} />
                    ))}
                  </Picker>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={s.footer}>
        <Pressable style={s.cta} onPress={cont}>
          <Text style={s.ctaTxt}>Continue</Text>
        </Pressable>
        <Text style={s.foot}>We'll set your starting weights from this</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },

  backWrap: { position: 'absolute', left: 20, zIndex: 30 },
  backBtn: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)',
    ...({ boxShadow: '0px 2px 8px rgba(0,0,0,0.10)' } as any),
  },

  header: { paddingTop: 66, paddingHorizontal: 26, alignItems: 'center' },
  h1: { fontFamily: PJS.extrabold, fontSize: 28, color: '#111114', letterSpacing: -1, textAlign: 'center', lineHeight: 32 },
  accent: { color: '#2E7DFF', fontFamily: PJS.extrabold },
  sub: { fontFamily: PJS.semibold, fontSize: 13.5, color: '#6e6e77', textAlign: 'center', paddingTop: 8, lineHeight: 19 },

  cardWrap: { paddingHorizontal: 18, paddingTop: 40 },
  card: { borderRadius: 26, backgroundColor: '#f6f6f8', paddingVertical: 22, paddingHorizontal: 12 },
  cols: { flexDirection: 'row', gap: 8 },
  col: { flex: 1, alignItems: 'center', gap: 10 },
  icon: { width: 30, height: 30 },
  colLabel: { fontFamily: PJS.bold, fontSize: 13, letterSpacing: -0.2, color: '#6e6e77' },

  wheel: { width: '100%', height: 226, borderRadius: 20, backgroundColor: '#ffffff', overflow: 'hidden', justifyContent: 'center' },
  picker: { width: '100%', height: 226 },
  pickerItem: { fontSize: 20, color: '#111114', height: 226 },

  footer: { marginTop: 'auto', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 30, gap: 8 },
  cta: {
    width: '100%', height: 58, borderRadius: 999, backgroundColor: '#111114',
    alignItems: 'center', justifyContent: 'center',
    ...({ boxShadow: '0px 16px 30px -16px rgba(17,17,20,0.6)' } as any),
  },
  ctaTxt: { fontFamily: PJS.bold, fontSize: 16.5, color: '#fff', letterSpacing: -0.2 },
  foot: { fontFamily: PJS.semibold, fontSize: 11.5, color: '#6e6e77', textAlign: 'center' },
});
