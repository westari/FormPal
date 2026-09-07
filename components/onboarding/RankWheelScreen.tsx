/**
 * components/onboarding/RankWheelScreen.tsx
 *
 * Native rebuild of rankwheel2.html — the Bronze→Champion coverflow. Was a
 * WebView with a hand-rolled pointer-drag wheel (very choppy); now a native
 * paged Animated.ScrollView with scroll-driven scale/opacity, so it's
 * 60fps and has snap haptics. Matches the artboard (Plus Jakarta Sans, the
 * 28px header, the "Top N%" line in blue, dot pager, black pill CTA).
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Dimensions, Platform, ScrollView, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { LiquidGlassButton } from '../LiquidGlass';
import { PJS } from '../../constants/theme';

const ACCENT = '#2E7DFF';

const RANKS = [
  { name: 'Bronze',   blurb: 'Where everyone starts.',      pct: 'Top 100%', img: require('../../assets/ranks/bronze.png') },
  { name: 'Silver',   blurb: 'Consistent reps, clean form.', pct: 'Top 60%',  img: require('../../assets/ranks/silver.png') },
  { name: 'Gold',     blurb: 'Strong lifts, dialled technique.', pct: 'Top 35%', img: require('../../assets/ranks/gold.png') },
  { name: 'Platinum', blurb: 'Real strength, real control.', pct: 'Top 15%',  img: require('../../assets/ranks/platinum.png') },
  { name: 'Diamond',  blurb: 'Near-perfect form, every set.', pct: 'Top 5%',   img: require('../../assets/ranks/diamond.png') },
  { name: 'Master',   blurb: 'Coaching-level technique.',    pct: 'Top 1%',   img: require('../../assets/ranks/master.png') },
  { name: 'Champion', blurb: 'The top of FormPal.',          pct: 'Top 0.1%', img: require('../../assets/ranks/champion.png') },
];

const W = Dimensions.get('window').width;
const ITEM_W = 210;
const SNAP = ITEM_W;
const SIDE_PAD = (W - ITEM_W) / 2;
const TILE_H = 300;

export default function RankWheelScreen({
  topInset,
  onAdvance,
  onBack,
}: {
  topInset: number;
  onAdvance: () => void;
  onBack: () => void;
}) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<ScrollView>(null);
  const mountFade = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const idxRef = useRef(0);
  const current = RANKS[index];

  useEffect(() => {
    Animated.timing(mountFade, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [mountFade]);

  // Update the name / blurb / "Top N%" line LIVE as the wheel moves (see the
  // onScroll listener below) — not on momentum-end, which lags the wheel.
  const onScrollFrame = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const i = Math.max(0, Math.min(RANKS.length - 1, Math.round(e.nativeEvent.contentOffset.x / SNAP)));
    if (i !== idxRef.current) {
      idxRef.current = i;
      setIndex(i);
      if (Platform.OS !== 'web') void Haptics.selectionAsync();
    }
  };

  const goTo = (i: number) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    (listRef.current as any)?.scrollTo?.({ x: i * SNAP, animated: true });
  };

  return (
    <Animated.View style={[s.root, { paddingTop: topInset, opacity: mountFade, transform: [{ translateY: mountFade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      <Animated.View style={[s.backWrap, { top: topInset + 8 }]} pointerEvents="box-none">
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

      <View style={s.header}>
        <Text style={s.h1}>FormPal has ranks</Text>
        <Text style={s.sub}>Train with good form and climb from Bronze to Champion.</Text>
      </View>

      <View style={s.mid}>
      <Animated.ScrollView
        ref={listRef as any}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD }}
        scrollEventThrottle={16}
        onScroll={(e) => { scrollX.setValue(e.nativeEvent.contentOffset.x); onScrollFrame(e); }}
        style={s.flow}
      >
        {RANKS.map((r, i) => {
          const inputRange = [(i - 1) * SNAP, i * SNAP, (i + 1) * SNAP];
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.66, 1, 0.66], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.38, 1, 0.38], extrapolate: 'clamp' });
          const tx = scrollX.interpolate({ inputRange, outputRange: [30, 0, -30], extrapolate: 'clamp' });
          return (
            <Animated.View key={r.name} style={[s.tile, { opacity, transform: [{ translateX: tx }, { scale }] }]}>
              <Animated.Image source={r.img} resizeMode="contain" style={s.shield} />
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      <View style={s.meta}>
        <Text style={s.name}>{current.name}</Text>
        <Text style={s.blurb}>{current.blurb}</Text>
        <Text style={s.pct}>{current.pct} of FormPal lifters</Text>
      </View>

      <View style={s.dots}>
        {RANKS.map((_, i) => (
          <Pressable key={i} onPress={() => goTo(i)} hitSlop={8}>
            <View style={[s.dot, i === index && s.dotActive]} />
          </Pressable>
        ))}
      </View>
      </View>

      <View style={s.footer}>
        <Pressable style={s.cta} onPress={() => { void Haptics.selectionAsync(); onAdvance(); }}>
          <Text style={s.ctaTxt}>Continue</Text>
        </Pressable>
        <Text style={s.foot}>Your rank updates after every workout</Text>
      </View>
    </Animated.View>
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

  header: { paddingTop: 50, paddingHorizontal: 26, alignItems: 'center' },
  h1: { fontFamily: PJS.extrabold, fontSize: 28, color: '#111114', letterSpacing: -1, textAlign: 'center', lineHeight: 32 },
  sub: { fontFamily: PJS.semibold, fontSize: 13.5, color: '#6e6e77', textAlign: 'center', paddingTop: 8, lineHeight: 19 },

  // Wheel + rank text + dots, vertically centred in the space below the header.
  mid: { flex: 1, justifyContent: 'center' },
  flow: { height: TILE_H, flexGrow: 0 },
  tile: { width: ITEM_W, height: TILE_H, alignItems: 'center', justifyContent: 'center' },
  shield: {
    width: ITEM_W * 0.98, height: TILE_H * 0.96,
    ...({ filter: 'drop-shadow(0 16px 24px rgba(17,17,20,0.24))' } as any),
  },

  meta: { paddingHorizontal: 26, alignItems: 'center', marginTop: 2 },
  name: { fontFamily: PJS.extrabold, fontSize: 26, color: '#111114', letterSpacing: -0.8 },
  blurb: { fontFamily: PJS.semibold, fontSize: 13.5, color: '#6e6e77', paddingTop: 5 },
  pct: { fontFamily: PJS.semibold, fontSize: 13.5, color: ACCENT, paddingTop: 3 },

  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 18 },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: '#dcdce1' },
  dotActive: { width: 22, backgroundColor: '#111114' },

  footer: { marginTop: 'auto', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26, gap: 8 },
  cta: {
    width: '100%', height: 58, borderRadius: 999, backgroundColor: '#111114',
    alignItems: 'center', justifyContent: 'center',
    ...({ boxShadow: '0px 16px 30px -16px rgba(17,17,20,0.6)' } as any),
  },
  ctaTxt: { fontFamily: PJS.bold, fontSize: 16.5, color: '#fff', letterSpacing: -0.2 },
  foot: { fontFamily: PJS.semibold, fontSize: 11.5, color: '#6e6e77', textAlign: 'center' },
});
