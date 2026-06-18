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

// ---------------------------------------------------------------------------
// FormPal palette — grey/monochrome accent, kept local.
// ---------------------------------------------------------------------------
const C = {
  bg: '#0A0B0C',
  surface: '#15161A',
  surfaceBorder: 'rgba(255,255,255,0.08)',
  iconBg: 'rgba(255,255,255,0.06)',
  textPrimary: '#F0F0F2',
  textSecondary: '#9A9AA2',
  textMuted: '#62626A',
  primary: '#D6D7DC',                       // light cool grey accent
  primarySoft: 'rgba(214,215,220,0.14)',
};

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(style);
};

const AGE_OPTIONS = Array.from({ length: 73 }, (_, i) => String(i + 13)); // 13–85

// ---------------------------------------------------------------------------
// Onboarding definition
// ---------------------------------------------------------------------------
interface OptionDef { label: string; subtitle?: string; icon?: any; }
interface Step {
  id: string;
  section: string;
  type: 'select' | 'multiselect' | 'wheel' | 'text';
  question: string;
  subtitle?: string; // the "why we ask" line
  options?: OptionDef[];
  placeholder?: string;
  wheelKind?: 'age';
  showIf?: (a: Record<string, any>) => boolean;
}

const SECTION_ICONS: Record<string, any> = {
  'Your Goal': Target,
  'Your Experience': TrendingUp,
  'Your Training': Dumbbell,
  'About You': UserIcon,
  'Reminders': Calendar,
};

