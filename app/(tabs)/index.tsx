import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';

import { FONT, Col, Sp, Sz, W, R } from '../../constants/theme';
import Card from '../../components/Card';
import Ring from '../../components/Ring';
import SpeedoGauge from '../../components/SpeedoGauge';
import ScreenBackground from '../../components/ScreenBackground';
import { MOVES } from '../../constants/moves';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_LOG_KEY = 'formpal_session_log';
const VIEWED_KEY      = 'formpal_viewed_moves';
const THIRTY_DAYS_MS  = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS   =  7 * 24 * 60 * 60 * 1000;
const WEEK_GOAL       = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}
function formatShort(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── SF Symbol map ────────────────────────────────────────────────────────────

const MOVE_SYMBOL: Record<string, string> = {
  'Bodyweight_Squat':         'figure.strengthtraining.traditional',
  'Pushups':                  'figure.core.training',
  'Pullups':                  'figure.gymnastics',
  'Bodyweight_Walking_Lunge': 'figure.walk',
  'Plank':                    'figure.pilates',
  'Dumbbell_Bicep_Curl':      'dumbbell.fill',
  'Dumbbell_Bench_Press':     'figure.strengthtraining.functional',
  'Wide-Grip_Lat_Pulldown':   'figure.climbing',
  'Leg_Press':                'figure.run',
  'Cable_Shoulder_Press':     'figure.dance',
  'Clean_Deadlift':           'figure.highintensityintervaltraining',
  'Single_Leg_Glute_Bridge':  'figure.cooldown',
};

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({
  icon, color, label,
}: { icon: string; color: string; label: string }) {
  return (
    <View style={[pill.root, { backgroundColor: color + '1A' }]}>
      <SymbolView
        name={icon as any} type="monochrome"
        style={pill.icon} tintColor={color}
      />
      <Text style={[pill.label, { color }]}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  root:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill },
  icon:  { width: 14, height: 14 },
  label: { fontSize: Sz.caption, fontWeight: W.semi, letterSpacing: 0.1 },
});

// ─── ProgressBar — expo-linear-gradient horizontal fill ──────────────────────

function ProgressBar({
  progress, colors,
}: { progress: number; colors: [string, string] }) {
  const pct = Math.max(4, Math.round(Math.min(1, progress) * 100));
  return (
    <View style={pbar.track}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[pbar.fill, { width: `${pct}%` as any }]}
      />
    </View>
  );
}
const pbar = StyleSheet.create({
  track: { height: 8, backgroundColor: Col.ringTrack, borderRadius: R.pill, overflow: 'hidden' },
  fill:  { height: '100%' as any, borderRadius: R.pill },
});

// ─── MoveCircle ───────────────────────────────────────────────────────────────

function MoveCircle({
  id, viewed, onPress,
}: { id: string; viewed: boolean; onPress: () => void }) {
  const sym  = MOVE_SYMBOL[id] ?? 'figure.walk';
  const name = MOVES.find(m => m.id === id)?.name ?? id;
  return (
    <Pressable onPress={onPress} style={mc.wrap}>
      <View style={[mc.circle, viewed && mc.dimmed]}>
        <SymbolView
          name={sym as any} type="monochrome"
          style={{ width: 26, height: 26 }}
          tintColor={viewed ? Col.textDim : Col.text}
        />
      </View>
      <Text style={[mc.label, viewed && mc.dlabel]} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
}
const mc = StyleSheet.create({
  wrap:   { width: 66, alignItems: 'center', gap: Sp.xs + 2 },
  circle: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Col.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Col.ringC[0],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 5, elevation: 3,
  },
  dimmed: { borderColor: Col.textDim },
  label:  { fontSize: 10, fontWeight: W.medium, color: Col.textSub, textAlign: 'center' },
  dlabel: { color: Col.textDim },
});

// ─── SessionRow ───────────────────────────────────────────────────────────────

type SessionEntry = { ts: number; reps: number; goodReps: number; pct: number };

