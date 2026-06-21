import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView,
  Animated, TextInput, KeyboardAvoidingView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check, Flame, Target, TrendingUp, Dumbbell, User as UserIcon,
  Calendar, Camera, Play, Heart, Activity, Sprout, Award, Compass,
  Repeat, Shield, Home as HomeIcon, Settings, Clock, Bell, BellOff, Zap,
} from 'lucide-react-native';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import Svg, { Path as SvgPath, Text as SvgText, Circle as SvgCircle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Shared with app/index.tsx — both must use the same string
export const ONBOARDING_KEY = 'formpal_onboarding_complete';

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
  primarySoft:   'rgba(214,215,220,0.14)',
};

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(style);
};

const AGE_OPTIONS = Array.from({ length: 73 }, (_, i) => String(i + 13));

const HEIGHT_OPTIONS: string[] = [];
for (let ft = 4; ft <= 6; ft++) {
  const startIn = ft === 4 ? 8 : 0;
  const endIn   = ft === 6 ? 10 : 11;
  for (let inch = startIn; inch <= endIn; inch++) {
    HEIGHT_OPTIONS.push(`${ft}'${inch}"`);
  }
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------
interface OptionDef { label: string; subtitle?: string; icon?: any; }
interface Step {
  id: string;
  section: string;
  type: 'select' | 'multiselect' | 'wheel' | 'text';
  question: string;
  subtitle?: string;
  options?: OptionDef[];
  placeholder?: string;
  wheelKind?: 'age' | 'height';
  showIf?: (a: Record<string, any>) => boolean;
}

const SECTION_ICONS: Record<string, any> = {
  'Your Goal':       Target,
  'Your Experience': TrendingUp,
  'Your Training':   Dumbbell,
  'About You':       UserIcon,
  'Reminders':       Calendar,
};

const STEPS: Step[] = [
  { id: 'age',    section: 'About You', type: 'wheel', wheelKind: 'age',    question: 'How old are you?',    subtitle: 'Helps me dial in the right pace.' },
  { id: 'height', section: 'About You', type: 'wheel', wheelKind: 'height', question: 'How tall are you?',   subtitle: 'Helps set the right benchmarks for your body.' },
  { id: 'weight', section: 'About You', type: 'text',  question: 'What do you weigh?', subtitle: 'So weight suggestions actually fit you.', placeholder: '0' },
  { id: 'sex',    section: 'About You', type: 'select', question: "What's your sex?", subtitle: 'Helps me set the right starting weights.', options: [
    { label: 'Male',              icon: UserIcon },
    { label: 'Female',            icon: UserIcon },
    { label: 'Prefer not to say', icon: UserIcon },
  ] },
  { id: 'goal', section: 'Your Goal', type: 'select', question: "What's your main goal?", subtitle: "I'll shape your whole plan around this.", options: [
    { label: 'Build muscle',    icon: Dumbbell   },
    { label: 'Get stronger',    icon: TrendingUp },
    { label: 'Lose fat',        icon: Flame      },
    { label: 'General fitness', icon: Heart      },
  ] },
  { id: 'experience', section: 'Your Experience', type: 'select', question: 'How much lifting experience do you have?', subtitle: 'Sets where your plan starts.', options: [
    { label: 'Brand new',       icon: Sprout   },
    { label: 'Some experience', icon: Activity },
    { label: 'Experienced',     icon: Award    },
  ] },
  { id: 'struggle', section: 'Your Experience', type: 'select', question: "What's your biggest struggle?", subtitle: 'So I focus where it actually counts.', options: [
    { label: 'My form',            icon: Camera  },
    { label: 'Knowing what to do', icon: Compass },
    { label: 'Staying consistent', icon: Repeat  },
    { label: 'Gym anxiety',        icon: Shield  },
  ] },
  { id: 'location', section: 'Your Training', type: 'select', question: 'Where do you train?', subtitle: 'Decides what equipment I plan around.', options: [
    { label: 'Gym',                   icon: Dumbbell },
    { label: 'Home with equipment',   icon: HomeIcon },
    { label: 'Home, bodyweight only', icon: UserIcon },
  ] },
  { id: 'equipment', section: 'Your Training', type: 'multiselect', question: 'What do you have access to?', subtitle: "I'll only pick moves you can actually do.", options: [
    { label: 'Barbell',          icon: Dumbbell },
    { label: 'Dumbbells',        icon: Dumbbell },
    { label: 'Machines',         icon: Settings },
    { label: 'Resistance bands', icon: Zap      },
    { label: 'Bench',            icon: Activity },
  ], showIf: (a) => a.location !== 'Home, bodyweight only' },
  { id: 'days', section: 'Your Training', type: 'select', question: 'How many days a week can you train?', subtitle: 'Sets your weekly split.', options: [
    { label: '2 days',  icon: Calendar },
    { label: '3 days',  icon: Calendar },
    { label: '4 days',  icon: Calendar },
    { label: '5+ days', icon: Calendar },
  ] },
  { id: 'duration', section: 'Your Training', type: 'select', question: 'How long per session?', subtitle: "I'll size each workout to fit.", options: [
    { label: '15 min', icon: Clock },
    { label: '30 min', icon: Clock },
    { label: '45 min', icon: Clock },
    { label: '60 min', icon: Clock },
  ] },
  { id: 'notifications', section: 'Reminders', type: 'select', question: 'Want a reminder on training days?', subtitle: 'A quick nudge on the days you train.', options: [
    { label: 'Yes, remind me', icon: Bell    },
    { label: 'No thanks',      icon: BellOff },
  ] },
];

const LOADING_STEPS = [
  'Reading your answers',
  'Picking your exercises',
  'Setting your difficulty',
  'Laying out your week',
  'Finishing your plan',
];

function getVisibleSteps(a: Record<string, any>): Step[] {
  return STEPS.filter(s => !s.showIf || s.showIf(a));
}

interface WorkoutExercise { name: string; scheme: string; formCheck: boolean; }
function buildPlan(a: Record<string, any>): { focus: string; exercises: WorkoutExercise[] } {
  const bodyweight = a.location === 'Home, bodyweight only';
  const exercises: WorkoutExercise[] = bodyweight
    ? [
        { name: 'Bodyweight Squats', scheme: '3 × 12',      formCheck: true  },
        { name: 'Push-ups',          scheme: '3 × 10',      formCheck: false },
        { name: 'Reverse Lunges',    scheme: '3 × 10 each', formCheck: true  },
        { name: 'Plank',             scheme: '3 × 30 sec',  formCheck: false },
      ]
    : [
        { name: 'Goblet Squats',     scheme: '3 × 8',       formCheck: true  },
        { name: 'Dumbbell Press',    scheme: '3 × 10',      formCheck: false },
        { name: 'Romanian Deadlift', scheme: '3 × 10',      formCheck: false },
        { name: 'Walking Lunges',    scheme: '3 × 12 each', formCheck: true  },
      ];
  return { focus: 'Full Body', exercises };
}

function projectionLine(a: Record<string, any>): string {
  const goalWord: Record<string, string> = {
    'Build muscle':    'building real muscle',
    'Get stronger':    'getting noticeably stronger',
    'Lose fat':        'leaning out',
    'General fitness': 'feeling fitter',
  };
  const days = (a.days || '3 days').replace(' days', '');
  const word = goalWord[a.goal] || 'hitting your goal';
  return `Training ${days} days a week, you're on track to start seeing real progress toward ${word} in about 8 weeks.`;
}

// ---------------------------------------------------------------------------
// AnimatedOption
// ---------------------------------------------------------------------------
function AnimatedOption({ index, children, style, onPress }: { index: number; children: React.ReactNode; style: any; onPress: () => void; }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 320, delay: index * 70, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay: index * 70, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.7}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// ProjectionChart
// ---------------------------------------------------------------------------
const AnimatedSvgPath   = Animated.createAnimatedComponent(SvgPath);
const AnimatedSvgCircle = Animated.createAnimatedComponent(SvgCircle);

const CURVE_LEN          = 330;
const LINE_DRAW_DURATION = 1500;
const LINE_DRAW_DELAY    = 350;

function ProjectionChart() {
  const lineProgress = useRef(new Animated.Value(0)).current;
  const dotOpacity   = useRef(new Animated.Value(0)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(lineProgress, {
      toValue: 1, duration: LINE_DRAW_DURATION, delay: LINE_DRAW_DELAY, useNativeDriver: false,
    }).start(() => {
      Animated.timing(dotOpacity, { toValue: 1, duration: 250, useNativeDriver: false }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.55, duration: 850, useNativeDriver: false }),
          Animated.timing(pulseOpacity, { toValue: 0,    duration: 850, useNativeDriver: false }),
        ])
      ).start();
    });
  }, []);

  const strokeDashoffset = lineProgress.interpolate({ inputRange: [0, 1], outputRange: [CURVE_LEN, 0] });
  const fillOpacity      = lineProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] });

  return (
    <View style={{ marginVertical: 20 }}>
      <View style={{ flexDirection: 'row', gap: 20, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 18, height: 2.5, backgroundColor: C.textPrimary, borderRadius: 2 }} />
          <Text style={{ fontSize: 12, color: C.textSecondary }}>With FormPal</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 18, borderTopWidth: 1.5, borderColor: C.textMuted, borderStyle: 'dashed' }} />
          <Text style={{ fontSize: 12, color: C.textSecondary }}>Without</Text>
        </View>
      </View>
      <Svg width="100%" height={150} viewBox="0 0 300 145">
        <SvgPath d="M 25,105 L 280,105" stroke={C.surfaceBorder} strokeWidth={1} fill="none" />
        <AnimatedSvgPath
          d="M 25,100 C 90,100 205,18 280,18 L 280,105 L 25,105 Z"
          fill="white" opacity={fillOpacity} stroke="none"
        />
        <SvgPath
          d="M 25,100 L 280,100"
          stroke={C.textMuted} strokeWidth={1.5} strokeDasharray="6 4"
          fill="none" strokeLinecap="round"
        />
        <AnimatedSvgPath
          d="M 25,100 C 90,100 205,18 280,18"
          stroke={C.textPrimary} strokeWidth={3}
          strokeDasharray={`${CURVE_LEN} ${CURVE_LEN}`}
          strokeDashoffset={strokeDashoffset}
          fill="none" strokeLinecap="round"
        />
        <AnimatedSvgCircle cx="280" cy="18" r="10" fill="white" opacity={pulseOpacity} />
        <AnimatedSvgCircle cx="280" cy="18" r="4"  fill="white" opacity={dotOpacity}   />
        <SvgText x="25"  y="126" fill={C.textMuted} fontSize="11" textAnchor="middle">Week 1</SvgText>
        <SvgText x="280" y="126" fill={C.textMuted} fontSize="11" textAnchor="middle">Week 8</SvgText>
        <SvgText x="8" y="60" fill={C.textMuted} fontSize="11" textAnchor="middle" transform="rotate(-90 8 60)">
          Form score
        </SvgText>
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// BulletItem
// ---------------------------------------------------------------------------
const BULLET_ITEMS      = ['Personalized from day one', 'Real-time form feedback on every rep', 'Adapts as you improve'];
const BULLET_BASE_DELAY = LINE_DRAW_DELAY + LINE_DRAW_DURATION + 100;
const BULLET_STAGGER    = 300;

