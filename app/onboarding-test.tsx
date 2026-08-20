// ── app/onboarding-test.tsx ─────────────────────────────────────────────────
// EXPERIMENTAL onboarding style test — completely separate from the real
// onboarding flow (app/onboarding.tsx), which this file does not touch or
// import from. Question content, icons, and the weight-ruler/wheel controls
// are duplicated here on purpose to keep this file 100% isolated — no
// shared state, no shared component imports beyond AppBackground (a
// read-only visual layer) and theme tokens. Reached only via the "Test New
// Onboarding" button on the home screen. Safe to delete this file and that
// button with no effect on the real flow.
//
// Third pass, after two rounds of "that's not what I meant":
//   • font switched off the Bricolage display faces entirely — system font
//     ("the basic iOS font"), light weight, not the bold display font
//   • real icons (the same assets/icons/*.webp + SF Symbol fallbacks the
//     real onboarding uses) instead of emoji
//   • AppBackground's colorful blob gradient restored behind everything
//   • age/height use the real wheel picker, weight uses a duplicated
//     version of the real tick-mark ruler slider — not bucketed pills
//   • the active question now anchors near the TOP of the viewport and the
//     whole page scrolls down to bring each new turn there, rather than
//     leaving it wherever it happened to land after accumulated content
//   • a round "X" icon button (SF Symbol, not text) top-right
//
// Open question I'm not confident I read correctly: something about
// reusing "the four things" / "two animations" from the real interstitial
// screens for two of the four "did you know" facts, excluding the two that
// use photos. I left the facts as plain animated text rather than guess at
// embedding chart components — say more if that's not what you meant.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, ScrollView, TextInput, Image,
  KeyboardAvoidingView, Platform, PanResponder, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { SymbolView } from 'expo-symbols';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import AppBackground from '../components/AppBackground';
import { Col } from '../constants/theme';

const ACCENT   = '#2E7DFF';
const DARK     = '#0B1020';
const TYPE_SPEED_MS = 20; // ms per character
const SPACER_H = Math.round(Dimensions.get('window').height * 0.55);

// ── Icons — same asset files the real onboarding uses ─────────────────────

const ICON = {
  heart: require('../assets/icons/heart.webp'), person: require('../assets/icons/person.webp'),
  muscle: require('../assets/icons/muscle.webp'), calm: require('../assets/icons/calm.webp'),
  days: require('../assets/icons/days.webp'), run: require('../assets/icons/run.webp'),
  gym: require('../assets/icons/gym.webp'), scale: require('../assets/icons/scale.webp'),
  camera: require('../assets/icons/camera.webp'), arm: require('../assets/icons/arm.webp'),
  allGood: require('../assets/icons/allgood.webp'), hip: require('../assets/icons/hip.webp'),
  wrist: require('../assets/icons/wrist.webp'), neck: require('../assets/icons/neck.webp'),
  shoulder: require('../assets/icons/shoulder.webp'), knee: require('../assets/icons/knee.webp'),
  notSure: require('../assets/icons/notsure.webp'), fire: require('../assets/icons/fire.webp'),
  scared: require('../assets/icons/scared.webp'), noResults: require('../assets/icons/progressquestion.webp'),
  date: require('../assets/icons/date.webp'), good: require('../assets/icons/good.webp'),
  bodyweight: require('../assets/icons/bodyweight.webp'), bench: require('../assets/icons/bench.webp'),
  pullupBar: require('../assets/icons/pullupbar.webp'), kettlebell: require('../assets/icons/kettlebell.webp'),
  bands: require('../assets/icons/bands.webp'), dumbbell: require('../assets/icons/dumbell.webp'),
  barbell: require('../assets/icons/barbellandplates.webp'), expertGym: require('../assets/icons/gymexpert.webp'),
  intermediateGym: require('../assets/icons/gymintermediate.webp'), someExpGym: require('../assets/icons/gymsomeexperience.webp'),
  beginnerGym: require('../assets/icons/gymbeginner.webp'), home: require('../assets/icons/home.webp'),
  female: require('../assets/icons/female.webp'), male: require('../assets/icons/male.webp'),
  mixOfBoth: require('../assets/icons/mixofboth.webp'), back: require('../assets/icons/back.webp'),
  squatMachine: require('../assets/icons/squatmachine.webp'), backMachine: require('../assets/icons/backmachine.webp'),
  chestMachine: require('../assets/icons/chestmachine.webp'), legMachine: require('../assets/icons/legmachine.webp'),
  cableMachine: require('../assets/icons/cablemachine.webp'),
} as const;

// ── Content model ────────────────────────────────────────────────────────

