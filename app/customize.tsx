/**
 * app/customize.tsx — rank-unlock customization screen.
 *
 * Reached from Profile ("Rank & customization") and the muscle-ranks page.
 *
 *   1. Shareable rank badge — RankBadgeCard in a ViewShot, screenshot/share
 *      via expo-sharing (same pattern as app/recap.tsx).
 *   2. Editable display name for that badge.
 *   3. One section per CUSTOMIZATION_CATEGORIES entry (only "Rank colour" for
 *      now) — a grid of options. Unlocked ones are selectable; locked ones are
 *      greyed with the rank needed, so what's coming is visible (aspiration).
 *   4. A live preview of the form-check ✓ orb + rep counter in the selected
 *      colour.
 *
 * Everything is data-driven off constants/customization.ts — adding cosmetics
 * later needs no change here beyond the catalog (and a renderer only if it's a
 * brand-new KIND of option).
 */

import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';

import { Col, FONT, Sp, Sz, W } from '../constants/theme';
import ScreenBackground from '../components/ScreenBackground';
import { MuscleRankBackdrop, TIER_META, TierEmblem } from '../components/MuscleTierMap';
import RankBadgeCard from '../components/RankBadgeCard';
import RankUpBanner from '../components/RankUpBanner';
import { useRankStanding } from '../lib/rank';
import { resolveFormTheme } from '../lib/activeTheme';
import { useCustomizationStore } from '../store/customizationStore';
import {
  CUSTOMIZATION_CATEGORIES, optionsInCategory, isOptionUnlocked, unlockProgress,
  type CustomizationCategory, type CustomizationOption,
} from '../constants/customization';
import type { Tier } from '../lib/sessionLog';

const SHADOW = Platform.OS === 'ios'
  ? { boxShadow: '0px 1.5px 3px rgba(16,24,40,0.05), 0px 12px 26px rgba(28,40,90,0.14)' } as any
  : { elevation: 6 };

// Col has no `border` token — profile.tsx / progress.tsx use this same value locally.
const BORDER = 'rgba(17,24,39,0.06)';

// ─── Live preview of a form-check theme ─────────────────────────────────────

function ThemePreview({ optionId }: { optionId: string }) {
  const t = resolveFormTheme(optionId);
  return (
    <View style={pv.wrap}>
      <View style={[pv.orb, { backgroundColor: t.orbGood }]}>
        <Text style={pv.tick}>✓</Text>
      </View>
      <View style={pv.repCol}>
        <Text style={[pv.repNum, { color: t.isDefault ? Col.text : t.repText }]}>8</Text>
        <Text style={pv.repSub}>6 good</Text>
      </View>
      <View style={[pv.chip, { backgroundColor: t.accentSoft, borderColor: t.accent }]}>
        <Text style={[pv.chipTxt, { color: t.isDefault ? '#1f9d4d' : Col.text }]}>accent glow</Text>
      </View>
    </View>
  );
}
const pv = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  orb: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: -2 },
  repCol: { alignItems: 'center' },
  repNum: { fontFamily: FONT.displayBlack, fontSize: 34, letterSpacing: -1 },
  repSub: { fontSize: 10, fontWeight: W.semi, color: Col.textSub, marginTop: -2 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipTxt: { fontSize: 11, fontWeight: W.bold, letterSpacing: 0.3 },
});

// ─── One option swatch ─────────────────────────────────────────────────────

