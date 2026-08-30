import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { EXERCISE_CATALOG, type ExerciseId } from '../constants/exercises';

const F = {
  regular: 'BricolageGrotesque_400Regular',
  bold:    'BricolageGrotesque_700Bold',
  extra:   'BricolageGrotesque_800ExtraBold',
};

// Record<ExerciseId, ...>, not Record<string, ...> — every catalog exercise
// required to have an icon/gradient, checked at compile time. A missing
// entry used to mean the exercise silently didn't render in this list at
// all (see the `if (!ui) return null` below) — now it's a build error.
const EXERCISE_UI: Record<ExerciseId, { symbol: string; grad: [string, string] }> = {
  squat:             { symbol: 'figure.strengthtraining.traditional', grad: ['#FFC24B', '#FF7A2E'] },
  pushup:            { symbol: 'figure.core.training',               grad: ['#67CEFF', '#0A6CFF'] },
  curl:              { symbol: 'dumbbell.fill',                      grad: ['#48E08A', '#12B59A'] },
  lunge:             { symbol: 'figure.step.training',               grad: ['#C084FC', '#7C3AED'] },
  shoulderPress:     { symbol: 'figure.arms.open',                   grad: ['#F97316', '#DC2626'] },
  chestPress:        { symbol: 'dumbbell.fill',                      grad: ['#FF8A65', '#C62828'] },
  // Barbell Bench Press — same warm red-orange family as chestPress (same
  // tracked movement), one shade darker/more saturated to read as the more
  // "serious barbell" version rather than a visually unrelated exercise.
  barbellBenchPress: { symbol: 'dumbbell.fill',                      grad: ['#F4511E', '#8E0000'] },
  jumpingJack:       { symbol: 'figure.jumprope',                    grad: ['#FF6B35', '#FF2D55'] },
  // Curl-family variants — same dumbbell icon, distinct greens/teals to group visually
  hammerCurl:        { symbol: 'dumbbell.fill', grad: ['#4ADE80', '#059669'] },
  concentrationCurl: { symbol: 'dumbbell.fill', grad: ['#22D3EE', '#0E7490'] },
  preacherCurl:      { symbol: 'dumbbell.fill', grad: ['#A3E635', '#4D7C0F'] },
  reverseCurl:       { symbol: 'dumbbell.fill', grad: ['#818CF8', '#4338CA'] },
  cableCurl:         { symbol: 'dumbbell.fill', grad: ['#FACC15', '#B45309'] },
  // Squat-family variants — same lower-body icon, amber-orange family
  gobletSquat:       { symbol: 'figure.strengthtraining.traditional', grad: ['#FCD34D', '#F59E0B'] },
  airSquat:          { symbol: 'figure.strengthtraining.traditional', grad: ['#FDE68A', '#D97706'] },
  frontSquat:        { symbol: 'figure.strengthtraining.traditional', grad: ['#FB923C', '#EA580C'] },
  backSquat:         { symbol: 'figure.strengthtraining.traditional', grad: ['#FDBA74', '#C2410C'] },
  sumoSquat:         { symbol: 'figure.strengthtraining.traditional', grad: ['#FCA5A5', '#DC2626'] },
  // Push-up-family variants — same core icon, blue family
  kneePushup:        { symbol: 'figure.core.training', grad: ['#BAE6FD', '#0284C7'] },
  inclinePushup:     { symbol: 'figure.core.training', grad: ['#7DD3FC', '#0369A1'] },
  widePushup:        { symbol: 'figure.core.training', grad: ['#38BDF8', '#075985'] },
  diamondPushup:     { symbol: 'figure.core.training', grad: ['#0EA5E9', '#1E3A5F'] },
  declinePushup:     { symbol: 'figure.core.training', grad: ['#60A5FA', '#1D4ED8'] },
  // Shoulder-press-family variants — same arms icon, orange-red family
  overheadPress:          { symbol: 'figure.arms.open', grad: ['#FDBA74', '#EA580C'] },
  arnoldPress:            { symbol: 'figure.arms.open', grad: ['#FCA5A5', '#DC2626'] },
  dumbbellShoulderPress:  { symbol: 'figure.arms.open', grad: ['#FCD34D', '#F97316'] },
  machineShoulderPress:   { symbol: 'figure.arms.open', grad: ['#FB923C', '#B91C1C'] },
  // Lunge-family variants — same step icon, purple family
  splitSquat:          { symbol: 'figure.step.training', grad: ['#D8B4FE', '#7C3AED'] },
  reverseLunge:        { symbol: 'figure.step.training', grad: ['#C084FC', '#6D28D9'] },
  stepUp:              { symbol: 'figure.step.training', grad: ['#A78BFA', '#5B21B6'] },
  bulgarianSplitSquat: { symbol: 'figure.step.training', grad: ['#8B5CF6', '#4C1D95'] },
  // Close-grip push-up (push-up family) — same icon, darker navy blue
  closegripPushup:     { symbol: 'figure.core.training', grad: ['#93C5FD', '#1E3A8A'] },
  // Tricep family — dumbbell icon, amber/gold to distinguish from green curl family
  tricepPushdown:          { symbol: 'dumbbell.fill', grad: ['#FDE68A', '#D97706'] },
  overheadTricepExtension: { symbol: 'dumbbell.fill', grad: ['#FCD34D', '#B45309'] },
  skullcrusher:            { symbol: 'dumbbell.fill', grad: ['#FCA5A5', '#9A3412'] },
  // Row family — steel blue (bent-over sub-family) / teal (seated sub-family)
  bentOverRow:   { symbol: 'dumbbell.fill', grad: ['#5B9BD5', '#1B4E7E'] },
  barbellRow:    { symbol: 'dumbbell.fill', grad: ['#7FBADC', '#14416E'] },
  singleArmRow:  { symbol: 'dumbbell.fill', grad: ['#3B85C4', '#0D2F5A'] },
  invertedRow:   { symbol: 'dumbbell.fill', grad: ['#92C5E8', '#1A3560'] },
  tBarRow:       { symbol: 'dumbbell.fill', grad: ['#4A8EC2', '#152E58'] },
  seatedCableRow: { symbol: 'dumbbell.fill', grad: ['#2DD4BF', '#115E59'] },
  machineRow:     { symbol: 'dumbbell.fill', grad: ['#14B8A6', '#0F4845'] },
  // Hip-hinge family — crimson/rose, distinct from every other family's palette
  romanianDeadlift: { symbol: 'figure.strengthtraining.traditional', grad: ['#FB7185', '#9F1239'] },
  deadlift:         { symbol: 'figure.strengthtraining.traditional', grad: ['#F43F5E', '#881337'] },
  goodMorning:      { symbol: 'figure.strengthtraining.traditional', grad: ['#E11D48', '#7F1D3B'] },
  kettlebellSwing:  { symbol: 'figure.strengthtraining.traditional', grad: ['#FDA4AF', '#BE123C'] },
  singleLegRDL:     { symbol: 'figure.strengthtraining.traditional', grad: ['#FB7185', '#831843'] },
  // Shoulder/arm isolation raise family — golden-yellow, distinct from shoulder press's orange-red
  lateralRaise: { symbol: 'figure.arms.open', grad: ['#FDE047', '#CA8A04'] },
  frontRaise:   { symbol: 'figure.arms.open', grad: ['#FEF08A', '#A16207'] },
  // Lat pulldown — indigo/violet, distinct from row's steel-blue and lunge's purple
  latPulldown: { symbol: 'dumbbell.fill', grad: ['#818CF8', '#3730A3'] },
  // Standing glute kickback — rose/pink, distinct from the hip-hinge family's
  // crimson (different movement pattern: extension, not a hinge)
  standingGluteKickback: { symbol: 'figure.core.training', grad: ['#FDA4AF', '#E11D48'] },
  // Face pull — teal/cyan, distinct from every other pull family's palette
  // (row's steel-blue, lat pulldown's indigo)
  facePull: { symbol: 'figure.arms.open', grad: ['#2DD4BF', '#0F766E'] },
  // Cable pull-through — same hip-hinge family palette as
  // romanianDeadlift/deadlift/etc (crimson/rose), one step further toward
  // the dark end since it's the most posterior-chain-loaded of the group
  cablePullThrough: { symbol: 'figure.strengthtraining.traditional', grad: ['#F43F5E', '#7F1D3B'] },
  // Pull-up — dedicated calisthenics SF Symbol, deep indigo (distinct from
  // lunge's purple and lat pulldown's own indigo)
  pullup: { symbol: 'figure.pull.up', grad: ['#818CF8', '#312E81'] },
  // Calf raise — emerald/green, its own family (no other lower-body
  // exercise uses green)
  calfRaise: { symbol: 'figure.strengthtraining.functional', grad: ['#6EE7B7', '#047857'] },
  // Leg curl (machine) — teal, distinct from squat's amber-orange lower-body family
  legCurl: { symbol: 'figure.strengthtraining.traditional', grad: ['#5EEAD4', '#0D9488'] },
  crunch: { symbol: 'figure.core.training', grad: ['#FCD34D', '#B45309'] },
};

