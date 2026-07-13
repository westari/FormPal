import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView,
  Animated, TextInput, KeyboardAvoidingView, ActivityIndicator, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import Svg, { Path as SvgPath, Text as SvgText, Circle as SvgCircle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenBackground from '../components/ScreenBackground';
import { FONT, W, Col, Elev } from '../constants/theme';

export const ONBOARDING_KEY = 'formpal_onboarding_complete';

// ── Light theme palette ────────────────────────────────────────────────────────

const L = {
  bg:         Col.bg,
  card:       Col.card,
  border:     'rgba(17,24,39,0.06)',
  text:       Col.text,
  textSub:    Col.textSub,
  textDim:    Col.textDim,
  accent:     '#0A84FF',
  accentSoft: 'rgba(10,132,255,0.08)',
  btnDark:    '#0B1020',
  navBar:     'rgba(251,251,253,0.94)',
  iconBg:     '#F4F5F8',
};

// Split slider — warm amber for home, green for gym (no blue/purple)
const HOME_CLR = '#FF9F0A';
const GYM_CLR  = '#30D158';
const THUMB_SZ  = 30;
const TRACK_H   = 52;

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(style);
};

const AGE_OPTIONS = Array.from({ length: 73 }, (_, i) => String(i + 13));
const HEIGHT_OPTIONS: string[] = [];
for (let ft = 4; ft <= 6; ft++) {
  for (let inch = (ft === 4 ? 8 : 0); inch <= (ft === 6 ? 10 : 11); inch++) {
    HEIGHT_OPTIONS.push(`${ft}'${inch}"`);
  }
}

function Sym({ name, size, color }: { name: string; size: number; color: string }) {
  return <SymbolView name={name as any} size={size} tintColor={color} type="monochrome" style={{ width: size, height: size }} />;
}

// ── Step definitions ───────────────────────────────────────────────────────────

interface OptionDef { label: string; sfSymbol?: string; sublabel?: string; }
interface Step {
  id:             string;
  section:        string;
  type:           'select' | 'multiselect' | 'wheel' | 'text' | 'slider';
  question:       string;
  subtitle?:      string;
  options?:       OptionDef[];
  wheelKind?:     'age' | 'height';
  showIf?:        (a: Record<string, any>) => boolean;
  clearAllOption?: string;
}