interface OptionDef { label: string; sfSymbol?: string; customIcon?: any }
interface Segment { text: string; accent?: boolean }
type TurnBase = { id: string; showIf?: (a: Record<string, any>) => boolean };
type Turn =
  | (TurnBase & { kind: 'fact'; segments: Segment[]; visual?: 'effortBars' })
  | (TurnBase & { kind: 'text'; prompt: string; placeholder: string })
  | (TurnBase & { kind: 'select'; prompt: string; options: OptionDef[] })
  | (TurnBase & { kind: 'multiselect'; prompt: string; options: OptionDef[]; clearAllOption?: string })
  | (TurnBase & { kind: 'wheel'; prompt: string; wheelKind: 'age' | 'height' })
  | (TurnBase & { kind: 'ruler'; prompt: string });

const fact = (id: string, segments: Segment[], visual?: 'effortBars'): Turn => ({ id, kind: 'fact', segments, visual });

const FLOW: Turn[] = [
  { id: 'name', kind: 'text', prompt: "Hey — I'm going to build your training plan. What should I call you?", placeholder: 'Your name' },
  { id: 'age', kind: 'wheel', wheelKind: 'age', prompt: 'How old are you?' },
  { id: 'height', kind: 'wheel', wheelKind: 'height', prompt: 'How tall are you?' },
  { id: 'weight', kind: 'ruler', prompt: 'What do you weigh?' },
  { id: 'sex', kind: 'select', prompt: "What's your sex?", options: [
    { label: 'Male', sfSymbol: 'person.fill', customIcon: ICON.male },
    { label: 'Female', sfSymbol: 'person.fill', customIcon: ICON.female },
  ]},

  fact('fact1', [
    { text: 'Did you know? ' },
    { text: 'Lifters with a structured plan build ' },
    { text: '2-3x more muscle.', accent: true },
  ]),

  { id: 'goal', kind: 'multiselect', prompt: 'What are your goals?', options: [
    { label: 'Build muscle', sfSymbol: 'dumbbell.fill', customIcon: ICON.muscle },
    { label: 'Lose weight', sfSymbol: 'flame.fill', customIcon: ICON.scale },
    { label: 'Get stronger', sfSymbol: 'bolt.fill', customIcon: ICON.arm },
    { label: 'Improve form', sfSymbol: 'camera.fill', customIcon: ICON.camera },
    { label: 'Stay consistent', sfSymbol: 'repeat', customIcon: ICON.days },
  ]},
  { id: 'motivation', kind: 'multiselect', prompt: 'What draws you to fitness?', options: [
    { label: 'Feel healthier', sfSymbol: 'heart.fill', customIcon: ICON.heart },
    { label: 'Look & feel confident', sfSymbol: 'star.fill', customIcon: ICON.person },
    { label: 'Get strong', sfSymbol: 'bolt.fill', customIcon: ICON.gym },
    { label: 'Reduce stress', sfSymbol: 'leaf.fill', customIcon: ICON.calm },
    { label: 'Build a habit', sfSymbol: 'repeat', customIcon: ICON.days },
    { label: 'Sports & performance', sfSymbol: 'figure.run', customIcon: ICON.run },
  ]},

  fact('fact2', [
    { text: 'Did you know? Without good form, you only get back ' },
    { text: 'a fraction of the work', accent: true },
    { text: ' you put in.' },
  ], 'effortBars'),

  { id: 'experience', kind: 'select', prompt: 'Your experience level?', options: [
    { label: 'Beginner', sfSymbol: '1.circle.fill', customIcon: ICON.beginnerGym },
    { label: 'Some experience', sfSymbol: '2.circle.fill', customIcon: ICON.someExpGym },
    { label: 'Intermediate', sfSymbol: '3.circle.fill', customIcon: ICON.intermediateGym },
    { label: 'Advanced', sfSymbol: '4.circle.fill', customIcon: ICON.expertGym },
  ]},
  { id: 'injuries', kind: 'multiselect', prompt: 'Anything to train around?', clearAllOption: "None — I'm good", options: [
    { label: 'Knees', sfSymbol: 'figure.walk', customIcon: ICON.knee },
    { label: 'Shoulders', sfSymbol: 'figure.arms.open', customIcon: ICON.shoulder },
    { label: 'Lower back', sfSymbol: 'figure.cooldown', customIcon: ICON.back },
    { label: 'Wrists', sfSymbol: 'hand.raised.fill', customIcon: ICON.wrist },
    { label: 'Neck', sfSymbol: 'figure.stand', customIcon: ICON.neck },
    { label: 'Hips', sfSymbol: 'figure.run', customIcon: ICON.hip },
    { label: "None — I'm good", sfSymbol: 'checkmark.circle.fill', customIcon: ICON.good },
  ]},
  { id: 'struggle', kind: 'multiselect', prompt: 'Anything getting in your way?', clearAllOption: 'Nothing — just ready to start', options: [
    { label: 'Not sure what to do', sfSymbol: 'questionmark.circle.fill', customIcon: ICON.notSure },
    { label: 'Staying consistent', sfSymbol: 'repeat', customIcon: ICON.days },
    { label: 'Gym anxiety', sfSymbol: 'shield.fill', customIcon: ICON.scared },
    { label: 'Not seeing results', sfSymbol: 'minus.circle.fill', customIcon: ICON.noResults },
    { label: 'Finding time', sfSymbol: 'clock.fill', customIcon: ICON.date },
    { label: 'Nothing — just ready to start', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.fire },
  ]},

  fact('fact3', [
    { text: 'Did you know? Correct form builds nearly ' },
    { text: '2x the muscle.', accent: true },
  ]),

  { id: 'trainingLocation', kind: 'select', prompt: 'Where do you train?', options: [
    { label: 'Home', sfSymbol: 'house.fill', customIcon: ICON.home },
    { label: 'Gym', sfSymbol: 'figure.strengthtraining.traditional', customIcon: ICON.gym },
    { label: 'Mix of both', sfSymbol: 'shuffle', customIcon: ICON.mixOfBoth },
  ]},
  { id: 'homeEquipment', kind: 'multiselect', prompt: 'Equipment you have at home?',
    showIf: a => a.trainingLocation === 'Home' || a.trainingLocation === 'Mix of both',
    clearAllOption: 'Nothing — bodyweight only',
    options: [
      { label: 'Dumbbells', sfSymbol: 'dumbbell.fill', customIcon: ICON.dumbbell },
      { label: 'Resistance bands', sfSymbol: 'figure.flexibility', customIcon: ICON.bands },
      { label: 'Kettlebells', sfSymbol: 'figure.strengthtraining.functional', customIcon: ICON.kettlebell },
      { label: 'Pull-up bar', sfSymbol: 'figure.gymnastics', customIcon: ICON.pullupBar },
      { label: 'Bench', sfSymbol: 'rectangle.fill', customIcon: ICON.bench },
      { label: 'Barbell & plates', sfSymbol: 'figure.strengthtraining.traditional', customIcon: ICON.barbell },
      { label: 'Nothing — bodyweight only', sfSymbol: 'figure.walk', customIcon: ICON.bodyweight },
    ],
  },
  { id: 'gymMissingEquipment', kind: 'multiselect', prompt: 'Anything your gym is missing?',
    showIf: a => a.trainingLocation === 'Gym' || a.trainingLocation === 'Mix of both',
    clearAllOption: 'It has everything',
    options: [
      { label: 'Free weights', sfSymbol: 'dumbbell.fill', customIcon: ICON.dumbbell },
      { label: 'Cable machines', sfSymbol: 'figure.strengthtraining.functional', customIcon: ICON.cableMachine },
      { label: 'Leg machines', sfSymbol: 'figure.walk', customIcon: ICON.legMachine },
      { label: 'Chest / press machines', sfSymbol: 'figure.strengthtraining.traditional', customIcon: ICON.chestMachine },
      { label: 'Back / row machines', sfSymbol: 'figure.rower', customIcon: ICON.backMachine },
      { label: 'Squat rack', sfSymbol: 'figure.cross.training', customIcon: ICON.squatMachine },
      { label: 'It has everything', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.allGood },
    ],
  },
  { id: 'days', kind: 'select', prompt: 'How many days a week?', options: [
    { label: '1 day', sfSymbol: '1.circle.fill' }, { label: '2 days', sfSymbol: '2.circle.fill' },
    { label: '3 days', sfSymbol: '3.circle.fill' }, { label: '4 days', sfSymbol: '4.circle.fill' },
    { label: '5 days', sfSymbol: '5.circle.fill' }, { label: '6 days', sfSymbol: '6.circle.fill' },
    { label: '7 days', sfSymbol: '7.circle.fill' },
  ]},
  { id: 'duration', kind: 'select', prompt: 'How long per session?', options: [
    { label: '15-20 min', sfSymbol: 'clock.fill' }, { label: '30 min', sfSymbol: 'clock.fill' },
    { label: '45 min', sfSymbol: 'clock.fill' }, { label: '60 min', sfSymbol: 'clock.fill' },
    { label: '75+ min', sfSymbol: 'clock.fill' },
  ]},

  fact('fact4', [
    { text: 'Did you know? ' },
    { text: '1,000,000', accent: true },
    { text: ' gym injuries hit the ER every year — most caused by bad form.' },
  ]),

  { id: 'notifications', kind: 'select', prompt: 'Reminders on training days?', options: [
    { label: 'Yes please', sfSymbol: 'bell.fill' }, { label: 'No thanks', sfSymbol: 'bell.slash.fill' },
  ]},
];