function SessionRow({ entry, last }: { entry: SessionEntry; last: boolean }) {
  const col = entry.pct >= 80 ? Col.good : entry.pct >= 60 ? Col.ringC[0] : Col.mid;
  return (
    <View style={[ses.row, !last && ses.div]}>
      <View style={ses.left}>
        <Text style={ses.date}>{formatShort(entry.ts)}</Text>
        <Text style={ses.meta}>{entry.reps} reps · {entry.goodReps} good</Text>
      </View>
      <View style={[ses.badge, { backgroundColor: col + '18' }]}>
        <Text style={[ses.pct, { color: col }]}>{entry.pct}%</Text>
      </View>
    </View>
  );
}
const ses = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  div:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' },
  left:  { gap: 2 },
  date:  { fontSize: Sz.small, fontWeight: W.semi, color: Col.text, letterSpacing: -0.2 },
  meta:  { fontSize: Sz.caption, fontWeight: W.regular, color: Col.textSub },
  badge: { borderRadius: R.pill, paddingVertical: 5, paddingHorizontal: 12 },
  pct:   { fontSize: Sz.small, fontWeight: W.bold },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [sessions,    setSessions]    = useState<SessionEntry[]>([]);
  const [viewedMoves, setViewedMoves] = useState<Set<string>>(new Set());

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
  }, []));

  async function markViewed(id: string) {
    const next = new Set(viewedMoves);
    next.add(id);
    setViewedMoves(next);
    await AsyncStorage.setItem(VIEWED_KEY, JSON.stringify([...next]));
    if (id === 'Bodyweight_Squat') {
      router.push('/formcheck?exercise=squat' as any);
    } else if (id === 'Dumbbell_Bicep_Curl') {
      router.push('/formcheck?exercise=curl' as any);
    } else {
      router.push(`/move/${id}` as any);
    }
  }

  const reversedSessions = useMemo(() => [...sessions].reverse(), [sessions]);

  return (
    <>
      <StatusBar style="dark" />
      <ScreenBackground>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.scroll,
            { paddingTop: insets.top + Sp.md, paddingBottom: insets.bottom + 64 },
          ]}
        >

          {/* ── 1. Header ────────────────────────────────────────────────── */}
          <View style={s.header}>
            <Text style={s.greeting}>Welcome back.</Text>
            <Text style={s.dateLabel}>{formatDate(new Date())}</Text>
          </View>

          {/* ── 2. Status pills ──────────────────────────────────────────── */}
          <View style={s.pillRow}>
            <StatusPill
              icon="figure.run"
              color={Col.good}
              label="Ready to train"
            />
            <StatusPill
              icon="figure.strengthtraining.traditional"
              color={Col.mid}
              label="Full Body"
            />
          </View>

          {/*
           * ── 3. HERO BLOCK ────────────────────────────────────────────────
           *
           * Only these TWO cards overlap. The rings card (elevation="high",
           * zIndex:2) sits on top — its layered shadows fall onto the insight
           * card. The insight card tucks 18px under rings (marginTop:-18,
           * zIndex:1). Everything below uses normal Sp.md gaps, no overlap.
           */}
          <View>
            {/* Rings card — hero, highest elevation */}
            <Card elevation="high" style={s.ringsCard}>
              <View style={s.ringsRow}>
                <Ring
                  progress={(formScore ?? 0) / 100}
                  colors={Col.ringA}
                  gradientId="gFormScore"
                  value={formScore !== null ? String(formScore) : '--'}
                  unit="%"
                  label="Form Score"
                  size={76}
                  strokeWidth={9}
                />
                <View style={s.ringDivider} />
                <Ring
                  progress={Math.min(weekCount / WEEK_GOAL, 1)}
                  colors={Col.ringB}
                  gradientId="gWeek"
                  value={String(weekCount)}
                  unit={`/ ${WEEK_GOAL}`}
                  label="This Week"
                  size={76}
                  strokeWidth={9}
                />
                <View style={s.ringDivider} />
                <Ring
                  progress={(avgGoodPct ?? 0) / 100}
                  colors={Col.ringC}
                  gradientId="gGoodReps"
                  value={avgGoodPct !== null ? String(avgGoodPct) : '--'}
                  unit="%"
                  label="Good Reps"
                  size={76}
                  strokeWidth={9}
                />
              </View>
            </Card>

            {/* Insight card — tucks under rings, lower z-index */}
            <Pressable onPress={() => router.push('/mypal' as any)}>
              <Card elevation="medium" style={s.insightCard}>
                <View style={s.insightHeader}>
                  <View style={s.sparkBadge}>
                    <SymbolView
                      name={'sparkles' as any}
                      type="monochrome"
                      style={{ width: 13, height: 13 }}
                      tintColor="#FFFFFF"
                    />
                  </View>
                  <Text style={s.mypalLabel}>MyPal</Text>
                  <SymbolView
                    name={'chevron.right' as any}
                    type="monochrome"
                    style={{ width: 12, height: 12, marginLeft: 'auto' as any }}
                    tintColor={Col.textDim}
                  />
                </View>
                <Text style={s.mypalMsg}>
                  Consistency is what builds lasting strength. Your form improves most with regular reps — tap to chat with your coach.
                </Text>
              </Card>
            </Pressable>
          </View>

          {/* ── 4. Overall Form gauge + Week Goal ────────────────────────── */}
          <Card elevation="medium" style={s.gaugeCard}>
            {/* Left: rainbow speedometer */}
            <View style={s.gaugeLeft}>
              <Text style={s.statCaption}>Overall Form</Text>
              <SpeedoGauge progress={(formScore ?? 0) / 100} />
            </View>

            <View style={s.vDivider} />

            {/* Right: sessions this week + green bar */}
            <View style={s.gaugeRight}>
              <Text style={s.statCaption}>Week Goal</Text>
              <View style={s.weekNumRow}>
                <Text style={s.weekBig}>{weekCount}</Text>
                <Text style={s.weekDenom}> / {WEEK_GOAL}</Text>
              </View>
              <Text style={s.weekUnit}>sessions</Text>
              <View style={{ marginTop: Sp.sm, gap: Sp.xs }}>
                <ProgressBar progress={weekCount / WEEK_GOAL} colors={Col.ringB} />
                <Text style={s.weekHint}>
                  {weekCount >= WEEK_GOAL ? 'Goal reached!' : `${WEEK_GOAL - weekCount} more to go`}
                </Text>
              </View>
            </View>
          </Card>

          {/* ── 5. Full Body workout card ─────────────────────────────────── */}
          <Pressable onPress={() => router.push('/formcheck' as any)}>
            <Card elevation="medium" style={s.workoutCard}>
              <View style={s.workoutTop}>
                <View>
                  <Text style={s.workoutTitle}>Full Body</Text>
                  <Text style={s.workoutSub}>4 exercises · 30 min</Text>
                </View>
                <View style={s.startBtn}>
                  <Text style={s.startTxt}>Start</Text>
                </View>
              </View>
              <View style={s.chips}>
                {['Squat', 'Push-up', 'Pull-up', 'Lunge'].map(ex => (
                  <View key={ex} style={s.chip}>
                    <Text style={s.chipTxt}>{ex}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </Pressable>

          {/* ── 6. Learn the Moves ────────────────────────────────────────── */}
          <Card elevation="low" style={s.movCard}>
            <Text style={s.sectionHead}>Movements</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.movRow}
            >
              {MOVES.map(m => (
                <MoveCircle
                  key={m.id}
                  id={m.id}
                  viewed={viewedMoves.has(m.id)}
                  onPress={() => markViewed(m.id)}
                />
              ))}
            </ScrollView>
          </Card>

          {/* ── 7. Past Sessions ──────────────────────────────────────────── */}
          <Card elevation="low" style={s.sessCard}>
            <Text style={s.sectionHead}>Recent Sessions</Text>
            {reversedSessions.length === 0 ? (
              <Text style={s.empty}>
                No sessions yet. Start a session to begin tracking your form.
              </Text>
            ) : (
              reversedSessions.map((entry, i) => (
                <SessionRow
                  key={`${entry.ts}-${i}`}
                  entry={entry}
                  last={i === reversedSessions.length - 1}
                />
              ))
            )}
          </Card>

        </ScrollView>
      </ScreenBackground>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({

  // ScrollView container — Sp.md gap between all top-level children
  scroll: {
    paddingHorizontal: Sp.lg,
    gap: Sp.md,
  },

  // ── 1. Header ──────────────────────────────────────────────────────────────
  header: { gap: Sp.xs },
  greeting: {
    fontFamily:    FONT.displayLight,   // Bricolage Grotesque 300 — premium light heading
    fontSize:      Sz.h1,
    color:         Col.text,
    letterSpacing: -0.8,
    lineHeight:    40,
  },
  dateLabel: {
    fontSize:      Sz.small,
    fontWeight:    W.regular,
    color:         Col.textSub,
    letterSpacing: 0.1,
  },

  // ── 2. Status pills ────────────────────────────────────────────────────────
  pillRow: { flexDirection: 'row', gap: Sp.sm },

  // ── 3. Hero block — rings card ─────────────────────────────────────────────
  ringsCard: {
    paddingVertical:   Sp.lg,
    paddingHorizontal: Sp.md,
    zIndex:            2,               // must sit visually above the insight card
  },
  ringsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-around',
  },
  ringDivider: {
    width:           StyleSheet.hairlineWidth,
    height:          60,
    backgroundColor: 'rgba(0,0,0,0.07)',
  },

  // Insight card — 18px tuck; paddingTop clears the overlap region
  insightCard: {
    marginTop:         -18,
    zIndex:            1,
    paddingTop:        Sp.xl,           // 32px — content clears the rings card tuck
    paddingBottom:     Sp.lg,
    paddingHorizontal: Sp.lg,
    gap:               Sp.sm,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Sp.sm,
  },
  sparkBadge: {
    width:           24, height: 24,
    borderRadius:    R.sm,
    backgroundColor: Col.ringC[0],      // blue badge — matches Good Reps ring hue
    alignItems:      'center', justifyContent: 'center',
  },
  mypalLabel: {
    fontSize:      Sz.caption,
    fontWeight:    W.bold,
    color:         Col.ringC[0],
    letterSpacing: 0.3,
  },
  mypalMsg: {
    fontSize:      Sz.body,
    fontWeight:    W.regular,
    color:         Col.text,
    lineHeight:    22,
    letterSpacing: -0.1,
  },

  // ── 4. Gauge card ──────────────────────────────────────────────────────────
  gaugeCard: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   Sp.lg,
    paddingHorizontal: Sp.lg,
    gap:               Sp.lg,
  },
  gaugeLeft:  { alignItems: 'center', gap: Sp.sm },
  gaugeRight: { flex: 1, gap: 2 },
  vDivider: {
    width:           StyleSheet.hairlineWidth,
    height:          80,
    backgroundColor: 'rgba(0,0,0,0.07)',
  },
  statCaption: {
    fontSize:      Sz.caption,
    fontWeight:    W.semi,
    color:         Col.textSub,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  weekNumRow: {
    flexDirection: 'row',
    alignItems:    'baseline',
    marginTop:     Sp.sm,
  },
  weekBig: {
    fontSize:      Sz.h1,
    fontWeight:    W.bold,
    color:         Col.good,            // green = goal-state meaning
    letterSpacing: -1,
    lineHeight:    38,
  },
  weekDenom: {
    fontSize:   Sz.h3,
    fontWeight: W.regular,
    color:      Col.textSub,
  },
  weekUnit: {
    fontSize:   Sz.caption,
    fontWeight: W.regular,
    color:      Col.textSub,
  },
  weekHint: {
    fontSize:   Sz.caption,
    fontWeight: W.medium,
    color:      Col.textSub,
  },

  // ── 5. Workout card ────────────────────────────────────────────────────────
  workoutCard: { padding: Sp.lg, gap: Sp.md },
  workoutTop:  {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  workoutTitle: {
    fontFamily:    FONT.displayBold,    // Bricolage Grotesque 700 — strong card heading
    fontSize:      Sz.h2,
    color:         Col.text,
    letterSpacing: -0.5,
  },
  workoutSub: {
    fontSize:   Sz.small,
    fontWeight: W.regular,
    color:      Col.textSub,
    marginTop:  Sp.xs,
  },
  startBtn: {
    backgroundColor: Col.text,
    borderRadius:    R.pill,
    paddingVertical:   10,
    paddingHorizontal: Sp.lg,
  },
  startTxt: {
    fontSize:   Sz.body,
    fontWeight: W.bold,
    color:      Col.card,
  },
  chips: { flexDirection: 'row', gap: Sp.xs + 2, flexWrap: 'wrap' },
  chip: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius:    R.chip,
    paddingVertical:   Sp.xs,
    paddingHorizontal: Sp.sm + 2,
  },
  chipTxt: {
    fontSize:   Sz.caption,
    fontWeight: W.medium,
    color:      Col.textSub,
  },

  // ── 6. Moves card ──────────────────────────────────────────────────────────
  movCard: { paddingTop: Sp.lg, paddingBottom: Sp.lg, gap: Sp.md },
  movRow:  { paddingHorizontal: Sp.lg, gap: Sp.sm + 4, paddingBottom: Sp.xs },

  // ── 7. Sessions card ───────────────────────────────────────────────────────
  sessCard: { paddingTop: Sp.lg, paddingBottom: Sp.sm, paddingHorizontal: Sp.lg },
  empty: {
    fontSize:        Sz.body,
    fontWeight:      W.regular,
    color:           Col.textSub,
    lineHeight:      22,
    paddingVertical: Sp.lg,
  },

  // Shared section heading — Bricolage Grotesque Bold, used in movCard + sessCard
  sectionHead: {
    fontFamily:        FONT.displayBold,
    fontSize:          Sz.h3,
    color:             Col.text,
    letterSpacing:     -0.3,
    paddingHorizontal: Sp.lg,
  },
});
