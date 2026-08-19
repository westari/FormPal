// ── StructuredPlanInterstitial ───────────────────────────────────────────────
// Onboarding interstitial: "Lifters with a structured plan build 2-3x more
// muscle." Signature visual is a two-tower block-stack race, not another
// pill/bar comparison (onboarding.tsx's ComparisonMoment already owns that
// shape for the goal screen) — RANDOM stacks a few blocks on an uneven,
// stuttering cadence; STRUCTURED PLAN stacks 2.5x as many on a perfectly
// even one. The rhythm of the animation argues the point, not just the
// final heights: consistency compounding, not a static chart.
//
// Per explicit brief: flat white background (no gradient — deliberately NOT
// <ScreenBackground>/Col.bgGrad), a single custom accent (#2E7DFF, not
// Col.ringC — same "local flow accent" pattern app/onboarding.tsx already
// uses), no gradients anywhere. Continue button matches onboarding.tsx's
// existing dark-pill CTA (#0B1020) for visual continuity with the rest of
// that flow, since this screen is meant to slot into it.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { FONT, Col, Sp, Sz, W, R, Elev } from '../constants/theme';

const ACCENT   = '#2E7DFF';
const CTA_DARK = '#0B1020'; // matches app/onboarding.tsx's L.btnDark

// ── Diagram geometry ─────────────────────────────────────────────────────────
const BLOCK_W = 76;
const BLOCK_H = 16;
const BLOCK_GAP = 6;
const RANDOM_COUNT = 4;
// 2.5x RANDOM_COUNT — the exact center of the "2-3x" claim, not an arbitrary
// block count. The tower-height ratio and the on-screen "2-3X" badge agree.
const STRUCTURED_COUNT = 10;
const TOWER_GAP = 64;
const BADGE_CLEARANCE = 78; // headroom above the tallest tower for the badge

const randomHeight     = RANDOM_COUNT * BLOCK_H + (RANDOM_COUNT - 1) * BLOCK_GAP;
const structuredHeight = STRUCTURED_COUNT * BLOCK_H + (STRUCTURED_COUNT - 1) * BLOCK_GAP;
const DIAGRAM_W = BLOCK_W * 2 + TOWER_GAP;
const DIAGRAM_H = structuredHeight + BADGE_CLEARANCE;

// Deliberately UNEVEN — the random tower's timing itself argues the point,
// not just its label. Structured's cadence is perfectly even by contrast.
const RANDOM_DELAYS = [0, 170, 430, 560];
const STRUCTURED_STEP = 76;
const STRUCTURED_DELAYS = Array.from({ length: STRUCTURED_COUNT }, (_, i) => i * STRUCTURED_STEP);

const lastStructuredDelay = STRUCTURED_DELAYS[STRUCTURED_DELAYS.length - 1];
const LINE_DELAY     = lastStructuredDelay + 340;
const BADGE_DELAY    = LINE_DELAY + 260;
const HEADLINE_DELAY = BADGE_DELAY + 180;

// ── Tower block ───────────────────────────────────────────────────────────────

function TowerBlock({ delay, color }: { delay: number; color: string }) {
  const entrance = useSharedValue(0);

  useEffect(() => {
    entrance.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 180, mass: 0.6 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 14 },
      { scale: 0.85 + entrance.value * 0.15 },
    ],
  }));

  return <Animated.View style={[styles.block, { backgroundColor: color }, style]} />;
}

function Tower({ count, delays, color }: { count: number; delays: number[]; color: string }) {
  return (
    <View style={styles.tower}>
      {Array.from({ length: count }).map((_, i) => (
        <TowerBlock key={i} delay={delays[i]} color={color} />
      ))}
    </View>
  );
}

// ── Dashed reference line — level with RANDOM's peak, spans to STRUCTURED ────

function ReferenceLine() {
  const opacity = useSharedValue(0);
  const scaleX  = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(LINE_DELAY, withTiming(1, { duration: 260, easing: Easing.out(Easing.ease) }));
    scaleX.value  = withDelay(LINE_DELAY, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleX: scaleX.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.lineWrap, { top: DIAGRAM_H - randomHeight - 1 }, style]}>
      <Svg width={DIAGRAM_W} height={2}>
        <Line x1={0} y1={1} x2={DIAGRAM_W} y2={1} stroke={Col.textDim} strokeWidth={1.5} strokeDasharray="5,6" />
      </Svg>
    </Animated.View>
  );
}

