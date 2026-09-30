/**
 * components/onboarding/RankRevealScreen.tsx
 *
 * Native rank-reveal reel — a vertical strip of rank shields spins and
 * decelerates to land on the user's real computed rank. Replaces an earlier
 * tap-to-crack-a-shield version (not used anymore) and, before that, a
 * WebView "reel" artboard built on a custom templating framework whose
 * sc-for loops turned out to never render any DOM children — a confirmed,
 * reproducible bug in that framework, not a timing fluke. Rebuilt here as
 * plain RN Animated so the whole class of "the loop silently renders
 * nothing" bug is structurally impossible: every row is a real React
 * element on every render, not something a template engine assembles at
 * runtime.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { LiquidGlassButton } from '../LiquidGlass';
import { PJS } from '../../constants/theme';

// Same 7-tier ladder + shields RankWheelScreen uses, kept in landed order
// (low to high) so the reel scrolls "upward through the ranks" toward
// whichever one the user actually landed on. computeRank() in
// app/onboarding.tsx only ever returns Bronze or Silver today (it's capped
// at Silver IV), but the full ladder is in the strip so the spin has
// somewhere real to scroll through before landing, not just two rows.
const LADDER = [
  { key: 'Bronze',   img: require('../../assets/ranks/bronze.png') },
  { key: 'Silver',   img: require('../../assets/ranks/silver.png') },
  { key: 'Gold',     img: require('../../assets/ranks/gold.png') },
  { key: 'Platinum', img: require('../../assets/ranks/platinum.png') },
  { key: 'Diamond',  img: require('../../assets/ranks/diamond.png') },
  { key: 'Master',   img: require('../../assets/ranks/master.png') },
  { key: 'Champion', img: require('../../assets/ranks/champion.png') },
];

const LOOPS = 4; // rows in the strip = LADDER.length * LOOPS
const ROW_H = 104;
const VIEWPORT_H = 340;
// The spin value at which row `i` sits exactly centered in the viewport.
const centerFor = (i: number) => VIEWPORT_H / 2 - ROW_H / 2 - i * ROW_H;

function narrationFor(landed: boolean): string {
  return landed ? 'Your starting rank is...' : 'Calculating your rank...';
}

export default function RankRevealScreen({
  rankName,
  topInset,
  onAdvance,
  onBack,
}: {
  rankName: string;
  topInset: number;
  onAdvance: () => void;
  onBack: () => void;
}) {
  const tierName = rankName.split(' ')[0];
  const tierIdx = Math.max(0, LADDER.findIndex((r) => r.key === tierName));

  // Land on the tier's LAST occurrence in the looped strip, so the spin
  // has the full strip to travel through first.
  const reel = useMemo(() => {
    const out: { key: string; img: any }[] = [];
    for (let l = 0; l < LOOPS; l++) LADDER.forEach((r) => out.push(r));
    return out;
  }, []);
  const targetIndex = (LOOPS - 1) * LADDER.length + tierIdx;

  const [landed, setLanded] = useState(false);
  const spin = useRef(new Animated.Value(centerFor(0))).current;
  const backIn = useRef(new Animated.Value(0)).current;
  const nameIn = useRef(new Animated.Value(0)).current;
  const ctaIn = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(backIn, { toValue: 1, duration: 300, delay: 200, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(spin, {
        toValue: centerFor(targetIndex),
        duration: 2600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setLanded(true);
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        Animated.parallel([
          Animated.timing(glow, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.spring(nameIn, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
          Animated.timing(ctaIn, { toValue: 1, duration: 340, delay: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      });
    }, 450);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
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

      <View style={s.narrationWrap}>
        <Text style={s.narration}>{narrationFor(landed)}</Text>
      </View>

      {/* reel viewport */}
      <View style={s.viewport}>
        {/* landing-slot frame */}
        <View pointerEvents="none" style={s.slotFrame} />
        <Animated.View
          pointerEvents="none"
          style={[s.slotGlow, { opacity: glow.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.9, 0] }) }]}
        />

        <Animated.View style={{ transform: [{ translateY: spin }] }}>
          {reel.map((r, i) => {
            const c = centerFor(i);
            const opacity = spin.interpolate({
              inputRange: [c - 2 * ROW_H, c - ROW_H, c, c + ROW_H, c + 2 * ROW_H],
              outputRange: [0.15, 0.4, 1, 0.4, 0.15],
              extrapolate: 'clamp',
            });
            const scale = spin.interpolate({
              inputRange: [c - 2 * ROW_H, c - ROW_H, c, c + ROW_H, c + 2 * ROW_H],
              outputRange: [0.72, 0.85, 1, 0.85, 0.72],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View key={i} style={[s.row, { opacity, transform: [{ scale }] }]}>
                <Animated.Image source={r.img} resizeMode="contain" style={s.rowImg} />
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>

      {/* rank name, revealed once landed */}
      <View style={s.nameWrap}>
        {landed && (
          <Animated.Text
            style={[
              s.rankName,
              {
                opacity: nameIn,
                transform: [
                  { translateY: nameIn.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                  { scale: nameIn.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                ],
              },
            ]}
          >
            {rankName}
          </Animated.Text>
        )}
      </View>

      {/* footer */}
      <View style={s.footer}>
        {!landed ? (
          <Text style={s.hint}>FINDING YOUR RANK</Text>
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

  viewport: { height: VIEWPORT_H, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  slotFrame: {
    position: 'absolute', top: VIEWPORT_H / 2 - ROW_H / 2, height: ROW_H,
    left: 40, right: 40, borderRadius: 24,
    borderWidth: 1.5, borderColor: 'rgba(46,125,255,0.25)',
    backgroundColor: 'rgba(46,125,255,0.04)',
  },
  slotGlow: {
    position: 'absolute', top: VIEWPORT_H / 2 - ROW_H, height: ROW_H * 2,
    left: 20, right: 20, borderRadius: 100,
    backgroundColor: 'rgba(253,240,226,0.9)',
  },

  row: { height: ROW_H, alignItems: 'center', justifyContent: 'center' },
  rowImg: { width: 76, height: 76 },

  nameWrap: { minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  rankName: {
    fontFamily: PJS.extrabold, fontSize: 32, color: '#111114', letterSpacing: -1.1,
  },

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
