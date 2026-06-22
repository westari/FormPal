import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, Path, Line } from 'react-native-svg';

const FB_GOOD_FILL = '#15803D';
const FB_GOOD_RING = '#4ADE80';
const FB_BAD_FILL  = '#B91C1C';
const FB_BAD_RING  = '#F87171';

const SVG_SZ    = 200;
const SVG_C     = 100;
const DISC_R    = 72;
const RING_R    = 88;
const RING_CIRC = 2 * Math.PI * RING_R;
const PC        = 24;

const AnimatedSvgCircle = Animated.createAnimatedComponent(Circle);

function getCue(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes('shallow') || r.includes('deeper')) return 'GO DEEPER';
  if (r.includes('hip'))                              return 'SIT BACK';
  if (r.includes('form'))                             return 'FIX FORM';
  const clean = reason.replace(/[^a-zA-Z\s]/g, '').toUpperCase().slice(0, 12).trim();
  return clean || 'FIX FORM';
}

export default function RepFeedback({
  good,
  reason,
  onComplete,
}: {
  good: boolean;
  reason: string;
  onComplete: () => void;
}) {
  const fillColor = good ? FB_GOOD_FILL : FB_BAD_FILL;
  const ringColor = good ? FB_GOOD_RING : FB_BAD_RING;
  const mounted   = useRef(true);

  const masterOpacity = useRef(new Animated.Value(1)).current;
  const scaleAnim     = useRef(new Animated.Value(0)).current;
  const ringProgress  = useRef(new Animated.Value(0)).current;

  const particles = useRef(
    Array.from({ length: PC }, () => ({
      ty:     new Animated.Value(0),
      op:     new Animated.Value(0),
      startX: (Math.random() - 0.5) * 170,
      size:   6 + Math.random() * 18,
      delay:  Math.random() * 450,
      dur:    700 + Math.random() * 450,
      rise:   -(100 + Math.random() * 140),
    }))
  ).current;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    mounted.current = true;

    Animated.spring(scaleAnim, {
      toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true,
    }).start();

    Animated.timing(ringProgress, {
      toValue: 1, duration: 560, delay: 60, useNativeDriver: false,
    }).start();

    particles.forEach(p => {
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.timing(p.ty, { toValue: p.rise, duration: p.dur, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(p.op, { toValue: 0.9,  duration: 120, useNativeDriver: true }),
            Animated.delay(Math.max(0, p.dur - 420)),
            Animated.timing(p.op, { toValue: 0,    duration: 300, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    });

    const hold = good ? 900 : 1100;
    Animated.sequence([
      Animated.delay(hold),
      Animated.timing(masterOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start(() => { if (mounted.current) onComplete(); });

    return () => { mounted.current = false; };
  }, []);

  const dashOffset = ringProgress.interpolate({
    inputRange: [0, 1], outputRange: [RING_CIRC, 0],
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, fb.overlay, { opacity: masterOpacity }]}
      pointerEvents="none"
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map((p, i) => (
          <View
            key={i}
            style={{
              position:   'absolute',
              left:       '50%' as any,
              top:        '54%' as any,
              marginLeft: p.startX - p.size / 2,
              marginTop:  -(p.size / 2),
            }}
          >
            <Animated.View
              style={{
                width:           p.size,
                height:          p.size,
                borderRadius:    p.size / 2,
                backgroundColor: ringColor,
                opacity:         p.op,
                transform:       [{ translateY: p.ty }],
              }}
            />
          </View>
        ))}
      </View>

      <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
        <Svg width={SVG_SZ} height={SVG_SZ} viewBox={`0 0 ${SVG_SZ} ${SVG_SZ}`}>
          <Circle cx={SVG_C} cy={SVG_C} r={DISC_R} fill={fillColor} />
          <Circle
            cx={SVG_C} cy={SVG_C} r={RING_R}
            fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={4}
          />
          <AnimatedSvgCircle
            cx={SVG_C} cy={SVG_C} r={RING_R}
            fill="none"
            stroke={ringColor}
            strokeWidth={5}
            strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            originX={SVG_C}
            originY={SVG_C}
          />
          {good ? (
            <Path
              d="M 62 102 L 88 128 L 140 68"
              stroke="white"
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : (
            <>
              <Line x1={70} y1={70} x2={130} y2={130} stroke="white" strokeWidth={12} strokeLinecap="round" />
              <Line x1={130} y1={70} x2={70}  y2={130} stroke="white" strokeWidth={12} strokeLinecap="round" />
            </>
          )}
        </Svg>

        {!good && (
          <View style={fb.cuePill}>
            <Text style={fb.cueText}>{getCue(reason)}</Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const fb = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center' },
  cuePill: {
    marginTop:         16,
    paddingHorizontal: 26,
    paddingVertical:   11,
    borderRadius:      100,
    backgroundColor:   'rgba(0,0,0,0.55)',
    borderWidth:       StyleSheet.hairlineWidth,
    borderColor:       'rgba(255,255,255,0.22)',
  },
  cueText: {
    fontSize:         26,
    fontWeight:       '800',
    color:            'white',
    letterSpacing:    2,
    textAlign:        'center',
    textShadowColor:  'rgba(0,0,0,0.70)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