function OptionSwatch({
  option, unlocked, selected, onPress,
}: {
  option: CustomizationOption;
  unlocked: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const isTier = option.payload.kind === 'tier';
  const meta = isTier ? TIER_META[(option.payload as { tier: Tier }).tier] : null;

  return (
    <Pressable
      onPress={unlocked ? onPress : undefined}
      style={({ pressed }) => [
        sw.cell,
        selected && sw.cellSelected,
        pressed && unlocked && { opacity: 0.8 },
      ]}
    >
      <View style={[sw.swatch, !unlocked && sw.swatchLocked]}>
        {meta ? (
          <LinearGradient
            colors={[meta.hi, meta.lo, meta.ink]}
            start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          // Classic — the shipped green / red pairing
          <View style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, backgroundColor: '#32d74b' }} />
            <View style={{ flex: 1, backgroundColor: '#ff453a' }} />
          </View>
        )}

        {!unlocked && (
          <View style={sw.lockOverlay}>
            <SymbolView name="lock.fill" size={16} tintColor="#fff" type="monochrome" style={{ width: 16, height: 16 }} />
          </View>
        )}
        {selected && unlocked && (
          <View style={sw.checkBadge}>
            <SymbolView name="checkmark" size={12} tintColor="#fff" type="monochrome" style={{ width: 12, height: 12 }} />
          </View>
        )}
      </View>

      <Text style={[sw.label, !unlocked && sw.labelLocked]} numberOfLines={1}>{option.label}</Text>
      {!unlocked && option.unlockTier && (
        <Text style={sw.unlockAt}>Unlock at {TIER_META[option.unlockTier].label}</Text>
      )}
    </Pressable>
  );
}
const sw = StyleSheet.create({
  cell: {
    width: '31%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellSelected: { borderColor: Col.text, backgroundColor: 'rgba(255,255,255,0.5)' },
  swatch: {
    width: 62, height: 62, borderRadius: 31, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)',
  },
  swatchLocked: { opacity: 0.4 },
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
  checkBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Col.text, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  label: { fontSize: 12, fontWeight: W.semi, color: Col.text },
  labelLocked: { color: Col.textSub },
  unlockAt: { fontSize: 9.5, fontWeight: W.medium, color: Col.textDim, textAlign: 'center' },
});

// ─── Screen ────────────────────────────────────────────────────────────────

