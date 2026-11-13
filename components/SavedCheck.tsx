/**
 * components/SavedCheck.tsx
 *
 * The short "it worked" moment after Save ("Workout saved", "Session logged"). About one second, all natively drawn over the
 * design page (the design file itself is untouched):
 *   0 - 300 ms   a clean white wash sweeps up from the bottom of the screen (curved leading edge) and covers the page
 *   200 - 620 ms a green ring draws itself, then the check mark draws itself inside it
 *   520 - 780 ms the words fade up
 *   1000 ms      onDone, so the screen can leave
 * The success haptic is played by the screen at the moment Save is pressed (hapticSuccess in create-workout / log-session).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export const SAVED_CHECK_HOLD_MS = 1000;
/** Where each part of the moment starts and ends (ms). Exported so a test can check the order. */
export const SAVED_CHECK_TIMELINE = { washStart: 0, washEnd: 300, ringStart: 200, ringEnd: 440, checkStart: 420, checkEnd: 620, textStart: 520, textEnd: 780 };

const GREEN = '#34c759';
const RING_R = 42;
const RING_LEN = 2 * Math.PI * RING_R;
const CHECK_PATH = 'M 31 51 L 44 64 L 70 36';
const CHECK_LEN = Math.hypot(13, 13) + Math.hypot(26, 28) + 0.5; // the exact length of the two strokes, so the draw runs for the whole time

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function SavedCheck({ text, onDone }: { text: string; onDone: () => void }) {
  const { height } = useWindowDimensions();
  const T = SAVED_CHECK_TIMELINE;
  const wash = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    Animated.timing(wash, { toValue: 1, duration: T.washEnd - T.washStart, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.timing(ring, { toValue: 1, delay: T.ringStart, duration: T.ringEnd - T.ringStart, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start();
    Animated.timing(check, { toValue: 1, delay: T.checkStart, duration: T.checkEnd - T.checkStart, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    Animated.timing(words, { toValue: 1, delay: T.textStart, duration: T.textEnd - T.textStart, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const t = setTimeout(() => done.current(), SAVED_CHECK_HOLD_MS);
    return () => clearTimeout(t);
  }, [wash, ring, check, words, T]);

  const rise = height + 140;
  const washY = wash.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] });
  const ringOffset = ring.interpolate({ inputRange: [0, 1], outputRange: [RING_LEN, 0] });
  const checkOffset = check.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LEN, 0] });
  const wordsY = words.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <View style={s.wrap} pointerEvents="auto" testID="saved-check">
      {/* the white wash: a panel a little taller than the screen with a curved top edge, so its leading edge is soft */}
      <Animated.View style={[s.panel, { top: -60, height: height + 120, transform: [{ translateY: washY }] }]} />
      <View style={s.center} pointerEvents="none">
        <Svg width={100} height={100} viewBox="0 0 100 100">
          <AnimatedCircle
            cx={50} cy={50} r={RING_R} fill="none" stroke={GREEN} strokeWidth={6} strokeLinecap="round"
            strokeDasharray={`${RING_LEN} ${RING_LEN}`} strokeDashoffset={ringOffset as any}
            transform="rotate(-90 50 50)"
          />
          <AnimatedPath
            d={CHECK_PATH} fill="none" stroke={GREEN} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`} strokeDashoffset={checkOffset as any}
          />
        </Svg>
        <Animated.Text style={[s.text, { opacity: words, transform: [{ translateY: wordsY }] }]}>{text}</Animated.Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 50, overflow: 'hidden' },
  panel: { position: 'absolute', left: 0, right: 0, backgroundColor: '#ffffff', borderTopLeftRadius: 44, borderTopRightRadius: 44 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 20 },
  text: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, letterSpacing: -0.4, color: '#111114' },
});