const STEPS: Step[] = [
  { id: 'goal', section: 'Your Goal', type: 'select', question: "What's your main goal?", subtitle: "I'll shape your whole plan around this.", options: [
    { label: 'Build muscle', icon: Dumbbell },
    { label: 'Get stronger', icon: TrendingUp },
    { label: 'Lose fat', icon: Flame },
    { label: 'General fitness', icon: Heart },
  ] },
  { id: 'experience', section: 'Your Experience', type: 'select', question: 'How much lifting experience do you have?', subtitle: 'Sets where your plan starts.', options: [
    { label: 'Brand new', icon: Sprout },
    { label: 'Some experience', icon: Activity },
    { label: 'Experienced', icon: Award },
  ] },
  { id: 'struggle', section: 'Your Experience', type: 'select', question: "What's your biggest struggle?", subtitle: 'So I focus where it actually counts.', options: [
    { label: 'My form', icon: Camera },
    { label: 'Knowing what to do', icon: Compass },
    { label: 'Staying consistent', icon: Repeat },
    { label: 'Gym anxiety', icon: Shield },
  ] },
  { id: 'location', section: 'Your Training', type: 'select', question: 'Where do you train?', subtitle: 'Decides what equipment I plan around.', options: [
    { label: 'Gym', icon: Dumbbell },
    { label: 'Home with equipment', icon: HomeIcon },
    { label: 'Home, bodyweight only', icon: UserIcon },
  ] },
  { id: 'equipment', section: 'Your Training', type: 'multiselect', question: 'What do you have access to?', subtitle: "I'll only pick moves you can actually do.", options: [
    { label: 'Barbell', icon: Dumbbell },
    { label: 'Dumbbells', icon: Dumbbell },
    { label: 'Machines', icon: Settings },
    { label: 'Resistance bands', icon: Zap },
    { label: 'Bench', icon: Activity },
  ], showIf: (a) => a.location !== 'Home, bodyweight only' },
  { id: 'days', section: 'Your Training', type: 'select', question: 'How many days a week can you train?', subtitle: 'Sets your weekly split.', options: [
    { label: '2 days', icon: Calendar },
    { label: '3 days', icon: Calendar },
    { label: '4 days', icon: Calendar },
    { label: '5+ days', icon: Calendar },
  ] },
  { id: 'duration', section: 'Your Training', type: 'select', question: 'How long per session?', subtitle: "I'll size each workout to fit.", options: [
    { label: '15 min', icon: Clock },
    { label: '30 min', icon: Clock },
    { label: '45 min', icon: Clock },
    { label: '60 min', icon: Clock },
  ] },
  { id: 'sex', section: 'About You', type: 'select', question: "What's your sex?", subtitle: 'Helps me set the right starting weights.', options: [
    { label: 'Male', icon: UserIcon },
    { label: 'Female', icon: UserIcon },
    { label: 'Prefer not to say', icon: UserIcon },
  ] },
  { id: 'age', section: 'About You', type: 'wheel', wheelKind: 'age', question: 'How old are you?', subtitle: 'Helps me dial in the right pace.' },
  { id: 'weight', section: 'About You', type: 'text', question: 'What do you weigh?', subtitle: 'So weight suggestions actually fit you.', placeholder: '0' },
  { id: 'notifications', section: 'Reminders', type: 'select', question: 'Want a reminder on training days?', subtitle: 'A quick nudge on the days you train.', options: [
    { label: 'Yes, remind me', icon: Bell },
    { label: 'No thanks', icon: BellOff },
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

interface Exercise { name: string; scheme: string; formCheck: boolean; }
function buildPlan(a: Record<string, any>): { focus: string; exercises: Exercise[] } {
  const bodyweight = a.location === 'Home, bodyweight only';
  const exercises: Exercise[] = bodyweight
    ? [
        { name: 'Bodyweight Squats', scheme: '3 × 12', formCheck: true },
        { name: 'Push-ups', scheme: '3 × 10', formCheck: false },
        { name: 'Reverse Lunges', scheme: '3 × 10 each', formCheck: true },
        { name: 'Plank', scheme: '3 × 30 sec', formCheck: false },
      ]
    : [
        { name: 'Goblet Squats', scheme: '3 × 8', formCheck: true },
        { name: 'Dumbbell Press', scheme: '3 × 10', formCheck: false },
        { name: 'Romanian Deadlift', scheme: '3 × 10', formCheck: false },
        { name: 'Walking Lunges', scheme: '3 × 12 each', formCheck: true },
      ];
  return { focus: 'Full Body', exercises };
}

function projectionLine(a: Record<string, any>): string {
  const goalWord: Record<string, string> = {
    'Build muscle': 'building real muscle',
    'Get stronger': 'getting noticeably stronger',
    'Lose fat': 'leaning out',
    'General fitness': 'feeling fitter',
  };
  const days = (a.days || '3 days').replace(' days', '');
  const word = goalWord[a.goal] || 'hitting your goal';
  return `Training ${days} days a week, you're on track to start seeing real progress toward ${word} in about 8 weeks.`;
}

// ---------------------------------------------------------------------------
// Animated option (fade + rise on mount, staggered)
// ---------------------------------------------------------------------------
function AnimatedOption({ index, children, style, onPress }: { index: number; children: React.ReactNode; style: any; onPress: () => void; }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: index * 70, useNativeDriver: true }),
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
// Screen
// ---------------------------------------------------------------------------
type AppState = 'welcome' | 'onboarding' | 'building' | 'payoff' | 'home';

export default function TodayScreen() {
  const insets = useSafeAreaInsets();

  const [appState, setAppState] = useState<AppState>('welcome');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [textInput, setTextInput] = useState('');
  const [plan, setPlan] = useState<{ focus: string; exercises: Exercise[] } | null>(null);

  const [loadStep, setLoadStep] = useState(0);
  const [loadPct, setLoadPct] = useState(0);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // day-1 placeholders (wire to real data later)
  const streak = 0;
  const sessions = 0;
  const goodForm = '—';

  const visibleSteps = getVisibleSteps(answers);
  const currentStep = visibleSteps[stepIndex];
  const progress = visibleSteps.length > 0 ? (stepIndex + 1) / visibleSteps.length : 0;

  // building → payoff
  useEffect(() => {
    if (appState !== 'building') return;
    setLoadStep(0);
    setLoadPct(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i < LOADING_STEPS.length) {
        setLoadStep(i);
        setLoadPct(Math.round((i / LOADING_STEPS.length) * 100));
      } else {
        clearInterval(id);
        setLoadPct(100);
        setTimeout(() => setAppState('payoff'), 500);
      }
    }, 700);
    return () => clearInterval(id);
  }, [appState]);

  const animTrans = (dir: 'forward' | 'back', cb: () => void) => {
    const out = dir === 'forward' ? -36 : 36;
    const inn = dir === 'forward' ? 36 : -36;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 130, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: out, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideAnim.setValue(inn);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
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

  const startWorkout = () => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Coming next', 'The live camera workout screen is what we build next.');
  };

  // ---- WELCOME ----
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

  // ---- ONBOARDING ----
  if (appState === 'onboarding' && currentStep) {
    const st = currentStep;
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

    // WHEEL (age)
    if (st.type === 'wheel') {
      const ageVal = (answers[st.id] as string) || '16';
      return (
        <View style={[s.c, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {header}
          <View style={{ paddingHorizontal: 24, paddingTop: 12, flex: 1 }}>
            {sectionHeader}
            <View style={{ marginTop: 16 }}>
              <Picker
                selectedValue={ageVal}
                onValueChange={(v) => setAnswers({ ...answers, [st.id]: v as string })}
                style={{ height: 230 }}
                itemStyle={{ color: C.textPrimary, fontSize: 28, fontWeight: '600' }}
              >
                {AGE_OPTIONS.map(o => <Picker.Item key={o} label={o} value={o} />)}
              </Picker>
            </View>
          </View>
          <View style={s.bn}>
            <TouchableOpacity style={s.cb} onPress={() => advance({ ...answers, [st.id]: ageVal })} activeOpacity={0.85}>
              <Text style={s.ct}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // TEXT (weight)
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

    // SELECT / MULTISELECT
    const isSel = (o: string) => {
      const a = answers[st.id];
      return Array.isArray(a) ? a.includes(o) : a === o;
    };
    const multiReady = st.type === 'multiselect' && Array.isArray(answers[st.id]) && (answers[st.id] as string[]).length > 0;

    return (
      <View style={[s.c, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {header}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
            {sectionHeader}
            {(st.options || []).map((o, i) => {
              const sel = isSel(o.label);
              const Icon = o.icon || UserIcon;
              return (
                <AnimatedOption
                  key={`${st.id}-${o.label}`}
                  index={i}
                  style={[s.opt, sel && s.optSel]}
                  onPress={() => handleSelect(o.label)}
                >
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

  // ---- BUILDING ----
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
            const done = i < loadStep;
            const current = i === loadStep;
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, opacity: i > loadStep ? 0.35 : 1 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: done ? C.primary : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: current ? C.primary : C.surfaceBorder, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                  {done && <Text style={{ color: C.bg, fontSize: 13, fontWeight: '700' }}>✓</Text>}
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

  // ---- PAYOFF ----
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
          <TouchableOpacity style={s.cb} onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setAppState('home'); }} activeOpacity={0.85}>
            <Text style={s.ct}>Start training</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---- HOME ----
  return (
    <View style={s.c}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {/* top bar */}
        <View style={s.homeTop}>
          <Text style={s.wordmark}>FormPal</Text>
          <View style={s.streakPill}>
            <Flame size={14} color={C.primary} />
            <Text style={s.streakTxt}>{streak}</Text>
          </View>
        </View>

        {/* coach greeting */}
        <Text style={s.greeting}>
          {streak > 0 ? 'Welcome back. Ready when you are.' : "Welcome. Let's get your first session in."}
        </Text>

        {/* today's workout — hero */}
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>TODAY'S WORKOUT</Text>
          <Text style={s.heroFocus}>{plan?.focus || 'Full Body'}</Text>
          {(plan?.exercises || buildPlan(answers).exercises).map((ex, i) => (
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
          <TouchableOpacity style={s.startBtn} onPress={startWorkout} activeOpacity={0.88}>
            <Play size={18} color={C.bg} fill={C.bg} />
            <Text style={s.startTxt}>Start workout</Text>
          </TouchableOpacity>
        </View>

        {/* this week */}
        <View style={s.weekStrip}>
          <View style={s.weekItem}>
            <Text style={s.weekNum}>{streak}</Text>
            <Text style={s.weekLbl}>day streak</Text>
          </View>
          <View style={s.weekDivider} />
          <View style={s.weekItem}>
            <Text style={s.weekNum}>{sessions}</Text>
            <Text style={s.weekLbl}>sessions</Text>
          </View>
          <View style={s.weekDivider} />
          <View style={s.weekItem}>
            <Text style={[s.weekNum, { color: C.primary }]}>{goodForm}</Text>
            <Text style={s.weekLbl}>good form</Text>
          </View>
        </View>

        {/* recent */}
        <Text style={s.sectionHdr}>Recent sessions</Text>
        <View style={s.emptyCard}>
          <Text style={s.emptyTxt}>No sessions yet — your first one will show up here.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: C.bg },

  // onboarding header / progress
  qh: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  bb: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bt: { fontSize: 22, color: C.textSecondary },
  pc: { flex: 1, paddingHorizontal: 12 },
  pt: { height: 4, backgroundColor: C.surfaceBorder, borderRadius: 2, overflow: 'hidden' },
  pf: { height: 4, backgroundColor: C.primary, borderRadius: 2 },

  // section + question
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIconWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.iconBg, borderWidth: 1, borderColor: C.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  qs: { fontSize: 11, fontWeight: '700', color: C.textSecondary, letterSpacing: 1.5 },
  qq: { fontSize: 26, fontWeight: '700', color: C.textPrimary, lineHeight: 32, marginBottom: 8, letterSpacing: -0.8 },
  qsub: { fontSize: 14, color: C.textMuted, lineHeight: 20, marginBottom: 24, letterSpacing: -0.1 },

  // options (icon + label + radio)
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.surfaceBorder, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 11 },
  optSel: { borderColor: C.primary, backgroundColor: C.primarySoft },
  optIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.iconBg, alignItems: 'center', justifyContent: 'center' },
  optIconSel: { backgroundColor: 'rgba(255,255,255,0.12)' },
  optTxt: { flex: 1, fontSize: 16, fontWeight: '600', color: C.textPrimary, letterSpacing: -0.2 },
  optTxtSel: { color: C.textPrimary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  radioSel: { backgroundColor: C.primary, borderColor: C.primary },

  // bottom continue
  bn: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.surfaceBorder },
  cb: { backgroundColor: C.primary, borderRadius: 100, paddingVertical: 18, alignItems: 'center' },
  cbDisabled: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.surfaceBorder },
  ct: { fontSize: 16, fontWeight: '700', color: C.bg, letterSpacing: 0.2 },
  ctDisabled: { color: C.textMuted },

  // welcome
  logoDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.primary, marginBottom: 20 },
  wordmarkBig: { fontSize: 15, fontWeight: '700', color: C.textPrimary, textAlign: 'center', letterSpacing: 2, marginBottom: 28 },
  welcomeTitle: { fontSize: 30, fontWeight: '700', color: C.textPrimary, textAlign: 'center', lineHeight: 38, letterSpacing: -1, marginBottom: 14 },
  welcomeSub: { fontSize: 15, color: C.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 40, paddingHorizontal: 8 },
  primaryBtn: { backgroundColor: C.primary, borderRadius: 100, paddingVertical: 18, alignItems: 'center' },
  primaryBtnTxt: { fontSize: 16, fontWeight: '700', color: C.bg, letterSpacing: 0.2 },

  // home top
  homeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  wordmark: { fontSize: 20, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.5 },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.surfaceBorder, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100 },
  streakTxt: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  greeting: { fontSize: 16, color: C.textSecondary, marginBottom: 18, lineHeight: 22 },

  // hero workout card
  heroCard: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.surfaceBorder, padding: 20, marginBottom: 16 },
  heroLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 1.5, marginBottom: 6 },
  heroFocus: { fontSize: 24, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.6, marginBottom: 16 },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.surfaceBorder },
  exName: { fontSize: 15, fontWeight: '600', color: C.textPrimary, letterSpacing: -0.2 },
  exScheme: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  fcTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.iconBg, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 100 },
  fcTxt: { fontSize: 11, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.2 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 100, paddingVertical: 16, marginTop: 18 },
  startTxt: { fontSize: 16, fontWeight: '700', color: C.bg, letterSpacing: 0.2 },

  // this week strip
  weekStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.surfaceBorder, paddingVertical: 18, marginBottom: 24 },
  weekItem: { flex: 1, alignItems: 'center' },
  weekDivider: { width: 1, height: 32, backgroundColor: C.surfaceBorder },
  weekNum: { fontSize: 22, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.5 },
  weekLbl: { fontSize: 12, color: C.textMuted, marginTop: 4 },

  // recent
  sectionHdr: { fontSize: 13, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.5, marginBottom: 12 },
  emptyCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.surfaceBorder, padding: 20, alignItems: 'center' },
  emptyTxt: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
});
