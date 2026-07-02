/**
 * app/(tabs)/progress.tsx — FormPal Progress Screen
 *
 * Features:
 *   • Interactive form-trend chart — tap any dot to inspect that session
 *   • Muscle coverage heatmap — front/back body diagram, exercise-weighted scoring
 *   • Personal bests / milestones
 *   • Per-exercise breakdown cards
 *   • Full session history with home-style SessionCards
 *
 * Design: exact same tokens, shadows, and components as index.tsx.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import Svg, {
  G,
  Path as SvgPath,
  Circle as SvgCircle,
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Line as SvgLine,
} from 'react-native-svg';
import Body from 'react-native-body-highlighter';

import { FONT, Sp, W } from '../../constants/theme';
import Ring from '../../components/Ring';
import ScreenBackground from '../../components/ScreenBackground';
import { EXERCISE_CATALOG, MuscleGroup } from '../../constants/exercises';

// ─── Design tokens — exact match to index.tsx ────────────────────────────────

const C = {
  text:     '#0b1020',
  textSub:  '#9aa0ad',
  textDim:  '#b6bcc7',
  accent:   '#0a84ff',
  card:     '#ffffff',
  border:   'rgba(17,24,39,0.05)',
  iconBox:  '#f4f5f8',
  formGrad: ['#FFC24B', '#FF7A2E'] as [string, string],
  weekGrad: ['#48E08A', '#12B59A'] as [string, string],
  repsGrad: ['#67CEFF', '#0A6CFF'] as [string, string],
  goodBg:   'rgba(52,199,89,0.14)',  goodText:  '#1f9d4d',
  midBg:    'rgba(255,179,61,0.20)', midText:   '#c47f12',
  lowBg:    'rgba(255,59,48,0.14)',  lowText:   '#e0352b',
};

const SHADOW_HIGH = Platform.OS === 'ios' ? {
  boxShadow: '0px 1.5px 3px rgba(16,24,40,0.05), 0px 5px 12px rgba(16,24,40,0.05), 0px 20px 36px rgba(28,40,90,0.22), inset 0px 1px 0px rgba(255,255,255,0.95)',
} as any : {};

const SHADOW_MED = Platform.OS === 'ios' ? {
  boxShadow: '0px 1px 1.5px rgba(16,24,40,0.05), 0px 8px 18px rgba(28,40,90,0.15), inset 0px 1px 0px rgba(255,255,255,0.9)',
} as any : {};

const SHADOW_ROW = Platform.OS === 'ios' ? {
  boxShadow: '0px 1px 1.5px rgba(16,24,40,0.05), 0px 8px 18px rgba(28,40,90,0.12), inset 0px 1px 0px rgba(255,255,255,0.9)',
} as any : {};

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_LOG_KEY = 'formpal_session_log';
const THIRTY_DAYS_MS  = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS   =  7 * 24 * 60 * 60 * 1000;
const DAY_MS          = 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionEntry = { ts: number; reps: number; goodReps: number; pct: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatShort(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLong(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Catmull-Rom → cubic bezier smooth path (exact from index.tsx)
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return '';
  const t = 0.35;
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

function calcStreak(sessions: SessionEntry[]): number {
  if (sessions.length === 0) return 0;
  const daySet = new Set(sessions.map(s => {
    const d = new Date(s.ts); d.setHours(0, 0, 0, 0); return d.getTime();
  }));
  const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const startDay = daySet.has(todayMs) ? todayMs : todayMs - DAY_MS;
  if (!daySet.has(startDay)) return 0;
  let streak = 0; let check = startDay;
  while (daySet.has(check)) { streak++; check -= DAY_MS; }
  return streak;
}

// Muscle group → library slug mappings
const GROUP_TO_FRONT_SLUGS: Partial<Record<MuscleGroup, string[]>> = {
  [MuscleGroup.Chest]:     ['chest'],
  [MuscleGroup.Shoulders]: ['deltoids'],
  [MuscleGroup.Arms]:      ['biceps', 'forearm'],
  [MuscleGroup.Core]:      ['abs', 'obliques'],
  [MuscleGroup.Legs]:      ['quadriceps', 'adductors'],
};
const GROUP_TO_BACK_SLUGS: Partial<Record<MuscleGroup, string[]>> = {
  [MuscleGroup.Back]:      ['trapezius', 'upper-back'],
  [MuscleGroup.Shoulders]: ['deltoids'],
  [MuscleGroup.Arms]:      ['triceps'],
  [MuscleGroup.Core]:      ['lower-back'],
  [MuscleGroup.Legs]:      ['hamstring', 'gluteal', 'calves'],
};

function computeGroupScores(sessions: SessionEntry[]): Partial<Record<MuscleGroup, number>> {
  if (sessions.length === 0) return {};
  const now = Date.now();
  const weightedReps = sessions.reduce((sum, s) => {
    const ageDays = (now - s.ts) / DAY_MS;
    return sum + s.reps * Math.exp(-ageDays * Math.LN2 / 14);
  }, 0);
  const intensity = Math.min(1, weightedReps / 200);

  const groupCount: Partial<Record<MuscleGroup, number>> = {};
  for (const ex of EXERCISE_CATALOG) {
    for (const mg of ex.muscleGroups) {
      groupCount[mg] = (groupCount[mg] ?? 0) + 1;
    }
  }
  const maxCount = Math.max(...(Object.values(groupCount) as number[]));
  const result: Partial<Record<MuscleGroup, number>> = {};
  for (const mg of Object.keys(groupCount) as MuscleGroup[]) {
    result[mg] = ((groupCount[mg] ?? 0) / maxCount) * intensity;
  }
  return result;
}

function scoreToIntensity(score: number): 1 | 2 | 3 {
  if (score < 0.3) return 1;
  if (score < 0.65) return 2;
  return 3;
}

function buildBodyData(
  groupScores: Partial<Record<MuscleGroup, number>>,
  side: 'front' | 'back',
): Array<{ slug: string; intensity: 1 | 2 | 3 }> {
  const mapping = side === 'front' ? GROUP_TO_FRONT_SLUGS : GROUP_TO_BACK_SLUGS;
  const out: Array<{ slug: string; intensity: 1 | 2 | 3 }> = [];
  for (const [mg, slugs] of Object.entries(mapping) as [MuscleGroup, string[]][]) {
    const score = groupScores[mg] ?? 0;
    if (score > 0.05) {
      for (const slug of slugs) {
        out.push({ slug, intensity: scoreToIntensity(score) });
      }
    }
  }
  return out;
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={sh.wrap}>
      <Text style={sh.title}>{title}</Text>
      {sub ? <Text style={sh.sub}>{sub}</Text> : null}
    </View>
  );
}
const sh = StyleSheet.create({
  wrap:  { paddingHorizontal: 8 },
  title: { fontSize: 17, fontWeight: W.bold, letterSpacing: -0.3, color: C.text },
  sub:   { marginTop: 2, fontSize: 12, fontWeight: W.medium, color: C.textSub },
});

// ─── SessionCard — exact clone of home screen ─────────────────────────────────

function SessionCard({ entry }: { entry: SessionEntry }) {
  const pct = entry.pct;
  const bgColor   = pct >= 80 ? C.goodBg  : pct >= 60 ? C.midBg  : C.lowBg;
  const textColor = pct >= 80 ? C.goodText : pct >= 60 ? C.midText : C.lowText;
  return (
    <View style={[sc.card, SHADOW_ROW]}>
      <View style={sc.iconBox}>
        <SymbolView name="dumbbell.fill" type="monochrome"
          style={{ width: 18, height: 18 }} tintColor="#6b7180" />
      </View>
      <View style={sc.mid}>
        <Text style={sc.date}>{formatLong(entry.ts)}</Text>
        <Text style={sc.meta}>{entry.reps} reps · {entry.goodReps} good</Text>
      </View>
      <View style={[sc.badge, { backgroundColor: bgColor }]}>
        <Text style={[sc.badgeTxt, { color: textColor }]}>{pct}%</Text>
      </View>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, paddingHorizontal: 16,
    backgroundColor: C.card, borderRadius: 18,
    borderWidth: 1, borderColor: C.border,
  },
  iconBox: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: C.iconBox, alignItems: 'center', justifyContent: 'center',
  },
  mid:      { flex: 1, marginLeft: 13 },
  date:     { fontSize: 14, fontWeight: W.semi, color: '#1a1d26' },
  meta:     { marginTop: 2, fontSize: 12.5, fontWeight: W.medium, color: C.textSub },
  badge:    { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 11 },
  badgeTxt: { fontSize: 13, fontWeight: W.bold },
});

// ─── InteractiveFormChart ─────────────────────────────────────────────────────
//
// Bigger than the home preview (VH=220). Each data point is individually
// tappable via SVG G/onPress. A RN View tooltip appears over the selected dot.

function InteractiveFormChart({
  sessions, tab,
}: {
  sessions: SessionEntry[];
  tab: 'week' | 'month' | 'all';
}) {
  const VH = 220;
  const PX = 14;
  const PY = 20;

  const [containerW, setContainerW] = useState(320);
  const [selIdx,     setSelIdx]     = useState<number | null>(null);

  // Reset selection when tab changes
  useEffect(() => { setSelIdx(null); }, [tab]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cut = tab === 'week' ? now - SEVEN_DAYS_MS : tab === 'month' ? now - THIRTY_DAYS_MS : 0;
    return [...sessions].filter(e => e.ts >= cut).sort((a, b) => a.ts - b.ts);
  }, [sessions, tab]);

  const pts = useMemo(() => {
    if (filtered.length < 2) return [];
    return filtered.map((e, i) => ({
      x: PX + (i / (filtered.length - 1)) * (containerW - PX * 2),
      y: PY + (1 - e.pct / 100) * (VH - PY * 2),
    }));
  }, [filtered, containerW]);

  if (filtered.length < 2) {
    return (
      <View style={{ height: VH, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <SymbolView name="chart.line.uptrend.xyaxis" type="monochrome"
          style={{ width: 34, height: 34, marginBottom: 10 }} tintColor={C.textDim} />
        <Text style={{ fontSize: 13.5, color: C.textSub, textAlign: 'center', lineHeight: 20 }}>
          {sessions.length === 0
            ? 'Log your first form check to start tracking progress.'
            : 'Not enough sessions for this time range.'}
        </Text>
      </View>
    );
  }

  const linePath = smoothPath(pts);
  const last     = pts[pts.length - 1];
  const areaPath = linePath + ` L${last.x.toFixed(2)},${VH} L${PX},${VH} Z`;

  const selPt    = selIdx !== null ? pts[selIdx]     : null;
  const selEntry = selIdx !== null ? filtered[selIdx] : null;

  const firstPct = filtered[0].pct;
  const lastPct  = filtered[filtered.length - 1].pct;
  const diff     = lastPct - firstPct;

  // Build evenly spaced date labels (4 labels)
  const dateLabels: string[] = (() => {
    const n = Math.min(4, filtered.length);
    return Array.from({ length: n }, (_, i) => {
      const idx = Math.round(i * (filtered.length - 1) / (n - 1));
      return formatShort(filtered[idx].ts);
    });
  })();

  // Tooltip X: clamp so it doesn't go off-screen (tooltip ~120px wide)
  const tooltipW = 140;
  const tooltipX = selPt
    ? Math.max(4, Math.min(containerW - tooltipW - 4, selPt.x - tooltipW / 2))
    : 0;
  const tooltipY = selPt ? Math.max(6, selPt.y - 68) : 0;

  return (
    <View>
      {/* Y-axis labels */}
      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
        <View style={ifc.yAxis}>
          <Text style={ifc.yLbl}>100%</Text>
          <Text style={ifc.yLbl}>50%</Text>
          <Text style={ifc.yLbl}>0%</Text>
        </View>
        <View style={{ flex: 1, position: 'relative' }}
          onLayout={e => setContainerW(e.nativeEvent.layout.width)}
        >
          <Svg width={containerW} height={VH} viewBox={`0 0 ${containerW} ${VH}`}>
            <Defs>
              <SvgGrad id="icArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#FF9F0A" stopOpacity={0.22} />
                <Stop offset="85%"  stopColor="#FF9F0A" stopOpacity={0.03} />
                <Stop offset="100%" stopColor="#FF9F0A" stopOpacity={0} />
              </SvgGrad>
            </Defs>

            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((f, i) => (
              <SvgLine key={i}
                x1={0} y1={VH * f} x2={containerW} y2={VH * f}
                stroke={i === 1 ? 'rgba(11,16,36,0.10)' : 'rgba(11,16,36,0.05)'}
                strokeWidth={i === 1 ? 1 : 0.7}
              />
            ))}

            {/* Area fill */}
            <SvgPath d={areaPath} fill="url(#icArea)" />

            {/* Bezier line */}
            <SvgPath
              d={linePath}
              fill="none"
              stroke="#FF9F0A"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Dashed vertical drop from last point */}
            <SvgLine
              x1={last.x} y1={last.y} x2={last.x} y2={VH}
              stroke="rgba(255,159,10,0.20)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />

            {/* Tappable data points */}
            {pts.map((pt, i) => {
              const isSel = selIdx === i;
              return (
                <G key={i} onPress={() => setSelIdx(isSel ? null : i)}>
                  {/* Large transparent hit area */}
                  <SvgCircle cx={pt.x} cy={pt.y} r={22} fill="transparent" />
                  {isSel ? (
                    <>
                      <SvgCircle cx={pt.x} cy={pt.y} r={15} fill="rgba(255,159,10,0.15)" />
                      <SvgCircle cx={pt.x} cy={pt.y} r={7}  fill="#FF9F0A" />
                      <SvgCircle cx={pt.x} cy={pt.y} r={2.8} fill="rgba(255,255,255,0.92)" />
                    </>
                  ) : (
                    <SvgCircle cx={pt.x} cy={pt.y} r={i === pts.length - 1 ? 5 : 3.5}
                      fill={i === pts.length - 1 ? '#FF9F0A' : 'rgba(255,159,10,0.50)'} />
                  )}
                </G>
              );
            })}
          </Svg>

          {/* Session tooltip — appears above the tapped dot */}
          {selPt && selEntry ? (
            <View style={[ifc.tooltip, { left: tooltipX, top: tooltipY }]}
              pointerEvents="none">
              <Text style={ifc.ttDate}>{formatLong(selEntry.ts)}</Text>
              <View style={ifc.ttRow}>
                <Text style={ifc.ttScore}>{selEntry.pct}%</Text>
                <Text style={ifc.ttSub}> form · {selEntry.reps} reps</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {/* X-axis date labels */}
      {dateLabels.length > 0 ? (
        <View style={[ifc.xAxis, { marginLeft: 34 }]}>
          {dateLabels.map((lbl, i) => (
            <Text key={i} style={[ifc.xLbl, i === dateLabels.length - 1 && ifc.xLblNow]}>
              {lbl}
            </Text>
          ))}
        </View>
      ) : null}

      {/* Tap hint when nothing selected */}
      {selIdx === null ? (
        <Text style={ifc.hint}>Tap any dot to inspect that session</Text>
      ) : null}

      {/* Insight */}
      <View style={ifc.insightRow}>
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <SvgPath d="M12 2.5l1.7 5.3 5.3 1.7-5.3 1.7L12 16.5l-1.7-5.3L5 9.5l5.3-1.7z" fill={C.accent} />
          <SvgPath d="M18.5 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" fill={C.accent} />
        </Svg>
        <Text style={ifc.insightTxt}>
          {diff >= 0
            ? <Text>Up <Text style={ifc.insightBold}>{diff}%</Text> since your first session.</Text>
            : <Text>Down <Text style={ifc.insightBold}>{Math.abs(diff)}%</Text> — keep logging to turn it around.</Text>
          }
        </Text>
      </View>
    </View>
  );
}
const ifc = StyleSheet.create({
  yAxis: {
    width: 34, justifyContent: 'space-between',
    paddingTop: 20, paddingBottom: 20,
  },
  yLbl: { fontSize: 9.5, fontWeight: W.medium, color: C.textSub, textAlign: 'right' },
  tooltip: {
    position: 'absolute',
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    ...SHADOW_HIGH,
    borderWidth: 1,
    borderColor: C.border,
    minWidth: 140,
  },
  ttDate:  { fontSize: 11, fontWeight: W.semi, color: C.textSub, marginBottom: 3 },
  ttRow:   { flexDirection: 'row', alignItems: 'baseline' },
  ttScore: { fontSize: 18, fontWeight: W.bold, color: '#FF9F0A' },
  ttSub:   { fontSize: 12.5, fontWeight: W.medium, color: C.textSub },
  xAxis:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 2 },
  xLbl:    { fontSize: 10.5, fontWeight: W.medium, color: C.textSub },
  xLblNow: { fontWeight: W.bold, color: C.text },
  hint:    { textAlign: 'center', fontSize: 11, color: C.textDim, marginTop: 6, fontWeight: W.medium },
  insightRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 14 },
  insightTxt:  { fontSize: 12.5, color: C.text, letterSpacing: -0.2 },
  insightBold: { fontWeight: W.bold },
});

