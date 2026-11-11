/**
 * components/SavedCheck.tsx
 *
 * A short "it worked" moment: a green check pops in over a white screen with a line of words ("Workout saved"), holds for a
 * beat, then calls onDone so the screen can leave. Drawn natively over the design page (the design file itself is untouched).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

export const SAVED_CHECK_HOLD_MS = 950;

export default function SavedCheck({ text, onDone }: { text: string; onDone: () => void }) {
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.6)).current;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => done.current(), SAVED_CHECK_HOLD_MS);
    return () => clearTimeout(t);
  }, [fade, pop]);
  return (
    <Animated.View style={[s.wrap, { opacity: fade }]} pointerEvents="auto" testID="saved-check">
      <Animated.View style={{ transform: [{ scale: pop }], alignItems: 'center', gap: 18 }}>
        <View style={s.disc}>
          <SymbolView name="checkmark" size={44} tintColor="#ffffff" weight="bold" type="monochrome" style={{ width: 44, height: 44 }} />
        </View>
        <Text style={s.text}>{text}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  disc: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#34c759', alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, letterSpacing: -0.4, color: '#111114' },
});
