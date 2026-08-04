/**
 * components/MuscleHeatmap.tsx
 *
 * Shared muscle-coverage body diagram — used by the progress tab (cumulative
 * only) and the recap screen (cumulative + "worked this session" overlay).
 * Wraps react-native-body-highlighter; does not re-implement the body art.
 *
 * Gender note: the library only ships gender="male" | "female" body shapes —
 * there is no neutral silhouette option, and building a custom one would mean
 * not reusing this component. "male" is hardcoded below as an accepted
 * limitation, not a guess — see CLAUDE.md investigate-first rule.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Body from 'react-native-body-highlighter';
import type { ExtendedBodyPart, Slug } from 'react-native-body-highlighter';
import { MuscleGroup } from '../constants/exercises';
import type { MuscleScores } from '../lib/sessionLog';

const C = {
  text:    '#0b1020',
  textSub: '#9aa0ad',
};

const BODY_COLORS  = ['#FFC24B', '#FF9F0A', '#FF7A2E'] as const; // cumulative low → high
const TODAY_COLOR  = '#0a84ff'; // distinct overlay color for "worked this session"

const GROUP_TO_FRONT_SLUGS: Partial<Record<MuscleGroup, Slug[]>> = {
  [MuscleGroup.Chest]:     ['chest'],
  [MuscleGroup.Shoulders]: ['deltoids'],
  [MuscleGroup.Arms]:      ['biceps', 'forearm'],
  [MuscleGroup.Core]:      ['abs', 'obliques'],
  [MuscleGroup.Legs]:      ['quadriceps', 'adductors'],
};
const GROUP_TO_BACK_SLUGS: Partial<Record<MuscleGroup, Slug[]>> = {
  [MuscleGroup.Back]:      ['trapezius', 'upper-back'],
  [MuscleGroup.Shoulders]: ['deltoids'],
  [MuscleGroup.Arms]:      ['triceps'],
  [MuscleGroup.Core]:      ['lower-back'],
  [MuscleGroup.Legs]:      ['hamstring', 'gluteal', 'calves'],
};

function scoreToIntensity(score: number): 1 | 2 | 3 {
  if (score < 0.3) return 1;
  if (score < 0.65) return 2;
  return 3;
}

function buildBodyData(
  overallScores: MuscleScores,
  highlightGroups: Set<MuscleGroup> | undefined,
  side: 'front' | 'back',
): ExtendedBodyPart[] {
  const mapping = side === 'front' ? GROUP_TO_FRONT_SLUGS : GROUP_TO_BACK_SLUGS;
  const out: ExtendedBodyPart[] = [];
  for (const [mg, slugs] of Object.entries(mapping) as [MuscleGroup, Slug[]][]) {
    const isHighlighted = highlightGroups?.has(mg) ?? false;
    if (isHighlighted) {
      for (const slug of slugs) out.push({ slug, intensity: 3, color: TODAY_COLOR });
      continue;
    }
    const score = overallScores[mg] ?? 0;
    if (score > 0.05) {
      for (const slug of slugs) out.push({ slug, intensity: scoreToIntensity(score) });
    }
  }
  return out;
}

export function MuscleHeatmap({
  overallScores,
  highlightGroups,
  highlightLabel = 'Today',
  scale = 0.72,
  showLegend = true,
  showLabels = true,
  emptyMessage = 'Log a session to fill in your muscle map.',
}: {
  overallScores:    MuscleScores;
  highlightGroups?: Set<MuscleGroup>;
  highlightLabel?:  string;
  scale?:           number;
  showLegend?:      boolean;
  showLabels?:      boolean;
  emptyMessage?:    string;
}) {
  const isEmpty = Object.keys(overallScores).length === 0 && (!highlightGroups || highlightGroups.size === 0);

  const frontData = useMemo(
    () => buildBodyData(overallScores, highlightGroups, 'front'),
    [overallScores, highlightGroups],
  );
  const backData = useMemo(
    () => buildBodyData(overallScores, highlightGroups, 'back'),
    [overallScores, highlightGroups],
  );

  return (
    <View style={{ gap: 14 }}>
      {showLegend && !isEmpty && (
        <View style={mh.legendRow}>
          {highlightGroups && highlightGroups.size > 0 && (
            <View style={mh.legendItem}>
              <View style={[mh.legendDot, { backgroundColor: TODAY_COLOR }]} />
              <Text style={mh.legendLbl}>{highlightLabel}</Text>
            </View>
          )}
          <View style={mh.legendItem}>
            <LinearGradient
              colors={BODY_COLORS}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={mh.legendGrad}
            />
            <Text style={mh.legendLbl}>Overall</Text>
          </View>
        </View>
      )}

      {isEmpty ? (
        <View style={mh.emptyState}>
          <Text style={mh.emptyTxt}>{emptyMessage}</Text>
        </View>
      ) : (
        <View style={mh.diagramsRow}>
          <View style={mh.diagramCol}>
            <Body
              data={frontData}
              side="front"
              gender="male"
              scale={scale}
              colors={BODY_COLORS}
              defaultFill="rgba(200,210,228,0.4)"
              border="none"
            />
            {showLabels && <Text style={mh.diagramLabel}>Front</Text>}
          </View>

          <View style={mh.diagramDivider} />

          <View style={mh.diagramCol}>
            <Body
              data={backData}
              side="back"
              gender="male"
              scale={scale}
              colors={BODY_COLORS}
              defaultFill="rgba(200,210,228,0.4)"
              border="none"
            />
            {showLabels && <Text style={mh.diagramLabel}>Back</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

const mh = StyleSheet.create({
  legendRow:      { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:      { width: 9, height: 9, borderRadius: 4.5 },
  legendGrad:     { width: 22, height: 9, borderRadius: 4.5 },
  legendLbl:      { fontSize: 11, fontWeight: '600', color: C.textSub },
  emptyState:     { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
  emptyTxt:       { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 19 },
  diagramsRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  diagramCol:     { flex: 1, alignItems: 'center', gap: 8 },
  diagramDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(17,24,39,0.07)', marginHorizontal: 8 },
  diagramLabel:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: C.textSub },
});