// ─── MuscleMapCard ────────────────────────────────────────────────────────────

const BODY_COLORS = ['#FFC24B', '#FF9F0A', '#FF7A2E'] as const;
const BODY_SCALE  = 0.72; // 144 × 288

function MuscleMapCard({ sessions }: { sessions: SessionEntry[] }) {
  const groupScores = useMemo(() => computeGroupScores(sessions), [sessions]);
  const isEmpty = sessions.length === 0;

  const frontData = useMemo(() => buildBodyData(groupScores, 'front'), [groupScores]);
  const backData  = useMemo(() => buildBodyData(groupScores, 'back'),  [groupScores]);

  return (
    <View style={[mm.card, SHADOW_HIGH]}>
      <View style={mm.header}>
        <View style={{ flex: 1 }}>
          <Text style={mm.title}>Muscle coverage</Text>
          <Text style={mm.sub}>Computed from your squat · push-up · curl sessions</Text>
        </View>
        {!isEmpty && (
          <View style={mm.legendBar}>
            <LinearGradient
              colors={['#FFC24B', '#FF9F0A', '#FF7A2E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={mm.legendGrad}
            />
            <View style={mm.legendLabels}>
              <Text style={mm.legendLbl}>Low</Text>
              <Text style={mm.legendLbl}>High</Text>
            </View>
          </View>
        )}
      </View>

      {isEmpty ? (
        <View style={mm.emptyState}>
          <SymbolView name="figure.strengthtraining.traditional" type="monochrome"
            style={{ width: 36, height: 36, marginBottom: 10 }} tintColor={C.textDim} />
          <Text style={mm.emptyTitle}>No sessions yet</Text>
          <Text style={mm.emptySub}>
            Log form-check sessions and your muscle coverage map will fill in here.
          </Text>
        </View>
      ) : (
        <View style={mm.diagramsRow}>
          <View style={mm.diagramCol}>
            <Body
              data={frontData}
              side="front"
              gender="male"
              scale={BODY_SCALE}
              colors={BODY_COLORS}
              defaultFill="rgba(200,210,228,0.4)"
              border="none"
            />
            <Text style={mm.diagramLabel}>Front</Text>
          </View>

          <View style={mm.diagramDivider} />

          <View style={mm.diagramCol}>
            <Body
              data={backData}
              side="back"
              gender="male"
              scale={BODY_SCALE}
              colors={BODY_COLORS}
              defaultFill="rgba(200,210,228,0.4)"
              border="none"
            />
            <Text style={mm.diagramLabel}>Back</Text>
          </View>
        </View>
      )}

      {!isEmpty && (
        <Text style={mm.note}>
          Color warmth reflects training intensity over the past 14 days
        </Text>
      )}
    </View>
  );
}
const mm = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 28,
    borderWidth: 1, borderColor: C.border,
    padding: 20, gap: 18,
  },
  header:         { flexDirection: 'row', alignItems: 'flex-start' },
  title:          { fontSize: 15.5, fontWeight: W.bold, letterSpacing: -0.2, color: C.text },
  sub:            { marginTop: 2, fontSize: 11, fontWeight: W.medium, color: C.textSub },
  legendBar:      { alignItems: 'flex-end', gap: 4, marginLeft: 12 },
  legendGrad:     { width: 60, height: 7, borderRadius: 4 },
  legendLabels:   { flexDirection: 'row', justifyContent: 'space-between', width: 60 },
  legendLbl:      { fontSize: 9, fontWeight: W.semi, color: C.textSub },
  emptyState:     { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
  emptyTitle:     { fontSize: 15, fontWeight: W.semi, color: C.text, marginBottom: 8 },
  emptySub:       { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 19 },
  diagramsRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  diagramCol:     { flex: 1, alignItems: 'center', gap: 8 },
  diagramDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(17,24,39,0.07)', marginHorizontal: 8 },
  diagramLabel:   { fontSize: 11, fontWeight: W.semi, letterSpacing: 0.4, color: C.textSub },
  note:           { textAlign: 'center', fontSize: 10.5, color: C.textDim, fontWeight: W.medium },
});

