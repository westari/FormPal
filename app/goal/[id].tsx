/**
 * app/goal/[id].tsx
 *
 * A goal in depth (tap a ring on Home): the big ring, where you are, this week by day, the past weeks and what counts. The cards are the
 * same soft white tiles as the rings on Home, the ring colours are the rings' own. Data: lib/goalDetail.ts (the same maths as the rings).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import GlassBackButton from '../../components/GlassBackButton';
import { getAllSessions } from '../../lib/sessionLog';
import { loadPlan } from '../../lib/planStorage';
import { loadUserDays } from '../../lib/weeklyGoalStore';
import { resolveWeeklyGoal } from '../../lib/weeklyGoal';
import { goalDetail, isGoalId, GOAL_COLORS, type GoalDetail } from '../../lib/goalDetail';
import { FONT } from '../../constants/theme';

const INK = '#111114';
const SUB = '#5f5f69';
const TRACK = '#eceef3';

function BigRing({ d }: { d: GoalDetail }) {
  const size = 150, r = 64, c = 2 * Math.PI * r, col = GOAL_COLORS[d.id];
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 150 150" style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs><SvgGradient id="g" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={col[0]} /><Stop offset="1" stopColor={col[1]} /></SvgGradient></Defs>
        <Circle cx={75} cy={75} r={r} fill="none" stroke={TRACK} strokeWidth={14} />
        <Circle cx={75} cy={75} r={r} fill="none" stroke="url(#g)" strokeWidth={14} strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - d.ring.fill)} />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={s.ringMid}><Text style={s.ringNum}>{d.ring.text}</Text></View></View>
    </View>
  );
}

export default function GoalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const gid = isGoalId(id) ? id : 'workouts';
  const [d, setD] = useState<GoalDetail | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.all([getAllSessions(), loadPlan().catch(() => null), loadUserDays()]).then(([sessions, plan, userDays]) => {
      if (alive) setD(goalDetail(gid, sessions, resolveWeeklyGoal(plan?.profile?.daysPerWeek, userDays).goal));
    }).catch(() => {});
    return () => { alive = false; };
  }, [gid]));

  const col = GOAL_COLORS[gid];
  return (
    <View style={s.root}>
      <LinearGradient colors={['#ebebef', '#f4f4f6', '#fafafb', '#ffffff']} locations={[0, 0.26, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 47) + 14 }]}>
        <GlassBackButton onPress={() => router.back()} />
        <Text style={s.title}>{d ? d.title : gid === 'form' ? 'Form' : gid === 'muscles' ? 'Muscles' : 'Workouts'}</Text>
      </View>
      {d ? (
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          <View style={[s.card, s.hero]}>
            <BigRing d={d} />
            <Text style={s.summary}>{d.summary}</Text>
          </View>

          <Text style={s.h2}>This week</Text>
          <View style={s.card} testID="goal-days">
            <View style={s.daysRow}>
              {d.days.map((x) => (
                <View key={x.label} style={s.dayCol}>
                  <Text style={[s.dayVal, x.today && { color: INK }]}>{x.text}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { height: `${Math.round(x.fill * 100)}%`, backgroundColor: col[1], opacity: x.future ? 0.25 : 1 }]} />
                  </View>
                  <Text style={[s.dayLab, x.today && s.dayLabToday]}>{x.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {d.muscles ? (
            <>
              <Text style={s.h2}>Muscles this week</Text>
              <View style={[s.card, s.chips]} testID="goal-muscles">
                {d.muscles.map((m) => (
                  <View key={m.name} style={[s.chip, m.hit && { backgroundColor: col[1] }]}>
                    <Text style={[s.chipTxt, m.hit && { color: '#ffffff' }]}>{m.name}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Text style={s.h2}>Past weeks</Text>
          <View style={s.card} testID="goal-weeks">
            {d.weeks.map((w, i) => (
              <View key={w.label + i} style={[s.weekRow, i > 0 && s.weekLine]}>
                <Text style={[s.weekLab, w.current && { color: INK, fontFamily: FONT.displayBold }]}>{w.label}</Text>
                <View style={s.weekTrack}><View style={[s.weekFill, { width: `${Math.round(w.fill * 100)}%`, backgroundColor: col[1] }]} /></View>
                <Text style={s.weekVal}>{w.text}</Text>
              </View>
            ))}
          </View>

          <Text style={s.h2}>What counts</Text>
          <View style={s.card} testID="goal-counts">
            {d.counts.map((t, i) => (
              <View key={i} style={[s.countRow, i > 0 && s.weekLine]}>
                <View style={[s.dot, { backgroundColor: col[1] }]} />
                <Text style={s.countTxt}>{t}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const CARD_SHADOW = '0 8px 18px -8px rgba(40,50,90,0.28), 0 1px 3px -1px rgba(40,50,90,0.1)';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafb' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 15 },
  title: { fontFamily: FONT.displayBold, fontSize: 34, lineHeight: 40, letterSpacing: -1, color: INK },
  body: { paddingHorizontal: 14, paddingTop: 22 },
  card: { backgroundColor: '#ffffff', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14, boxShadow: CARD_SHADOW } as any,
  hero: { alignItems: 'center', paddingVertical: 22, gap: 14 },
  ringMid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringNum: { fontFamily: FONT.displayBlack, fontSize: 34, letterSpacing: -1, color: INK },
  summary: { fontFamily: FONT.displaySemi, fontSize: 16, lineHeight: 22, color: SUB, textAlign: 'center', paddingHorizontal: 8 },
  h2: { fontFamily: FONT.displayBold, fontSize: 21, letterSpacing: -0.6, color: INK, paddingHorizontal: 8, paddingTop: 26, paddingBottom: 10 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', width: 40 },
  dayVal: { fontFamily: FONT.displayBold, fontSize: 13.5, color: SUB, height: 18 },
  barTrack: { width: 14, height: 84, borderRadius: 7, backgroundColor: TRACK, overflow: 'hidden', justifyContent: 'flex-end', marginVertical: 6 },
  barFill: { width: '100%', borderRadius: 7 },
  dayLab: { fontFamily: FONT.displaySemi, fontSize: 12.5, color: SUB },
  dayLabToday: { color: INK, fontFamily: FONT.displayBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: TRACK, alignItems: 'center', justifyContent: 'center' },
  chipTxt: { fontFamily: FONT.displaySemi, fontSize: 13.5, color: SUB },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  weekLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(17,17,20,0.1)' },
  weekLab: { width: 98, fontFamily: FONT.displaySemi, fontSize: 13.5, color: SUB },
  weekTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: TRACK, overflow: 'hidden' },
  weekFill: { height: '100%', borderRadius: 5 },
  weekVal: { width: 44, textAlign: 'right', fontFamily: FONT.displayBold, fontSize: 14, color: INK },
  countRow: { flexDirection: 'row', gap: 12, paddingVertical: 11, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  countTxt: { flex: 1, fontFamily: FONT.display, fontSize: 15, lineHeight: 21, color: INK },
});
