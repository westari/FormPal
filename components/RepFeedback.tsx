// RepFeedback — liquid glass feedback card, overlaid on the exercise camera view.
// Props unchanged: { good, reason, onComplete } — formcheck.tsx needs no edits.

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath, Line as SvgLine } from 'react-native-svg';

// ─── Tokens ───────────────────────────────────────────────────────────────────

const GREEN = '#32d74b';
const RED   = '#ff453a';

// ─── MyPal star ───────────────────────────────────────────────────────────────

function Star() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <SvgPath
        d="M12 2.5l1.7 5.3 5.3 1.7-5.3 1.7L12 16.5l-1.7-5.3L5 9.5l5.3-1.7z"
        fill="rgba(255,255,255,0.70)"
      />
      <SvgPath
        d="M18.5 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z"
        fill="rgba(255,255,255,0.70)"
      />
    </Svg>
  );
}

// ─── Glass orb (check or X) ───────────────────────────────────────────────────

const ORB = 130;

function GlassOrb({ good }: { good: boolean }) {
  const glow = good ? GREEN : RED;

  return (
    <View style={[orb.shadow, { shadowColor: glow }]}>
      <View style={[orb.circle, { borderColor: `${glow}90` }]}>
        <View style={[StyleSheet.absoluteFill, orb.base]} />
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.58)',
            'rgba(255,255,255,0.14)',
            'rgba(255,255,255,0.02)',
            'rgba(255,255,255,0.06)',
          ]}
          locations={[0, 0.38, 0.65, 1]}
          start={{ x: 0.12, y: 0 }}
          end={{ x: 0.88, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={orb.iconCenter}>
          <Svg width={66} height={66} viewBox="0 0 24 24">
            {good ? (
              <SvgPath
                d="M 3.5 12 L 9.5 18 L 20.5 5.5"
                stroke="white"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : (
              <>
                <SvgLine
                  x1={5} y1={5} x2={19} y2={19}
                  stroke="white" strokeWidth={2.6} strokeLinecap="round"
                />
                <SvgLine
                  x1={19} y1={5} x2={5} y2={19}
                  stroke="white" strokeWidth={2.6} strokeLinecap="round"
                />
              </>
            )}
          </Svg>
        </View>
      </View>
    </View>
  );
}

const orb = StyleSheet.create({
  shadow: {
    width:        ORB,
    height:       ORB,
    borderRadius: ORB / 2,
    ...Platform.select({ ios: {
      shadowOffset:  { width: 0, height: 0 },
      shadowOpacity: 0.70,
      shadowRadius:  20,
    }}),
  },
  circle: {
    width:        ORB,
    height:       ORB,
    borderRadius: ORB / 2,
    borderWidth:  1.5,
    overflow:     'hidden',
  },
  base:       { backgroundColor: 'rgba(255,255,255,0.10)' },
  iconCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});

// ─── Liquid glass card ────────────────────────────────────────────────────────

const CARD_W = 270;
const CARD_R = 32;

function GlassCard({ good, reason }: { good: boolean; reason: string }) {
  return (
    <View style={card.shadow}>
      <BlurView intensity={65} tint="dark" style={card.blur}>
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.22)',
            'rgba(255,255,255,0.07)',
            'rgba(255,255,255,0.00)',
            'rgba(255,255,255,0.04)',
          ]}
          locations={[0, 0.30, 0.65, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={card.header}>
          <Star />
          <Text style={card.headerTxt}>MYPAL</Text>
        </View>

        <View style={card.divider} />

        <View style={card.orbWrap}>
          <GlassOrb good={good} />
        </View>

        <Text style={card.cue} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.70}>
          {good ? 'Solid form.' : reason}
        </Text>

        <View style={card.border} pointerEvents="none" />
      </BlurView>
    </View>
  );
}

const card = StyleSheet.create({
  shadow: {
    width:        CARD_W,
    borderRadius: CARD_R,
    ...Platform.select({ ios: {
      shadowColor:   '#000',
      shadowOffset:  { width: 0, height: 12 },
      shadowOpacity: 0.50,
      shadowRadius:  28,
    }}),
  },
  blur: {
    width:             CARD_W,
    borderRadius:      CARD_R,
    overflow:          'hidden',
    paddingTop:        18,
    paddingBottom:     30,
    paddingHorizontal: 14,
    alignItems:        'center',
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    alignSelf:     'flex-start',
  },
  headerTxt: {
    fontSize:      13,
    fontWeight:    '700',
    color:         'rgba(255,255,255,0.62)',
    letterSpacing: 2,
  },
  divider: {
    width:           '100%',
    height:          StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop:       12,
    marginBottom:    20,
  },
  orbWrap: { marginBottom: 20 },
  cue: {
    fontSize:      26,
    fontWeight:    '700',
    color:         'rgba(255,255,255,0.95)',
    textAlign:     'center',
    letterSpacing: -0.3,
    lineHeight:    31,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CARD_R,
    borderWidth:  1,
    borderColor:  'rgba(255,255,255,0.20)',
  },
});

// ─── RepFeedback overlay ──────────────────────────────────────────────────────

export default function RepFeedback({
  good,
  reason,
  onComplete,
}: {
  good: boolean;
  reason: string;
  onComplete: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const current = useRef<Animated.CompositeAnimation | null>(null);

  // Root cause of "verdict doesn't show, especially on fast reps": the parent
  // used to remount this component on every rep (a growing `key` prop), which
  // hard-cuts whatever was on screen to nothing and restarts a fresh 150ms
  // fade-in. At a fast rep tempo (well under the ~1.4-1.6s full fade-in/hold/
  // fade-out cycle), each new rep's card could itself get cut off before its
  // own fade-in finished — the verdict flashed for a few ms and was gone.
  // Fix: the parent now keeps ONE mounted instance for as long as feedback is
  // showing (no key). A new rep's good/reason props update that instance:
  // stop whatever animation was running and SNAP opacity to 1 immediately, so
  // the newest verdict is always visible at full opacity for at least an
  // instant, however fast reps arrive, then run its own hold+fade-out.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    current.current?.stop();
    opacity.setValue(1);
    const seq = Animated.sequence([
      Animated.delay(good ? 900 : 1100),
      Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]);
    current.current = seq;
    seq.start(({ finished }) => { if (finished) onComplete(); });

    return () => { current.current?.stop(); };
  }, [good, reason]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, rf.overlay, { opacity }]}
      pointerEvents="none"
    >
      <GlassCard good={good} reason={reason} />
    </Animated.View>
  );
}

const rf = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center' },
});
