// RepFeedback — a single 3D Liquid Glass orb (check / X) over the camera view.
// No card, no border, no label — just the mark, as a glass control would look
// on iOS 26. Props unchanged: { good, reason, seq, onComplete }.

import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath, Line as SvgLine } from 'react-native-svg';

const GREEN = '#32d74b';
const RED   = '#ff453a';
const ORB   = 150;

// ─── 3D Liquid Glass orb ─────────────────────────────────────────────────────

function GlassOrb({ good }: { good: boolean }) {
  const tint = good ? GREEN : RED;

  return (
    <View style={[orb.lift, { shadowColor: '#000' }]}>
      <View style={[orb.glow, { shadowColor: tint }]}>
        <BlurView intensity={32} tint="systemThinMaterialDark" style={orb.clip}>
          {/* faint colour wash */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: `${tint}1F` }]} />

          {/* domed 3D shading: bright top-left → clear → shaded bottom-right */}
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.62)',
              'rgba(255,255,255,0.14)',
              'rgba(255,255,255,0.00)',
              'rgba(0,0,0,0.20)',
            ]}
            locations={[0, 0.30, 0.60, 1]}
            start={{ x: 0.16, y: 0.06 }}
            end={{ x: 0.86, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* tight wet-glass sheen near the top */}
          <LinearGradient
            colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.32 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* the mark — carries its own shadow so it sits ON the glass */}
          <View style={orb.iconCenter}>
            <Svg width={72} height={72} viewBox="0 0 24 24">
              {good ? (
                <SvgPath
                  d="M 3.5 12 L 9.5 18 L 20.5 5.5"
                  stroke="white" strokeWidth={2.8}
                  strokeLinecap="round" strokeLinejoin="round" fill="none"
                />
              ) : (
                <>
                  <SvgLine x1={5} y1={5} x2={19} y2={19} stroke="white" strokeWidth={2.8} strokeLinecap="round" />
                  <SvgLine x1={19} y1={5} x2={5} y2={19} stroke="white" strokeWidth={2.8} strokeLinecap="round" />
                </>
              )}
            </Svg>
          </View>

          {/* colour rim catching light + brighter top edge */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, orb.rim, { borderColor: `${tint}D0` }]} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, orb.rimTop]} />
        </BlurView>
      </View>
    </View>
  );
}

const orb = StyleSheet.create({
  // dark drop shadow — lifts the orb off the scene
  lift: {
    width: ORB, height: ORB, borderRadius: ORB / 2,
    ...Platform.select({ ios: {
      shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.4, shadowRadius: 26,
    } }),
  },
  // coloured glow — green/red halo
  glow: {
    width: ORB, height: ORB, borderRadius: ORB / 2,
    ...Platform.select({ ios: {
      shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.75, shadowRadius: 22,
    } }),
  },
  clip: {
    width: ORB, height: ORB, borderRadius: ORB / 2,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  iconCenter: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({ ios: {
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6,
    } }),
  },
  rim: {
    borderRadius: ORB / 2, borderWidth: 1.5,
  },
  rimTop: {
    borderRadius: ORB / 2, borderTopWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
  },
});

// ─── RepFeedback overlay ─────────────────────────────────────────────────────

export default function RepFeedback({
  good,
  reason: _reason,
  seq: repSeq,
  onComplete,
}: {
  good: boolean;
  reason: string;
  seq: number;
  onComplete: () => void;
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
      <Animated.View style={{ transform: [{ scale }] }}>
        <GlassOrb good={good} />
      </Animated.View>
    </Animated.View>
  );
}

const rf = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center' },
});
