/**
 * app/(tabs)/profile.tsx — FormPal Profile & Settings Screen
 *
 * Design tokens, shadows, and typography are identical to index.tsx.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';

import { FONT, Sp, W } from '../../constants/theme';
import ScreenBackground from '../../components/ScreenBackground';

// ─── Design tokens (exact match to index.tsx) ─────────────────────────────────

const C = {
  text:     '#0b1020',
  textSub:  '#9aa0ad',
  textDim:  '#b6bcc7',
  accent:   '#0a84ff',
  card:     '#ffffff',
  border:   'rgba(17,24,39,0.05)',
  iconBox:  '#f4f5f8',
  formGrad: ['#FFC24B', '#FF7A2E'] as [string, string],
  weekGrad: ['#48E08A', '#12B59A'] as [string, string],
  repsGrad: ['#67CEFF', '#0A6CFF'] as [string, string],
};

const SHADOW_HIGH = Platform.OS === 'ios' ? {
  boxShadow: '0px 1.5px 3px rgba(16,24,40,0.05), 0px 5px 12px rgba(16,24,40,0.05), 0px 20px 36px rgba(28,40,90,0.22), inset 0px 1px 0px rgba(255,255,255,0.95)',
} as any : {};

const SHADOW_MED = Platform.OS === 'ios' ? {
  boxShadow: '0px 1px 1.5px rgba(16,24,40,0.05), 0px 8px 18px rgba(28,40,90,0.15), inset 0px 1px 0px rgba(255,255,255,0.9)',
} as any : {};

const SHADOW_ROW = Platform.OS === 'ios' ? {
  boxShadow: '0px 1px 1.5px rgba(16,24,40,0.05), 0px 8px 18px rgba(28,40,90,0.12), inset 0px 1px 0px rgba(255,255,255,0.9)',
} as any : {};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const ONBOARDING_KEY    = 'formpal_onboarding_complete';
const PLAN_PROFILE_KEY  = 'formpal_plan_profile';
const READINESS_KEY     = 'formpal_readiness';
const LOCATION_KEY      = 'formpal_location';

// ─── Display maps ─────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  strength:   'Build strength',
  toned:      'Get toned',
  general:    'General fitness',
  weightloss: 'Lose weight',
};
const EXP_LABELS: Record<string, string> = {
  beginner:     'Beginner',
  intermediate: 'Intermediate',
  advanced:     'Advanced',
};
const READINESS_LABELS: Record<string, string> = {
  fresh:  'Fresh',
  tired:  'A bit tired',
  sore:   'Sore',
};
const LOCATION_LABELS: Record<string, string> = {
  home:     'Home',
  gym:      'Gym',
  outdoors: 'Outdoors',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanProfile {
  goal?:        string;
  experience?:  string;
  daysPerWeek?: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={sh.title}>{title}</Text>;
}
const sh = StyleSheet.create({
  title: { fontSize: 17, fontWeight: W.bold, letterSpacing: -0.3, color: C.text, paddingHorizontal: 8 },
});

interface SettingRowProps {
  icon:     string;
  colors:   [string, string];
  label:    string;
  value?:   string;
  onPress?: () => void;
  danger?:  boolean;
  last?:    boolean;
}

function SettingRow({ icon, colors, label, value, onPress, danger, last }: SettingRowProps) {
  const inner = (
    <View style={[sr.row, !last && sr.rowBorder]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sr.iconBox}>
        <SymbolView name={icon as any} type="monochrome" style={{ width: 16, height: 16 }} tintColor="#fff" />
      </LinearGradient>
      <Text style={[sr.label, danger && sr.labelDanger]}>{label}</Text>
      <View style={sr.right}>
        {value ? <Text style={sr.value}>{value}</Text> : null}
        {onPress ? <Text style={sr.chevron}>›</Text> : null}
      </View>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed ? { opacity: 0.7 } : undefined}
    >
      {inner}
    </Pressable>
  );
}
const sr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingVertical: 13, paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(17,24,39,0.07)',
  },
  iconBox: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  label:       { flex: 1, fontSize: 15, fontWeight: W.medium, color: C.text },
  labelDanger: { color: '#e0352b' },
  right:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value:       { fontSize: 14, fontWeight: W.medium, color: C.textSub },
  chevron:     { fontSize: 18, color: C.textDim, lineHeight: 22 },
});

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={[scard.card, SHADOW_MED]}>
      {children}
    </View>
  );
}
const scard = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 22,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [plan,      setPlan]      = useState<PlanProfile>({});
  const [readiness, setReadiness] = useState<string | null>(null);
  const [location,  setLocation]  = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    Promise.all([
      AsyncStorage.getItem(PLAN_PROFILE_KEY),
      AsyncStorage.getItem(READINESS_KEY),
      AsyncStorage.getItem(LOCATION_KEY),
    ]).then(([planRaw, readRaw, locRaw]) => {
      if (planRaw) setPlan(JSON.parse(planRaw));
      if (readRaw) setReadiness(readRaw);
      if (locRaw)  setLocation(locRaw);
    }).catch(() => {});
  }, []));

  const resetOnboarding = async () => {
    Alert.alert(
      'Reset Onboarding',
      'This will clear your plan and send you back to onboarding.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(ONBOARDING_KEY);
            router.replace('/onboarding');
          },
        },
      ],
    );
  };

  // Build a one-line profile summary for the avatar card
  const planSummary = [
    plan.goal        ? GOAL_LABELS[plan.goal]      : null,
    plan.experience  ? EXP_LABELS[plan.experience] : null,
    plan.daysPerWeek ? `${plan.daysPerWeek}×/wk`   : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <StatusBar style="dark" />
      <ScreenBackground>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.scroll,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 90 },
          ]}
        >

          {/* ── 1. HEADER ──────────────────────────────────────────────── */}
          <View style={s.header}>
            <Text style={s.heading}>Profile</Text>
            <Text style={s.sub}>Your plan, preferences, and settings.</Text>
          </View>

          {/* ── 2. AVATAR CARD ──────────────────────────────────────────── */}
          <View style={[s.avatarCard, SHADOW_HIGH]}>
            {/* Gradient circle avatar */}
            <LinearGradient
              colors={C.formGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.avatar}
            >
              <Text style={s.avatarLetter}>A</Text>
            </LinearGradient>

            <View style={s.avatarInfo}>
              <Text style={s.avatarName}>Athlete</Text>
              {planSummary ? (
                <Text style={s.avatarSub}>{planSummary}</Text>
              ) : (
                <Text style={s.avatarSub}>No plan set up yet</Text>
              )}
            </View>
          </View>

          {/* ── 3. YOUR PLAN ────────────────────────────────────────────── */}
          <SectionHeader title="Your plan" />
          <SettingsCard>
            <SettingRow
              icon="target"
              colors={C.formGrad}
              label="Goal"
              value={plan.goal ? GOAL_LABELS[plan.goal] : '—'}
            />
            <SettingRow
              icon="chart.bar.fill"
              colors={C.weekGrad}
              label="Experience"
              value={plan.experience ? EXP_LABELS[plan.experience] : '—'}
            />
            <SettingRow
              icon="calendar"
              colors={C.repsGrad}
              label="Days per week"
              value={plan.daysPerWeek ? `${plan.daysPerWeek} days` : '—'}
              last
            />
          </SettingsCard>

          {/* ── 4. PREFERENCES ──────────────────────────────────────────── */}
          <SectionHeader title="Preferences" />
          <SettingsCard>
            <SettingRow
              icon="bolt.fill"
              colors={['#48E08A', '#1FA85A']}
              label="Today's readiness"
              value={readiness ? READINESS_LABELS[readiness] : 'Not set'}
            />
            <SettingRow
              icon="house.fill"
              colors={C.repsGrad}
              label="Workout location"
              value={location ? LOCATION_LABELS[location] : 'Not set'}
              last
            />
          </SettingsCard>

          {/* ── 5. APP ──────────────────────────────────────────────────── */}
          <SectionHeader title="App" />
          <SettingsCard>
            <SettingRow
              icon="bell.fill"
              colors={['#FF9F0A', '#FF6B00']}
              label="Notifications"
              value="Coming soon"
            />
            <SettingRow
              icon="ruler.fill"
              colors={['#BF5AF2', '#9544C9']}
              label="Units"
              value="Imperial"
              last
            />
          </SettingsCard>

          {/* ── 6. ACCOUNT ──────────────────────────────────────────────── */}
          <SectionHeader title="Account" />
          <SettingsCard>
            <SettingRow
              icon="info.circle.fill"
              colors={C.repsGrad}
              label="About FormPal"
              value="v1.0"
            />
            <SettingRow
              icon="hand.raised.fill"
              colors={['#48E08A', '#12B59A']}
              label="Privacy"
              value="Coming soon"
            />
            <SettingRow
              icon="questionmark.circle.fill"
              colors={['#d4d7dd', '#9aa0ad']}
              label="Help & feedback"
              value="Coming soon"
              last
            />
          </SettingsCard>

          {/* ── 7. DEV ──────────────────────────────────────────────────── */}
          <SectionHeader title="Developer" />
          <SettingsCard>
            <SettingRow
              icon="arrow.counterclockwise"
              colors={['#FF6B6B', '#FF3B30']}
              label="Reset Onboarding"
              onPress={resetOnboarding}
              danger
              last
            />
          </SettingsCard>

          <Text style={s.versionNote}>FormPal · v1.0 · Made for athletes</Text>

        </ScrollView>
      </ScreenBackground>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: { gap: Sp.lg, paddingHorizontal: 16 },

  // 1. Header
  header:  { gap: 6, paddingHorizontal: 8 },
  heading: {
    fontFamily:    FONT.displayLight,
    fontSize:      36,
    lineHeight:    38,
    letterSpacing: -1,
    color:         C.text,
  },
  sub: { fontSize: 13.5, fontWeight: W.medium, letterSpacing: 0.1, color: C.textSub },

  // 2. Avatar card
  avatarCard: {
    flexDirection: 'row', alignItems: 'center', gap: 18,
    backgroundColor: C.card, borderRadius: 28,
    borderWidth: 1, borderColor: C.border,
    padding: 22,
  },
  avatar: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily:    FONT.displayLight,
    fontSize:      30,
    lineHeight:    34,
    color:         '#fff',
    letterSpacing: -1,
  },
  avatarInfo:  { flex: 1, gap: 4 },
  avatarName:  { fontSize: 20, fontWeight: W.bold, letterSpacing: -0.4, color: C.text },
  avatarSub:   { fontSize: 13, fontWeight: W.medium, color: C.textSub, lineHeight: 18 },

  // Footer version note
  versionNote: {
    textAlign: 'center', fontSize: 12, color: C.textDim,
    fontWeight: W.medium, paddingBottom: 8,
  },
});
