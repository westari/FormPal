import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { EXERCISE_CATALOG } from '../constants/exercises';

const EXERCISE_UI: Record<string, { symbol: string; grad: [string, string] }> = {
  squat:             { symbol: 'figure.strengthtraining.traditional', grad: ['#FFC24B', '#FF7A2E'] },
  pushup:            { symbol: 'figure.core.training',               grad: ['#67CEFF', '#0A6CFF'] },
  curl:              { symbol: 'dumbbell.fill',                      grad: ['#48E08A', '#12B59A'] },
  lunge:             { symbol: 'figure.step.training',               grad: ['#C084FC', '#7C3AED'] },
  shoulderPress:     { symbol: 'figure.arms.open',                   grad: ['#F97316', '#DC2626'] },
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
};

export default function ExercisePickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
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
    </ScrollView>
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
