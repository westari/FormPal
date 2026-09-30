/**
 * components/onboarding/TryForFreeScreen.tsx
 *
 * "Try FormPal for free" — comes right after Save your progress. Plays the
 * demo clip (assets/videos/demovid.mov) in a rounded card. Same design
 * language as planisreadynow / the rank screens. CTA advances into the
 * existing trial-timeline / paywall pages, which own the real pricing.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { LiquidGlassButton } from '../LiquidGlass';
import { PJS } from '../../constants/theme';

const DEMO_VIDEO = require('../../assets/videos/demovid.mov');

export default function TryForFreeScreen({
  topInset,
  onAdvance,
  onBack,
}: {
  topInset: number;
  onAdvance: () => void;
  onBack: () => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const player = useVideoPlayer(DEMO_VIDEO, (p) => { p.loop = true; p.muted = true; p.play(); });

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAdvance();
  };

  return (
    // root carries the opaque white background and is NEVER animated — opacity
    // on the same view as the white bg fades the background out too, exposing
    // the Stack navigator's dark contentStyle behind it as a black flash.
    <View style={[s.root, { paddingTop: topInset }]}>
    <Animated.View style={{ flex: 1, opacity: fade }}>
      <Animated.View style={[s.backWrap, { top: topInset + 8 }]} pointerEvents="box-none">
        <LiquidGlassButton
          onPress={() => { Haptics.selectionAsync(); onBack(); }}
          hitSlop={12}
          radius={17}
          variant="regular"
          fallbackColor="rgba(255,255,255,0.92)"
          style={s.backBtn}
        >
          <SymbolView name="chevron.left" size={15} tintColor="#1b1f27" type="monochrome" style={{ width: 15, height: 15 }} />
        </LiquidGlassButton>
      </Animated.View>

      <View style={s.body}>
        <View style={s.videoCard}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        </View>

        <Text style={s.h1}>Try FormPal for free</Text>
        <Text style={s.sub}>
          Full access to your plan and live form-check for 3 days. We'll remind you before it ends — cancel anytime.
        </Text>
      </View>

      <View style={s.footer}>
        <Pressable style={s.cta} onPress={start}>
          <Text style={s.ctaTxt}>Start my free trial</Text>
        </Pressable>
        <Text style={s.foot}>No charge today. Cancel anytime before the trial ends.</Text>
      </View>
    </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },

  backWrap: { position: 'absolute', left: 20, zIndex: 30 },
  backBtn: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)',
    ...({ boxShadow: '0px 2px 8px rgba(0,0,0,0.10)' } as any),
  },

  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  videoCard: {
    width: '100%', aspectRatio: 5 / 6, maxHeight: '58%',
    borderRadius: 26, overflow: 'hidden', backgroundColor: '#0b0b0d',
    marginBottom: 26,
    ...({ boxShadow: '0px 22px 44px -22px rgba(17,17,20,0.45)' } as any),
  },
  h1: { fontFamily: PJS.extrabold, fontSize: 28, color: '#111114', letterSpacing: -1, textAlign: 'center', lineHeight: 32 },
  sub: { fontFamily: PJS.semibold, fontSize: 13.5, color: '#6e6e77', textAlign: 'center', paddingTop: 8, lineHeight: 19, maxWidth: 320, alignSelf: 'center' },

  footer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 26, gap: 9 },
  cta: {
    width: '100%', height: 58, borderRadius: 999, backgroundColor: '#111114',
    alignItems: 'center', justifyContent: 'center',
    ...({ boxShadow: '0px 16px 30px -16px rgba(17,17,20,0.6)' } as any),
  },
  ctaTxt: { fontFamily: PJS.bold, fontSize: 16.5, color: '#fff', letterSpacing: -0.2 },
  foot: { fontFamily: PJS.semibold, fontSize: 11.5, color: '#6e6e77', textAlign: 'center' },
});
