/**
 * app/(tabs)/index.tsx — FormPal Home Screen
 * Visual target: FormPal_Home_reference.html
 *
 * Ring gradient colors match the reference exactly:
 *   Form Score  — #FFC24B → #FF7A2E  (orange → amber)
 *   This Week   — #48E08A → #12B59A  (green  → teal)
 *   Good Reps   — #67CEFF → #0A6CFF  (sky    → blue)
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import Svg, {
  Path as SvgPath, Circle as SvgCircle,
  Defs, LinearGradient as SvgGrad, Stop, Line as SvgLine,
} from 'react-native-svg';

import { FONT, Sp, W } from '../../constants/theme';
import Ring from '../../components/Ring';
import Card from '../../components/Card';
import ScreenBackground from '../../components/ScreenBackground';
import { MOVES } from '../../constants/moves';
import Dropdown from '../../components/Dropdown';

// ─── Reference colors (exact from FormPal_Home_reference.html) ────────────────

const C = {
  text:     '#0b1020',
  textSub:  '#9aa0ad',
  textDim:  '#b6bcc7',
  accent:   '#0a84ff',
  card:     '#ffffff',
  border:   'rgba(17,24,39,0.05)',
  iconBox:  '#f4f5f8',

  // Ring gradients — exact hex from reference defs
  formGrad: ['#FFC24B', '#FF7A2E'] as [string, string],
  weekGrad: ['#48E08A', '#12B59A'] as [string, string],
  repsGrad: ['#67CEFF', '#0A6CFF'] as [string, string],

  // Score badge tiers
  goodBg:   'rgba(52,199,89,0.14)',   goodText:  '#1f9d4d',
  midBg:    'rgba(255,179,61,0.20)',  midText:   '#c47f12',
  lowBg:    'rgba(255,59,48,0.14)',   lowText:   '#e0352b',
};

// Card shadows matching reference exactly (requires new arch)
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
const VIEWED_KEY      = 'formpal_viewed_moves';
const THIRTY_DAYS_MS  = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS   =  7 * 24 * 60 * 60 * 1000;
const WEEK_GOAL       = 5;

// Move-specific gradient colors (ordered to match MOVES array)
const MOVE_GRAD: Record<string, [string, string]> = {
  Bodyweight_Squat:         ['#FFC24B', '#FF7A2E'],
  Pushups:                  ['#67CEFF', '#0A6CFF'],
  Pullups:                  ['#48E08A', '#12B59A'],
  Bodyweight_Walking_Lunge: ['#FFD36B', '#E0A012'],
  Plank:                    ['#d4d7dd', '#b0b4bb'],
  Dumbbell_Bicep_Curl:      ['#67CEFF', '#0A6CFF'],
  Dumbbell_Bench_Press:     ['#FFC24B', '#FF7A2E'],
  Wide_Grip_Lat_Pulldown:   ['#48E08A', '#12B59A'],
  Leg_Press:                ['#FFD36B', '#E0A012'],
  Cable_Shoulder_Press:     ['#67CEFF', '#0A6CFF'],
  Clean_Deadlift:           ['#d4d7dd', '#b0b4bb'],
  Single_Leg_Glute_Bridge:  ['#48E08A', '#12B59A'],
};

const MOVE_SYMBOL: Record<string, string> = {
  Bodyweight_Squat:         'figure.strengthtraining.traditional',
  Pushups:                  'figure.core.training',
  Pullups:                  'figure.gymnastics',
  Bodyweight_Walking_Lunge: 'figure.walk',
  Plank:                    'figure.pilates',
  Dumbbell_Bicep_Curl:      'dumbbell.fill',
  Dumbbell_Bench_Press:     'figure.strengthtraining.functional',
  Wide_Grip_Lat_Pulldown:   'figure.climbing',
  Leg_Press:                'figure.run',
  Cable_Shoulder_Press:     'figure.dance',
  Clean_Deadlift:           'figure.highintensityintervaltraining',
  Single_Leg_Glute_Bridge:  'figure.cooldown',
};

// Moves to feature in the "Learn the moves" row (first 6)
const FEATURED_MOVES = MOVES.slice(0, 6);

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatShort(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionEntry = { ts: number; reps: number; goodReps: number; pct: number };

// ─── Pill dropdown options ─────────────────────────────────────────────────────

interface PillOption {
  value:      string;
  label:      string;
  symbolName: string;
  gradient:   [string, string];
}

const READINESS_OPTIONS: PillOption[] = [
  { value: 'fresh', label: 'Fresh',       symbolName: 'bolt.fill',                     gradient: ['#48E08A', '#1FA85A'] },
  { value: 'tired', label: 'A bit tired', symbolName: 'moon.fill',                     gradient: ['#FFD060', '#FFAA00'] },
  { value: 'sore',  label: 'Sore',        symbolName: 'exclamationmark.triangle.fill',  gradient: ['#FF6B6B', '#FF3B30'] },
];

const LOCATION_OPTIONS: PillOption[] = [
  { value: 'home',     label: 'Home',     symbolName: 'house.fill',    gradient: ['#5AC0FF', '#0A6CFF'] },
  { value: 'gym',      label: 'Gym',      symbolName: 'dumbbell.fill', gradient: ['#BF5AF2', '#9544C9'] },
  { value: 'outdoors', label: 'Outdoors', symbolName: 'sun.max.fill',  gradient: ['#48E08A', '#12B59A'] },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Section heading row with optional right-side action link */
