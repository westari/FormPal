/**
 * app/audio-settings.tsx — Audio coaching preferences.
 *
 * Reached from Profile → "Audio coaching". Controls:
 *   - Master audio on/off (voice + chime)
 *   - Good-rep chime on/off (independent of voice)
 *   - How often the voice talks (off / corrections only / corrections + counts)
 *   - Which iOS TTS voice MyPal speaks with
 *
 * See lib/audioFeedback.ts for how these settings are consumed during a
 * session, and store/audioSettingsStore.ts for persistence.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { Col, Sp, Sz, W, R, Elev, FONT } from '../constants/theme';
import ScreenBackground from '../components/ScreenBackground';
import { useAudioSettingsStore, type VoiceFrequency } from '../store/audioSettingsStore';
import {
  previewVoice, playGoodRepChime, listAvailableVoices,
  isVoiceAvailable, isChimeAvailable, type Voice,
} from '../lib/audioFeedback';

const SHADOW_MED = Platform.OS === 'ios' ? { boxShadow: Elev.medium.shadow } as any : { elevation: Elev.medium.android };

const FREQUENCY_OPTIONS: { value: VoiceFrequency; label: string; sub: string }[] = [
  { value: 'off',                   label: 'Off',                    sub: 'No spoken cues — just the good-rep chime' },
  { value: 'correctionsOnly',       label: 'Corrections only',       sub: 'Speaks only when a rep needs fixing' },
  { value: 'correctionsAndCounts',  label: 'Corrections + counts',   sub: 'Also calls out your rep count every so often' },
];

export default function AudioSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const audioEnabled       = useAudioSettingsStore(s => s.audioEnabled);
  const soundEffectEnabled = useAudioSettingsStore(s => s.soundEffectEnabled);
  const voiceFrequency     = useAudioSettingsStore(s => s.voiceFrequency);
  const voiceIdentifier    = useAudioSettingsStore(s => s.voiceIdentifier);
  const setAudioEnabled       = useAudioSettingsStore(s => s.setAudioEnabled);
  const setSoundEffectEnabled = useAudioSettingsStore(s => s.setSoundEffectEnabled);
  const setVoiceFrequency     = useAudioSettingsStore(s => s.setVoiceFrequency);
  const setVoiceIdentifier    = useAudioSettingsStore(s => s.setVoiceIdentifier);

  const [voices, setVoices] = useState<Voice[] | null>(null);
  const voiceAvailable = isVoiceAvailable();
  const chimeAvailable = isChimeAvailable();

  useEffect(() => {
    if (!voiceAvailable) { setVoices([]); return; }
    let cancelled = false;
    listAvailableVoices().then(list => {
      if (cancelled) return;
      // English voices only — a device can ship 100+ voices across every
      // supported language, and only the ones that can read English cues
      // are useful here.
      const english = list.filter(v => v.language?.toLowerCase().startsWith('en'));
      setVoices(english.length > 0 ? english : list);
    });
    return () => { cancelled = true; };
  }, [voiceAvailable]);

  return (
    <ScreenBackground>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60, paddingHorizontal: Sp.md }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
            <SymbolView name="chevron.left" size={18} tintColor={Col.text} type="monochrome" style={{ width: 18, height: 18 }} />
          </Pressable>
          <View style={{ gap: 2 }}>
            <Text style={s.title}>Audio coaching</Text>
            <Text style={s.sub}>MyPal speaks over your music, never stops it.</Text>
          </View>
        </View>

        {(!voiceAvailable || !chimeAvailable) && (
          <View style={s.notice}>
            <Text style={s.noticeText}>
              {!voiceAvailable && !chimeAvailable
                ? 'Voice and chime need a fresh app build to turn on — this device build predates the audio feature.'
                : !voiceAvailable
                  ? 'Voice needs a fresh app build to turn on — the chime works now.'
                  : 'The chime needs a fresh app build to turn on — voice works now.'}
            </Text>
          </View>
        )}

        {/* ── General ─────────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>General</Text>
        <View style={[s.card, SHADOW_MED]}>
          <View style={[s.row, s.rowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Audio feedback</Text>
              <Text style={s.rowSub}>Master switch for voice cues and the chime</Text>
            </View>
            <Switch
              value={audioEnabled}
              onValueChange={setAudioEnabled}
              trackColor={{ false: Col.textDim, true: Col.good }}
            />
          </View>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, !audioEnabled && s.dimmed]}>Good-rep chime</Text>
              <Text style={[s.rowSub, !audioEnabled && s.dimmed]}>A quiet sound when a rep looks solid — no words</Text>
            </View>
            <Switch
              value={soundEffectEnabled}
              onValueChange={(v) => { setSoundEffectEnabled(v); if (v) playGoodRepChime(); }}
              disabled={!audioEnabled || !chimeAvailable}
              trackColor={{ false: Col.textDim, true: Col.good }}
            />
          </View>
        </View>

        {/* ── Talk frequency ──────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>How much should MyPal talk?</Text>
        <View style={[s.card, SHADOW_MED]}>
          {FREQUENCY_OPTIONS.map((opt, i) => (
            <Pressable
              key={opt.value}
              onPress={() => setVoiceFrequency(opt.value)}
              disabled={!audioEnabled || !voiceAvailable}
              style={({ pressed }) => [
                s.row,
                i < FREQUENCY_OPTIONS.length - 1 && s.rowBorder,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.rowLabel, !audioEnabled && s.dimmed]}>{opt.label}</Text>
                <Text style={[s.rowSub, !audioEnabled && s.dimmed]}>{opt.sub}</Text>
              </View>
              {voiceFrequency === opt.value && (
                <SymbolView name="checkmark" size={16} tintColor={Col.good} type="monochrome" style={{ width: 16, height: 16 }} />
              )}
            </Pressable>
          ))}
        </View>

        {/* ── Voice picker ────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Voice</Text>
        <View style={[s.card, SHADOW_MED]}>
          <Pressable
            onPress={() => { setVoiceIdentifier(null); previewVoice(null); }}
            disabled={!audioEnabled || !voiceAvailable}
            style={({ pressed }) => [s.row, s.rowBorder, pressed && { opacity: 0.7 }]}
          >
            <Text style={[s.rowLabel, { flex: 1 }, (!audioEnabled || !voiceAvailable) && s.dimmed]}>System default</Text>
            {voiceIdentifier === null && (
              <SymbolView name="checkmark" size={16} tintColor={Col.good} type="monochrome" style={{ width: 16, height: 16 }} />
            )}
          </Pressable>

          {voices === null && (
            <Text style={[s.rowSub, { padding: Sp.md }]}>Loading voices…</Text>
          )}
          {voices?.length === 0 && (
            <Text style={[s.rowSub, { padding: Sp.md }]}>No voices found on this device.</Text>
          )}
          {voices?.map((v, i) => (
            <Pressable
              key={v.identifier}
              onPress={() => { setVoiceIdentifier(v.identifier); previewVoice(v.identifier); }}
              disabled={!audioEnabled || !voiceAvailable}
              style={({ pressed }) => [
                s.row,
                i < voices.length - 1 && s.rowBorder,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.rowLabel, !audioEnabled && s.dimmed]}>{v.name}</Text>
                <Text style={[s.rowSub, !audioEnabled && s.dimmed]}>{v.language}{v.quality === 'Enhanced' ? ' · Enhanced' : ''}</Text>
              </View>
              {voiceIdentifier === v.identifier && (
                <SymbolView name="checkmark" size={16} tintColor={Col.good} type="monochrome" style={{ width: 16, height: 16 }} />
              )}
            </Pressable>
          ))}
        </View>
        <Text style={s.footnote}>Tap a voice to hear a short preview.</Text>
      </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: Sp.lg,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Col.card,
    ...(Platform.OS === 'ios' ? { boxShadow: Elev.low.shadow } as any : { elevation: Elev.low.android }),
  },
  title: { fontSize: Sz.h2, fontWeight: W.bold, color: Col.text, letterSpacing: -0.3 },
  sub:   { fontSize: Sz.small, color: Col.textSub, maxWidth: 260 },

  notice: {
    backgroundColor: Col.midSoft, borderRadius: R.inner,
    padding: Sp.md, marginBottom: Sp.md,
  },
  noticeText: { fontSize: Sz.small, color: Col.text, lineHeight: 19 },

  sectionTitle: {
    fontSize: Sz.small, fontWeight: W.semi, color: Col.textSub,
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginBottom: Sp.sm, marginTop: Sp.lg, paddingHorizontal: 4,
  },

  card: {
    backgroundColor: Col.card, borderRadius: R.card,
    borderWidth: 1, borderColor: 'rgba(17,24,39,0.05)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(17,24,39,0.07)',
  },
  rowLabel: { fontSize: Sz.body, fontWeight: W.medium, color: Col.text },
  rowSub:   { fontSize: Sz.caption, color: Col.textSub, marginTop: 2 },
  dimmed:   { opacity: 0.4 },

  footnote: {
    fontSize: Sz.caption, color: Col.textDim,
    textAlign: 'center', marginTop: Sp.md, marginBottom: Sp.lg,
  },
});