// ── Wheel data (age/height) ─────────────────────────────────────────────

const AGE_OPTIONS = Array.from({ length: 73 }, (_, i) => String(i + 13));
const HEIGHT_OPTIONS: string[] = [];
for (let ft = 4; ft <= 6; ft++) {
  for (let inch = (ft === 4 ? 8 : 0); inch <= (ft === 6 ? 10 : 11); inch++) HEIGHT_OPTIONS.push(`${ft}'${inch}"`);
}

// ── Weight ruler (duplicated from app/onboarding.tsx's WeightRulerSlider —
// same tick-mark/drag mechanics, restyled to this screen's palette) ───────

const WEIGHT_MIN = 70, WEIGHT_MAX = 400, TICK_GAP = 14, TICK_TRACK_H = 70;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

function WeightRuler({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackWidth = (WEIGHT_MAX - WEIGHT_MIN) * TICK_GAP;
  const pxFromValue = (v: number) => Math.max(0, Math.min(trackWidth, (v - WEIGHT_MIN) * TICK_GAP));
  const valueFromPx = (px: number) => WEIGHT_MIN + px / TICK_GAP;

  const [displayVal, setDisplayVal] = useState(value);
  const [viewportWidth, setViewportWidth] = useState(300);
  const valuePx  = useRef(new Animated.Value(pxFromValue(value))).current;
  const startRef = useRef(pxFromValue(value));
  const lastTickRef = useRef(Math.round(value));
  // The decimal digit blurs while actively dragging and sharpens back into
  // focus once you settle — the reference image's look (crisp whole
  // number, soft/blurred tenths digit mid-scrub).
  const blurAmount = useRef(new Animated.Value(0)).current;
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = (valuePx as any)._value ?? pxFromValue(value);
        if (settleTimeout.current) clearTimeout(settleTimeout.current);
        Animated.timing(blurAmount, { toValue: 14, duration: 100, useNativeDriver: false }).start();
      },
      onPanResponderMove: (_, gs) => {
        const raw = startRef.current - gs.dx;
        const next = Math.max(0, Math.min(trackWidth, raw));
        valuePx.setValue(next);
        const v = Math.round(valueFromPx(next) * 10) / 10;
        setDisplayVal(v);
        onChange(v);
        const wholeLb = Math.round(v);
        if (wholeLb !== lastTickRef.current) { lastTickRef.current = wholeLb; void Haptics.selectionAsync(); }
      },
      onPanResponderRelease: (_, gs) => {
        const raw = startRef.current - gs.dx;
        const next = Math.max(0, Math.min(trackWidth, raw));
        const v = Math.round(valueFromPx(next) * 10) / 10;
        valuePx.setValue(pxFromValue(v));
        setDisplayVal(v);
        onChange(v);
        settleTimeout.current = setTimeout(() => {
          Animated.timing(blurAmount, { toValue: 0, duration: 340, useNativeDriver: false }).start();
        }, 220);
      },
    })
  ).current;

  useEffect(() => () => { if (settleTimeout.current) clearTimeout(settleTimeout.current); }, []);

  const [whole, decimal] = displayVal.toFixed(1).split('.');

  const stripTranslateX = valuePx.interpolate({
    inputRange: [0, trackWidth], outputRange: [viewportWidth / 2, viewportWidth / 2 - trackWidth],
  });
  const ticks = useMemo(() => {
    const out: { left: number; major: boolean }[] = [];
    for (let i = 0; i <= WEIGHT_MAX - WEIGHT_MIN; i++) out.push({ left: i * TICK_GAP, major: i % 10 === 0 });
    return out;
  }, []);

  return (
    <View style={{ alignItems: 'center', marginTop: 14 }}>
      <View style={rulerStyles.valueRow}>
        <Text style={rulerStyles.value}>{whole}.</Text>
        <View style={rulerStyles.decimalWrap}>
          <Text style={rulerStyles.value}>{decimal}</Text>
          <AnimatedBlurView intensity={blurAmount} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
        </View>
        <Text style={[rulerStyles.value, rulerStyles.unit]}> lbs</Text>
      </View>
      <View
        style={{ width: '100%', height: TICK_TRACK_H, overflow: 'hidden' }}
        onLayout={e => setViewportWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <Animated.View style={{ width: trackWidth, height: TICK_TRACK_H, transform: [{ translateX: stripTranslateX }] }}>
          {ticks.map((t, i) => (
            <View key={i} style={{ position: 'absolute', left: t.left, bottom: 0, width: 3, height: t.major ? 38 : 20, backgroundColor: 'rgba(17,24,39,0.14)', borderRadius: 1.5 }} />
          ))}
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: valuePx, overflow: 'hidden' }}>
            {ticks.map((t, i) => (
              <View key={i} style={{ position: 'absolute', left: t.left, bottom: 0, width: 3, height: t.major ? 38 : 20, backgroundColor: DARK, borderRadius: 1.5 }} />
            ))}
          </Animated.View>
        </Animated.View>
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: viewportWidth / 2 - 2, width: 4, height: 52, backgroundColor: DARK, borderRadius: 2 }} />
      </View>
    </View>
  );
}

