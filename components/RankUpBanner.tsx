/**
 * components/RankUpBanner.tsx
 *
 * The small "you ranked up" celebration. Self-contained: give it the current
 * peak tier and it decides whether to show, by comparing against the last tier
 * the user acknowledged (customizationStore.celebratedTier). Renders null when
 * there's nothing new.
 *
 * Fires once per newly-reached tier. Acknowledged when the user taps Customize
 * or dismisses — so it survives app restarts until seen, rather than flashing
 * once and being missed.
 *
 * Drop it near the top of any rank surface (muscle-ranks, customize).
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { FONT, W } from '../constants/theme';
import { TIER_META, TierEmblem } from './MuscleTierMap';
import { TIER_ORDER, type Tier } from '../lib/sessionLog';
import { useCustomizationStore } from '../store/customizationStore';
import { unlockProgress } from '../constants/customization';

const SHADOW = Platform.OS === 'ios'
  ? { boxShadow: '0px 2px 6px rgba(16,24,40,0.10), 0px 14px 30px rgba(28,40,90,0.20)' } as any
  : { elevation: 8 };

export default function RankUpBanner({ peakTier }: { peakTier: Tier | null }) {
  const router = useRouter();
  const celebratedTier = useCustomizationStore((s) => s.celebratedTier);
  const markCelebrated = useCustomizationStore((s) => s.markCelebrated);

  const isNew =
    !!peakTier &&
    (celebratedTier === null || TIER_ORDER.indexOf(peakTier) > TIER_ORDER.indexOf(celebratedTier));

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isNew) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }).start();
  }, [isNew, anim]);

  if (!isNew || !peakTier) return null;

  const meta = TIER_META[peakTier];
  const { unlocked, total } = unlockProgress(peakTier);

  const acknowledge = () => markCelebrated(peakTier);

  return (
    <Animated.View
      style={[
        b.wrap, SHADOW,
        { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] },
      ]}
    >
      <LinearGradient
        colors={[`${meta.hi}`, `${meta.lo}`]}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Pressable onPress={acknowledge} hitSlop={10} style={b.close}>
        <Text style={[b.closeTxt, { color: `${meta.ink}99` }]}>✕</Text>
      </Pressable>

      <View style={b.row}>
        <TierEmblem tier={peakTier} size={54} />
        <View style={b.textCol}>
          <Text style={[b.kicker, { color: `${meta.ink}CC` }]}>NEW RANK</Text>
          <Text style={[b.title, { color: meta.ink }]}>{meta.label}</Text>
          <Text style={[b.sub, { color: `${meta.ink}DD` }]}>
            {unlocked}/{total} customizations unlocked
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => { acknowledge(); router.push('/customize' as any); }}
        style={({ pressed }) => [b.cta, { backgroundColor: meta.ink }, pressed && { opacity: 0.85 }]}
      >
        <Text style={b.ctaTxt}>Customize</Text>
      </Pressable>
    </Animated.View>
  );
}

const b = StyleSheet.create({
  wrap: {
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    gap: 14,
  },
  close: { position: 'absolute', top: 10, right: 12, padding: 6, zIndex: 2 },
  closeTxt: { fontSize: 13, fontWeight: W.bold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  textCol: { flex: 1, gap: 1 },
  kicker: { fontSize: 10, fontWeight: W.bold, letterSpacing: 1.5 },
  title: { fontFamily: FONT.displayBold, fontSize: 22, letterSpacing: -0.4 },
  sub: { fontSize: 12, fontWeight: W.medium },
  cta: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  ctaTxt: { color: '#fff', fontSize: 13, fontWeight: W.bold, letterSpacing: 0.2 },
});
