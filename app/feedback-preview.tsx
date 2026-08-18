// app/feedback-preview.tsx — dev preview: real iOS 26 liquid glass feedback card
// Glass card = BlurView + specular gradient. Glass orb = layered gradients + colored glow.
// Layout per card: [✦ MYPAL] → [glass orb] → [cue text]

import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath, Line as SvgLine } from 'react-native-svg';

// ─── Tokens ───────────────────────────────────────────────────────────────────

const T = {
  bg:      '#0A0B0C',
  surface: '#0d1018',
  border:  'rgba(255,255,255,0.07)',
  text:    '#f2f4f8',
  textSub: 'rgba(255,255,255,0.38)',
  accent:  '#0a84ff',
  green:   '#32d74b',
  red:     '#ff453a',
};

// ─── MyPal star ───────────────────────────────────────────────────────────────

function Star({ size = 13 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
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

// ─── Liquid glass orb ─────────────────────────────────────────────────────────
// Shadow on the outer wrapper so it isn't clipped.
// Inner circle uses overflow:hidden to clip the gradient layers to the circle shape.

const ORB = 100;

function GlassOrb({ good }: { good: boolean }) {
  const glow = good ? T.green : T.red;

  return (
    // Outer wrapper carries the colored shadow/glow — no overflow:hidden here
    <View style={[orb.shadow, { shadowColor: glow }]}>
      {/* Inner circle clips the gradient layers */}
      <View style={[orb.circle, { borderColor: `${glow}90` }]}>
        {/* Base: semi-transparent white glass fill */}
        <View style={[StyleSheet.absoluteFill, orb.base]} />

        {/* Specular highlight — the key iOS 26 glass ingredient */}
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

        {/* Icon — centered in the orb */}
        <View style={orb.iconCenter}>
          <Svg width={50} height={50} viewBox="0 0 24 24">
            {good ? (
              // Clean balanced checkmark — short left leg, long right sweep
              <SvgPath
                d="M 3.5 12 L 9.5 18 L 20.5 5.5"
                stroke="white"
                strokeWidth={2.3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : (
              // Perfectly symmetric X — same margin on all sides
              <>
                <SvgLine
                  x1={5} y1={5} x2={19} y2={19}
                  stroke="white" strokeWidth={2.3} strokeLinecap="round"
                />
                <SvgLine
                  x1={19} y1={5} x2={5} y2={19}
                  stroke="white" strokeWidth={2.3} strokeLinecap="round"
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
    overflow:     'hidden', // clips gradients to circle
  },
  base: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  iconCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
  },
});

// ─── Liquid glass card ────────────────────────────────────────────────────────
// Shadow on outer wrapper. BlurView + specular gradient inside.

const CARD_W = 162;
const CARD_R = 28;

function GlassCard({ good, reason }: { good: boolean; reason: string }) {
  return (
    // Outer wrapper carries the drop shadow
    <View style={card.shadow}>
      {/* BlurView provides the frosted glass base */}
      <BlurView intensity={65} tint="dark" style={card.blur}>

        {/* iOS 26 specular gradient — bright at top, fades to nothing */}
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

        {/* ── Content ──────────────────────────────────────────────── */}

        {/* Header */}
        <View style={card.header}>
          <Star size={12} />
          <Text style={card.headerTxt}>MYPAL</Text>
        </View>

        {/* Thin divider */}
        <View style={card.divider} />

        {/* Glass orb */}
        <View style={card.orbWrap}>
          <GlassOrb good={good} />
        </View>

        {/* Cue text — one sentence, regular weight */}
        <Text
          style={card.cue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.70}
        >
          {good ? 'Solid form.' : reason}
        </Text>

        {/* Border inside BlurView so overflow:hidden clips it correctly */}
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
    fontSize:      10.5,
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
  orbWrap: {
    marginBottom: 20,
  },
  cue: {
    fontSize:      16,
    fontWeight:    '500',
    color:         'rgba(255,255,255,0.92)',
    textAlign:     'center',
    letterSpacing: -0.2,
    lineHeight:    22,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CARD_R,
    borderWidth:  1,
    borderColor:  'rgba(255,255,255,0.20)',
  },
});

// ─── Animated pair ────────────────────────────────────────────────────────────

function AnimatedPair({ reason, onDone }: { reason: string; onDone: () => void }) {
  const mounted = useRef(true);
  const opacity = useRef(new Animated.Value(0)).current;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    mounted.current = true;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start(() => { if (mounted.current) onDone(); });
    return () => { mounted.current = false; };
  }, []);

  return (
    <Animated.View style={[row.wrap, { opacity }]}>
      <GlassCard good={true}  reason="" />
      <GlassCard good={false} reason={reason} />
    </Animated.View>
  );
}

const row = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 14 },
});

// ─── Sample errors ────────────────────────────────────────────────────────────

const ERRORS = ['Elbows higher', 'Go deeper', 'Keep it tight', 'Chest lower'];

// ─── Preview screen ───────────────────────────────────────────────────────────

export default function FeedbackPreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [errorIdx, setErrorIdx] = useState(0);
  const [animKey,  setAnimKey]  = useState<number | null>(null);

  const reason  = ERRORS[errorIdx % ERRORS.length];
  const replay  = useCallback(() => setAnimKey(k => k === null ? 0 : k + 1), []);
  const nextErr = useCallback(() => { setErrorIdx(i => i + 1); setAnimKey(null); }, []);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={s.backTxt}>‹ Back</Text>
        </Pressable>
        <Text style={s.title}>Feedback Preview</Text>
        <View style={{ width: 56 }} />
      </View>

      {/* Both cards visible simultaneously — easy comparison */}
      <View style={s.stage}>
        {animKey !== null ? (
          <AnimatedPair
            key={animKey}
            reason={reason}
            onDone={() => setAnimKey(null)}
          />
        ) : (
          <View style={row.wrap}>
            <GlassCard good={true}  reason="" />
            <GlassCard good={false} reason={reason} />
          </View>
        )}
      </View>

      <View style={s.controls}>
        <Pressable style={[s.btn, s.btnSec]} onPress={replay}>
          <Text style={s.btnTxt}>▶  Replay</Text>
        </Pressable>
        <Pressable style={[s.btn, s.btnCycle]} onPress={nextErr}>
          <Text style={s.btnTxt}>Cycle error →</Text>
        </Pressable>
      </View>

      <Text style={s.note}>
        Left = good form.  Right = error + cue.{'\n'}
        iOS 26 liquid glass: BlurView + specular gradient + colored glow.
      </Text>

    </View>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 20,
    paddingVertical:   14,
  },
  backTxt: { fontSize: 17, color: T.accent },
  title:   { fontSize: 15, fontWeight: '600', color: T.text, letterSpacing: -0.2 },

  stage: {
    alignItems:       'center',
    justifyContent:   'center',
    backgroundColor:  T.surface,
    marginHorizontal: 20,
    borderRadius:     28,
    paddingVertical:  44,
    borderWidth:      1,
    borderColor:      T.border,
    marginTop:        16,
  },

  controls: {
    flexDirection:     'row',
    gap:               10,
    paddingHorizontal: 20,
    marginTop:         24,
  },
  btn:      { flex: 1, paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnSec:   { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: T.border },
  btnCycle: { backgroundColor: '#22252f' },
  btnTxt:   { fontSize: 14, fontWeight: '600', color: T.text },

  note: {
    fontSize:          12,
    color:             'rgba(255,255,255,0.20)',
    textAlign:         'center',
    marginTop:         24,
    paddingHorizontal: 32,
    lineHeight:        18,
  },
});