export default function CustomizeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { peakTier, cleanReps, sessions, loaded } = useRankStanding();
  const displayName    = useCustomizationStore((s) => s.displayName);
  const setDisplayName  = useCustomizationStore((s) => s.setDisplayName);
  const selected        = useCustomizationStore((s) => s.selected);
  const select          = useCustomizationStore((s) => s.select);

  const badgeTier: Tier = peakTier ?? 'bronze';
  const hasRank = !!peakTier;

  const shotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);

  const { unlocked, total } = useMemo(() => unlockProgress(peakTier), [peakTier]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await shotRef.current?.capture?.();
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your FormPal rank' });
      }
    } catch {
      // best-effort — no share sheet on some simulators
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  const commitName = () => {
    setDisplayName(draftName);
    setEditingName(false);
  };

  const pick = (category: CustomizationCategory, opt: CustomizationOption) => {
    Haptics.selectionAsync().catch(() => {});
    select(category, opt.id);
  };

  return (
    <>
      <StatusBar style="dark" />
      <ScreenBackground>
        <MuscleRankBackdrop tier={badgeTier} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 60,
            paddingHorizontal: Sp.md,
            gap: Sp.lg,
          }}
        >
          {/* Header */}
          <View style={s.header}>
            <Pressable onPress={() => router.back()} style={[s.backBtn, SHADOW]} hitSlop={10}>
              <SymbolView name="chevron.left" size={18} tintColor={Col.text} type="monochrome" style={{ width: 18, height: 18 }} />
            </Pressable>
            <Text style={s.title}>Customize</Text>
          </View>

          <RankUpBanner peakTier={peakTier} />

          {/* ── Shareable rank badge ─────────────────────────────────────── */}
          <View style={s.badgeWrap}>
            <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
              <RankBadgeCard tier={badgeTier} name={displayName} cleanReps={cleanReps} sessions={sessions} />
            </ViewShot>

            {!hasRank && loaded && (
              <Text style={s.preRankNote}>
                Train with form checks to earn your first rank — Bronze unlocks your first colour.
              </Text>
            )}

            <View style={s.badgeActions}>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [s.shareBtn, SHADOW, pressed && { opacity: 0.85 }]}
              >
                <SymbolView name="square.and.arrow.up" size={15} tintColor="#fff" type="monochrome" style={{ width: 15, height: 15 }} />
                <Text style={s.shareTxt}>{sharing ? 'Sharing…' : 'Share'}</Text>
              </Pressable>
              <Pressable
                onPress={() => { setDraftName(displayName); setEditingName(true); }}
                style={({ pressed }) => [s.editBtn, SHADOW, pressed && { opacity: 0.85 }]}
              >
                <SymbolView name="pencil" size={15} tintColor={Col.text} type="monochrome" style={{ width: 15, height: 15 }} />
                <Text style={s.editTxt}>Edit name</Text>
              </Pressable>
            </View>

            {editingName && (
              <View style={[s.nameEditor, SHADOW]}>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="Your name"
                  placeholderTextColor={Col.textDim}
                  maxLength={24}
                  autoFocus
                  style={s.nameInput}
                  onSubmitEditing={commitName}
                  returnKeyType="done"
                />
                <Pressable onPress={commitName} style={s.nameSave}>
                  <Text style={s.nameSaveTxt}>Save</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* ── Unlock summary ───────────────────────────────────────────── */}
          <View style={[s.summaryRow, SHADOW]}>
            {peakTier ? <TierEmblem tier={peakTier} size={30} /> : (
              <SymbolView name="lock.open" size={18} tintColor={Col.textSub} type="monochrome" style={{ width: 18, height: 18 }} />
            )}
            <Text style={s.summaryTxt}>
              <Text style={s.summaryStrong}>{unlocked}</Text> of {total} customizations unlocked
              {peakTier ? ` · peak ${TIER_META[peakTier].label}` : ''}
            </Text>
          </View>

          {/* ── Category sections ────────────────────────────────────────── */}
          {CUSTOMIZATION_CATEGORIES.map((cat) => {
            const opts = optionsInCategory(cat.id);
            const currentId = selected[cat.id];
            return (
              <View key={cat.id} style={{ gap: 12 }}>
                <View style={s.sectionHead}>
                  <Text style={s.sectionTitle}>{cat.label}</Text>
                  <Text style={s.sectionBlurb}>{cat.blurb}</Text>
                </View>

                <View style={[s.previewCard, SHADOW]}>
                  <Text style={s.previewLabel}>PREVIEW</Text>
                  <ThemePreview optionId={currentId} />
                </View>

                <View style={s.grid}>
                  {opts.map((opt) => (
                    <OptionSwatch
                      key={opt.id}
                      option={opt}
                      unlocked={isOptionUnlocked(opt, peakTier)}
                      selected={currentId === opt.id}
                      onPress={() => pick(cat.id, opt)}
                    />
                  ))}
                </View>
              </View>
            );
          })}

          <Text style={s.footNote}>
            Every colour you unlock is yours to keep. Ranking up never takes options away.
          </Text>
        </ScrollView>
      </ScreenBackground>
    </>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Col.card,
  },
  title: { fontFamily: FONT.displayLight, fontSize: Sz.h1, color: Col.text, letterSpacing: -0.5 },

  badgeWrap: { alignItems: 'center', gap: 14 },
  preRankNote: {
    fontSize: 12.5, color: Col.textSub, textAlign: 'center', lineHeight: 18,
    paddingHorizontal: 20,
  },
  badgeActions: { flexDirection: 'row', gap: 10 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Col.text, borderRadius: 999,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  shareTxt: { color: '#fff', fontSize: 13.5, fontWeight: W.bold, letterSpacing: 0.2 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Col.card, borderRadius: 999,
    paddingVertical: 10, paddingHorizontal: 18,
    borderWidth: 1, borderColor: BORDER,
  },
  editTxt: { color: Col.text, fontSize: 13.5, fontWeight: W.semi },

  nameEditor: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Col.card, borderRadius: 14, padding: 8, paddingLeft: 14,
    width: '100%', borderWidth: 1, borderColor: BORDER,
  },
  nameInput: { flex: 1, fontSize: 15, fontWeight: W.medium, color: Col.text, paddingVertical: 6 },
  nameSave: { backgroundColor: Col.text, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  nameSaveTxt: { color: '#fff', fontSize: 13, fontWeight: W.bold },

  summaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Col.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  summaryTxt: { flex: 1, fontSize: 13, color: Col.textSub, fontWeight: W.medium },
  summaryStrong: { color: Col.text, fontWeight: W.bold },

  sectionHead: { gap: 3, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 17, fontWeight: W.bold, letterSpacing: -0.3, color: Col.text },
  sectionBlurb: { fontSize: 12, color: Col.textSub, fontWeight: W.medium, lineHeight: 16 },

  previewCard: {
    backgroundColor: Col.card, borderRadius: 20, padding: 18, gap: 10,
    borderWidth: 1, borderColor: BORDER,
  },
  previewLabel: { fontSize: 9.5, fontWeight: W.bold, letterSpacing: 1.4, color: Col.textDim },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },

  footNote: {
    fontSize: 12, color: Col.textSub, textAlign: 'center', lineHeight: 18,
    paddingHorizontal: 16, marginTop: 4,
  },
});