function SectionHeader({ title, action, onAction }: {
  title: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction}>
          <Text style={sh.link}>{action} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const sh = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  title: { fontSize: 17, fontWeight: W.bold, letterSpacing: -0.3, color: C.text },
  link:  { fontSize: 12.5, fontWeight: W.semi, color: C.accent },
});

/** Tappable pill — dropdown trigger with gradient icon + label + chevron */
function DropdownPill({
  gradient, icon, label, onOpen,
}: { gradient: [string, string]; icon: string; label: string; onOpen: () => void }) {
  return (
    <Pressable style={dp.pill} onPress={onOpen}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dp.iconWrap}>
        <SymbolView name={icon as any} type="monochrome" style={dp.icon} tintColor="#fff" />
      </LinearGradient>
      <Text style={dp.label}>{label}</Text>
      <Text style={dp.chevron}>▾</Text>
    </Pressable>
  );
}
const dp = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingVertical: 11, paddingLeft: 12, paddingRight: 15,
    backgroundColor: C.card, borderRadius: 999,
    borderWidth: 1, borderColor: C.border,
    ...SHADOW_MED,
  },
  iconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  icon:     { width: 15, height: 15 },
  label:    { fontSize: 14, fontWeight: W.semi, color: C.text },
  chevron:  { fontSize: 11, color: C.textSub, marginLeft: 2 },
});

