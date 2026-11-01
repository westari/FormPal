/**
 * app/(tabs)/profile.tsx — Profile tab
 *
 * Renders the real Claude-Design artboard (assets/app screens/profile.html)
 * wired with real data, same architecture + process as the Progress tab (see
 * app/(tabs)/progress.tsx, lib/dcLogicPatch.ts, lib/profileInject.ts). The
 * design file is never edited.
 *
 * Everything the old native Profile screen could do is still here: sign out,
 * delete account, audio settings, rank & customization, reset onboarding, and
 * the dev tools (they now live as rows in the artboard's own list style).
 * Features the app doesn't have yet (reminders, Apple Health, membership,
 * referrals, support messaging) are hidden rather than shown as placeholders.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONSOLE_FORWARD_JS, DC_VIEWPORT_JS } from '../../lib/dcWebviewHelpers';
import { dcLogicPatchJs, athltSetDataJs } from '../../lib/dcLogicPatch';
import { PROFILE_LOGIC_EXT, PROFILE_DOM_JS } from '../../lib/profileInject';
import { buildProfileData, GOAL_IDS, PLACE_IDS, type ProfileData, type ProfileDetails } from '../../lib/profileData';
import { getAllSessions, calcStreak, computeMuscleTiers } from '../../lib/sessionLog';
import { getWeightLog, logWeight } from '../../lib/weightLog';
import { loadPlan, loadProfile, saveProfile, savePlan } from '../../lib/planStorage';
import { generatePlan } from '../../lib/planGenerator';
import { clearAllCalibrations } from '../../lib/calibration/store';
import { signOutAndClear, deleteAccountAndClear } from '../../lib/formpalSync';
import { useCustomizationStore } from '../../store/customizationStore';
import { useAudioSettingsStore } from '../../store/audioSettingsStore';
import { supabase } from '../../constants/supabase';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlanProfile } from '../../types/plan';

const PROFILE_HTML = require('../../assets/app screens/profile.html');
const PROFILE_BUILD = 'profile-2';
if (__DEV__) console.log(`[profile] build ${PROFILE_BUILD}`);

const ONBOARDING_KEY = 'formpal_onboarding_complete';
const LOCATION_KEY   = 'formpal_location';
const PROFILE_DETAILS_KEY = 'formpal_profile_details';

const PROFILE_BEFORE = DC_VIEWPORT_JS + CONSOLE_FORWARD_JS + dcLogicPatchJs(PROFILE_LOGIC_EXT) + PROFILE_DOM_JS;

async function loadDetails(): Promise<ProfileDetails> {
  try { const raw = await AsyncStorage.getItem(PROFILE_DETAILS_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
async function patchDetails(patch: ProfileDetails) {
  try { await AsyncStorage.setItem(PROFILE_DETAILS_KEY, JSON.stringify({ ...(await loadDetails()), ...patch })); } catch {}
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const dataRef = useRef<ProfileData | null>(null);
  const seedRef = useRef(0);

  const push = useCallback(() => {
    if (dataRef.current) webRef.current?.injectJavaScript(athltSetDataJs(dataRef.current));
  }, []);

  // Safety net so a missing ready signal can never leave a blank tab.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 7000);
    return () => clearTimeout(t);
  }, []);

  const load = useCallback(async (reseed: boolean) => {
    const [sessions, weights, plan, planProfile, location, details, userRes] = await Promise.all([
      getAllSessions(), getWeightLog(), loadPlan(), loadProfile(),
      AsyncStorage.getItem(LOCATION_KEY), loadDetails(), supabase.auth.getUser().catch(() => null),
    ]);
    if (reseed) seedRef.current += 1;
    const audio = useAudioSettingsStore.getState();
    dataRef.current = buildProfileData({
      seedVersion: seedRef.current,
      name: useCustomizationStore.getState().displayName,
      email: userRes?.data?.user?.email ?? null,
      sessions, streak: calcStreak(sessions),
      planProfile, planGeneratedAt: plan?.generatedAt ?? null,
      location, latestWeightLb: weights.length ? weights[weights.length - 1].weightLb : null,
      details,
      audio: { enabled: audio.audioEnabled, voiceFrequency: audio.voiceFrequency },
      insets: { top: insets.top, bottom: insets.bottom },
      appVersion: `FormPal ${Constants.expoConfig?.version ?? ''}${Constants.expoConfig?.ios?.buildNumber ? ` (${Constants.expoConfig.ios.buildNumber})` : ''}`.trim(),
    });
    push();
  }, [push, insets.top, insets.bottom]);

  useFocusEffect(useCallback(() => { load(true).catch(() => {}); }, [load]));

  // Persist edits made on the page to their real homes.
  const save = useCallback(async (p: Record<string, any>) => {
    try {
      if (p.name !== undefined) useCustomizationStore.getState().setDisplayName(String(p.name));
      const det: ProfileDetails = {};
      if (p.age !== undefined) det.age = p.age;
      if (p.height !== undefined) det.height = p.height;
      if (p.sex !== undefined) det.sex = p.sex;
      if (p.units !== undefined) det.units = p.units;
      if (p.days !== undefined) det.days = p.days;
      if (p.pinned !== undefined) det.pinned = p.pinned;
      if (Object.keys(det).length) await patchDetails(det);

      if (p.place !== undefined) await AsyncStorage.setItem(LOCATION_KEY, PLACE_IDS[p.place] ?? 'gym');

      if (p.goal !== undefined || p.experience !== undefined || p.days !== undefined) {
        const base: PlanProfile = (await loadProfile()) ?? { goal: 'strength', experience: 'beginner', daysPerWeek: 3, location: 'gym' as any };
        const next: PlanProfile = { ...base };
        if (p.goal !== undefined) next.goal = GOAL_IDS[p.goal] ?? base.goal;
        if (p.experience !== undefined) next.experience = String(p.experience).toLowerCase() as PlanProfile['experience'];
        if (p.days !== undefined) next.daysPerWeek = Math.max(1, (p.days as boolean[]).filter(Boolean).length);
        await saveProfile(next);
      }
      if (p.weight !== undefined && p.weight > 0) await logWeight(p.weight, new Date());
    } catch {}
  }, []);

  const applyPlan = useCallback(async () => {
    try {
      const profile = await loadProfile();
      if (!profile) return;
      const sessions = await getAllSessions();
      await savePlan(generatePlan(profile, computeMuscleTiers(sessions)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }, []);

  const onMessage = useCallback((raw: string) => {
    let msg: { type?: string; to?: string; patch?: Record<string, any>; msg?: string };
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'ready': setReady(true); break;
      case 'needData': push(); break;
      case 'pageConsole': if (__DEV__) console.log('[profile-page]', msg.msg); break;
      case 'save': if (msg.patch) void save(msg.patch); break;
      case 'applyPlan': void applyPlan(); break;
      case 'nav': {
        const route = msg.to === 'audio' ? '/audio-settings' : msg.to === 'ar' ? '/ar-experiment' : msg.to === 'calibrate' ? '/calibrate' : msg.to === 'camera' ? '/exercise-picker' : null;
        if (route) router.push(route as any);
        break;
      }
      case 'signOut':
        Alert.alert('Sign Out', 'This clears everything saved on this device. Your account data stays safe in the cloud.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOutAndClear(); router.replace('/onboarding'); } },
        ]);
        break;
      case 'deleteAccount':
        Alert.alert('Delete Account', 'This permanently deletes your account and everything saved with it — onboarding answers, plan, workout history, streaks, and progress photos. This cannot be undone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            const { error } = await deleteAccountAndClear();
            if (error) { Alert.alert('Could not delete account', error); return; }
            router.replace('/onboarding');
          } },
        ]);
        break;
      case 'resetOnboarding':
        Alert.alert('Reset Onboarding', 'This will clear your plan and send you back to onboarding.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(ONBOARDING_KEY); router.replace('/onboarding'); } },
        ]);
        break;
      case 'clearCalibration':
        Alert.alert('Clear Calibration Overrides', 'This deletes every saved exercise calibration. Every exercise reverts to its built-in thresholds until you recalibrate. Use this if the calibration tool may have saved a bad override while you were testing it.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear', style: 'destructive', onPress: async () => { await clearAllCalibrations(); Alert.alert('Cleared', 'All saved calibration overrides have been removed.'); } },
        ]);
        break;
    }
  }, [push, save, applyPlan, router]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <WebView
        ref={webRef}
        source={PROFILE_HTML}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={PROFILE_BEFORE}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={[styles.web, { opacity: ready ? 1 : 0 }]}
        scrollEnabled
        bounces={false}
        overScrollMode="never"
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eeeef1' },
  web:  { flex: 1, backgroundColor: '#eeeef1' },
});