const rulerStyles = StyleSheet.create({
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 18 },
  value: { fontSize: 40, fontWeight: '300', color: Col.text, letterSpacing: -1 },
  unit: { fontSize: 18, fontWeight: '400', color: Col.textDim },
  // Fixed width so the blur overlay's frame doesn't jump around as the
  // digit itself changes (a "1" is narrower than a "8", etc.).
  decimalWrap: { width: 24, overflow: 'hidden' },
});

// ── Typewriter ───────────────────────────────────────────────────────────

function useTypewriter(fullText: string, active: boolean, onWord: () => void, onDone: () => void) {
  const [count, setCount] = useState(active ? 0 : fullText.length);
  useEffect(() => {
    if (!active) { setCount(fullText.length); return; }
    setCount(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setCount(i);
      if (fullText[i - 1] === ' ') onWord();
      if (i >= fullText.length) { clearInterval(id); onDone(); }
    }, TYPE_SPEED_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullText, active]);
  return count;
}

function TypedSegments({ segments, count, style }: { segments: Segment[]; count: number; style: any }) {
  let consumed = 0;
  return (
    <Text style={style}>
      {segments.map((seg, i) => {
        const start = consumed;
        consumed += seg.text.length;
        const visible = Math.max(0, Math.min(seg.text.length, count - start));
        if (visible <= 0) return null;
        return <Text key={i} style={seg.accent ? styles.accent : undefined}>{seg.text.slice(0, visible)}</Text>;
      })}
    </Text>
  );
}