/** Move circle: gradient border ring, white inner with icon */
function MoveCircle({ id, viewed, onPress }: {
  id: string; viewed: boolean; onPress: () => void;
}) {
  const grad  = MOVE_GRAD[id] ?? ['#d4d7dd', '#b0b4bb'];
  const sym   = MOVE_SYMBOL[id] ?? 'figure.walk';
  const name  = MOVES.find(m => m.id === id)?.name ?? id;
  const dimmed = viewed && !['Bodyweight_Squat', 'Dumbbell_Bicep_Curl'].includes(id)
    ? false  // don't dim exercise-routed moves
    : false;

  return (
    <Pressable onPress={onPress} style={mc.wrap}>
      <LinearGradient
        colors={grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[mc.ring, dimmed && mc.dimRing]}
      >
        <View style={[mc.inner, dimmed && mc.dimInner]}>
          <SymbolView
            name={sym as any}
            type="monochrome"
            style={{ width: 26, height: 26 }}
            tintColor={dimmed ? '#9aa0ad' : '#3a3f4b'}
          />
        </View>
      </LinearGradient>
      <Text style={[mc.label, dimmed && mc.dimLabel]} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
}
const mc = StyleSheet.create({
  wrap:     { width: 72, alignItems: 'center', gap: 9 },
  ring:     { width: 66, height: 66, borderRadius: 33, padding: 3, ...SHADOW_MED },
  dimRing:  { opacity: 0.45 },
  inner:    { flex: 1, borderRadius: 30, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  dimInner: {},
  label:    { fontSize: 11.5, fontWeight: W.semi, color: '#4a4f5b', textAlign: 'center' },
  dimLabel: { color: C.textSub },
});

/** Past session row — standalone white card */
function SessionCard({ entry, last: _ }: { entry: SessionEntry; last: boolean }) {
  const pct = entry.pct;
  const bgColor   = pct >= 80 ? C.goodBg  : pct >= 60 ? C.midBg  : C.lowBg;
  const textColor = pct >= 80 ? C.goodText : pct >= 60 ? C.midText : C.lowText;

  return (
    <View style={[sc.card, SHADOW_ROW]}>
      <View style={sc.iconBox}>
        <SymbolView
          name="dumbbell.fill" type="monochrome"
          style={{ width: 18, height: 18 }} tintColor="#6b7180"
        />
      </View>
      <View style={sc.mid}>
        <Text style={sc.date}>{formatShort(entry.ts)}</Text>
        <Text style={sc.meta}>Full Body · {entry.reps} reps</Text>
      </View>
      <View style={[sc.badge, { backgroundColor: bgColor }]}>
        <Text style={[sc.badgeTxt, { color: textColor }]}>{pct}%</Text>
      </View>
    </View>
  );
}
const sc = StyleSheet.create({
  card:    {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, paddingHorizontal: 16,
    backgroundColor: C.card, borderRadius: 18,
    borderWidth: 1, borderColor: C.border,
  },
  iconBox: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: C.iconBox,
    alignItems: 'center', justifyContent: 'center',
  },
  mid:     { flex: 1, marginLeft: 13 },
  date:    { fontSize: 14.5, fontWeight: W.semi, color: '#1a1d26' },
  meta:    { marginTop: 2, fontSize: 12.5, fontWeight: W.medium, color: C.textSub },
  badge:   { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 11 },
  badgeTxt: { fontSize: 13, fontWeight: W.bold },
});

// Catmull-Rom → cubic bezier for smooth curves
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

// Build "Wk 1 / Wk 2 / … / Now" labels from a sorted session array
function buildWeekLabels(sorted: SessionEntry[]): string[] {
  if (sorted.length < 2) return [];
  const spanMs   = sorted[sorted.length - 1].ts - sorted[0].ts;
  const spanDays = spanMs / (24 * 60 * 60 * 1000);
  const weeks    = Math.max(1, Math.round(spanDays / 7));
  const count    = Math.min(weeks + 1, 5);
  const labels: string[] = [];
  for (let i = 1; i < count; i++) labels.push(`Wk ${i}`);
  labels.push('Now');
  return labels;
}

/** Smooth bezier form-trend chart — white card */
function FormChart({
  sessions,
  tab,
}: {
  sessions: SessionEntry[];
  tab: 'week' | 'month' | 'all';
}) {
  const VW = 320;
  const VH = 128;
  const PX = 10;   // left/right inset so the "Now" dot is never clipped
  const PY = 14;

  const filtered = useMemo(() => {
    const now = Date.now();
    const cut  = tab === 'week'  ? now - SEVEN_DAYS_MS
               : tab === 'month' ? now - THIRTY_DAYS_MS
               : 0;
    return [...sessions].filter(e => e.ts >= cut).sort((a, b) => a.ts - b.ts);
  }, [sessions, tab]);

  if (filtered.length < 2) {
    return (
      <View style={{ height: VH, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12.5, color: C.textSub, textAlign: 'center' }}>
          {sessions.length === 0
            ? 'Log sessions to see your progress.'
            : 'Not enough data for this period.'}
        </Text>
      </View>
    );
  }

  // x stays between PX and VW-PX so dots never clip
  const pts = filtered.map((entry, i) => ({
    x: PX + (i / (filtered.length - 1)) * (VW - PX * 2),
    y: PY + (1 - entry.pct / 100) * (VH - PY * 2),
  }));

  const linePath  = smoothPath(pts);
  const last      = pts[pts.length - 1];
  const lastPct   = filtered[filtered.length - 1].pct;
  const firstPct  = filtered[0].pct;
  const diff      = lastPct - firstPct;
  const areaPath  = linePath + ` L${last.x.toFixed(2)},${VH} L${PX},${VH} Z`;
  const wkLabels  = buildWeekLabels(filtered);
  const chipTop   = Math.max(4, last.y - 30);

  return (
    <View>
      {/* SVG chart — viewBox inset so dot radius doesn't clip at edges */}
      <View style={{ position: 'relative' }}>
        <Svg
          width="100%"
          height={VH}
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
        >
          <Defs>
            <SvgGrad id="ltArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor="#FF9F0A" stopOpacity={0.22} />
              <Stop offset="85%"  stopColor="#FF9F0A" stopOpacity={0.03} />
              <Stop offset="100%" stopColor="#FF9F0A" stopOpacity={0} />
            </SvgGrad>
          </Defs>

          {/* Grid */}
          {([0.33, 0.66] as const).map((f, i) => (
            <SvgLine
              key={i}
              x1={0} y1={VH * f}
              x2={VW} y2={VH * f}
              stroke="rgba(11,16,36,0.06)"
              strokeWidth={0.8}
            />
          ))}

          {/* Area fill */}
          <SvgPath d={areaPath} fill="url(#ltArea)" />

          {/* Bezier line */}
          <SvgPath
            d={linePath}
            fill="none"
            stroke="#FF9F0A"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Vertical dashed drop to baseline */}
          <SvgLine
            x1={last.x} y1={last.y}
            x2={last.x} y2={VH}
            stroke="rgba(255,159,10,0.22)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />

          {/* Dot: outer glow + fill + white core */}
          <SvgCircle cx={last.x} cy={last.y} r={9}   fill="rgba(255,159,10,0.14)" />
          <SvgCircle cx={last.x} cy={last.y} r={5}   fill="#FF9F0A" />
          <SvgCircle cx={last.x} cy={last.y} r={2.1} fill="rgba(255,255,255,0.9)" />
        </Svg>

        {/* Value chip near latest dot */}
        <View style={[fc.chip, { top: chipTop, right: 4 }]} pointerEvents="none">
          <Text style={fc.chipTxt}>{lastPct}%</Text>
        </View>
      </View>

      {/* X-axis week labels */}
      {wkLabels.length > 0 && (
        <View style={fc.xAxis}>
          {wkLabels.map((lbl, i) => (
            <Text key={i} style={[fc.xLabel, i === wkLabels.length - 1 && fc.xLabelNow]}>
              {lbl}
            </Text>
          ))}
        </View>
      )}

      {/* MyPal insight */}
      <View style={fc.insightRow}>
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <SvgPath d="M12 2.5l1.7 5.3 5.3 1.7-5.3 1.7L12 16.5l-1.7-5.3L5 9.5l5.3-1.7z" fill={C.accent} />
          <SvgPath d="M18.5 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" fill={C.accent} />
        </Svg>
        <Text style={fc.insightTxt}>
          {diff >= 0
            ? <>You&apos;re <Text style={fc.insightBold}>{diff}% better</Text> than when you started.</>
            : <>Score is <Text style={fc.insightBold}>{Math.abs(diff)}% lower</Text> than your start.</>
          }
        </Text>
      </View>
    </View>
  );
}
const fc = StyleSheet.create({
  chip:       {
    position:          'absolute',
    paddingHorizontal: 8,
    paddingVertical:   3,
    backgroundColor:   'rgba(255,159,10,0.12)',
    borderRadius:      9,
  },
  chipTxt:    { fontSize: 11.5, fontWeight: W.bold, color: '#FF9F0A' },
  xAxis:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, paddingHorizontal: 2 },
  xLabel:     { fontSize: 10.5, fontWeight: W.medium, color: C.textSub },
  xLabelNow:  { fontWeight: W.bold, color: C.text },
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 14 },
  insightTxt: { fontSize: 12.5, color: C.text, letterSpacing: -0.2 },
  insightBold: { fontWeight: W.bold },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [sessions,    setSessions]    = useState<SessionEntry[]>([]);
  const [viewedMoves, setViewedMoves] = useState<Set<string>>(new Set());
  const [progressTab, setProgressTab] = useState<'week' | 'month' | 'all'>('all');
  const [readiness,   setReadiness]   = useState<string>('fresh');
  const [location,    setLocation]    = useState<string>('home');

  // ── Derived metrics ──────────────────────────────────────────────────────────

  const formScore = useMemo<number | null>(() => {
    if (sessions.length === 0) return null;
    const last5 = sessions.slice(-5);
    return Math.round(last5.reduce((a, e) => a + e.pct, 0) / last5.length);
  }, [sessions]);

  const weekCount = useMemo(() => {
    const cut = Date.now() - SEVEN_DAYS_MS;
    return sessions.filter(e => e.ts >= cut).length;
  }, [sessions]);

  const avgGoodPct = useMemo<number | null>(() => {
    if (sessions.length === 0) return null;
    return Math.round(sessions.reduce((a, e) => a + e.pct, 0) / sessions.length);
  }, [sessions]);

  const reversedSessions = useMemo(() => [...sessions].reverse(), [sessions]);

  // ── Load data on focus ───────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(SESSION_LOG_KEY).then(raw => {
      if (!raw) { setSessions([]); return; }
      const parsed: SessionEntry[] = JSON.parse(raw);
      const cut    = Date.now() - THIRTY_DAYS_MS;
      const pruned = parsed.filter(e => e.ts >= cut);
      if (pruned.length !== parsed.length) {
        void AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(pruned));
      }
      setSessions(pruned);
    }).catch(() => setSessions([]));

    AsyncStorage.getItem(VIEWED_KEY).then(raw => {
      setViewedMoves(new Set(raw ? JSON.parse(raw) : []));
    }).catch(() => {});

    AsyncStorage.multiGet(['formpal_readiness', 'formpal_location']).then(pairs => {
      const r = pairs.find(p => p[0] === 'formpal_readiness')?.[1];
      const l = pairs.find(p => p[0] === 'formpal_location')?.[1];
      if (r) setReadiness(r);
      if (l) setLocation(l);
    }).catch(() => {});
  }, []));

  async function saveReadiness(v: string) {
    setReadiness(v);
    await AsyncStorage.setItem('formpal_readiness', v);
    // TODO: adjust workout intensity / MyPal tone based on readiness
  }

  async function saveLocation(v: string) {
    setLocation(v);
    await AsyncStorage.setItem('formpal_location', v);
    // TODO: filter exercises by available equipment based on location
  }

  const readinessOpt = READINESS_OPTIONS.find(o => o.value === readiness) ?? READINESS_OPTIONS[0];
  const locationOpt  = LOCATION_OPTIONS.find(o => o.value === location)   ?? LOCATION_OPTIONS[0];

  async function markViewed(id: string) {
    const next = new Set(viewedMoves);
    next.add(id);
    setViewedMoves(next);
    await AsyncStorage.setItem(VIEWED_KEY, JSON.stringify([...next]));
    if (id === 'Bodyweight_Squat') {
      router.push('/formcheck?exercise=squat' as any);
    } else if (id === 'Dumbbell_Bicep_Curl') {
      router.push('/formcheck?exercise=curl' as any);
    } else if (id === 'Pushups') {
      router.push('/formcheck?exercise=pushup' as any);
    } else {
      router.push(`/move/${id}` as any);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <StatusBar style="dark" />
      <ScreenBackground>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.scroll,
            { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 },
          ]}
        >

          {/* ── 1. HEADER ─────────────────────────────────────────────────── */}
          <View style={s.header}>
            <Text style={s.greeting}>Welcome back.</Text>
            <Text style={s.dateLabel}>{formatDate(new Date())}</Text>
          </View>

          {/* ── 2. READINESS + LOCATION DROPDOWN PILLS ───────────────────── */}
          <View style={s.pillRow}>
            <Dropdown
              options={READINESS_OPTIONS}
              value={readiness}
              onChange={saveReadiness}
              renderTrigger={open => (
                <DropdownPill
                  gradient={readinessOpt.gradient}
                  icon={readinessOpt.symbolName}
                  label={readinessOpt.label}
                  onOpen={open}
                />
              )}
            />
            <Dropdown
              options={LOCATION_OPTIONS}
              value={location}
              onChange={saveLocation}
              renderTrigger={open => (
                <DropdownPill
                  gradient={locationOpt.gradient}
                  icon={locationOpt.symbolName}
                  label={locationOpt.label}
                  onOpen={open}
                />
              )}
            />
          </View>

          {/* ── 3. HERO BLOCK: RINGS + MYPAL OVERLAP ─────────────────────── */}
          <View style={s.heroBlock}>

            {/* Rings card */}
            <View style={[s.ringsCard, SHADOW_HIGH]}>
              <View style={s.ringsRow}>
                <Ring
                  progress={(formScore ?? 0) / 100}
                  colors={C.formGrad}
                  gradientId="gForm"
                  value={formScore != null ? String(formScore) : '--'}
                  unit="%"
                  label="Form Score"
                  size={96}
                  strokeWidth={10.5}
                />
                <View style={s.ringDivider} />
                <Ring
                  progress={Math.min(weekCount / WEEK_GOAL, 1)}
                  colors={C.weekGrad}
                  gradientId="gWeek"
                  value={String(weekCount)}
                  unit={`/ ${WEEK_GOAL}`}
                  label="This Week"
                  size={96}
                  strokeWidth={10.5}
                />
                <View style={s.ringDivider} />
                <Ring
                  progress={(avgGoodPct ?? 0) / 100}
                  colors={C.repsGrad}
                  gradientId="gReps"
                  value={avgGoodPct != null ? String(avgGoodPct) : '--'}
                  unit="%"
                  label="Good Reps"
                  size={96}
                  strokeWidth={10.5}
                />
              </View>
            </View>

            {/* MyPal insight — tucked 30px under rings */}
            <Pressable onPress={() => router.push('/mypal' as any)} style={[s.mypalCard, SHADOW_MED]}>
              <View style={s.mypalHeader}>
                <Svg width={16} height={16} viewBox="0 0 24 24">
                  <SvgPath d="M12 2.5l1.7 5.3 5.3 1.7-5.3 1.7L12 16.5l-1.7-5.3L5 9.5l5.3-1.7z" fill={C.accent} />
                  <SvgPath d="M18.5 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" fill={C.accent} />
                </Svg>
                <Text style={s.mypalLabel}>MYPAL</Text>
              </View>
              <Text style={s.mypalBody}>
                Consistent reps build real strength — your form improves with every rep you log.{' '}
                <Text style={s.mypalCta}>Tap to chat with your coach ›</Text>
              </Text>
            </Pressable>
          </View>

          {/* ── 4. TODAY'S SESSION ────────────────────────────────────────── */}
          <SectionHeader title="Today's session" />

          <Pressable onPress={() => router.push('/formcheck' as any)}>
            <View style={[s.workoutCard, SHADOW_HIGH]}>
              <LinearGradient
                colors={['#5AC0FF', '#0A6CFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.workoutIcon}
              >
                <SymbolView
                  name="dumbbell.fill" type="monochrome"
                  style={{ width: 28, height: 28 }} tintColor="#fff"
                />
              </LinearGradient>
              <Text style={s.workoutTitle}>Full Body</Text>
              <Text style={s.workoutSub}>4 exercises · ~30 min</Text>
              <LinearGradient
                colors={['#33363f', '#0b0d12']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={s.startBtn}
              >
                <Svg width={15} height={15} viewBox="0 0 24 24">
                  <SvgPath d="M7 4.5l13 7.5-13 7.5z" fill="#fff" />
                </Svg>
                <Text style={s.startTxt}>Start workout</Text>
              </LinearGradient>
            </View>
          </Pressable>

          {/* ── 5. YOUR PROGRESS ──────────────────────────────────────────── */}
          <SectionHeader title="Your progress" />
          <View style={[s.progressCard, SHADOW_HIGH]}>
            <View style={s.segPicker}>
              {(['week', 'month', 'all'] as const).map(tab => (
                <Pressable key={tab} onPress={() => setProgressTab(tab)} style={[s.segItem, progressTab === tab && s.segActive]}>
                  <Text style={[s.segTxt, progressTab === tab && s.segTxtActive]}>
                    {tab === 'week' ? 'Week' : tab === 'month' ? 'Month' : 'All'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <FormChart sessions={sessions} tab={progressTab} />
          </View>

          {/* ── 6. LEARN THE MOVES ────────────────────────────────────────── */}
          <View>
            <SectionHeader title="Learn the moves" action="See all" onAction={() => {}} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.movesRow}
            >
              {FEATURED_MOVES.map(m => (
                <MoveCircle
                  key={m.id}
                  id={m.id}
                  viewed={viewedMoves.has(m.id)}
                  onPress={() => markViewed(m.id)}
                />
              ))}
            </ScrollView>
          </View>

          {/* ── 7. PAST SESSIONS ──────────────────────────────────────────── */}
          <View>
            <SectionHeader title="Past sessions" />
            <View style={s.sessionsList}>
              {reversedSessions.length === 0 ? (
                <Text style={s.emptyTxt}>
                  No sessions yet. Tap "Start workout" to begin tracking your form.
                </Text>
              ) : (
                reversedSessions.slice(0, 6).map((entry, i) => (
                  <SessionCard
                    key={`${entry.ts}-${i}`}
                    entry={entry}
                    last={i === Math.min(reversedSessions.length, 6) - 1}
                  />
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

  // 1. Header
  header: { gap: 7, paddingHorizontal: 8 },
  greeting: {
    fontFamily:    FONT.displayLight,
    fontSize:      36,
    lineHeight:    37,
    letterSpacing: -1,
    color:         C.text,
  },
  dateLabel: { fontSize: 13.5, fontWeight: W.medium, letterSpacing: 0.2, color: C.textSub },

  // 2. Status pills
  pillRow: { flexDirection: 'row', gap: 9, flexWrap: 'wrap', paddingHorizontal: 8 },

  // 3. Hero block
  heroBlock: { gap: 0 },

  ringsCard: {
    backgroundColor: C.card,
    borderRadius:    28,
    borderWidth:     1,
    borderColor:     C.border,
    paddingVertical:   26,
    paddingHorizontal: 14,
    zIndex:            2,
  },
  ringsRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-around',
  },
  ringDivider: {
    width:           StyleSheet.hairlineWidth,
    height:          70,
    backgroundColor: 'rgba(0,0,0,0.07)',
    alignSelf:       'center',
  },

  mypalCard: {
    backgroundColor: C.card,
    borderRadius:    24,
    borderWidth:     1,
    borderColor:     C.border,
    marginTop:       -30,
    marginHorizontal: 10,
    paddingTop:      46,
    paddingBottom:   17,
    paddingHorizontal: 18,
    zIndex:          1,
    gap:             7,
  },
  mypalHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mypalLabel:  { fontSize: 11, fontWeight: W.bold, letterSpacing: 0.7, color: C.accent },
  mypalBody:   { fontSize: 13.5, lineHeight: 20, color: '#454b58' },
  mypalCta:    { color: C.accent, fontWeight: W.semi },

  // 4. Workout card
  workoutCard: {
    backgroundColor: C.card,
    borderRadius:    28,
    borderWidth:     1,
    borderColor:     C.border,
    paddingVertical:   26,
    paddingHorizontal: 20,
    alignItems:      'center',
    gap:             0,
  },
  workoutIcon: {
    width: 58, height: 58, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  workoutTitle: { fontSize: 23, fontWeight: W.bold, letterSpacing: -0.5, color: C.text, marginTop: 15 },
  workoutSub:   { fontSize: 13.5, fontWeight: W.medium, color: C.textSub, marginTop: 4 },
  startBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    width:          '100%',
    paddingVertical: 14,
    borderRadius:   16,
    marginTop:      20,
  },
  startTxt: { fontSize: 15, fontWeight: W.semi, color: '#fff' },

  // 5. Progress card
  progressCard: {
    backgroundColor: C.card,
    borderRadius:    28,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         18,
    paddingBottom:   14,
  },
  segPicker: {
    flexDirection:  'row',
    gap:             2,
    padding:         3,
    backgroundColor: '#eceef3',
    borderRadius:    10,
    alignSelf:       'flex-start',
    marginBottom:    14,
  },
  segItem:       { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 7 },
  segActive:     { backgroundColor: C.card },
  segTxt:        { fontSize: 11, fontWeight: W.semi, color: C.textSub },
  segTxtActive:  { fontWeight: W.bold, color: C.text },

  // 6. Moves
  movesRow: { paddingHorizontal: 16, paddingVertical: 16, gap: 18 },

  // 7. Sessions
  sessionsList: { gap: 10 },
  emptyTxt: {
    fontSize:        Sp.md,
    color:           C.textSub,
    lineHeight:      22,
    textAlign:       'center',
    paddingVertical: Sp.lg,
    paddingHorizontal: Sp.lg,
  },
});