function BulletItem({ text, index }: { text: string; index: number }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    const delay = BULLET_BASE_DELAY + index * BULLET_STAGGER;
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }], flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Check size={12} color={C.bg} strokeWidth={3} />
      </View>
      <Text style={{ fontSize: 15, color: C.textPrimary, fontWeight: '500', flex: 1 }}>{text}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
type AppState = 'welcome' | 'onboarding' | 'building' | 'projection' | 'payoff';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [appState,  setAppState]  = useState<AppState>('welcome');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers,   setAnswers]   = useState<Record<string, any>>({});
  const [textInput, setTextInput] = useState('');
  const [plan,      setPlan]      = useState<{ focus: string; exercises: WorkoutExercise[] } | null>(null);
  const [loadStep,  setLoadStep]  = useState(0);
  const [loadPct,   setLoadPct]   = useState(0);

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const visibleSteps = getVisibleSteps(answers);
  const currentStep  = visibleSteps[stepIndex];
  const progress     = visibleSteps.length > 0 ? (stepIndex + 1) / visibleSteps.length : 0;

  useEffect(() => {
    if (appState !== 'building') return;
    setLoadStep(0); setLoadPct(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i < LOADING_STEPS.length) {
        setLoadStep(i);
        setLoadPct(Math.round((i / LOADING_STEPS.length) * 100));
      } else {
        clearInterval(id);
        setLoadPct(100);
        setTimeout(() => setAppState('projection'), 500);
      }
    }, 700);
    return () => clearInterval(id);
  }, [appState]);

  const animTrans = (dir: 'forward' | 'back', cb: () => void) => {
    const out = dir === 'forward' ? -36 : 36;
    const inn = dir === 'forward' ? 36 : -36;
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 130, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: out, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideAnim.setValue(inn);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    });
  };

  const advance = (ans: Record<string, any>) => {
    const vis = getVisibleSteps(ans);
    if (stepIndex < vis.length - 1) {
      const next = vis[stepIndex + 1];
      if (next.type === 'text') setTextInput((ans[next.id] as string) || '');
      animTrans('forward', () => setStepIndex(i => i + 1));
    } else {
      setPlan(buildPlan(ans));
      setAppState('building');
    }
  };

  const goBack = () => {
    if (stepIndex > 0) {
      const prev = visibleSteps[stepIndex - 1];
      if (prev.type === 'text') setTextInput((answers[prev.id] as string) || '');
      animTrans('back', () => setStepIndex(i => i - 1));
    } else {
      setAppState('welcome');
    }
  };

  const handleSelect = (opt: string) => {
    const st = currentStep;
    if (!st) return;
    haptic();
    if (st.type === 'multiselect') {
      const cur = (answers[st.id] as string[]) || [];
      setAnswers({ ...answers, [st.id]: cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt] });
    } else {
      const next = { ...answers, [st.id]: opt };
      setAnswers(next);
      setTimeout(() => advance(next), 300);
    }
  };

  const finishOnboarding = async () => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(tabs)');
  };

  // ── WELCOME ───────────────────────────────────────────────────────────────
  if (appState === 'welcome') {
    return (
      <View style={[s.c, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <View style={s.logoDot} />
          </View>
          <Text style={s.wordmarkBig}>FORMPAL</Text>
          <Text style={s.welcomeTitle}>Your AI form coach, plus a plan built for you.</Text>
          <Text style={s.welcomeSub}>Answer a few quick questions and I'll build your first workout — then I'll check every rep.</Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setStepIndex(0); setAppState('onboarding'); }}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnTxt}>Build my plan</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── ONBOARDING ────────────────────────────────────────────────────────────
  if (appState === 'onboarding' && currentStep) {
    const st          = currentStep;
    const SectionIcon = SECTION_ICONS[st.section] || UserIcon;

    const header = (
      <View style={s.qh}>
        <TouchableOpacity onPress={goBack} style={s.bb}><Text style={s.bt}>←</Text></TouchableOpacity>
        <View style={s.pc}><View style={s.pt}><View style={[s.pf, { width: (progress * 100) + '%' }]} /></View></View>
        <View style={{ width: 44 }} />
      </View>
    );

    const sectionHeader = (
      <>
        <View style={s.sectionRow}>
          <View style={s.sectionIconWrap}><SectionIcon size={14} color={C.textSecondary} /></View>
          <Text style={s.qs}>{st.section.toUpperCase()}</Text>
        </View>
        <Text style={s.qq}>{st.question}</Text>
        {st.subtitle ? <Text style={s.qsub}>{st.subtitle}</Text> : null}
      </>
    );

    if (st.type === 'wheel') {
      const isHeight   = st.wheelKind === 'height';
      const options    = isHeight ? HEIGHT_OPTIONS : AGE_OPTIONS;
      const defaultVal = isHeight ? `5'8"` : '16';
      const wheelVal   = (answers[st.id] as string) || defaultVal;
      return (
        <View style={[s.c, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {header}
          <View style={{ paddingHorizontal: 24, paddingTop: 12, flex: 1 }}>
            {sectionHeader}
            <View style={{ marginTop: 16 }}>
              <Picker
                selectedValue={wheelVal}
                onValueChange={(v) => setAnswers({ ...answers, [st.id]: v as string })}
                style={{ height: 230 }}
                itemStyle={{ color: C.textPrimary, fontSize: 28, fontWeight: '600' }}
              >
                {options.map(o => <Picker.Item key={o} label={o} value={o} />)}
              </Picker>
            </View>
          </View>
          <View style={s.bn}>
            <TouchableOpacity style={s.cb} onPress={() => advance({ ...answers, [st.id]: wheelVal })} activeOpacity={0.85}>
              <Text style={s.ct}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (st.type === 'text') {
      const val = textInput;
      return (
        <KeyboardAvoidingView style={s.c} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.c, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            {header}
            <View style={{ paddingHorizontal: 24, paddingTop: 12, flex: 1 }}>
              {sectionHeader}
              <View style={{ alignItems: 'center', marginTop: 48, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                <TextInput
                  value={val}
                  onChangeText={(v) => setTextInput(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={{ fontSize: 56, fontWeight: '700', color: val ? C.textPrimary : C.textMuted, textAlign: 'center', minWidth: 110, letterSpacing: -2 }}
                  placeholder="000"
                  placeholderTextColor={C.textMuted}
                  autoFocus
                />
                <Text style={{ fontSize: 22, fontWeight: '600', color: C.textMuted, paddingBottom: 10 }}>lbs</Text>
              </View>
            </View>
            <View style={s.bn}>
              <TouchableOpacity
                style={[s.cb, !val && s.cbDisabled]}
                disabled={!val}
                onPress={() => { const next = { ...answers, [st.id]: val }; setAnswers(next); setTextInput(''); advance(next); }}
                activeOpacity={0.85}
              >
                <Text style={[s.ct, !val && s.ctDisabled]}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      );
    }

    const isSel      = (o: string) => { const a = answers[st.id]; return Array.isArray(a) ? a.includes(o) : a === o; };
    const multiReady = st.type === 'multiselect' && Array.isArray(answers[st.id]) && (answers[st.id] as string[]).length > 0;

    return (
      <View style={[s.c, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {header}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
            {sectionHeader}
            {(st.options || []).map((o, i) => {
              const sel  = isSel(o.label);
              const Icon = o.icon || UserIcon;
              return (
                <AnimatedOption key={`${st.id}-${o.label}`} index={i} style={[s.opt, sel && s.optSel]} onPress={() => handleSelect(o.label)}>
                  <View style={[s.optIcon, sel && s.optIconSel]}>
                    <Icon size={18} color={C.textPrimary} />
                  </View>
                  <Text style={[s.optTxt, sel && s.optTxtSel]}>{o.label}</Text>
                  <View style={[s.radio, sel && s.radioSel]}>
                    {sel && <Check size={13} color={C.bg} strokeWidth={3} />}
                  </View>
                </AnimatedOption>
              );
            })}
          </Animated.View>
        </ScrollView>
        {st.type === 'multiselect' && (
          <View style={s.bn}>
            <TouchableOpacity style={[s.cb, !multiReady && s.cbDisabled]} disabled={!multiReady} onPress={() => advance(answers)} activeOpacity={0.85}>
              <Text style={[s.ct, !multiReady && s.ctDisabled]}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── BUILDING ──────────────────────────────────────────────────────────────
  if (appState === 'building') {
    return (
      <View style={[s.c, { paddingTop: insets.top + 40, paddingBottom: insets.bottom, paddingHorizontal: 28 }]}>
        <View style={{ marginBottom: 44 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.textMuted, letterSpacing: 1.2 }}>BUILDING PLAN</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.5 }}>{loadPct}%</Text>
          </View>
          <View style={{ width: '100%', height: 6, backgroundColor: C.surfaceBorder, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ height: 6, backgroundColor: C.primary, borderRadius: 3, width: (loadPct + '%') as any }} />
          </View>
        </View>
        <Text style={{ fontSize: 28, fontWeight: '700', color: C.textPrimary, marginBottom: 8, letterSpacing: -0.8 }}>Building your plan</Text>
        <Text style={{ fontSize: 15, color: C.textSecondary, marginBottom: 36, lineHeight: 22 }}>Putting together a workout around your goal and setup.</Text>
        <View>
          {LOADING_STEPS.map((step, i) => {
            const done    = i < loadStep;
            const current = i === loadStep;
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, opacity: i > loadStep ? 0.35 : 1 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: done ? C.primary : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: current ? C.primary : C.surfaceBorder, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                  {done    && <Text style={{ color: C.bg, fontSize: 13, fontWeight: '700' }}>✓</Text>}
                  {current && <ActivityIndicator size="small" color={C.primary} />}
                </View>
                <Text style={{ fontSize: 16, fontWeight: current ? '600' : '500', color: done || current ? C.textPrimary : C.textMuted }}>{step}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  // ── PROJECTION ────────────────────────────────────────────────────────────
  if (appState === 'projection') {
    const daysNum = (answers.days || '3 days').replace(' days', '');
    return (
      <View style={[s.c, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={s.sectionRow}>
            <View style={s.sectionIconWrap}><TrendingUp size={14} color={C.textSecondary} /></View>
            <Text style={s.qs}>YOUR 8-WEEK PROJECTION</Text>
          </View>
          <Text style={s.qq}>Here's what training {daysNum} days a week looks like.</Text>
          <ProjectionChart />
          {BULLET_ITEMS.map((item, i) => <BulletItem key={item} text={item} index={i} />)}
        </ScrollView>
        <View style={s.bn}>
          <TouchableOpacity style={s.cb} onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setAppState('payoff'); }} activeOpacity={0.85}>
            <Text style={s.ct}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── PAYOFF ────────────────────────────────────────────────────────────────
  if (appState === 'payoff') {
    return (
      <View style={[s.c, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <View style={s.sectionRow}>
            <View style={s.sectionIconWrap}><Check size={14} color={C.textSecondary} /></View>
            <Text style={s.qs}>YOUR PLAN IS READY</Text>
          </View>
          <Text style={s.qq}>Here's your starting point.</Text>
          <Text style={s.qsub}>{projectionLine(answers)}</Text>
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>FIRST WORKOUT</Text>
            <Text style={s.heroFocus}>{plan?.focus}</Text>
            {plan?.exercises.map((ex, i) => (
              <View key={i} style={s.exRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.exName}>{ex.name}</Text>
                  <Text style={s.exScheme}>{ex.scheme}</Text>
                </View>
                {ex.formCheck && (
                  <View style={s.fcTag}><Camera size={11} color={C.textSecondary} /><Text style={s.fcTxt}>form-check</Text></View>
                )}
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 14, color: C.textSecondary, textAlign: 'center', marginVertical: 20, lineHeight: 20 }}>
            And on the exercises with a form-check tag, I'll watch every rep.
          </Text>
        </ScrollView>
        <View style={s.bn}>
          <TouchableOpacity style={s.cb} onPress={finishOnboarding} activeOpacity={0.85}>
            <Text style={s.ct}>Start training</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: C.bg },

  qh: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  bb: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bt: { fontSize: 22, color: C.textSecondary },
  pc: { flex: 1, paddingHorizontal: 12 },
  pt: { height: 4, backgroundColor: C.surfaceBorder, borderRadius: 2, overflow: 'hidden' },
  pf: { height: 4, backgroundColor: C.primary, borderRadius: 2 },

  sectionRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIconWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.iconBg, borderWidth: 1, borderColor: C.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  qs:   { fontSize: 11, fontWeight: '700', color: C.textSecondary, letterSpacing: 1.5 },
  qq:   { fontSize: 26, fontWeight: '700', color: C.textPrimary, lineHeight: 32, marginBottom: 8, letterSpacing: -0.8 },
  qsub: { fontSize: 14, color: C.textMuted, lineHeight: 20, marginBottom: 24, letterSpacing: -0.1 },

  opt:        { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.surfaceBorder, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 11 },
  optSel:     { borderColor: C.primary, backgroundColor: C.primarySoft },
  optIcon:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.iconBg, alignItems: 'center', justifyContent: 'center' },
  optIconSel: { backgroundColor: 'rgba(255,255,255,0.12)' },
  optTxt:     { flex: 1, fontSize: 16, fontWeight: '600', color: C.textPrimary, letterSpacing: -0.2 },
  optTxtSel:  { color: C.textPrimary },
  radio:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  radioSel:   { backgroundColor: C.primary, borderColor: C.primary },

  bn:         { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.surfaceBorder },
  cb:         { backgroundColor: C.primary, borderRadius: 100, paddingVertical: 18, alignItems: 'center' },
  cbDisabled: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.surfaceBorder },
  ct:         { fontSize: 16, fontWeight: '700', color: C.bg, letterSpacing: 0.2 },
  ctDisabled: { color: C.textMuted },

  logoDot:      { width: 14, height: 14, borderRadius: 7, backgroundColor: C.primary, marginBottom: 20 },
  wordmarkBig:  { fontSize: 15, fontWeight: '700', color: C.textPrimary, textAlign: 'center', letterSpacing: 2, marginBottom: 28 },
  welcomeTitle: { fontSize: 30, fontWeight: '700', color: C.textPrimary, textAlign: 'center', lineHeight: 38, letterSpacing: -1, marginBottom: 14 },
  welcomeSub:   { fontSize: 15, color: C.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 40, paddingHorizontal: 8 },
  primaryBtn:    { backgroundColor: C.primary, borderRadius: 100, paddingVertical: 18, alignItems: 'center' },
  primaryBtnTxt: { fontSize: 16, fontWeight: '700', color: C.bg, letterSpacing: 0.2 },

  heroCard:  { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.surfaceBorder, padding: 20, marginBottom: 16 },
  heroLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 1.5, marginBottom: 6 },
  heroFocus: { fontSize: 24, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.6, marginBottom: 16 },
  exRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.surfaceBorder },
  exName:    { fontSize: 15, fontWeight: '600', color: C.textPrimary, letterSpacing: -0.2 },
  exScheme:  { fontSize: 13, color: C.textMuted, marginTop: 2 },
  fcTag:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.iconBg, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 100 },
  fcTxt:     { fontSize: 11, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.2 },
});
