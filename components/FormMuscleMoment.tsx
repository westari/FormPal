// ── FormMuscleMoment — onboarding interstitial after "Your Experience".
// Rebuilt from the HTML reference (screen 3 of 4), then reworked per
// explicit follow-up feedback: dropped the "Poor form vs. good form."
// headline and the "2x" badge entirely, promoted the caption ("Engaging
// your muscles...") to the top as the lead text, and let the photo fill
// essentially the whole screen — edge to edge, no horizontal margin, no
// bottom margin (it runs behind the footer button same as InjuryRiskMoment
// does), only a small gap at the very top under the caption. resizeMode is
// "cover" here (not InjuryRiskMoment's "contain") specifically because the
// ask was zero white space on the sides — cover guarantees no letterboxing,
// at the cost of some cropping, which is what was wanted this time.
//
// assets/images/onboarding-bicep.jpg is the reference photo — drop a
// replacement at that exact path and it picks it up automatically, no code
// change needed.
import React, { useEffect, useRef } from 'react';
import { View, Text, ImageBackground, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FONT, Col } from '../constants/theme';
import OnboardingCTAFooter from './OnboardingCTAFooter';

const BICEP_IMAGE = require('../assets/images/onboarding-bicep.jpg');
const ACCENT = '#2E7DFF';
// Neutral grey close to the photo's own tone, so the bottom fade blends
// into it rather than cutting to white against a grayscale image.
const IMAGE_GREY = '#C9C9CE';

export default function FormMuscleMoment({ header, insets, onContinue }: {
  header: React.ReactNode;
  insets: { top: number; bottom: number };
  onContinue: () => void;
}) {
  const captionOpacity = useRef(new Animated.Value(0)).current;
  const captionY       = useRef(new Animated.Value(10)).current;
  const sourceOpacity  = useRef(new Animated.Value(0)).current;
  const imageOpacity   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(captionOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(captionY,       { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
    Animated.timing(sourceOpacity, { toValue: 1, duration: 380, delay: 250, useNativeDriver: true }).start();
    Animated.timing(imageOpacity,  { toValue: 1, duration: 420, delay: 200, useNativeDriver: true }).start();
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {header}

      <Animated.Text style={[styles.caption, { opacity: captionOpacity, transform: [{ translateY: captionY }] }]}>
        Engaging your muscles with correct form builds nearly{' '}
        <Text style={styles.captionAccent}>2x the muscle</Text>.
      </Animated.Text>
      <Animated.Text style={[styles.source, { opacity: sourceOpacity }]}>Schoenfeld et al., 2018</Animated.Text>

      <Animated.View style={[styles.imageZone, { opacity: imageOpacity }]}>
        <ImageBackground source={BICEP_IMAGE} resizeMode="cover" style={StyleSheet.absoluteFillObject}>
          <LinearGradient
            colors={['rgba(201,201,206,0)', IMAGE_GREY]}
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
  caption: {
    fontFamily: FONT.display, fontSize: 28, color: Col.text,
    letterSpacing: -0.6, textAlign: 'center', lineHeight: 35,
    paddingHorizontal: 24, paddingTop: 32,
  },
  captionAccent: { color: ACCENT },
  source: { fontFamily: FONT.display, fontSize: 13, color: Col.textDim, textAlign: 'center', marginTop: 8 },

  // Edge to edge (no horizontal padding), runs to the bottom of the screen
  // behind the footer button — only the small gap above (from source's own
  // marginTop) separates it from the text.
  imageZone: { flex: 1, marginTop: 14 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 90 },
});