export default function ExercisePickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Optional redirect target (e.g. `/analyze-video`) — defaults to the
  // existing `/formcheck` behavior when absent, so every current call site
  // is unaffected.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  return (
    <View style={s.root}>
      <LinearGradient
        colors={['#E8F1FF', '#EFEAFF', '#E9FBF2', '#FFF4EA']}
        locations={[0, 0.38, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <SymbolView
              name="chevron.left"
              size={18}
              tintColor="#1B1B1F"
              type="monochrome"
              style={{ width: 18, height: 18 }}
            />
          </Pressable>
          <View style={{ gap: 2 }}>
            <Text style={s.title}>Form Check</Text>
            <Text style={s.sub}>What are you working on?</Text>
          </View>
        </View>

        <View style={s.grid}>
          {EXERCISE_CATALOG.map(ex => {
            const ui = EXERCISE_UI[ex.id];
            if (!ui) return null;
            return (
              <Pressable
                key={ex.id}
                style={({ pressed }) => [s.card, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={() => router.push(`${returnTo || '/formcheck'}?exercise=${ex.id}` as any)}
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
                <Text style={s.cardName} numberOfLines={2}>{ex.displayName}</Text>
                <Text style={s.cardSub} numberOfLines={1}>{ex.muscleGroups.join(' · ')}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 22,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4A5468',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    fontFamily: F.extra,
    fontSize: 24,
    color: '#16171B',
    letterSpacing: -0.4,
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
    rowGap: 12,
  },
  card: {
    width: '48%',
    minHeight: 138,
    backgroundColor: '#fff',
    borderRadius: 22,
    borderCurve: 'continuous',
    padding: 16,
    gap: 10,
    alignItems: 'flex-start',
    shadowColor: '#4A5468',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
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