const STEPS: Step[] = [
  // ── About You
  { id: 'age',    section: 'About You', type: 'wheel',  wheelKind: 'age',    question: 'How old are you?' },
  { id: 'height', section: 'About You', type: 'wheel',  wheelKind: 'height', question: 'How tall are you?' },
  { id: 'weight', section: 'About You', type: 'text',   question: 'What do you weigh?' },
  { id: 'sex', section: 'About You', type: 'select', question: "What's your sex?", options: [
    { label: 'Male',   sfSymbol: 'person.fill' },
    { label: 'Female', sfSymbol: 'person.fill' },
  ]},

  // ── Your Goal (short, distinct options)
  { id: 'goal', section: 'Your Goal', type: 'multiselect', question: 'What are your goals?', options: [
    { label: 'Build muscle',    sfSymbol: 'dumbbell.fill' },
    { label: 'Lose weight',     sfSymbol: 'flame.fill'    },
    { label: 'Get stronger',    sfSymbol: 'bolt.fill'     },
    { label: 'Improve form',    sfSymbol: 'camera.fill'   },
    { label: 'Stay consistent', sfSymbol: 'repeat'        },
  ]},
  { id: 'motivation', section: 'Your Goal', type: 'multiselect', question: 'What draws you to fitness?', options: [
    { label: 'Feel healthier',       sfSymbol: 'heart.fill'  },
    { label: 'Look & feel confident', sfSymbol: 'star.fill'  },
    { label: 'Get strong',           sfSymbol: 'bolt.fill'   },
    { label: 'Reduce stress',        sfSymbol: 'leaf.fill'   },
    { label: 'Build a habit',        sfSymbol: 'repeat'      },
    { label: 'Sports & performance', sfSymbol: 'figure.run'  },
  ]},

  // ── Your Experience (short main label + tiny sublabel)
  { id: 'experience', section: 'Your Experience', type: 'select', question: 'Your experience level?', options: [
    { label: 'Beginner',        sublabel: 'Never really worked out',   sfSymbol: '1.circle.fill' },
    { label: 'Some experience', sublabel: 'Tried it, not consistent',  sfSymbol: '2.circle.fill' },
    { label: 'Intermediate',    sublabel: 'Train semi-regularly',      sfSymbol: '3.circle.fill' },
    { label: 'Advanced',        sublabel: 'Train consistently',        sfSymbol: '4.circle.fill' },
  ]},
  {
    id: 'injuries', section: 'Your Experience', type: 'multiselect',
    question: 'Anything to train around?',
    subtitle: "We'll keep your plan safe and avoid aggravating these.",
    clearAllOption: "None — I'm good",
    options: [
      { label: 'Knees',            sfSymbol: 'figure.walk'                          },
      { label: 'Shoulders',        sfSymbol: 'figure.strengthtraining.traditional'  },
      { label: 'Lower back',       sfSymbol: 'figure.cooldown'                      },
      { label: 'Wrists',           sfSymbol: 'hand.raised.fill'                     },
      { label: 'Neck',             sfSymbol: 'person.fill'                          },
      { label: 'Hips',             sfSymbol: 'figure.run'                           },
      { label: "None — I'm good",  sfSymbol: 'checkmark.circle.fill'               },
    ],
  },
  // TODO: plan generator should avoid/modify exercises based on injuries[]
  { id: 'struggle', section: 'Your Experience', type: 'multiselect',
    question: 'Anything getting in your way?',
    clearAllOption: 'Nothing — just ready to start',
    options: [
      { label: 'Not sure what to do',          sfSymbol: 'questionmark.circle.fill' },
      { label: 'Staying consistent',           sfSymbol: 'repeat'                   },
      { label: 'Gym anxiety',                  sfSymbol: 'shield.fill'              },
      { label: 'Not seeing results',           sfSymbol: 'minus.circle.fill'        },
      { label: 'Finding time',                 sfSymbol: 'clock.fill'               },
      { label: 'Nothing — just ready to start', sfSymbol: 'checkmark.circle.fill'  },
    ],
  },

  // ── Your Training
  { id: 'trainingLocation', section: 'Your Training', type: 'select', question: 'Where do you train?', options: [
    { label: 'Home',       sfSymbol: 'house.fill'                          },
    { label: 'Gym',        sfSymbol: 'figure.strengthtraining.traditional' },
    { label: 'Mix of both', sfSymbol: 'shuffle'                            },
  ]},
  {
    id: 'homeSplit', section: 'Your Training', type: 'slider',
    question: 'How do you split your training?',
    showIf: (a) => a.trainingLocation === 'Mix of both',
  },
  {
    id: 'homeEquipment', section: 'Your Training', type: 'multiselect',
    question: 'Equipment you have at home?',
    showIf: (a) => a.trainingLocation === 'Home' || a.trainingLocation === 'Mix of both',
    clearAllOption: 'Nothing — bodyweight only',
    options: [
      { label: 'Dumbbells',              sfSymbol: 'dumbbell.fill'     },
      { label: 'Resistance bands',       sfSymbol: 'bolt.fill'         },
      { label: 'Kettlebells',            sfSymbol: 'dumbbell.fill'     },
      { label: 'Pull-up bar',            sfSymbol: 'figure.gymnastics' },
      { label: 'Bench',                  sfSymbol: 'rectangle.fill'    },
      { label: 'Barbell & plates',       sfSymbol: 'dumbbell.fill'     },
      { label: 'Nothing — bodyweight only', sfSymbol: 'hand.raised.fill' },
    ],
  },
  {
    id: 'gymMissingEquipment', section: 'Your Training', type: 'multiselect',
    question: "Anything your gym is missing?",
    showIf: (a) => a.trainingLocation === 'Gym' || a.trainingLocation === 'Mix of both',
    clearAllOption: 'It has everything',
    options: [
      { label: 'Free weights',       sfSymbol: 'dumbbell.fill'                      },
      { label: 'Cable machines',     sfSymbol: 'figure.strengthtraining.functional' },
      { label: 'Leg machines',       sfSymbol: 'figure.run'                         },
      { label: 'Chest / press machines', sfSymbol: 'figure.strengthtraining.traditional' },
      { label: 'Back / row machines', sfSymbol: 'figure.gymnastics'                },
      { label: 'Squat rack',         sfSymbol: 'dumbbell.fill'                      },
      { label: 'It has everything',  sfSymbol: 'checkmark.circle.fill'              },
    ],
  },
  // TODO: pass trainingLocation, homeSplit, homeEquipment[], gymMissingEquipment[] to planGenerator
  { id: 'days', section: 'Your Training', type: 'select', question: 'How many days a week?', options: [
    { label: '1 day',  sfSymbol: '1.circle.fill' },
    { label: '2 days', sfSymbol: '2.circle.fill' },
    { label: '3 days', sfSymbol: '3.circle.fill' },
    { label: '4 days', sfSymbol: '4.circle.fill' },
    { label: '5 days', sfSymbol: '5.circle.fill' },
    { label: '6 days', sfSymbol: '6.circle.fill' },
    { label: '7 days', sfSymbol: '7.circle.fill' },
  ]},
  { id: 'duration', section: 'Your Training', type: 'select', question: 'How long per session?', options: [
    { label: '15-20 min', sfSymbol: 'clock.fill' },
    { label: '30 min',    sfSymbol: 'clock.fill' },
    { label: '45 min',    sfSymbol: 'clock.fill' },
    { label: '60 min',    sfSymbol: 'clock.fill' },
    { label: '75+ min',   sfSymbol: 'clock.fill' },
  ]},

  // ── Reminders
  { id: 'notifications', section: 'Reminders', type: 'select', question: 'Reminders on training days?', options: [
    { label: 'Yes please', sfSymbol: 'bell.fill'       },
    { label: 'No thanks',  sfSymbol: 'bell.slash.fill' },
  ]},
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

// ── Plan helpers ──────────────────────────────────────────────────────────────

interface WorkoutExercise { name: string; scheme: string; formCheck: boolean; }

function buildPlan(a: Record<string, any>): { focus: string; exercises: WorkoutExercise[] } {
  const loc       = a.trainingLocation ?? 'Home';
  const homeEquip = (a.homeEquipment as string[]) ?? [];
  const noEquip   = loc === 'Home' && (homeEquip.includes('Nothing — bodyweight only') || homeEquip.length === 0);
  const exercises: WorkoutExercise[] = noEquip
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
  const goals   = (a.goal as string[]) ?? [];
  const primary = goals[0] ?? '';
  const goalWord: Record<string, string> = {
    'Build muscle':    'building muscle',
    'Lose weight':     'losing weight',
    'Get stronger':    'getting noticeably stronger',
    'Improve form':    'mastering your form',
    'Stay consistent': 'building a lasting habit',
  };
  const word    = goalWord[primary] ?? 'hitting your goal';
  const daysNum = parseInt((a.days as string) ?? '3') || 3;
  return `Training ${daysNum} day${daysNum !== 1 ? 's' : ''} a week, you're on track to start seeing real progress toward ${word} in about 8 weeks.`;
}

function motivationLine(a: Record<string, any>): string {
  const m = (a.motivation as string[]) ?? [];
  if (m.includes('Reduce stress'))
    return 'Every session is a step toward feeling better.';
  if (m.includes('Look & feel confident'))
    return "Stay consistent and you'll feel it in how you carry yourself.";
  if (m.includes('Get strong') || m.includes('Sports & performance'))
    return 'Strength is built one rep at a time. Your plan starts here.';
  return 'Track every rep. Build the habit. See the change.';
}

// ── AnimatedOption ─────────────────────────────────────────────────────────────

function AnimatedOption({ index, children, style, onPress }: {
  index: number; children: React.ReactNode; style: any; onPress: () => void;
}) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 280, delay: index * 55, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.7}>{children}</TouchableOpacity>
    </Animated.View>
  );
}