// ── "2-3X" badge — the punctuation mark, arrives last ─────────────────────────

function MultiplierBadge() {
  const scale   = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(BADGE_DELAY, withTiming(1, { duration: 160 }));
    scale.value   = withDelay(BADGE_DELAY, withSpring(1, { damping: 10, stiffness: 220, mass: 0.7 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.badgeSlot, { bottom: structuredHeight + 14 }]}>
      <Animated.View style={[styles.badge, style]}>
        <Text style={styles.badgeText}>2-3X</Text>
      </Animated.View>
    </View>
  );
}

// ── Headline — arrives last, confirms what the visual just showed ────────────

function Headline() {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value    = withDelay(HEADLINE_DELAY, withTiming(1, { duration: 420 }));
    translateY.value = withDelay(HEADLINE_DELAY, withSpring(0, { damping: 16, stiffness: 140 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={style}>
      <Text style={styles.headline}>
        Lifters with a <Text style={styles.headlineAccent}>structured plan</Text> build{'\n'}
        <Text style={styles.headlineAccent}>2-3x more muscle.</Text>
      </Text>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StructuredPlanInterstitial({
  progress = 0.7,
  onContinue,
}: {
  /** Onboarding progress, 0-1. Defaults to a mid-flow value for standalone use. */
  progress?: number;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>

      <View style={styles.center}>
        <View style={[styles.diagram, { width: DIAGRAM_W, height: DIAGRAM_H }]}>
          <ReferenceLine />
          <View style={styles.towersRow}>
            <Tower count={RANDOM_COUNT} delays={RANDOM_DELAYS} color={Col.textDim} />
            <Tower count={STRUCTURED_COUNT} delays={STRUCTURED_DELAYS} color={ACCENT} />
          </View>
          <MultiplierBadge />
        </View>

        <View style={styles.labelsRow}>
          <Text style={[styles.towerLabel, { width: BLOCK_W }]}>RANDOM</Text>
          <Text style={[styles.towerLabel, styles.towerLabelAccent, { width: BLOCK_W }]}>
            STRUCTURED{'\n'}PLAN
          </Text>
        </View>

        <View style={styles.headlineWrap}>
          <Headline />
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={onContinue}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Col.bg },

  progressRow:   { paddingHorizontal: Sp.lg, paddingTop: Sp.sm },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(17,24,39,0.08)', overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 2, backgroundColor: ACCENT },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Sp.lg },

  diagram: { position: 'relative' },

  towersRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  tower: { width: BLOCK_W, flexDirection: 'column-reverse', gap: BLOCK_GAP },
  block: { width: BLOCK_W, height: BLOCK_H, borderRadius: R.sm },

  lineWrap: { position: 'absolute', left: 0, width: DIAGRAM_W },

  badgeSlot: { position: 'absolute', left: BLOCK_W + TOWER_GAP, width: BLOCK_W, alignItems: 'center' },
  badge: {
    borderRadius: R.pill, backgroundColor: ACCENT,
    paddingHorizontal: Sp.md, paddingVertical: Sp.xs + 2,
    ...({ boxShadow: Elev.low.shadow } as any),
  },
  badgeText: { fontFamily: FONT.body, fontSize: Sz.body, fontWeight: W.bold, color: '#fff', letterSpacing: 0.2 },

  labelsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    width: DIAGRAM_W, marginTop: Sp.md,
  },
  towerLabel: {
    fontFamily: FONT.body, fontSize: Sz.caption, fontWeight: W.semi,
    color: Col.textSub, letterSpacing: 0.6, textAlign: 'center',
  },
  towerLabelAccent: { color: ACCENT, fontWeight: W.bold },

  headlineWrap: { marginTop: Sp.xxl, paddingHorizontal: Sp.sm },
  headline: {
    fontFamily: FONT.displayBold, fontSize: Sz.h1, color: Col.text,
    letterSpacing: -0.6, lineHeight: 38, textAlign: 'center',
  },
  headlineAccent: { color: ACCENT },

  footer: { paddingHorizontal: Sp.lg, paddingBottom: Sp.md, paddingTop: Sp.sm },
  cta: {
    backgroundColor: CTA_DARK, borderRadius: R.pill,
    paddingVertical: 18, alignItems: 'center',
    ...({ boxShadow: Elev.medium.shadow } as any),
  },
  ctaPressed: { opacity: 0.88 },
  ctaText: { fontFamily: FONT.displayBold, fontSize: Sz.body, color: '#fff', letterSpacing: 0.2 },
});