// Brought back from the real interstitial screens' EffortResultsMoment,
// scaled down to sit inline as a fact turn's visual instead of its own
// full screen — the "what you get vs what you put in" bar comparison.
function EffortBars() {
  const effortFill  = useRef(new Animated.Value(0)).current;
  const resultsFill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(effortFill,  { toValue: 1, duration: 900, delay: 150, useNativeDriver: false }).start();
    Animated.timing(resultsFill, { toValue: 1, duration: 900, delay: 150, useNativeDriver: false }).start();
  }, []);
  const effortW  = effortFill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const resultsW = resultsFill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '40%'] });
  return (
    <View style={styles.barsWrap}>
      <View>
        <View style={styles.barHead}>
          <Text style={styles.barLabel}>Effort you put in</Text>
          <Text style={[styles.barPct, styles.accent]}>100%</Text>
        </View>
        <View style={styles.barTrack}><Animated.View style={[styles.barFill, { width: effortW, backgroundColor: ACCENT }]} /></View>
      </View>
      <View>
        <View style={styles.barHead}>
          <Text style={styles.barLabel}>Results you get</Text>
          <Text style={styles.barPct}>40%</Text>
        </View>
        <View style={styles.barTrack}><Animated.View style={[styles.barFill, { width: resultsW, backgroundColor: DARK }]} /></View>
      </View>
    </View>
  );
}

function BlinkCursor({ show }: { show: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!show) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [show]);
  if (!show) return null;
  return <Animated.Text style={[styles.cursor, { opacity }]}>|</Animated.Text>;
}

// ── Option icon — customIcon (webp) takes priority, sfSymbol is the
// fallback, exactly like the real onboarding's option renderer ───────────