// ─── MilestoneCard ────────────────────────────────────────────────────────────

function MilestoneCard({ sessions }: { sessions: SessionEntry[] }) {
  if (sessions.length === 0) return null;

  const best     = sessions.reduce((a, b) => b.pct > a.pct ? b : a);
  const mostReps = sessions.reduce((a, b) => b.reps > a.reps ? b : a);
  const streak   = calcStreak(sessions);
  const total    = sessions.reduce((s, e) => s + e.reps, 0);

  const items = [
    {
      icon: 'trophy.fill',
      grad: C.formGrad,
      label: 'Best form',
      value: `${best.pct}%`,
      sub: formatShort(best.ts),
    },
    {
      icon: 'bolt.fill',
      grad: ['#48E08A', '#12B59A'] as [string,string],
      label: 'Most reps',
      value: String(mostReps.reps),
      sub: formatShort(mostReps.ts),
    },
    {
      icon: 'flame.fill',
      grad: ['#FF6B6B', '#FF3B30'] as [string,string],
      label: 'Day streak',
      value: String(streak),
      sub: streak === 1 ? '1 day' : `${streak} days`,
    },
    {
      icon: 'sum',
      grad: C.repsGrad,
      label: 'Total reps',
      value: total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total),
      sub: `${sessions.length} sessions`,
    },
  ];

  return (
    <View style={[mil.card, SHADOW_MED]}>
      {items.map((item, i) => (
        <View key={i} style={[mil.item, i < items.length - 1 && mil.itemBorder]}>
          <LinearGradient colors={item.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={mil.iconBox}>
            <SymbolView name={item.icon as any} type="monochrome"
              style={{ width: 15, height: 15 }} tintColor="#fff" />
          </LinearGradient>
          <Text style={mil.label}>{item.label}</Text>
          <Text style={mil.value}>{item.value}</Text>
          <Text style={mil.sub}>{item.sub}</Text>
        </View>
      ))}
    </View>
  );
}
const mil = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 22,
    borderWidth: 1, borderColor: C.border,
    flexDirection: 'row',
  },
  item: {
    flex: 1, alignItems: 'center', gap: 5,
    paddingVertical: 16, paddingHorizontal: 6,
  },
  itemBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(17,24,39,0.08)',
  },
  iconBox: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 10, fontWeight: W.semi, color: C.textSub, letterSpacing: 0.1, textAlign: 'center' },
  value:   { fontSize: 18, fontWeight: W.bold, letterSpacing: -0.3, color: C.text },
  sub:     { fontSize: 10, fontWeight: W.medium, color: C.textDim },
});