// ── ProjectionChart ───────────────────────────────────────────────────────────

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
    Animated.timing(lineProgress, { toValue: 1, duration: LINE_DRAW_DURATION, delay: LINE_DRAW_DELAY, useNativeDriver: false })
      .start(() => {
        Animated.timing(dotOpacity, { toValue: 1, duration: 250, useNativeDriver: false }).start();
        Animated.loop(Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.4, duration: 900, useNativeDriver: false }),
          Animated.timing(pulseOpacity, { toValue: 0,   duration: 900, useNativeDriver: false }),
        ])).start();
      });
  }, []);

  const strokeDashoffset = lineProgress.interpolate({ inputRange: [0, 1], outputRange: [CURVE_LEN, 0] });
  const fillOpacity      = lineProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={{ marginVertical: 20 }}>
      <View style={{ flexDirection: 'row', gap: 20, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 18, height: 2.5, backgroundColor: L.accent, borderRadius: 2 }} />
          <Text style={{ fontSize: 12, color: L.textSub }}>With FormPal</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 18, borderTopWidth: 1.5, borderColor: L.textDim, borderStyle: 'dashed' }} />
          <Text style={{ fontSize: 12, color: L.textSub }}>Without</Text>
        </View>
      </View>
      <Svg width="100%" height={150} viewBox="0 0 300 145">
        <SvgPath d="M 25,105 L 280,105" stroke="rgba(17,24,39,0.08)" strokeWidth={1} fill="none" />
        <AnimatedSvgPath d="M 25,100 C 90,100 205,18 280,18 L 280,105 L 25,105 Z" fill="rgba(10,132,255,0.07)" opacity={fillOpacity} stroke="none" />
        <SvgPath d="M 25,100 L 280,100" stroke={L.textDim} strokeWidth={1.5} strokeDasharray="6 4" fill="none" strokeLinecap="round" />
        <AnimatedSvgPath d="M 25,100 C 90,100 205,18 280,18" stroke={L.accent} strokeWidth={3} strokeDasharray={`${CURVE_LEN} ${CURVE_LEN}`} strokeDashoffset={strokeDashoffset} fill="none" strokeLinecap="round" />
        <AnimatedSvgCircle cx="280" cy="18" r="10" fill="rgba(10,132,255,0.14)" opacity={pulseOpacity} />
        <AnimatedSvgCircle cx="280" cy="18" r="4"  fill={L.accent}              opacity={dotOpacity}   />
        <SvgText x="25"  y="126" fill={L.textDim} fontSize="11" textAnchor="middle">Week 1</SvgText>
        <SvgText x="280" y="126" fill={L.textDim} fontSize="11" textAnchor="middle">Week 8</SvgText>
        <SvgText x="8" y="60" fill={L.textDim} fontSize="11" textAnchor="middle" transform="rotate(-90 8 60)">Progress</SvgText>
      </Svg>
    </View>
  );
}

