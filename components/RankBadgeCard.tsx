/**
 * components/RankBadgeCard.tsx
 *
 * The shareable rank card — a fixed-size, screenshot-friendly panel showing
 * the user's peak rank emblem, name and a headline stat. Purely presentational
 * (no ViewShot / share button here) so it can be reused: the Customize screen
 * wraps it in <ViewShot> and owns the Share action, matching how app/recap.tsx
 * shares its recap card.
 *
 * Styling follows the app's light aesthetic: white-ish glass panel, the rank
 * tier's own gradient wash, the same TierEmblem art the muscle-ranks page uses.
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { FONT, W } from '../constants/theme';
import { TIER_META, TierEmblem } from './MuscleTierMap';
import type { Tier } from '../lib/sessionLog';

const CARD_W = 340;

const SHADOW = Platform.OS === 'ios'
  ? { boxShadow: '0px 2px 6px rgba(16,24,40,0.10), 0px 18px 40px rgba(28,40,90,0.22)' } as any
  : { elevation: 10 };

export interface RankBadgeCardProps {
  tier:      Tier;
  name:      string;
  cleanReps: number;
  sessions:  number;
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export default function RankBadgeCard({ tier, name, cleanReps, sessions }: RankBadgeCardProps) {
  const meta = TIER_META[tier];

  return (
    <View style={[s.card, SHADOW]}>
      {/* Tier gradient wash — same hi→lo recipe the muscle tiles use */}
      <LinearGradient
        colors={[`${meta.hi}` , `${meta.lo}`]}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.sheen} pointerEvents="none" />

      <Text style={[s.wordmark, { color: meta.ink }]}>FORMPAL</Text>

      <TierEmblem tier={tier} size={104} style={s.emblem} />

      <Text style={[s.tierLabel, { color: meta.ink }]}>{meta.label.toUpperCase()}</Text>
      <Text style={[s.name, { color: meta.ink }]} numberOfLines={1}>{name}</Text>

      <View style={s.statRow}>
        <View style={s.stat}>
          <Text style={[s.statVal, { color: meta.ink }]}>{fmt(cleanReps)}</Text>
          <Text style={[s.statLbl, { color: meta.ink }]}>clean reps</Text>
        </View>
        <View style={[s.divider, { backgroundColor: `${meta.ink}44` }]} />
        <View style={s.stat}>
          <Text style={[s.statVal, { color: meta.ink }]}>{sessions}</Text>
          <Text style={[s.statLbl, { color: meta.ink }]}>sessions</Text>
        </View>
      </View>

      <Text style={[s.footer, { color: `${meta.ink}AA` }]}>Peak rank · camera-verified form</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    width: CARD_W,
    borderRadius: 28,
    paddingVertical: 26,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  // soft diagonal highlight so the wash doesn't read flat
  sheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ translateX: -CARD_W * 0.2 }, { rotate: '18deg' }],
    opacity: 0.5,
  },
  wordmark: {
    fontFamily: FONT.displayBlack,
    fontSize: 13,
    letterSpacing: 3,
    opacity: 0.65,
    marginBottom: 10,
  },
  emblem: { marginBottom: 6 },
  tierLabel: {
    fontFamily: FONT.displayBlack,
    fontSize: 15,
    letterSpacing: 2,
    marginTop: 2,
  },
  name: {
    fontFamily: FONT.displayLight,
    fontSize: 30,
    letterSpacing: -0.5,
    marginTop: 2,
    maxWidth: CARD_W - 48,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 18,
  },
  stat: { alignItems: 'center', gap: 2 },
  statVal: { fontFamily: FONT.displayBold, fontSize: 22, letterSpacing: -0.5 },
  statLbl: { fontSize: 10.5, fontWeight: W.semi, letterSpacing: 0.6, opacity: 0.75, textTransform: 'uppercase' },
  divider: { width: 1, height: 30 },
  footer: {
    fontSize: 10,
    fontWeight: W.medium,
    letterSpacing: 0.4,
    marginTop: 16,
  },
});
