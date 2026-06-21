import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
  Animated, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flame, Dumbbell, User as UserIcon, Camera } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MOVES as CURATED_MOVES } from '../../constants/moves';
import GlassButton from '../../components/GlassButton';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const C = {
  bg:            '#0A0B0C',
  surface:       '#15161A',
  surfaceBorder: 'rgba(255,255,255,0.08)',
  iconBg:        'rgba(255,255,255,0.06)',
  textPrimary:   '#F0F0F2',
  textSecondary: '#9A9AA2',
  textMuted:     '#62626A',
  primary:       '#D6D7DC',
};

// ---------------------------------------------------------------------------
// Default workout plan (shown until plan persistence is wired up)
// ---------------------------------------------------------------------------
const DEFAULT_PLAN = {
  focus: 'Full Body',
  exercises: [
    { name: 'Goblet Squats',     scheme: '3 × 8',       formCheck: true  },
    { name: 'Dumbbell Press',    scheme: '3 × 10',      formCheck: false },
    { name: 'Romanian Deadlift', scheme: '3 × 10',      formCheck: false },
    { name: 'Walking Lunges',    scheme: '3 × 12 each', formCheck: true  },
  ],
};

// ---------------------------------------------------------------------------
// Week strip
// ---------------------------------------------------------------------------
function getWeekDays() {
  const now     = new Date();
  const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWk = now.getDay();
  const offset  = dayOfWk === 0 ? -6 : 1 - dayOfWk;
  const monday  = new Date(today);
  monday.setDate(today.getDate() + offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      label:   ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'][i],
      date:    d.getDate(),
      isToday: d.getTime() === today.getTime(),
      isPast:  d < today,
    };
  });
}

// ---------------------------------------------------------------------------
// Form score ring
// ---------------------------------------------------------------------------
const SCORE_R    = 26;
const SCORE_CIRC = 2 * Math.PI * SCORE_R;
const SCORE_SZ   = 68;

const AnimatedSvgCircle = Animated.createAnimatedComponent(SvgCircle);