// ─── ExerciseCards ────────────────────────────────────────────────────────────

const EX_CONFIG = [
  {
    id: 'squat',  name: 'Squat',
    icon: 'figure.strengthtraining.traditional',
    colors: C.formGrad,
    grad: 'gExSq',
    muscles: 'Legs · Glutes',
  },
  {
    id: 'pushup', name: 'Push-up',
    icon: 'figure.core.training',
    colors: C.repsGrad,
    grad: 'gExPu',
    muscles: 'Chest · Shoulders · Arms',
  },
  {
    id: 'curl',   name: 'Curl',
    icon: 'dumbbell.fill',
    colors: C.weekGrad,
    grad: 'gExCu',
    muscles: 'Biceps · Back',
  },
];

function ExerciseBreakdown({ sessions }: { sessions: SessionEntry[] }) {
  return (
    <View style={ebd.row}>
      {EX_CONFIG.map(ex => (
        <View key={ex.id} style={[ebd.card, SHADOW_MED]}>
          <Ring
            progress={0}
            colors={ex.colors}
            gradientId={ex.grad}
            value="—"
            unit=""
            label=""
            size={60}
            strokeWidth={7}
          />
          <Text style={ebd.name}>{ex.name}</Text>
          <Text style={ebd.muscles}>{ex.muscles}</Text>
          <Text style={ebd.coming}>Track soon</Text>
        </View>
      ))}
    </View>
  );
}
const ebd = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 10 },
  card: {
    flex: 1, alignItems: 'center', gap: 7,
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.border,
    paddingVertical: 18, paddingHorizontal: 8,
  },
  name:    { fontSize: 12.5, fontWeight: W.semi, color: C.text, textAlign: 'center' },
  muscles: { fontSize: 10, fontWeight: W.medium, color: C.textSub, textAlign: 'center', lineHeight: 14 },
  coming:  { fontSize: 10, fontWeight: W.medium, color: C.textDim, textAlign: 'center' },
});

