/**
 * components/onboarding/RankRevealScreen.tsx
 *
 * Native rebuild of the rankreveal2.html artboard — "Something's sealed in
 * here" → tap to crack the bronze shield open → your rank. Was a WebView;
 * now real RN so it runs at 60fps, has proper haptics, and transitions in
 * instantly. Design matches the artboard (Plus Jakarta Sans, the amber
 * glow, the progress bar, the 44px rank name, the black pill CTA).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { LiquidGlassButton } from '../LiquidGlass';
import { PJS } from '../../constants/theme';

// The 4 "% to gold" shells are the tap-to-crack theatre only; the reveal
// lands on the real, uncovered Bronze emblem.
const SHIELDS = [
  require('../../assets/ranks/0percent.webp'),
  require('../../assets/ranks/25percent.webp'),
  require('../../assets/ranks/50percent.webp'),
  require('../../assets/ranks/75percent.webp'),
];
const EMBLEM = require('../../assets/ranks/bronze.png');

const TIER: Record<string, string> = {
  Beginner: 'I',
  'Some experience': 'II',
  Intermediate: 'III',
  Advanced: 'IV',
};

const TAPS_TO_REVEAL = 9; // 3 hits per crack stage, 3 stages to fully cracked
const CHIP_COUNT = 16;
const CHIP_COLORS = ['#6d6a67', '#4d4a48', '#8b8683', '#a9743f'];

function narrationFor(taps: number): string {
  if (taps === 0) return "Something's sealed in here.";
  if (taps < 5) return 'Keep going.';
  return 'Almost there.';
}

export default function RankRevealScreen({
  answers,
  topInset,
  onAdvance,
  onBack,
}: {
  answers: Record<string, any>;
  topInset: number;
  onAdvance: () => void;
  onBack: () => void;
}) {
  const rankName = `Bronze ${TIER[answers?.experience as string] ?? 'II'}`;

  const [taps, setTaps] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const stage = Math.min(3, Math.floor(taps / 3));

  // ── animated values ──────────────────────────────────────────────────────
  const float = useRef(new Animated.Value(0)).current;      // idle bob
  const shake = useRef(new Animated.Value(0)).current;      // hit shake
  const barW = useRef(new Animated.Value(0)).current;       // progress 0..1
  const flash = useRef(new Animated.Value(0)).current;      // white pop
  const halo = useRef(new Animated.Value(0)).current;       // reveal halo
  const ring = useRef(new Animated.Value(0)).current;       // shock ring
  const warmBg = useRef(new Animated.Value(0)).current;     // page warms
  const nameIn = useRef(new Animated.Value(0)).current;     // rank name pop
  const ctaIn = useRef(new Animated.Value(0)).current;      // CTA rise
  const backIn = useRef(new Animated.Value(0)).current;     // back button
  const emblemIn = useRef(new Animated.Value(0)).current;   // real emblem on reveal
  const frameOpacity = useRef(SHIELDS.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  const chips = useRef(
    Array.from({ length: CHIP_COUNT }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      o: new Animated.Value(0),
      r: new Animated.Value(0),
      size: 4 + Math.random() * 9,
      shade: CHIP_COLORS[Math.floor(Math.random() * CHIP_COLORS.length)],
      angle: Math.random() * Math.PI * 2,
    })),
  ).current;

  // idle bob loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    Animated.timing(backIn, { toValue: 1, duration: 300, delay: 260, useNativeDriver: true }).start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // crossfade shield frame when stage changes
  useEffect(() => {
    frameOpacity.forEach((v, i) =>
      Animated.timing(v, { toValue: i === stage ? 1 : 0, duration: 260, useNativeDriver: true }).start(),
    );
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const burstChips = (final: boolean) => {
    const n = final ? CHIP_COUNT : 8;
    chips.slice(0, n).forEach((c) => {
      const dist = (final ? 120 : 60) + Math.random() * (final ? 110 : 50);
      const dx = Math.cos(c.angle) * dist;
      const dy = Math.sin(c.angle) * dist * 0.8 + (final ? 60 : 34);
      c.x.setValue(0);
      c.y.setValue(0);
      c.o.setValue(1);
      c.r.setValue(0);
      Animated.parallel([
        Animated.timing(c.x, { toValue: dx, duration: final ? 900 : 620, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(c.y, { toValue: dy, duration: final ? 900 : 620, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(c.r, { toValue: (Math.random() - 0.5) * 3, duration: final ? 900 : 620, useNativeDriver: true }),
        Animated.timing(c.o, { toValue: 0, duration: final ? 900 : 620, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    });
  };

  const doShake = (final: boolean) => {
    const amp = final ? 9 : 5;
    Animated.sequence([
      Animated.timing(shake, { toValue: -amp, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: amp, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -amp * 0.5, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  };

  const doFlash = (final: boolean) => {
    flash.setValue(final ? 0.95 : 0.45);
    Animated.timing(flash, { toValue: 0, duration: final ? 620 : 300, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  const reveal = () => {
    setRevealed(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 90);
    }
    doFlash(true);
    burstChips(true);
    // Swap the cracked shell out, the real Bronze emblem in — fast, so the
    // rank appears (near-)instantly, not a second later.
    frameOpacity.forEach((v) => Animated.timing(v, { toValue: 0, duration: 160, useNativeDriver: true }).start());
    Animated.parallel([
      Animated.timing(emblemIn, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(halo, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(warmBg, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(nameIn, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
      Animated.timing(ctaIn, { toValue: 1, duration: 340, delay: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  const onTap = () => {
    if (revealed) return;
    const next = taps + 1;
    setTaps(next);
    const final = next >= TAPS_TO_REVEAL;
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(final ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    }
    Animated.timing(barW, { toValue: next / TAPS_TO_REVEAL, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    doShake(final);
    doFlash(final);
    burstChips(final);
    if (final) reveal();
  };

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [4, -7] });
  const floatR = float.interpolate({ inputRange: [0, 1], outputRange: ['-0.6deg', '0.6deg'] });

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      {/* warm wash that fades in on reveal */}
      <Animated.View pointerEvents="none" style={[s.warm, { opacity: warmBg.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) }]} />

      {/* back button */}
      <Animated.View style={[s.backWrap, { top: topInset + 8, opacity: backIn }]} pointerEvents="box-none">
        <LiquidGlassButton
          onPress={() => { void Haptics.selectionAsync(); onBack(); }}
          hitSlop={12}
          radius={17}
          variant="regular"
          fallbackColor="rgba(255,255,255,0.92)"
          style={s.backBtn}
        >
          <SymbolView name="chevron.left" size={15} tintColor="#1b1f27" type="monochrome" style={{ width: 15, height: 15 }} />
        </LiquidGlassButton>
      </Animated.View>

      {/* narration */}
      <View style={s.narrationWrap}>
        {!revealed && <Text style={s.narration}>{narrationFor(taps)}</Text>}
      </View>

      {/* stage */}
      <Pressable style={s.stageArea} onPress={onTap} disabled={revealed}>
        {/* reveal halo + shock ring */}
        <Animated.View
          pointerEvents="none"
          style={[
            s.halo,
            {
              opacity: halo.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.9, 0] }),
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.1] }) }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            s.ring,
            {
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1.9] }) }],
            },
          ]}
        />

        {/* shield frames (crack theatre) + the real emblem on reveal */}
        <Animated.View style={[s.shieldWrap, { transform: [{ translateX: shake }, { translateY: floatY }, { rotate: floatR }] }]}>
          {SHIELDS.map((src, i) => (
            <Animated.Image
              key={i}
              source={src}
              resizeMode="contain"
              style={[s.shieldImg, { opacity: frameOpacity[i] }]}
            />
          ))}
          <Animated.Image
            source={EMBLEM}
            resizeMode="contain"
            style={[s.shieldImg, { opacity: emblemIn, transform: [{ scale: emblemIn.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}
          />
        </Animated.View>

        {/* stone chips */}
        {chips.map((c, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: c.size,
              height: c.size * 0.8,
              borderRadius: 2,
              backgroundColor: c.shade,
              opacity: c.o,
              transform: [
                { translateX: c.x },
                { translateY: c.y },
                { rotate: c.r.interpolate({ inputRange: [-3, 3], outputRange: ['-540deg', '540deg'] }) },
              ],
            }}
          />
        ))}

        {/* white flash */}
        <Animated.View pointerEvents="none" style={[s.flash, { opacity: flash }]} />

        {/* rank name */}
        {revealed && (
          <Animated.Text
            style={[
              s.rankName,
              {
                opacity: nameIn,
                transform: [
                  { translateY: nameIn.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                  { scale: nameIn.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
                ],
              },
            ]}
          >
            {rankName}
          </Animated.Text>
        )}
      </Pressable>

      {/* progress bar (locked only) */}
      {!revealed && (
        <View style={s.barTrack}>
          <Animated.View style={[s.barFill, { width: barW.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </View>
      )}

      {/* footer */}
      <View style={s.footer}>
        {!revealed ? (
          <Text style={s.hint}>TAP TO REVEAL YOUR RANK</Text>
        ) : (
          <Animated.View style={{ opacity: ctaIn, transform: [{ translateY: ctaIn.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
            <Pressable style={s.cta} onPress={() => { void Haptics.selectionAsync(); onAdvance(); }}>
              <Text style={s.ctaTxt}>Continue</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff', overflow: 'hidden' },
  warm: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fdf0e2' },

  backWrap: { position: 'absolute', left: 20, zIndex: 30 },
  backBtn: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)',
    ...({ boxShadow: '0px 2px 8px rgba(0,0,0,0.10)' } as any),
  },

  narrationWrap: { minHeight: 64, paddingTop: 96, paddingHorizontal: 26, alignItems: 'center', justifyContent: 'center' },
  narration: {
    fontFamily: PJS.extrabold, fontSize: 22, color: '#111114',
    letterSpacing: -0.7, textAlign: 'center', lineHeight: 28,
  },

  stageArea: { flex: 1, minHeight: 400, alignItems: 'center', justifyContent: 'center' },

  halo: {
    position: 'absolute', width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(253,240,226,0.9)',
  },
  ring: {
    position: 'absolute', width: 230, height: 230, borderRadius: 115,
    borderWidth: 4, borderColor: 'rgba(214,140,74,0.4)',
  },

  shieldWrap: { width: 268, height: 268, alignItems: 'center', justifyContent: 'center' },
  shieldImg: { ...StyleSheet.absoluteFillObject, width: 268, height: 268 },

  flash: {
    position: 'absolute', width: 268, height: 268, borderRadius: 134,
    backgroundColor: '#ffffff',
  },

  rankName: {
    position: 'absolute', bottom: 6, alignSelf: 'center',
    fontFamily: PJS.extrabold, fontSize: 44, color: '#111114', letterSpacing: -1.6,
  },

  barTrack: {
    height: 5, borderRadius: 999, backgroundColor: '#eeeef1',
    marginHorizontal: 70, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: '#2E7DFF' },

  footer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30, minHeight: 92, justifyContent: 'center' },
  hint: {
    fontFamily: PJS.extrabold, fontSize: 15, color: '#111114',
    letterSpacing: 1.6, textAlign: 'center',
  },
  cta: {
    width: '100%', height: 58, borderRadius: 999, backgroundColor: '#111114',
    alignItems: 'center', justifyContent: 'center',
    ...({ boxShadow: '0px 16px 30px -16px rgba(17,17,20,0.6)' } as any),
  },
  ctaTxt: { fontFamily: PJS.bold, fontSize: 16.5, color: '#fff', letterSpacing: -0.2 },
});