// ── BulletItem ────────────────────────────────────────────────────────────────

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
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: L.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Sym name="checkmark" size={12} color="#fff" />
      </View>
      <Text style={{ fontSize: 15, color: L.text, fontWeight: W.medium, flex: 1 }}>{text}</Text>
    </Animated.View>
  );
}

// ── HomeSplitSlider — amber/green, icons at ends, % under bar ─────────────────

function HomeSplitSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(280);
  const [displayVal, setDisplayVal] = useState(Math.round(value));

  // Animated.Value drives the fill + thumb visually (no re-renders during drag)
  const animPct  = useRef(new Animated.Value(value)).current;
  const startRef = useRef(value);

  // One-time sync on mount
  useEffect(() => {
    animPct.setValue(value);
    setDisplayVal(Math.round(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        startRef.current = (animPct as any)._value ?? 50;
      },
      onPanResponderMove: (_, gs) => {
        const raw  = startRef.current + (gs.dx / trackWidth) * 100;
        const next = Math.max(5, Math.min(95, raw));
        animPct.setValue(next);                    // instant, no re-render
        const rounded = Math.round(next);
        setDisplayVal(rounded);                    // only text re-renders
        onChange(next);
      },
      onPanResponderRelease: (_, gs) => {
        const raw  = startRef.current + (gs.dx / trackWidth) * 100;
        const next = Math.round(Math.max(5, Math.min(95, raw)));
        animPct.setValue(next);
        setDisplayVal(next);
        onChange(next);
      },
    })
  ).current;

  const homePct = displayVal;
  const gymPct  = 100 - homePct;

  // Animated interpolations — drive fill + thumb without state
  const fillWidth = animPct.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const thumbLeft = animPct.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={{ gap: 16, marginTop: 16 }}>
      {/* Row: home icon | track | gym icon */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {/* Home icon */}
        <View style={[sl.iconBox, { backgroundColor: 'rgba(255,159,10,0.12)' }]}>
          <Sym name="house.fill" size={18} color={HOME_CLR} />
        </View>

        {/* Track + thumb in a relative wrapper */}
        <View
          style={{ flex: 1, height: TRACK_H, position: 'relative' }}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        >
          {/* Segmented fill — overflow:hidden clips to rounded corners */}
          <View style={sl.track}>
            <Animated.View style={{ height: '100%', width: fillWidth, backgroundColor: HOME_CLR }} />
            <View style={{ flex: 1, height: '100%', backgroundColor: GYM_CLR }} />
          </View>
          {/* Thumb — absolutely overlaid, NOT clipped by track's overflow */}
          <Animated.View style={[sl.thumb, { left: thumbLeft, marginLeft: -(THUMB_SZ / 2), top: (TRACK_H - THUMB_SZ) / 2 }]} />
        </View>

        {/* Gym icon */}
        <View style={[sl.iconBox, { backgroundColor: 'rgba(48,209,88,0.12)' }]}>
          <Sym name="dumbbell.fill" size={18} color={GYM_CLR} />
        </View>
      </View>

      {/* Percentages under each end */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 50 }}>
        <Text style={{ fontFamily: FONT.displayBold, fontSize: 20, color: HOME_CLR, letterSpacing: -0.5 }}>{homePct}%</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontFamily: FONT.displayBold, fontSize: 20, color: GYM_CLR, letterSpacing: -0.5 }}>{gymPct}%</Text>
      </View>
    </View>
  );
}

