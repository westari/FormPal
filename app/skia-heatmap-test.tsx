/**
 * app/skia-heatmap-test.tsx — ISOLATED test route for the experimental Skia
 * continuous thermal heatmap (components/SkiaMuscleHeatmap.tsx). Reach it
 * from Profile → Developer → "Skia Heatmap Test (DEV)".
 *
 * Deliberately standalone: this screen does not touch recap.tsx or the
 * progress tab. Verify it renders without crashing here first. If it's
 * solid, the next step is swapping components/SkiaMuscleHeatmapSafe.tsx in
 * for MuscleHeatmap in recap.tsx's hero card — not done yet, on purpose.
 *
 * Three panels, in order, so a crash (or a silent fallback) is easy to spot:
 *   1. Raw SkiaMuscleHeatmap — no error boundary. If Skia itself is going to
 *      throw, it throws here, and this whole screen goes down (that's the
 *      point of testing it in isolation, away from recap).
 *   2. SkiaMuscleHeatmapSafe — the boundary-wrapped version that recap would
 *      actually use. Should look identical to panel 1 if Skia is fine.
 *   3. The existing proven-safe MuscleHeatmap (SVG), same data, for a
 *      side-by-side comparison of the "real blend" vs. the shipped version.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenBackground from '../components/ScreenBackground';
import { SkiaMuscleHeatmap } from '../components/SkiaMuscleHeatmap';
import { SkiaMuscleHeatmapSafe } from '../components/SkiaMuscleHeatmapSafe';
import { MuscleHeatmap } from '../components/MuscleHeatmap';
import { MuscleGroup } from '../constants/exercises';
import type { MuscleScores } from '../lib/sessionLog';

const SAMPLE_SCORES: MuscleScores = {
  [MuscleGroup.Chest]:     0.9,
  [MuscleGroup.Shoulders]: 0.6,
  [MuscleGroup.Arms]:      0.4,
  [MuscleGroup.Back]:      0.75,
  [MuscleGroup.Core]:      0.2,
  [MuscleGroup.Legs]:      0.5,
};
const SAMPLE_HIGHLIGHT = new Set([MuscleGroup.Chest, MuscleGroup.Arms]);

export default function SkiaHeatmapTestScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60, paddingHorizontal: 16, gap: 28 }}>
        <Text style={s.title}>Skia heatmap test</Text>
        <Text style={s.sub}>Isolated route — not linked from recap. Verify each panel renders without crashing.</Text>

        <View style={s.panel}>
          <Text style={s.panelTitle}>1. Raw SkiaMuscleHeatmap (no boundary)</Text>
          <SkiaMuscleHeatmap overallScores={SAMPLE_SCORES} highlightGroups={SAMPLE_HIGHLIGHT} scale={0.72} />
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>2. SkiaMuscleHeatmapSafe (boundary + SVG fallback)</Text>
          <SkiaMuscleHeatmapSafe overallScores={SAMPLE_SCORES} highlightGroups={SAMPLE_HIGHLIGHT} highlightLabel="Today" scale={0.72} />
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>3. Existing shipped MuscleHeatmap (SVG, for comparison)</Text>
          <MuscleHeatmap overallScores={SAMPLE_SCORES} highlightGroups={SAMPLE_HIGHLIGHT} highlightLabel="Today" scale={0.72} />
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  title:      { fontSize: 22, fontWeight: '700', color: '#0b1020' },
  sub:        { fontSize: 13, color: '#6b7280', marginTop: -20 },
  panel:      { gap: 12, borderWidth: 1, borderColor: 'rgba(17,24,39,0.08)', borderRadius: 16, padding: 16, backgroundColor: 'rgba(255,255,255,0.6)' },
  panelTitle: { fontSize: 13, fontWeight: '600', color: '#0b1020' },
});
