/**
 * components/onboarding/FormPalLogo.tsx
 *
 * The FormPal mark and wordmark, in white, for dark screens. The mark is the app icon's disc (assets/images/icon.png is a plain dark disc) drawn in white with
 * a small cut-out dot, then "FormPal" in the app's heavy font. (There is no other FormPal logo file in the project; when a final logo exists, replace the
 * Svg below and nothing else changes.)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { PJS } from '../../constants/theme';

export default function FormPalLogo({ size = 34 }: { size?: number }) {
  return (
    <View style={s.row} accessibilityRole="image" accessibilityLabel="FormPal">
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Defs>
          <LinearGradient id="fpDisc" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="1" stopColor="#d9dbe3" />
          </LinearGradient>
        </Defs>
        <Circle cx={20} cy={20} r={17} fill="url(#fpDisc)" />
        <Circle cx={27.5} cy={12.5} r={4.2} fill="#0d0d11" />
      </Svg>
      <Text style={[s.word, { fontSize: size * 1.02, lineHeight: size * 1.25 }]}>FormPal</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { fontFamily: PJS.extrabold, color: '#ffffff', letterSpacing: -1 },
});
