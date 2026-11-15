/**
 * components/DoneScreen.tsx
 *
 * THE ONE shared "done" screen (Ari 2026-11-15). White background, a green circle that draws itself (slow and smooth), then a check that draws
 * inside it, then the title fades up in SF Pro semibold, an optional grey line under it, a success haptic when the check finishes, about 1.5
 * seconds, tap to skip. Used everywhere a thing is done, so they all look the same.
 *
 *   variant "small"    check + title (e.g. "Workout saved"). Window A switches Create workout, Session logged, weight and photo to it.
 *   variant "workout"  check + "Workout complete" (or "Form check complete") + the reps counting up live
 *   variant "streak"   the streak flame grows, "3-day streak" (the real number), "Come back tomorrow to keep it going."
 *
 * It fills its parent (absolute) and calls onFinish ONCE: when it has finished (about 1.7 s) or the user taps. The timeline lives in
 * lib/doneTimeline.ts (pure, tested). Uses the system font (SF Pro on iOS) on purpose.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SymbolView } from 'expo-symbols';
import { hapticSuccess } from '../lib/haptics';
import { doneFrame, doneWords, DONE_TIMES, type DoneVariant } from '../lib/doneTimeline';

const GREEN = '#30D158';
const SIZE = 132, STROKE = 6, R = (SIZE - STROKE) / 2, CIRC = 2 * Math.PI * R;
const CHECK_D = 'M 38 68 L 58 88 L 94 46';   // in the 132 x 132 box
const CHECK_LEN = 28 + 54;                      // the two legs, about 82

export interface DoneScreenProps {
  variant: DoneVariant;
  title?: string;
  subtitle?: string;
  /** workout variant: the rep total that counts up */
  reps?: number;
  /** streak variant: the real streak number */
  streak?: number;
  /** called once when it is finished (or tapped) */
  onFinish: () => void;
  /** a success haptic when the check finishes (default true) */
  haptic?: boolean;
}

export default function DoneScreen({ variant, title, subtitle, reps = 0, streak = 1, onFinish, haptic = true }: DoneScreenProps) {
  const words = doneWords(variant, { title, subtitle, streak });
  const [t, setT] = useState(0);
  const finished = useRef(false);
  const buzzed = useRef(false);
  const finish = () => { if (finished.current) return; finished.current = true; onFinish(); };

  useEffect(() => {
    let raf = 0; const t0 = Date.now(); let alive = true;
    const tick = () => {
      if (!alive) return;
      const el = Date.now() - t0;
      setT(Math.min(el, DONE_TIMES.total));
      if (el >= DONE_TIMES.total + DONE_TIMES.hold) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const f = doneFrame(t, { reps });
  useEffect(() => { if (f.hapticDue && !buzzed.current) { buzzed.current = true; if (haptic) hapticSuccess(); } }, [f.hapticDue, haptic]);

  return (
    <Pressable
      style={styles.root}
      onPress={() => { if (!buzzed.current && haptic) { buzzed.current = true; hapticSuccess(); } finish(); }}
      accessibilityRole="button"
      accessibilityLabel={words.title}
    >
      <View style={styles.center}>
        {variant === 'streak' ? (
          <View style={[styles.flameBox, { transform: [{ scale: Math.max(0.01, f.flame) }] }]}>
            <SymbolView name="flame.fill" size={112} tintColor="#FF9500" type="monochrome" style={{ width: 112, height: 112 }} />
          </View>
        ) : (
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Circle
              cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={GREEN} strokeWidth={STROKE} fill="none" strokeLinecap="round"
              strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={CIRC * (1 - f.circle)} transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
            <Path
              d={CHECK_D} stroke={GREEN} strokeWidth={STROKE + 1} fill="none" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`} strokeDashoffset={CHECK_LEN * (1 - f.check)}
            />
          </Svg>
        )}
        <Text style={[styles.title, { opacity: f.titleOpacity, transform: [{ translateY: f.titleRise }] }]}>{words.title}</Text>
        {variant === 'workout' ? (
          <Text style={[styles.count, { opacity: f.titleOpacity }]}>
            {f.count}<Text style={styles.countUnit}>{f.count === 1 ? ' rep' : ' reps'}</Text>
          </Text>
        ) : null}
        {words.subtitle ? <Text style={[styles.sub, { opacity: f.subOpacity }]}>{words.subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#ffffff', zIndex: 1000, elevation: 1000 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  flameBox: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  // no fontFamily on purpose: the system font is SF Pro on iOS
  title: { marginTop: 28, fontSize: 28, fontWeight: '600', letterSpacing: -0.4, color: '#111114', textAlign: 'center' },
  count: { marginTop: 14, fontSize: 56, fontWeight: '600', letterSpacing: -1.2, color: '#111114', fontVariant: ['tabular-nums'] },
  countUnit: { fontSize: 20, fontWeight: '500', letterSpacing: 0, color: '#8a8a93' },
  sub: { marginTop: 10, fontSize: 16, fontWeight: '400', color: '#8a8a93', textAlign: 'center', lineHeight: 22 },
});