const sl = StyleSheet.create({
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  track:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', borderRadius: TRACK_H / 2, overflow: 'hidden', backgroundColor: '#EBEBF0' },
  thumb:   { position: 'absolute', width: THUMB_SZ, height: THUMB_SZ, borderRadius: THUMB_SZ / 2, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
});

// ── NotificationBanner — absolute overlay, auto-fades, never pushes content ───

function NotificationBanner({ topOffset }: { topOffset: number }) {
  const translateY = useRef(new Animated.Value(-(topOffset + 100))).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Wait 500ms, then slide in + fade in together
    Animated.sequence([
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 9, tension: 60, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Hold ~2s then fade out
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity,    { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -8, duration: 350, useNativeDriver: true }),
        ]).start();
      }, 2000);
    });
  }, []);

  return (
    <Animated.View
      style={[nb.overlay, { top: topOffset + 10, opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <View style={nb.card}>
        <View style={nb.iconWrap}>
          <Sym name="dumbbell.fill" size={15} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={nb.appName}>FormPal</Text>
            <Text style={nb.time}>now</Text>
          </View>
          <Text style={nb.message}>Time for today's workout 💪</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const nb = StyleSheet.create({
  overlay: { position: 'absolute', left: 16, right: 16, zIndex: 100 },
  card:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: L.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: L.border, ...({ boxShadow: Elev.medium.shadow } as any) },
  iconWrap:{ width: 38, height: 38, borderRadius: 10, backgroundColor: L.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  appName: { fontSize: 13, fontWeight: W.bold, color: L.text },
  time:    { fontSize: 11, color: L.textDim, fontWeight: W.medium },
  message: { fontSize: 14, color: L.text, marginTop: 3 },
});

// ── MyPalIntroContent — animated, minimal, icon-forward ──────────────────────

function MyPalIntroContent({ onContinue }: { onContinue: () => void }) {
  const insets = useSafeAreaInsets();

  const iconScale    = useRef(new Animated.Value(0.5)).current;
  const iconOpacity  = useRef(new Animated.Value(0)).current;
  const glowScale    = useRef(new Animated.Value(0.8)).current;
  const glowOpacity  = useRef(new Animated.Value(0)).current;
  const textOpacity  = useRef(new Animated.Value(0)).current;
  const textY        = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    // Icon entrance
    Animated.parallel([
      Animated.spring(iconScale,   { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }),
      Animated.timing(iconOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start(() => {
      // Glow pulse (loops)
      Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(glowOpacity, { toValue: 0.55, duration: 1100, useNativeDriver: true }),
          Animated.timing(glowScale,   { toValue: 1.35, duration: 1100, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowOpacity, { toValue: 0,    duration: 1100, useNativeDriver: true }),
          Animated.timing(glowScale,   { toValue: 0.8,  duration: 1100, useNativeDriver: true }),
        ]),
      ])).start();
      // Text slides up
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 380, delay: 120, useNativeDriver: true }),
        Animated.timing(textY,       { toValue: 0, duration: 380, delay: 120, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Center content */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        {/* Icon + glow */}
        <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 36 }}>
          {/* Glow ring */}
          <Animated.View style={{
            position: 'absolute',
            width: 120, height: 120, borderRadius: 60,
            backgroundColor: 'rgba(10,132,255,0.10)',
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          }} />
          {/* Icon container */}
          <Animated.View style={[mp.iconWrap, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
            <Svg width={44} height={44} viewBox="0 0 24 24">
              <SvgPath d="M12 2.5l1.7 5.3 5.3 1.7-5.3 1.7L12 16.5l-1.7-5.3L5 9.5l5.3-1.7z" fill={L.accent} />
              <SvgPath d="M18.5 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" fill={L.accent} />
            </Svg>
          </Animated.View>
        </View>

        {/* Text */}
        <Animated.View style={{ alignItems: 'center', opacity: textOpacity, transform: [{ translateY: textY }] }}>
          <Text style={mp.headline}>Meet MyPal</Text>
          <Text style={mp.sub}>Your AI coach — chat anytime to adjust your plan or ask anything.</Text>
        </Animated.View>
      </View>

      {/* CTA */}
      <View style={s.bn}>
        <TouchableOpacity style={s.cb} onPress={onContinue} activeOpacity={0.85}>
          <Text style={s.ct}>Build my plan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const mp = StyleSheet.create({
  iconWrap: { width: 96, height: 96, borderRadius: 28, backgroundColor: 'rgba(10,132,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(10,132,255,0.14)', ...({ boxShadow: Elev.medium.shadow } as any) },
  headline: { fontFamily: FONT.displayBold, fontSize: 34, color: L.text, letterSpacing: -1, textAlign: 'center', marginBottom: 12 },
  sub:      { fontSize: 16, color: L.textSub, textAlign: 'center', lineHeight: 24, letterSpacing: -0.2 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

type AppState = 'welcome' | 'onboarding' | 'mypal' | 'building' | 'projection' | 'payoff';

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
      Animated.timing(fadeAnim,  { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: out, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideAnim.setValue(inn);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
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
      setAppState('mypal');
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
      if (st.clearAllOption && opt === st.clearAllOption) {
        const isSel = cur.includes(opt);
        setAnswers({ ...answers, [st.id]: isSel ? [] : [opt] });
      } else {
        const withoutClear = st.clearAllOption ? cur.filter(o => o !== st.clearAllOption) : cur;
        const next = withoutClear.includes(opt)
          ? withoutClear.filter(o => o !== opt)
          : [...withoutClear, opt];
        setAnswers({ ...answers, [st.id]: next });
      }
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

  // ── WELCOME ──────────────────────────────────────────────────────────────────

  if (appState === 'welcome') {
    return (
      <ScreenBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={s.logoDot} />
            </View>
            <Text style={s.wordmarkBig}>FORMPAL</Text>
            <Text style={s.welcomeTitle}>Your AI form coach, plus a plan built for you.</Text>
            <Text style={s.welcomeSub}>Answer a few quick questions and I'll build your first workout — then I'll check every rep.</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setStepIndex(0); setAppState('onboarding'); }} activeOpacity={0.85}>
              <Text style={s.primaryBtnTxt}>Build my plan</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </ScreenBackground>
    );
  }

  // ── ONBOARDING ───────────────────────────────────────────────────────────────

  if (appState === 'onboarding' && currentStep) {
    const st = currentStep;

    const header = (
      <View style={s.qh}>
        <TouchableOpacity onPress={goBack} style={s.bb}>
          <Sym name="chevron.left" size={16} color={L.textSub} />
        </TouchableOpacity>
        <View style={s.pc}>
          <View style={s.pt}><View style={[s.pf, { width: `${progress * 100}%` }]} /></View>
        </View>
        <View style={{ width: 44 }} />
      </View>
    );

    // Wheel
    if (st.type === 'wheel') {
      const isHeight   = st.wheelKind === 'height';
      const opts       = isHeight ? HEIGHT_OPTIONS : AGE_OPTIONS;
      const defaultVal = isHeight ? `5'8"` : '16';
      const wheelVal   = (answers[st.id] as string) || defaultVal;
      return (
        <ScreenBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <View style={{ paddingHorizontal: 24, paddingTop: 20, flex: 1 }}>
              <Text style={s.qq}>{st.question}</Text>
              <Picker selectedValue={wheelVal} onValueChange={(v) => setAnswers({ ...answers, [st.id]: v as string })} style={{ height: 230 }} itemStyle={{ color: L.text, fontSize: 28, fontWeight: '600' }}>
                {opts.map(o => <Picker.Item key={o} label={o} value={o} />)}
              </Picker>
            </View>
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => advance({ ...answers, [st.id]: wheelVal })} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScreenBackground>
      );
    }

    // Text (weight)
    if (st.type === 'text') {
      return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScreenBackground>
            <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
              {header}
              <View style={{ paddingHorizontal: 24, paddingTop: 20, flex: 1 }}>
                <Text style={s.qq}>{st.question}</Text>
                <View style={{ alignItems: 'center', marginTop: 40, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                  <TextInput
                    value={textInput}
                    onChangeText={(v) => setTextInput(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={3}
                    style={{ fontSize: 56, fontWeight: W.bold, color: textInput ? L.text : L.textDim, textAlign: 'center', minWidth: 110, letterSpacing: -2 }}
                    placeholder="000"
                    placeholderTextColor={L.textDim}
                    autoFocus
                  />
                  <Text style={{ fontSize: 22, fontWeight: W.semi, color: L.textDim, paddingBottom: 10 }}>lbs</Text>
                </View>
              </View>
              <View style={s.bn}>
                <TouchableOpacity style={[s.cb, !textInput && s.cbDisabled]} disabled={!textInput} onPress={() => { const next = { ...answers, [st.id]: textInput }; setAnswers(next); setTextInput(''); advance(next); }} activeOpacity={0.85}>
                  <Text style={[s.ct, !textInput && s.ctDisabled]}>Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScreenBackground>
        </KeyboardAvoidingView>
      );
    }

    // Slider (home/gym split)
    if (st.type === 'slider') {
      const sliderVal = typeof answers[st.id] === 'number' ? (answers[st.id] as number) : 50;
      return (
        <ScreenBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
                <Text style={s.qq}>{st.question}</Text>
                <HomeSplitSlider value={sliderVal} onChange={(v) => setAnswers({ ...answers, [st.id]: v })} />
              </Animated.View>
            </ScrollView>
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => { const ans = { ...answers, [st.id]: sliderVal }; setAnswers(ans); advance(ans); }} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScreenBackground>
      );
    }

    // Select / multiselect — notification overlay is absolute (not in scroll)
    const isSel      = (o: string) => { const a = answers[st.id]; return Array.isArray(a) ? a.includes(o) : a === o; };
    const multiReady = st.type === 'multiselect' && Array.isArray(answers[st.id]) && (answers[st.id] as string[]).length > 0;
    const isNotif    = st.id === 'notifications';

    return (
      <ScreenBackground>
        {/* Notification overlay — absolute, never pushes content */}
        {isNotif && <NotificationBanner topOffset={insets.top} />}

        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {header}
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
              <Text style={s.qq}>{st.question}</Text>
              {st.subtitle && <Text style={s.qqSub}>{st.subtitle}</Text>}
              {(st.options || []).map((o, i) => {
                const sel = isSel(o.label);
                const sym = o.sfSymbol || 'person.fill';
                return (
                  <AnimatedOption key={`${st.id}-${o.label}`} index={i} style={[s.opt, sel && s.optSel]} onPress={() => handleSelect(o.label)}>
                    <View style={[s.optIcon, sel && s.optIconSel]}>
                      <Sym name={sym} size={18} color={sel ? L.accent : L.textSub} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.optTxt, sel && s.optTxtSel]}>{o.label}</Text>
                      {o.sublabel && <Text style={s.optSublabel}>{o.sublabel}</Text>}
                    </View>
                    <View style={[s.radio, sel && s.radioSel]}>
                      {sel && <Sym name="checkmark" size={11} color="#fff" />}
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
      </ScreenBackground>
    );
  }

  // ── MYPAL INTRO — animated, icon-forward, minimal text ───────────────────────

  if (appState === 'mypal') {
    return (
      <ScreenBackground>
        <MyPalIntroContent onContinue={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setPlan(buildPlan(answers)); setAppState('building'); }} />
      </ScreenBackground>
    );
  }

  // ── BUILDING ─────────────────────────────────────────────────────────────────

  if (appState === 'building') {
    return (
      <ScreenBackground>
        <View style={{ flex: 1, paddingTop: insets.top + 40, paddingBottom: insets.bottom, paddingHorizontal: 28 }}>
          <View style={{ marginBottom: 44 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: W.bold, color: L.textDim, letterSpacing: 1.2 }}>BUILDING PLAN</Text>
              <Text style={{ fontFamily: FONT.displayBold, fontSize: 22, color: L.text, letterSpacing: -0.5 }}>{loadPct}%</Text>
            </View>
            <View style={{ width: '100%', height: 6, backgroundColor: 'rgba(17,24,39,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: 6, backgroundColor: L.accent, borderRadius: 3, width: `${loadPct}%` as any }} />
            </View>
          </View>
          <Text style={{ fontFamily: FONT.displayBold, fontSize: 28, color: L.text, marginBottom: 8, letterSpacing: -0.8 }}>Building your plan</Text>
          <Text style={{ fontSize: 15, color: L.textSub, marginBottom: 36, lineHeight: 22 }}>Putting it together around your goals and setup.</Text>
          <View>
            {LOADING_STEPS.map((step, i) => {
              const done    = i < loadStep;
              const current = i === loadStep;
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, opacity: i > loadStep ? 0.3 : 1 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, marginRight: 14, backgroundColor: done ? L.accent : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: current ? L.accent : 'rgba(17,24,39,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                    {done    && <Sym name="checkmark" size={12} color="#fff" />}
                    {current && <ActivityIndicator size="small" color={L.accent} />}
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: current ? W.semi : W.medium, color: done || current ? L.text : L.textDim }}>{step}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScreenBackground>
    );
  }

  // ── PROJECTION ───────────────────────────────────────────────────────────────

  if (appState === 'projection') {
    const daysNum = parseInt((answers.days as string) ?? '3') || 3;
    return (
      <ScreenBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <Text style={s.qq}>Here's what training {daysNum} day{daysNum !== 1 ? 's' : ''} a week looks like.</Text>
            <ProjectionChart />
            {BULLET_ITEMS.map((item, i) => <BulletItem key={item} text={item} index={i} />)}
          </ScrollView>
          <View style={s.bn}>
            <TouchableOpacity style={s.cb} onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setAppState('payoff'); }} activeOpacity={0.85}>
              <Text style={s.ct}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScreenBackground>
    );
  }

  // ── PAYOFF ───────────────────────────────────────────────────────────────────

  if (appState === 'payoff') {
    return (
      <ScreenBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <View style={s.projRow}>
              <View style={s.sectionIconWrap}>
                <Sym name="checkmark" size={12} color={L.accent} />
              </View>
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
                    <View style={s.fcTag}>
                      <Sym name="camera.fill" size={11} color={L.accent} />
                      <Text style={s.fcTxt}>form-check</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 14, color: L.textSub, textAlign: 'center', marginVertical: 16, lineHeight: 21 }}>
              {motivationLine(answers)}
            </Text>
          </ScrollView>
          <View style={s.bn}>
            <TouchableOpacity style={s.cb} onPress={finishOnboarding} activeOpacity={0.85}>
              <Text style={s.ct}>Start training</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScreenBackground>
    );
  }

  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Progress bar header
  qh: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  bb: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: L.card, borderWidth: 1, borderColor: L.border, ...({ boxShadow: Elev.low.shadow } as any) },
  pc: { flex: 1, paddingHorizontal: 12 },
  pt: { height: 4, backgroundColor: 'rgba(17,24,39,0.08)', borderRadius: 2, overflow: 'hidden' },
  pf: { height: 4, backgroundColor: L.accent, borderRadius: 2 },

  // Question
  qq:     { fontFamily: FONT.display, fontSize: 30, color: L.text, lineHeight: 38, marginBottom: 20, letterSpacing: -0.6 },
  qqSub:  { fontSize: 14, color: L.textSub, lineHeight: 21, marginTop: -12, marginBottom: 20 },

  // Options
  opt:        { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: L.card, borderRadius: 16, borderWidth: 1, borderColor: L.border, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10, ...({ boxShadow: Elev.low.shadow } as any) },
  optSel:     { borderColor: L.accent, backgroundColor: L.accentSoft },
  optIcon:    { width: 36, height: 36, borderRadius: 10, backgroundColor: L.iconBg, alignItems: 'center', justifyContent: 'center' },
  optIconSel: { backgroundColor: 'rgba(10,132,255,0.12)' },
  optTxt:     { fontSize: 15, fontWeight: W.medium, color: L.text, letterSpacing: -0.2 },
  optTxtSel:  { fontWeight: W.semi },
  optSublabel:{ fontSize: 12, color: L.textSub, marginTop: 2 },
  radio:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(17,24,39,0.12)', alignItems: 'center', justifyContent: 'center' },
  radioSel:   { backgroundColor: L.accent, borderColor: L.accent },

  // Bottom bar
  bn:         { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16, backgroundColor: L.navBar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border },
  cb:         { backgroundColor: L.btnDark, borderRadius: 100, paddingVertical: 18, alignItems: 'center' },
  cbDisabled: { backgroundColor: '#EBEBF0' },
  ct:         { fontFamily: FONT.displayBold, fontSize: 16, color: '#fff', letterSpacing: 0.1 },
  ctDisabled: { color: L.textDim },

  // Welcome
  logoDot:       { width: 12, height: 12, borderRadius: 6, backgroundColor: L.accent, marginBottom: 20 },
  wordmarkBig:   { fontSize: 13, fontWeight: W.bold, color: L.textDim, textAlign: 'center', letterSpacing: 2.5, marginBottom: 32 },
  welcomeTitle:  { fontFamily: FONT.displayBold, fontSize: 32, color: L.text, textAlign: 'center', lineHeight: 40, letterSpacing: -1, marginBottom: 14 },
  welcomeSub:    { fontSize: 15, color: L.textSub, textAlign: 'center', lineHeight: 23, marginBottom: 48, paddingHorizontal: 8 },
  primaryBtn:    { backgroundColor: L.btnDark, borderRadius: 100, paddingVertical: 18, alignItems: 'center', ...({ boxShadow: Elev.medium.shadow } as any) },
  primaryBtnTxt: { fontFamily: FONT.displayBold, fontSize: 17, color: '#fff', letterSpacing: 0.1 },

  // Payoff
  projRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIconWrap:{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(10,132,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  qs:             { fontSize: 11, fontWeight: W.bold, color: L.accent, letterSpacing: 1.5 },
  qsub:           { fontSize: 14, color: L.textSub, lineHeight: 21, marginBottom: 24, letterSpacing: -0.1 },
  heroCard:       { backgroundColor: L.card, borderRadius: 22, borderWidth: 1, borderColor: L.border, padding: 20, marginBottom: 16, ...({ boxShadow: Elev.medium.shadow } as any) },
  heroLabel:      { fontSize: 11, fontWeight: W.bold, color: L.textDim, letterSpacing: 1.5, marginBottom: 6 },
  heroFocus:      { fontFamily: FONT.displayBold, fontSize: 24, color: L.text, letterSpacing: -0.6, marginBottom: 16 },
  exRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border },
  exName:         { fontSize: 15, fontWeight: W.semi, color: L.text, letterSpacing: -0.2 },
  exScheme:       { fontSize: 13, color: L.textSub, marginTop: 2 },
  fcTag:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,132,255,0.08)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 100 },
  fcTxt:          { fontSize: 11, fontWeight: W.bold, color: L.accent, letterSpacing: 0.2 },
});
