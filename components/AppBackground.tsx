/**
 * components/AppBackground.tsx
 *
 * The light, airy "gradient + soft blobs" background first built for
 * app/recap.tsx (see its own BgGradient — a full palette swap from this
 * app's default dark theme, deliberate: "a bright, airy gradient (soft
 * blue → lavender → mint → peach) with white frosted-glass panels floating
 * on top"). Extracted here so a SECOND screen (app/(tabs)/plus.tsx, which
 * had a plain solid black background — reported as inconsistent with the
 * recap/after-workout screens' premium light look) can use the exact same
 * treatment without hand-copying the gradient+blob SVG a second time.
 *
 * NOT wired into recap.tsx itself — that file's own local BgGradient is
 * untouched. Recap wasn't part of the ask that created this component, and
 * swapping its internals for a shared one is a separate, unrequested
 * refactor; the two happen to render identically today because the colors
 * below are copied from recap's own C.bgTop/bgMid1/bgMid2/bgBottom/
 * blobIndigo/blobTeal/blobCoral verbatim, not re-derived.
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const BG_TOP    = '#EDF1FB';
const BG_MID_1  = '#E4EAFA';
const BG_MID_2  = '#EAF3F4';
const BG_BOTTOM = '#F6EFE9';
const BLOB_INDIGO = 'rgba(96,116,255,0.55)';
const BLOB_TEAL   = 'rgba(64,206,190,0.48)';
const BLOB_CORAL  = 'rgba(255,167,116,0.42)';

export default function AppBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[BG_TOP, BG_MID_1, BG_MID_2, BG_BOTTOM]}
        locations={[0, 0.38, 0.7, 1]}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="appBgBlobIndigo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={BLOB_INDIGO} stopOpacity={1} />
            <Stop offset="100%" stopColor={BLOB_INDIGO} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="appBgBlobTeal" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={BLOB_TEAL} stopOpacity={1} />
            <Stop offset="100%" stopColor={BLOB_TEAL} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="appBgBlobCoral" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={BLOB_CORAL} stopOpacity={1} />
            <Stop offset="100%" stopColor={BLOB_CORAL} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={SCREEN_W * 0.05} cy={SCREEN_H * 0.02} r={SCREEN_W * 0.62} fill="url(#appBgBlobIndigo)" />
        <Circle cx={SCREEN_W * 1.05} cy={SCREEN_H * 0.32} r={SCREEN_W * 0.56} fill="url(#appBgBlobTeal)" />
        <Circle cx={SCREEN_W * -0.05} cy={SCREEN_H * 0.92} r={SCREEN_W * 0.58} fill="url(#appBgBlobCoral)" />
      </Svg>
    </View>
  );
}
