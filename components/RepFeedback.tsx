// RepFeedback — a single 3D Liquid Glass orb (check / X) over the camera view.
// No card, no border, no label — just the mark, rendered as a glass sphere
// would look on iOS 26. Props unchanged: { good, reason, seq, onComplete }.

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, {
  Defs, RadialGradient, LinearGradient as SvgLinearGradient, Stop,
  Circle, Ellipse, Path as SvgPath, G,
} from 'react-native-svg';

const GREEN = '#32d74b';
const RED   = '#ff453a';
const ORB   = 152;

// ─── 3D Liquid Glass orb ─────────────────────────────────────────────────────

// goodColor / badColor default to the shipped green / red. formcheck.tsx
// passes the user's unlocked rank colour for the ✓ orb (see lib/activeTheme);
// the ✗ orb stays red on every theme by design.
function GlassOrb({ good, goodColor = GREEN, badColor = RED }: { good: boolean; goodColor?: string; badColor?: string }) {
  const tint = good ? goodColor : badColor;

  return (
    <View style={[orb.lift]}>
      <View style={[orb.glow, { shadowColor: tint }]}>
        <BlurView intensity={26} tint="systemThinMaterialDark" style={orb.clip}>
          <Svg width={ORB} height={ORB} viewBox="0 0 100 100">
            <Defs>
              {/* domed body: white hotspot top-left → tint → shaded edge */}
              <RadialGradient id="dome" cx="34%" cy="26%" r="82%">
                <Stop offset="0"    stopColor="#ffffff" stopOpacity="0.95" />
                <Stop offset="0.28" stopColor="#ffffff" stopOpacity="0.35" />
                <Stop offset="0.55" stopColor={tint}    stopOpacity="0.30" />
                <Stop offset="0.82" stopColor={tint}    stopOpacity="0.20" />
                <Stop offset="1"    stopColor="#000000" stopOpacity="0.42" />
              </RadialGradient>
              {/* underside shadow — the bottom of the sphere */}
              <RadialGradient id="under" cx="50%" cy="94%" r="60%">
                <Stop offset="0"   stopColor="#000000" stopOpacity="0.45" />
                <Stop offset="0.7" stopColor="#000000" stopOpacity="0.10" />
                <Stop offset="1"   stopColor="#000000" stopOpacity="0" />
              </RadialGradient>
              {/* sharp wet highlight near the top */}
              <RadialGradient id="spec" cx="50%" cy="50%" r="50%">
                <Stop offset="0"   stopColor="#ffffff" stopOpacity="0.9" />
                <Stop offset="0.6" stopColor="#ffffff" stopOpacity="0.25" />
                <Stop offset="1"   stopColor="#ffffff" stopOpacity="0" />
              </RadialGradient>
              {/* beveled rim: light at top, dark at bottom */}
              <SvgLinearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0"    stopColor="#ffffff" stopOpacity="0.85" />
                <Stop offset="0.5"  stopColor="#ffffff" stopOpacity="0.15" />
                <Stop offset="1"    stopColor="#000000" stopOpacity="0.45" />
              </SvgLinearGradient>
            </Defs>

            <Circle cx="50" cy="50" r="50" fill="url(#dome)" />
            <Circle cx="50" cy="50" r="50" fill="url(#under)" />
            <Ellipse cx="38" cy="24" rx="26" ry="15" fill="url(#spec)" />
            <Circle cx="50" cy="50" r="48.5" fill="none" stroke="url(#rim)" strokeWidth="2.4" />
            <Circle cx="50" cy="50" r="49.4" fill="none" stroke={tint} strokeOpacity="0.35" strokeWidth="1" />

            {/* the mark — dark drop copy under a white top copy = raised look */}
            <G transform="translate(50 51)">
              {good ? (
                <>
                  <SvgPath d="M -18 1 L -6 13 L 20 -14" transform="translate(0 2)"
                    stroke="#000000" strokeOpacity="0.28" strokeWidth="7"
                    strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <SvgPath d="M -18 1 L -6 13 L 20 -14"
                    stroke="#ffffff" strokeWidth="6.4"
                    strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </>
              ) : (
                <>
                  <G transform="translate(0 2)" stroke="#000000" strokeOpacity="0.28" strokeWidth="7" strokeLinecap="round">
                    <SvgPath d="M -15 -15 L 15 15" />
                    <SvgPath d="M 15 -15 L -15 15" />
                  </G>
                  <G stroke="#ffffff" strokeWidth="6.4" strokeLinecap="round">
                    <SvgPath d="M -15 -15 L 15 15" />
                    <SvgPath d="M 15 -15 L -15 15" />
                  </G>
                </>
              )}
            </G>
          </Svg>
        </BlurView>
      </View>
    </View>
  );
}

const orb = StyleSheet.create({
  lift: {
    width: ORB, height: ORB, borderRadius: ORB / 2,
    ...Platform.select({ ios: {
      shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.45, shadowRadius: 28,
    } }),
  },
  glow: {
    width: ORB, height: ORB, borderRadius: ORB / 2,
    ...Platform.select({ ios: {
      shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 24,
    } }),
  },
  clip: {
    width: ORB, height: ORB, borderRadius: ORB / 2,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
});

// ─── RepFeedback overlay ─────────────────────────────────────────────────────

export default function RepFeedback({
  good,
  reason,
  seq: repSeq,
  onComplete,
  goodColor,
  badColor,
}: {
  good: boolean;
  reason: string;
  seq: number;
  onComplete: () => void;
  goodColor?: string;
  badColor?: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.8)).current;
  const current = useRef<Animated.CompositeAnimation | null>(null);

  // Depend on `seq` (not [good, reason]) so back-to-back identical verdicts
  // still restart the animation — see git history for the full root-cause note.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    current.current?.stop();
    opacity.setValue(1);
    scale.setValue(0.8);
    const anim = Animated.sequence([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 }),
      Animated.delay(good ? 700 : 900),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 360, useNativeDriver: true }),
        Animated.timing(scale,   { toValue: 0.9, duration: 360, useNativeDriver: true }),
      ]),
    ]);
    current.current = anim;
    anim.start(({ finished }) => { if (finished) onComplete(); });
    return () => { current.current?.stop(); };
  }, [repSeq]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, rf.overlay, { opacity }]}
      pointerEvents="none"
    >
      <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
        <GlassOrb good={good} goodColor={goodColor} badColor={badColor} />
        {!good && !!reason && (
          <Text style={rf.cue} numberOfLines={2}>{reason}</Text>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const rf = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center' },
  cue: {
    marginTop: 20,
    maxWidth: 300,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 29,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
});
