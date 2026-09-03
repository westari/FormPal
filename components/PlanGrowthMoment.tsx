// ── PlanGrowthMoment — onboarding interstitial after "About You".
// "Lifters with a structured plan build 2-3x more muscle." Rebuilt from a
// standalone HTML reference (FormPal Onboarding Screens (lite).html, screen
// 1 of 4) — a "muscle gained" line chart, grey/flat "without a plan" vs
// blue/steep "with a plan", drawing in over the growth window. Replaces the
// old StatsMoment (age/weight counters) — this screen doesn't reflect the
// user's own stats, it makes the case for having a plan at all.
//
// Also replaces the separate tower-block StructuredPlanInterstitial that
// used to sit later in the flow (after 'duration') — that screen argued the
// exact same "2-3x more muscle" claim with a different visual; keeping both
// would have repeated the same stat twice in one onboarding pass, so this
// screen now owns it, earlier and once.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated } from 'react-native';
import Svg, { Path as SvgPath, Text as SvgText, Circle as SvgCircle, Line as SvgLine } from 'react-native-svg';
import { FONT, Col, R, Elev } from '../constants/theme';
import OnboardingCTAFooter from './OnboardingCTAFooter';

const ACCENT = '#2E7DFF'; // same local "flow accent" the goal/experience/training screens below use
const GREY   = '#C7C7CE';

const AnimatedPath   = Animated.createAnimatedComponent(SvgPath);
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

// Generous strokeDasharray for both curves — doesn't need to match the real
// bezier length exactly, only to exceed it, so the line is fully hidden at
// dashoffset=LEN and fully drawn at dashoffset=0 (see ProjectionChart in
// app/onboarding.tsx for the same technique this was copied from).
const LINE_LEN = 340;

export default function PlanGrowthMoment({ header, insets, onContinue }: {
  header: React.ReactNode;
  insets: { top: number; bottom: number };
  onContinue: () => void;
}) {
  const headlineOpacity = useRef(new Animated.Value(0)).current;
  const headlineY       = useRef(new Animated.Value(10)).current;
  const cardOpacity     = useRef(new Animated.Value(0)).current;
  const greyProgress    = useRef(new Animated.Value(0)).current;
  const blueProgress    = useRef(new Animated.Value(0)).current;
  const startDot        = useRef(new Animated.Value(0)).current;
  const endDot           = useRef(new Animated.Value(0)).current;
  const endGlow           = useRef(new Animated.Value(0)).current; // loops 0→0.4→0, the pulsing halo behind the end dot
  const captionOpacity  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Every animation is captured and stopped on unmount — tapping Continue
    // before blueProgress finishes (~2.1s) otherwise fires the endDot spring
    // + endGlow loop on a torn-down view: "Unable to find node on an
    // unmounted component".
    const anims: Animated.CompositeAnimation[] = [];
    const track = (a: Animated.CompositeAnimation) => { anims.push(a); return a; };

    track(Animated.parallel([
      Animated.timing(headlineOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(headlineY,       { toValue: 0, duration: 380, useNativeDriver: true }),
    ])).start();
    track(Animated.timing(cardOpacity, { toValue: 1, duration: 400, delay: 200, useNativeDriver: true })).start();
    track(Animated.timing(startDot, { toValue: 1, duration: 220, delay: 350, useNativeDriver: true })).start();
    track(Animated.timing(greyProgress, { toValue: 1, duration: 1100, delay: 450, useNativeDriver: false })).start();
    track(Animated.timing(blueProgress, { toValue: 1, duration: 1500, delay: 600, useNativeDriver: false })).start(({ finished }) => {
      if (!finished) return;
      track(Animated.spring(endDot, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true })).start();
      track(Animated.loop(
        Animated.sequence([
          Animated.timing(endGlow, { toValue: 0.4, duration: 900, useNativeDriver: true }),
          Animated.timing(endGlow, { toValue: 0,   duration: 900, useNativeDriver: true }),
        ])
      )).start();
    });
    track(Animated.timing(captionOpacity, { toValue: 1, duration: 400, delay: 2400, useNativeDriver: true })).start();

    return () => { anims.forEach(a => a.stop()); };
  }, []);

  const greyDashoffset = greyProgress.interpolate({ inputRange: [0, 1], outputRange: [LINE_LEN, 0] });
  const blueDashoffset = blueProgress.interpolate({ inputRange: [0, 1], outputRange: [LINE_LEN, 0] });

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.Text style={[styles.headline, { opacity: headlineOpacity, transform: [{ translateY: headlineY }] }]}>
          Lifters with a structured plan build 2-3x more muscle.
        </Animated.Text>

        <Animated.View style={[styles.card, { opacity: cardOpacity }]}>
          <Text style={styles.cardLabel}>Muscle gained</Text>

          <Svg width="100%" height={172} viewBox="0 0 360 214">
            <SvgLine x1={34} y1={16} x2={34} y2={182} stroke="#E2E2E8" strokeWidth={1} />
            <SvgLine x1={34} y1={182} x2={330} y2={182} stroke="#E2E2E8" strokeWidth={1} />

            <AnimatedPath
              d="M34 174 C 122 172 226 166 322 158"
              stroke={GREY} strokeWidth={3.4} strokeLinecap="round" fill="none"
              strokeDasharray={`${LINE_LEN} ${LINE_LEN}`} strokeDashoffset={greyDashoffset}
            />
            <AnimatedPath
              d="M34 174 C 132 168 214 140 322 44"
              stroke={ACCENT} strokeWidth={3.4} strokeLinecap="round" fill="none"
              strokeDasharray={`${LINE_LEN} ${LINE_LEN}`} strokeDashoffset={blueDashoffset}
            />

            <AnimatedCircle cx={34} cy={174} r={4.6} fill="#fff" stroke="#111111" strokeWidth={2.6} opacity={startDot} />
            <AnimatedCircle cx={322} cy={44} r={9}   fill={ACCENT} opacity={endGlow} />
            <AnimatedCircle cx={322} cy={44} r={5.4} fill={ACCENT} opacity={endDot} />

            <SvgText x={316} y={30}  textAnchor="end" fontFamily={FONT.display} fontSize={15} fill={ACCENT}>With a plan</SvgText>
            <SvgText x={316} y={148} textAnchor="end" fontFamily={FONT.display} fontSize={15} fill={Col.textSub}>Without a plan</SvgText>
            <SvgText x={34}  y={205} fontFamily={FONT.display} fontSize={13} fill={Col.textDim}>Week 1</SvgText>
            <SvgText x={330} y={205} textAnchor="end" fontFamily={FONT.display} fontSize={13} fill={Col.textDim}>Week 12</SvgText>
          </Svg>

          <Text style={styles.caption}>Train to a plan and stay consistent over twelve weeks.</Text>
        </Animated.View>
      </ScrollView>
      <OnboardingCTAFooter onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 140 },

  headline: {
    fontFamily: FONT.display, fontSize: 28, lineHeight: 34,
    color: Col.text, letterSpacing: -0.6, marginBottom: 20,
  },

  card: {
    backgroundColor: Col.card, borderRadius: R.card,
    borderWidth: 1, borderColor: 'rgba(17,24,39,0.06)',
    padding: 20, ...({ boxShadow: Elev.medium.shadow } as any),
  },
  cardLabel: { fontFamily: FONT.display, fontSize: 18, color: Col.text, letterSpacing: -0.3, marginBottom: 4 },
  caption: {
    fontFamily: FONT.display, fontSize: 16, color: Col.textSub,
    textAlign: 'center', lineHeight: 22, marginTop: 12, paddingHorizontal: 6,
  },
});