function OptIcon({ opt, selected }: { opt: OptionDef; selected: boolean }) {
  if (opt.customIcon) {
    // No background box — just the icon itself with rounded corners,
    // matching the real onboarding's plain (no-tint, no-badge) treatment.
    return <Image source={opt.customIcon} style={styles.pillIconImg} resizeMode="cover" />;
  }
  return (
    <View style={styles.pillIconWrap}>
      <SymbolView name={(opt.sfSymbol ?? 'circle.fill') as any} size={20} tintColor={selected ? ACCENT : Col.textSub} type="monochrome" style={{ width: 20, height: 20 }} />
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────

export default function OnboardingTestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [answers, setAnswers]     = useState<Record<string, any>>({});
  const [turnIndex, setTurnIndex] = useState(0);
  const [typingDone, setTypingDone] = useState(false);
  const [multiTemp, setMultiTemp]   = useState<string[]>([]);
  const [nameInput, setNameInput]   = useState('');
  const [wheelVal, setWheelVal]     = useState('');
  const [rulerVal, setRulerVal]     = useState(160);

  const visibleFlow = useMemo(() => FLOW.filter(t => !t.showIf || t.showIf(answers)), [answers]);
  const current = visibleFlow[turnIndex];
  const isDone = !current;

  useEffect(() => {
    setTypingDone(false);
    setMultiTemp([]);
    if (current?.kind === 'wheel') setWheelVal(current.wheelKind === 'height' ? `5'8"` : '18');
    if (current?.kind === 'ruler') setRulerVal(160);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnIndex]);

  const wordTick = () => Haptics.selectionAsync();

  const commitAndAdvance = (id: string, value: any) => {
    setAnswers(a => ({ ...a, [id]: value }));
    setTurnIndex(i => i + 1);
  };

  const selectOption = (id: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commitAndAdvance(id, label);
  };

  const toggleMultiOption = (opt: OptionDef, clearAllOption?: string) => {
    Haptics.selectionAsync();
    setMultiTemp(cur => {
      if (clearAllOption && opt.label === clearAllOption) return cur.includes(opt.label) ? [] : [opt.label];
      const withoutClear = clearAllOption ? cur.filter(o => o !== clearAllOption) : cur;
      return withoutClear.includes(opt.label) ? withoutClear.filter(o => o !== opt.label) : [...withoutClear, opt.label];
    });
  };

  const confirmMulti = (id: string) => {
    if (multiTemp.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    commitAndAdvance(id, multiTemp);
  };

  const confirmName = () => {
    const v = nameInput.trim();
    if (!v) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commitAndAdvance('name', v);
    setNameInput('');
  };

  const confirmWheel = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commitAndAdvance(id, wheelVal);
  };

  const confirmRuler = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commitAndAdvance(id, rulerVal);
  };

  // Facts auto-advance a beat after they finish typing — longer when there's
  // a visual (bars) to actually let it animate and register.
  useEffect(() => {
    if (current?.kind === 'fact' && typingDone) {
      const delay = current.visual ? 2400 : 1100;
      const t = setTimeout(() => setTurnIndex(i => i + 1), delay);
      return () => clearTimeout(t);
    }
  }, [typingDone, current]);

  // Scroll mechanism, take 3 — the previous two both measured the active
  // turn's own layout (onLayout, then a two-frame-deferred version of the
  // same) and scrolled to that Y. Both apparently only actually fired once
  // content had already grown enough to reach the bottom naturally, which
  // means the measurement itself wasn't the reliable part.
  //
  // This drops layout measurement entirely. `onContentSizeChange` is a
  // native ScrollView callback that fires on every content-size change —
  // including every single character the typewriter adds — so calling
  // scrollToEnd() from it is guaranteed to run continuously as content
  // grows, not dependent on my own timing. To keep the active turn sitting
  // in the upper portion of the screen rather than jammed at the very
  // bottom (which is what scrollToEnd alone would do), a tall spacer after
  // the active turn keeps there being room to scroll into.

  const name = answers.name as string | undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1 }}>
        <AppBackground />
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={12}>
            <View style={styles.closeCircle}>
              <SymbolView name="xmark" size={13} tintColor={Col.textSub} type="monochrome" style={{ width: 13, height: 13 }} />
            </View>
          </Pressable>

          <View style={styles.mark} />

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {visibleFlow.slice(0, turnIndex).map((t, i) => (
              <PastTurn key={t.id + i} turn={t} answer={answers[t.id]} />
            ))}

            {current && (
              <>
                <ActiveTurn
                  key={current.id}
                  turn={current}
                  typingDone={typingDone}
                  onWord={wordTick}
                  onDone={() => setTypingDone(true)}
                  onSelect={selectOption}
                  multiTemp={multiTemp}
                  onToggleMulti={toggleMultiOption}
                  onConfirmMulti={confirmMulti}
                  nameInput={nameInput}
                  onChangeName={setNameInput}
                  onConfirmName={confirmName}
                  wheelVal={wheelVal}
                  onChangeWheel={setWheelVal}
                  onConfirmWheel={confirmWheel}
                  rulerVal={rulerVal}
                  onChangeRuler={setRulerVal}
                  onConfirmRuler={confirmRuler}
                />
                {/* Keeps room to scroll into so scrollToEnd() lands the active
                    turn in the upper portion of the screen instead of jammed
                    against the very bottom. */}
                <View style={{ height: SPACER_H }} />
              </>
            )}

            {isDone && (
              <View style={styles.doneWrap}>
                <Text style={styles.doneText}>
                  All set{name ? `, ${name}` : ''}. <Text style={styles.accent}>That's the whole flow.</Text>
                </Text>
                <Pressable style={styles.finishBtn} onPress={() => router.back()}>
                  <Text style={styles.finishBtnTxt}>Close</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Past (already-answered) turn — dimmed, static, no animation ──────────

function PastTurn({ turn, answer }: { turn: Turn; answer: any }) {
  const prompt = turn.kind === 'fact' ? turn.segments.map(s => s.text).join('') : turn.prompt;
  const echo = turn.kind === 'fact' ? null
    : turn.kind === 'multiselect' ? (answer as string[] | undefined)?.join(', ')
    : turn.kind === 'ruler' ? `${Number(answer).toFixed(1)} lbs`
    : (answer != null ? String(answer) : undefined);
  return (
    <View style={styles.pastTurn}>
      <Text style={styles.pastLine} numberOfLines={3}>{prompt}</Text>
      {echo ? <Text style={styles.echoLine}>{echo}</Text> : null}
    </View>
  );
}

// ── Active turn — typewriter, then its input UI ───────────────────────────

function ActiveTurn({
  turn, typingDone, onWord, onDone, onSelect,
  multiTemp, onToggleMulti, onConfirmMulti,
  nameInput, onChangeName, onConfirmName,
  wheelVal, onChangeWheel, onConfirmWheel,
  rulerVal, onChangeRuler, onConfirmRuler,
}: {
  turn: Turn;
  typingDone: boolean;
  onWord: () => void;
  onDone: () => void;
  onSelect: (id: string, label: string) => void;
  multiTemp: string[];
  onToggleMulti: (opt: OptionDef, clearAllOption?: string) => void;
  onConfirmMulti: (id: string) => void;
  nameInput: string;
  onChangeName: (v: string) => void;
  onConfirmName: () => void;
  wheelVal: string;
  onChangeWheel: (v: string) => void;
  onConfirmWheel: (id: string) => void;
  rulerVal: number;
  onChangeRuler: (v: number) => void;
  onConfirmRuler: (id: string) => void;
}) {
  const segments: Segment[] = turn.kind === 'fact' ? turn.segments : [{ text: turn.prompt }];
  const fullText = segments.map(s => s.text).join('');
  const count = useTypewriter(fullText, true, onWord, onDone);

  return (
    <View style={styles.activeTurn}>
      <View style={styles.typeRow}>
        <TypedSegments segments={segments} count={count} style={styles.activeLine} />
        <BlinkCursor show={!typingDone} />
      </View>

      {typingDone && turn.kind === 'fact' && turn.visual === 'effortBars' && <EffortBars />}

      {typingDone && turn.kind === 'select' && (
        <View style={styles.pillWrap}>
          {turn.options.map(o => (
            <Pressable key={o.label} style={styles.pill} onPress={() => onSelect(turn.id, o.label)}>
              <OptIcon opt={o} selected={false} />
              <Text style={styles.pillLabel}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {typingDone && turn.kind === 'multiselect' && (
        <>
          <View style={styles.pillWrap}>
            {turn.options.map(o => {
              const sel = multiTemp.includes(o.label);
              return (
                <Pressable key={o.label} style={[styles.pill, sel && styles.pillSel]} onPress={() => onToggleMulti(o, turn.clearAllOption)}>
                  <OptIcon opt={o} selected={sel} />
                  <Text style={[styles.pillLabel, sel && styles.pillLabelSel]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={[styles.continueBtn, multiTemp.length === 0 && styles.continueBtnDisabled]} disabled={multiTemp.length === 0} onPress={() => onConfirmMulti(turn.id)}>
            <Text style={[styles.continueBtnTxt, multiTemp.length === 0 && styles.continueBtnTxtDisabled]}>Continue</Text>
          </Pressable>
        </>
      )}

      {typingDone && turn.kind === 'text' && (
        <View style={styles.textInputRow}>
          <TextInput
            value={nameInput} onChangeText={onChangeName} placeholder={turn.placeholder} placeholderTextColor={Col.textDim}
            style={styles.textInput} autoFocus returnKeyType="done" onSubmitEditing={onConfirmName}
          />
          <Pressable style={[styles.continueBtn, !nameInput.trim() && styles.continueBtnDisabled]} disabled={!nameInput.trim()} onPress={onConfirmName}>
            <Text style={[styles.continueBtnTxt, !nameInput.trim() && styles.continueBtnTxtDisabled]}>Continue</Text>
          </Pressable>
        </View>
      )}

      {typingDone && turn.kind === 'wheel' && (
        <View style={styles.wheelWrap}>
          <Picker selectedValue={wheelVal} onValueChange={onChangeWheel} style={{ height: 170 }} itemStyle={{ color: Col.text, fontSize: 24, fontWeight: '300' }}>
            {(turn.wheelKind === 'height' ? HEIGHT_OPTIONS : AGE_OPTIONS).map(o => <Picker.Item key={o} label={o} value={o} />)}
          </Picker>
          <Pressable style={styles.continueBtn} onPress={() => onConfirmWheel(turn.id)}>
            <Text style={styles.continueBtnTxt}>Continue</Text>
          </Pressable>
        </View>
      )}

      {typingDone && turn.kind === 'ruler' && (
        <View>
          <WeightRuler value={rulerVal} onChange={onChangeRuler} />
          <Pressable style={styles.continueBtn} onPress={() => onConfirmRuler(turn.id)}>
            <Text style={styles.continueBtnTxt}>Continue</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  closeBtn: { position: 'absolute', top: 8, right: 20, zIndex: 10 },
  closeCircle: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(17,24,39,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },

  mark: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT, alignSelf: 'center', marginTop: 20, marginBottom: 8 },

  scroll: { paddingHorizontal: 28, paddingTop: 16 },

  pastTurn: { marginBottom: 22 },
  pastLine: { fontSize: 16, lineHeight: 21, fontWeight: '400', color: Col.textDim, letterSpacing: -0.2 },
  echoLine: { fontSize: 17, lineHeight: 22, marginTop: 4, fontWeight: '500', color: ACCENT, letterSpacing: -0.2 },

  activeTurn: { marginBottom: 32 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  activeLine: { fontSize: 25, lineHeight: 32, fontWeight: '300', color: Col.text, letterSpacing: -0.3 },
  accent: { color: ACCENT, fontWeight: '500' },
  cursor: { fontSize: 25, fontWeight: '300', color: ACCENT, marginLeft: 1 },

  barsWrap: { marginTop: 22, gap: 18 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  barLabel: { fontSize: 15, fontWeight: '400', color: Col.text },
  barPct: { fontSize: 15, fontWeight: '600', color: Col.text },
  barTrack: { height: 30, borderRadius: 15, backgroundColor: 'rgba(17,24,39,0.06)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 15 },

  pillWrap: { marginTop: 20, gap: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 100, backgroundColor: '#ffffff',
    borderWidth: 1, borderColor: 'rgba(17,24,39,0.06)',
    ...({ boxShadow: '0px 1px 2px rgba(20,20,40,0.06), 0px 4px 10px rgba(20,20,40,0.04)' } as any),
  },
  pillSel: { backgroundColor: 'rgba(46,125,255,0.08)', borderColor: ACCENT },
  pillIconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pillIconImg: { width: 32, height: 32, borderRadius: 10 },
  pillLabel: { fontSize: 16, fontWeight: '400', color: Col.text, letterSpacing: -0.2 },
  pillLabelSel: { color: ACCENT, fontWeight: '500' },

  continueBtn: { marginTop: 14, backgroundColor: DARK, borderRadius: 100, paddingVertical: 15, alignItems: 'center' },
  continueBtnDisabled: { backgroundColor: '#EBEBF0' },
  continueBtnTxt: { fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: 0.1 },
  continueBtnTxtDisabled: { color: Col.textDim },

  textInputRow: { marginTop: 22, gap: 14 },
  textInput: { fontSize: 22, fontWeight: '300', color: Col.text, borderBottomWidth: 2, borderBottomColor: ACCENT, paddingBottom: 8, letterSpacing: -0.2 },

  wheelWrap: { marginTop: 8 },

  doneWrap: { marginTop: 12, alignItems: 'center' },
  doneText: { fontSize: 25, lineHeight: 32, fontWeight: '300', textAlign: 'center', color: Col.text, letterSpacing: -0.3, marginBottom: 24 },
  finishBtn: { backgroundColor: DARK, borderRadius: 100, paddingVertical: 15, paddingHorizontal: 40 },
  finishBtnTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