// ─── ProgressScreen ───────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();

  const [sessions,    setSessions]    = useState<SessionEntry[]>([]);
  const [progressTab, setProgressTab] = useState<'week' | 'month' | 'all'>('all');

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(SESSION_LOG_KEY).then(raw => {
      if (!raw) { setSessions([]); return; }
      setSessions((JSON.parse(raw) as SessionEntry[]).sort((a, b) => a.ts - b.ts));
    }).catch(() => setSessions([]));
  }, []));

  const reversedSessions = useMemo(() => [...sessions].reverse(), [sessions]);

  return (
    <>
      <StatusBar style="dark" />
      <ScreenBackground>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.scroll,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 90 },
          ]}
        >

          {/* ── HEADER ────────────────────────────────────────────────── */}
          <View style={s.header}>
            <Text style={s.heading}>Progress</Text>
            <Text style={s.sub}>Your form score and training history.</Text>
          </View>

          {/* ── FORM TREND CHART ──────────────────────────────────────── */}
          <View>
            <View style={s.chartTopRow}>
              <SectionHeader title="Form trend" />
              <View style={s.segPicker}>
                {(['week', 'month', 'all'] as const).map(tab => (
                  <Pressable key={tab} onPress={() => setProgressTab(tab)}
                    style={[s.segItem, progressTab === tab && s.segActive]}>
                    <Text style={[s.segTxt, progressTab === tab && s.segTxtActive]}>
                      {tab === 'week' ? 'Week' : tab === 'month' ? 'Month' : 'All'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={[s.chartCard, SHADOW_HIGH]}>
              <InteractiveFormChart sessions={sessions} tab={progressTab} />
            </View>
          </View>

          {/* ── MUSCLE MAP ────────────────────────────────────────────── */}
          <SectionHeader title="Muscle coverage" sub="Which muscle groups your sessions train" />
          <MuscleMapCard sessions={sessions} />

          {/* ── MILESTONES ────────────────────────────────────────────── */}
          {sessions.length > 0 ? (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Personal bests" />
              <MilestoneCard sessions={sessions} />
            </View>
          ) : null}

          {/* ── EXERCISE BREAKDOWN ────────────────────────────────────── */}
          <View style={{ gap: 10 }}>
            <SectionHeader
              title="By exercise"
              sub="Per-exercise stats will unlock when sessions track exercise type"
            />
            <ExerciseBreakdown sessions={sessions} />
          </View>

          {/* ── SESSION HISTORY ───────────────────────────────────────── */}
          <View style={{ gap: 10 }}>
            <SectionHeader
              title="All sessions"
              sub={sessions.length > 0 ? `${sessions.length} logged` : undefined}
            />
            <View style={s.sessionList}>
              {reversedSessions.length === 0 ? (
                <View style={[s.emptyCard, SHADOW_MED]}>
                  <SymbolView name="figure.run" type="monochrome"
                    style={{ width: 32, height: 32, marginBottom: 12 }} tintColor={C.textDim} />
                  <Text style={s.emptyTitle}>No sessions yet</Text>
                  <Text style={s.emptySub}>
                    Use Quick Form Check to start logging reps and form scores.
                  </Text>
                </View>
              ) : (
                reversedSessions.map((entry, i) => (
                  <SessionCard key={`${entry.ts}-${i}`} entry={entry} />
                ))
              )}
            </View>
          </View>

        </ScrollView>
      </ScreenBackground>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: { gap: Sp.lg, paddingHorizontal: 16 },

  // Header
  header:  { gap: 6, paddingHorizontal: 8 },
  heading: {
    fontFamily: FONT.displayLight,
    fontSize: 36, lineHeight: 38,
    letterSpacing: -1, color: C.text,
  },
  sub: { fontSize: 13.5, fontWeight: W.medium, letterSpacing: 0.1, color: C.textSub },

  // Chart
  chartTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 8,
    marginBottom: 10,
  },
  chartCard: {
    backgroundColor: C.card, borderRadius: 28,
    borderWidth: 1, borderColor: C.border,
    padding: 18, paddingBottom: 14,
  },
  segPicker: {
    flexDirection: 'row', gap: 2, padding: 3,
    backgroundColor: '#eceef3', borderRadius: 10,
  },
  segItem:      { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 7 },
  segActive:    { backgroundColor: C.card },
  segTxt:       { fontSize: 11, fontWeight: W.semi, color: C.textSub },
  segTxtActive: { fontWeight: W.bold, color: C.text },

  // Sessions
  sessionList: { gap: 10 },
  emptyCard: {
    backgroundColor: C.card, borderRadius: 22,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', paddingVertical: 36, paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 16, fontWeight: W.semi, color: C.text, marginBottom: 8 },
  emptySub:   { fontSize: 13.5, color: C.textSub, textAlign: 'center', lineHeight: 20 },
});