function FormScoreRing({ score, reps, play }: { score: number | null; reps: number; play: boolean }) {
  const ringProg  = useRef(new Animated.Value(0)).current;
  const numAnim   = useRef(new Animated.Value(0)).current;
  const [displayNum, setDisplayNum] = useState(0);

  useEffect(() => {
    if (!play || !score) return;
    ringProg.setValue(0);
    numAnim.setValue(0);
    setDisplayNum(0);
    const id = numAnim.addListener(({ value }) => setDisplayNum(Math.round(value)));
    Animated.timing(ringProg, { toValue: 1, duration: 1100, delay: 400, useNativeDriver: false }).start();
    Animated.timing(numAnim,  { toValue: score, duration: 1100, delay: 400, useNativeDriver: false }).start();
    return () => numAnim.removeListener(id);
  }, [play]);

  const dashOffset = ringProg.interpolate({
    inputRange:  [0, 1],
    outputRange: [SCORE_CIRC, SCORE_CIRC * (1 - (score ?? 0) / 100)],
  });
  const isEmpty = !score;

  return (
    <View style={s.scoreCard}>
      <View style={{ width: SCORE_SZ, height: SCORE_SZ }}>
        <Svg width={SCORE_SZ} height={SCORE_SZ} viewBox={`0 0 ${SCORE_SZ} ${SCORE_SZ}`}>
          <SvgCircle cx={SCORE_SZ / 2} cy={SCORE_SZ / 2} r={SCORE_R} fill="none" stroke={C.surfaceBorder} strokeWidth={3} />
          {!isEmpty && (
            <AnimatedSvgCircle
              cx={SCORE_SZ / 2} cy={SCORE_SZ / 2} r={SCORE_R}
              fill="none" stroke={C.textPrimary} strokeWidth={3}
              strokeDasharray={`${SCORE_CIRC} ${SCORE_CIRC}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              rotation="-90" originX={SCORE_SZ / 2} originY={SCORE_SZ / 2}
            />
          )}
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={s.scoreNum}>{isEmpty ? '—' : displayNum}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.scoreLabel}>Form Score</Text>
        <Text style={s.scoreChange}>{isEmpty ? 'Complete your first session' : '+6 this week'}</Text>
        {!isEmpty && <Text style={s.scoreReps}>from {reps} reps</Text>}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Move circle
// ---------------------------------------------------------------------------
function MoveCircle({ move, onPress }: { move: typeof CURATED_MOVES[0]; onPress: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUri = move.images?.[0] ?? null;
  return (
    <TouchableOpacity style={{ alignItems: 'center', gap: 7 }} onPress={onPress} activeOpacity={0.75}>
      <View style={s.moveCircle}>
        {imageUri && !imgFailed ? (
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <Text style={s.moveAbbr}>{move.name.slice(0, 2).toUpperCase()}</Text>
        )}
      </View>
      <Text style={s.moveLabel} numberOfLines={2}>{move.name}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function HomeScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const streak  = 0;
  const weekDays = getWeekDays();

  const startWorkout = () => {
    if (Haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Coming next', 'The live camera workout screen is what we build next.');
  };

  return (
    <View style={s.c} collapsable={false}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top row */}
        <View style={s.topRow}>
          <Text style={s.welcomeTxt}>Welcome back.</Text>
          <View style={s.topRight}>
            <View style={s.streakBadge}>
              <Flame size={13} color={C.textMuted} />
              <Text style={s.streakBadgeTxt}>{streak}</Text>
            </View>
            <View style={s.avatarCircle}>
              <UserIcon size={15} color={C.textMuted} />
            </View>
          </View>
        </View>

        {/* Week strip */}
        <View style={s.weekRow}>
          {weekDays.map((d, i) => (
            <View key={i} style={s.weekDayCol}>
              <Text style={[s.weekDayLbl, d.isToday && s.weekDayLblActive]}>{d.label}</Text>
              <View style={[s.weekDayCircle, d.isToday && s.weekDayCircleActive]}>
                <Text style={[s.weekDayNum, d.isToday && s.weekDayNumActive]}>{d.date}</Text>
              </View>
              <View style={{ height: 5 }} />
            </View>
          ))}
        </View>

        {/* Learn the Moves */}
        <View style={{ marginBottom: 22 }}>
          <Text style={s.sectionTitle}>Learn the Moves</Text>
          <Text style={s.sectionSub}>Tap any movement to see the form cues.</Text>
          <View style={{ marginHorizontal: -20 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 4 }}
            >
              {CURATED_MOVES.map(move => (
                <MoveCircle
                  key={move.id}
                  move={move}
                  onPress={() => router.push(`/move/${move.id}`)}
                />
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Coach chat bubble */}
        <View style={s.coachRow}>
          <View style={s.coachAvatar}>
            <Dumbbell size={16} color={C.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.coachTail} />
            <View style={s.coachBubble}>
              <Text style={s.coachMark}>Coach</Text>
              <Text style={s.coachNote}>
                {streak === 0
                  ? 'Form is your foundation. Take your time on each movement today.'
                  : 'Your squat depth held all week. Push a little deeper today.'}
              </Text>
            </View>
          </View>
        </View>

        {/* Today's Workout hero card — Pressable (not TouchableOpacity) to avoid opacity conflict with GlassView inside */}
        <Pressable style={s.heroWorkoutCard} onPress={startWorkout}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80' }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(10,11,12,0.45)', 'rgba(10,11,12,0.95)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.todayTag}>
            <Text style={s.todayTagTxt}>Today</Text>
          </View>
          <View style={s.heroWorkoutContent}>
            <View style={s.heroFormBadge}>
              <Camera size={11} color="rgba(240,240,242,0.7)" />
              <Text style={s.heroFormBadgeTxt}>form check</Text>
            </View>
            <Text style={s.heroWorkoutName}>{DEFAULT_PLAN.focus.toUpperCase()}</Text>
            <Text style={s.heroWorkoutMeta}>Day 1 · 30 min · {DEFAULT_PLAN.exercises.length} exercises</Text>
            <GlassButton style={{ height: 54, alignSelf: 'stretch' }} onPress={startWorkout}>
              <Text style={s.heroStartBtnTxt}>Start Workout</Text>
            </GlassButton>
          </View>
        </Pressable>

        {/* Form score */}
        <FormScoreRing score={null} reps={0} play={true} />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: C.bg },

  topRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  welcomeTxt:     { fontSize: 16, fontWeight: '500', color: C.textPrimary, letterSpacing: -0.3 },
  topRight:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streakBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.surfaceBorder, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 },
  streakBadgeTxt: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  avatarCircle:   { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.surfaceBorder, alignItems: 'center', justifyContent: 'center' },

  weekRow:             { flexDirection: 'row', marginBottom: 26 },
  weekDayCol:          { flex: 1, alignItems: 'center', gap: 5 },
  weekDayLbl:          { fontSize: 10, fontWeight: '500', color: C.textMuted, letterSpacing: 0.3 },
  weekDayLblActive:    { color: C.textPrimary, fontWeight: '700' },
  weekDayCircle:       { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  weekDayCircleActive: { backgroundColor: C.primary },
  weekDayNum:          { fontSize: 13, fontWeight: '500', color: C.textMuted },
  weekDayNumActive:    { color: C.bg, fontWeight: '700' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.3, marginBottom: 2 },
  sectionSub:   { fontSize: 12, color: C.textMuted, marginBottom: 14 },

  moveCircle: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 1.5, borderColor: C.surfaceBorder,
    backgroundColor: C.surface, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  moveAbbr:  { fontSize: 14, fontWeight: '700', color: C.textPrimary, letterSpacing: 0.5 },
  moveLabel: { fontSize: 10, color: C.textSecondary, fontWeight: '500', textAlign: 'center', maxWidth: 64 },

  coachRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  coachAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.surfaceBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 },
  coachTail: {
    position: 'absolute', left: -7, top: 14,
    width: 0, height: 0, borderStyle: 'solid',
    borderTopWidth: 7, borderBottomWidth: 7, borderRightWidth: 8, borderLeftWidth: 0,
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
    borderRightColor: '#1B1C22', borderLeftColor: 'transparent',
  },
  coachBubble: { backgroundColor: '#1B1C22', borderRadius: 16, borderTopLeftRadius: 4, padding: 14 },
  coachMark:   { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 1.2, marginBottom: 6 },
  coachNote:   { fontSize: 14, color: C.textSecondary, lineHeight: 20, letterSpacing: -0.1 },

  heroWorkoutCard:    { height: 400, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1A1B1F', marginBottom: 14, justifyContent: 'flex-end' },
  todayTag:           { position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  todayTagTxt:        { fontSize: 11, fontWeight: '600', color: 'rgba(240,240,242,0.9)', letterSpacing: 0.3 },
  heroWorkoutContent: { padding: 20 },
  heroFormBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100, marginBottom: 10 },
  heroFormBadgeTxt:   { fontSize: 11, fontWeight: '600', color: 'rgba(240,240,242,0.7)', letterSpacing: 0.2 },
  heroWorkoutName:    { fontSize: 36, fontWeight: '800', color: C.textPrimary, letterSpacing: -1, lineHeight: 40, marginBottom: 4 },
  heroWorkoutMeta:    { fontSize: 13, color: 'rgba(240,240,242,0.6)', marginBottom: 16 },
  heroStartBtnTxt:    { fontSize: 15, fontWeight: '700', color: C.textPrimary, letterSpacing: 0.1 },

  scoreCard:   { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.surfaceBorder, padding: 16, marginBottom: 14 },
  scoreNum:    { fontSize: 18, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.5 },
  scoreLabel:  { fontSize: 14, fontWeight: '600', color: C.textPrimary, letterSpacing: -0.2, marginBottom: 3 },
  scoreChange: { fontSize: 12, color: C.textMuted, marginBottom: 2 },
  scoreReps:   { fontSize: 11, color: C.textMuted, opacity: 0.7 },
});
