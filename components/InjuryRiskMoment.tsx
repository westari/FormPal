// ── InjuryRiskMoment — onboarding interstitial after "Your Training".
// "1,000,000 gym injuries hit the ER every year. Most are caused by bad
// form — the one thing you can control." Rebuilt from the HTML reference
// (screen 4 of 4). Replaces the old WeekDots (days-per-week dot row) — that
// recap reflected the days-per-week answer just given; this closing screen
// doesn't, so it was dropped in favor of matching the reference.
//
// assets/images/onboarding-er.jpg is the real reference photo (already
// grayscale-illustrated, matching the "faded black-and-white" look).
//
// Sequence: the 1,000,000 count-up runs first, on its own; only once it
// lands does the rest of the sentence fade in, word by word. The count
// itself uses LINEAR progress, not eased — an ease-out curve here front-
// loaded the growth so hard it visually reached ~500-600k within the first
// second, reading as "starting at 500k" instead of counting from 0.
//
// Image fills edge to edge via resizeMode="cover" in a flex:1 zone (an
// earlier "contain" version left visible white space on the sides/bottom).
// It fades in from white at the top (where it meets the text) and fades
// out to white again at the very bottom, instead of the photo just
// stopping at a hard edge.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ImageBackground, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FONT, Col } from '../constants/theme';
import OnboardingCTAFooter from './OnboardingCTAFooter';

const ER_IMAGE = require('../assets/images/onboarding-er.jpg');
const ACCENT = '#2E7DFF';

const COUNT_TARGET   = 1_000_000;
const COUNT_DURATION = 5200; // ms — "lasts longer" than the previous 4s
const WORD_STAGGER    = 65;  // ms between each word fading in
const WORD_FADE_DUR   = 240;
const WORDS_START_GAP = 200; // pause after the count lands before words start

function useCountUp(target: number, durationMs: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / durationMs);
      setValue(Math.round(target * p)); // linear — see header note on why not eased
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// One continuous word list spanning both sentences, so the stagger reads as
// a single reveal — not two separate groups popping in side by side.
const WORDS: { text: string; accent: boolean }[] = [
  ...'gym injuries hit the ER every year.'.split(' ').map(text => ({ text, accent: false })),
  ...'Most are caused by bad form — the one thing you can control.'.split(' ').map(text => ({ text, accent: true })),
];

export default function InjuryRiskMoment({ header, insets, onContinue }: {
  header: React.ReactNode;
  insets: { top: number; bottom: number };
  onContinue: () => void;
}) {
  const countOpacity = useRef(new Animated.Value(0)).current;
  const countY       = useRef(new Animated.Value(14)).current;
  const wordOpacities = useRef(WORDS.map(() => new Animated.Value(0))).current;
  const imageOpacity  = useRef(new Animated.Value(0)).current;
  const count = useCountUp(COUNT_TARGET, COUNT_DURATION);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(countOpacity, { toValue: 1, duration: 420, delay: 150, useNativeDriver: true }),
      Animated.timing(countY,       { toValue: 0, duration: 420, delay: 150, useNativeDriver: true }),
    ]).start();
    Animated.timing(imageOpacity, { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }).start();

    Animated.sequence([
      Animated.delay(COUNT_DURATION + WORDS_START_GAP),
      Animated.stagger(WORD_STAGGER, wordOpacities.map(o =>
        Animated.timing(o, { toValue: 1, duration: WORD_FADE_DUR, useNativeDriver: true })
      )),
    ]).start();
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {header}

      <View style={styles.textWrap}>
        <Animated.Text style={[styles.countLine, { opacity: countOpacity, transform: [{ translateY: countY }] }]}>
          {count.toLocaleString('en-US')}
        </Animated.Text>
        <Text style={styles.statement}>
          {WORDS.map((w, i) => (
            <Animated.Text
              key={i}
              style={[w.accent && styles.statementAccent, { opacity: wordOpacities[i] }]}
            >
              {w.text}{' '}
            </Animated.Text>
          ))}
        </Text>
      </View>

      <Animated.View style={[styles.imageZone, { opacity: imageOpacity }]}>
        <ImageBackground source={ER_IMAGE} resizeMode="cover" style={StyleSheet.absoluteFillObject}>
          <LinearGradient
            colors={['rgba(251,251,253,0.9)', 'rgba(251,251,253,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.fadeTop}
          />
          <LinearGradient
            colors={['rgba(251,251,253,0)', 'rgba(251,251,253,0.85)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.fadeBottom}
          />
        </ImageBackground>
      </Animated.View>

      <OnboardingCTAFooter onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  textWrap: { paddingHorizontal: 32, paddingTop: 16, alignItems: 'center' },
  countLine: {
    fontFamily: FONT.displayBold, fontSize: 42, lineHeight: 48,
    color: ACCENT, letterSpacing: -1, textAlign: 'center', marginBottom: 8,
  },
  statement: {
    fontFamily: FONT.display, fontSize: 21, lineHeight: 28,
    color: Col.text, letterSpacing: -0.4, textAlign: 'center',
  },
  statementAccent: { color: ACCENT },

  imageZone: { flex: 1, marginTop: 8 },
  fadeTop:    { position: 'absolute', left: 0, right: 0, top: 0, height: 56 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 },
});
