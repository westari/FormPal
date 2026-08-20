// ── EffortResultsMoment — onboarding interstitial after "Your Goal".
// "Effort you put in vs. results you get." Rebuilt from the HTML reference
// (screen 2 of 4): two fill bars — effort settles at 100%, results settles
// at 40% — with the percentage readouts scrambling through random digits
// before landing, same as the reference's `scramble()` helper. Replaces the
// old ComparisonMoment (bad-form/good-form pill towers) — same underlying
// point (form determines how much of your effort actually counts), new
// visual language matching the reference exactly.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated } from 'react-native';
import { FONT, Col, R, Elev } from '../constants/theme';
import OnboardingCTAFooter from './OnboardingCTAFooter';

const ACCENT = '#2E7DFF';
const EFFORT_PCT  = 100;
const RESULTS_PCT = 40;
const TRACK_BG = '#EDEDF1';

// Scrambles through random 0-99 values for `scrambleMs`, then settles on
// `target` — mirrors the HTML reference's setInterval/setTimeout scramble
// exactly, just as a hook instead of DOM text writes.
function useScramble(target: number, delayMs: number, scrambleMs = 900) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let tickId: ReturnType<typeof setInterval> | undefined;
    const startId = setTimeout(() => {
      tickId = setInterval(() => setDisplay(Math.floor(Math.random() * 100)), 40);
    }, delayMs);
    const settleId = setTimeout(() => {
      if (tickId) clearInterval(tickId);
      setDisplay(target);
    }, delayMs + scrambleMs);
    return () => { clearTimeout(startId); clearTimeout(settleId); if (tickId) clearInterval(tickId); };
  }, [target, delayMs, scrambleMs]);
  return display;
}

export default function EffortResultsMoment({ header, insets, onContinue }: {
  header: React.ReactNode;
  insets: { top: number; bottom: number };
  onContinue: () => void;
}) {
  const headlineOpacity = useRef(new Animated.Value(0)).current;
  const headlineY       = useRef(new Animated.Value(10)).current;
  const cardOpacity     = useRef(new Animated.Value(0)).current;
  const effortFill      = useRef(new Animated.Value(0)).current;
  const resultsFill     = useRef(new Animated.Value(0)).current;
  const leftOnTableOpacity = useRef(new Animated.Value(0)).current;
  const captionOpacity  = useRef(new Animated.Value(0)).current;
  const captionY        = useRef(new Animated.Value(12)).current;

  const effortDisplay  = useScramble(EFFORT_PCT, 400);
  const resultsDisplay = useScramble(RESULTS_PCT, 400);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headlineOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(headlineY,       { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
    Animated.timing(cardOpacity, { toValue: 1, duration: 400, delay: 150, useNativeDriver: true }).start();

    Animated.timing(effortFill,  { toValue: 1, duration: 1100, delay: 450, useNativeDriver: false }).start();
    Animated.timing(resultsFill, { toValue: 1, duration: 1100, delay: 450, useNativeDriver: false }).start();

    Animated.timing(leftOnTableOpacity, { toValue: 1, duration: 380, delay: 1650, useNativeDriver: true }).start();
    Animated.parallel([
      Animated.timing(captionOpacity, { toValue: 1, duration: 420, delay: 2000, useNativeDriver: true }),
      Animated.timing(captionY,       { toValue: 0, duration: 420, delay: 2000, useNativeDriver: true }),
    ]).start();
  }, []);

  const effortWidth  = effortFill.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${EFFORT_PCT}%`] });
  const resultsWidth = resultsFill.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${RESULTS_PCT}%`] });

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.Text style={[styles.headline, { opacity: headlineOpacity, transform: [{ translateY: headlineY }] }]}>
          Effort you put in vs. results you get.
        </Animated.Text>

        <Animated.View style={[styles.card, { opacity: cardOpacity }]}>
          <View style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.rowLabel}>Effort you put in</Text>
              <Text style={[styles.rowPct, { color: ACCENT }]}>{effortDisplay}%</Text>
            </View>
            <View style={styles.track}>
              <Animated.View style={[styles.fill, { width: effortWidth, backgroundColor: ACCENT }]} />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.rowLabel}>Results you get</Text>
              <Text style={styles.rowPct}>{resultsDisplay}%</Text>
            </View>
            <View style={styles.track}>
              <Animated.View style={[styles.fill, { width: resultsWidth, backgroundColor: Col.text }]} />
            </View>
            <Animated.View style={[styles.leftOnTableRow, { opacity: leftOnTableOpacity }]}>
              <View style={styles.divider} />
              <Text style={styles.leftOnTable}>60% left on the table</Text>
            </Animated.View>
          </View>
        </Animated.View>

        <Animated.Text style={[styles.caption, { opacity: captionOpacity, transform: [{ translateY: captionY }] }]}>
          Good form is what turns effort into real muscle.
        </Animated.Text>
      </ScrollView>
      <OnboardingCTAFooter onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 140 },

  headline: {
    fontFamily: FONT.display, fontSize: 27, lineHeight: 33,
    color: Col.text, letterSpacing: -0.6, marginBottom: 20,
  },

  card: {
    backgroundColor: Col.card, borderRadius: R.card,
    borderWidth: 1, borderColor: 'rgba(17,24,39,0.06)',
    padding: 22, gap: 30, ...({ boxShadow: Elev.medium.shadow } as any),
  },
  row: {},
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  rowLabel: { fontFamily: FONT.display, fontSize: 18, color: Col.text, letterSpacing: -0.3 },
  rowPct:   { fontFamily: FONT.display, fontSize: 17, color: Col.text, fontVariant: ['tabular-nums'] },
  track: { height: 40, borderRadius: 20, backgroundColor: TRACK_BG, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 20 },

  leftOnTableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 10 },
  divider: { width: 26, height: 1, backgroundColor: 'rgba(17,24,39,0.14)' },
  leftOnTable: { fontFamily: FONT.display, fontSize: 14, color: Col.textSub, letterSpacing: -0.1 },

  caption: {
    fontFamily: FONT.display, fontSize: 23, color: ACCENT,
    letterSpacing: -0.5, textAlign: 'center', lineHeight: 30,
    marginTop: 32, paddingHorizontal: 6,
  },
});
