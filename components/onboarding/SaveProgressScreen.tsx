/**
 * components/onboarding/SaveProgressScreen.tsx
 *
 * "Save your progress" (rebuilt round 10 to Ari's reference): a dark space screen (components/onboarding/SpaceBackground.tsx: stars and the lit edge of a planet),
 * the FormPal logo in the middle, then big pill buttons at the bottom: "Continue with Apple" (white), "Continue with email" (dark grey), and the two footer
 * links. The button you used last time carries a small "Last used" tag (remembered on this phone).
 * There is no Google button: Google sign-in is not built, and a button that does nothing is worse than none (the earlier instruction was "No Google for now").
 *
 * Real auth (unchanged): Apple via expo-apple-authentication + Supabase signInWithIdToken, email via Supabase signUp/signInWithPassword. On success it pushes
 * the onboarding answers + local plan to Supabase, OR (a returning user with cloud data) pulls that down instead. See handleAuthed below.
 * The back button and the progress bar are kept (white on the dark screen); the temporary Skip is kept too.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from '../../lib/haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SymbolView } from 'expo-symbols';
import OnbBackButton from './OnbBackButton';
import SpaceBackground, { SPACE_BG } from './SpaceBackground';
import FormPalLogo from './FormPalLogo';
import { PJS } from '../../constants/theme';
import { supabase } from '../../constants/supabase';
import { saveOnboardingAnswersToCloud, loadAllUserDataFromCloud } from '../../lib/formpalSync';
import { savePlan, saveProfile } from '../../lib/planStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SESSION_LOG_KEY } from '../../lib/sessionLog';

export const LAST_SIGNIN_KEY = 'formpal_last_signin';
type Method = 'apple' | 'email';
const rememberLast = (m: Method) => { AsyncStorage.setItem(LAST_SIGNIN_KEY, m).catch(() => {}); };

export default function SaveProgressScreen({
  topInset,
  progress,
  answers,
  onAdvance,
  onBack,
}: {
  topInset: number;
  progress?: number;
  answers: Record<string, any>;
  onAdvance: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const [emailMode, setEmailMode] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUsed, setLastUsed] = useState<Method | null>(null);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);
  useEffect(() => {
    AsyncStorage.getItem(LAST_SIGNIN_KEY).then((v) => { if (v === 'apple' || v === 'email') setLastUsed(v); }).catch(() => {});
  }, []);

  // Called once Supabase actually has a signed-in session, whichever method
  // got us there. A fresh sign-up has no cloud data yet (hasCloudData ===
  // false) — push what onboarding just produced. Signing back INTO an
  // existing account that already has cloud data means this is a returning
  // user, not a fresh one — pull their real data down instead of
  // overwriting it with whatever this new onboarding run just generated.
  const handleAuthed = async () => {
    try {
      const cloud = await loadAllUserDataFromCloud();
      if (cloud.hasCloudData) {
        if (cloud.plan) await savePlan(cloud.plan);
        if (cloud.planProfile) await saveProfile(cloud.planProfile);
        if (cloud.sessionLog.length > 0) await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(cloud.sessionLog));
      } else {
        await saveOnboardingAnswersToCloud(answers);
      }
    } catch (e) {
      if (__DEV__) console.log('[SaveProgressScreen] handleAuthed sync error (non-fatal):', e);
    }
    onAdvance();
  };

  const handleApple = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError('');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) { setError('Apple sign-in did not return a token. Try again.'); return; }
      setLoading(true);
      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      setLoading(false);
      if (signInError) { setError(signInError.message); return; }
      rememberLast('apple');
      await handleAuthed();
    } catch (e: any) {
      setLoading(false);
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // user dismissed the Apple sheet — not an error
      setError(e?.message ?? 'Apple sign-in failed.');
    }
  };

  const handleEmailSubmit = async () => {
    if (!email || !password) { setError('Email and password are required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError('');
    try {
      if (authMode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) { setLoading(false); setError(signUpError.message); return; }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) { setLoading(false); setError(signInError.message); return; }
      }
      setLoading(false);
      rememberLast('email');
      await handleAuthed();
    } catch (e: any) {
      setLoading(false);
      setError(e?.message ?? 'Something went wrong.');
    }
  };

  return (
    // root carries the opaque dark background and is NEVER animated (opacity on the same view as the background would fade it out and expose the
    // navigator's own dark colour behind it as a flash).
    <View style={[s.root, { paddingTop: topInset }]}>
      <SpaceBackground />
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <View style={s.headerRow}>
          {/* (Ari 2026-11-25) No back button and no progress bar from "building your plan" onward. The ONE exception is the
              e-mail form, which needs a way back to the sign-in choices. */}
          {emailMode ? <OnbBackButton scheme="dark" onPress={() => { Haptics.selectionAsync(); setEmailMode(false); }} /> : null}
          <View style={{ flex: 1 }} />
          {/* TEMPORARY dev skip: goes past sign-in without an account. Remove before release. */}
          <Pressable onPress={() => { Haptics.selectionAsync(); onAdvance(); }} hitSlop={12} style={s.skipBtn}>
            <Text style={s.skipTxt}>Skip</Text>
          </Pressable>
        </View>

        <View style={s.logoWrap} pointerEvents="none">
          <FormPalLogo size={36} />
        </View>

        {!emailMode ? (
          <View style={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View>
              <Pressable style={s.white} onPress={handleApple} disabled={loading} testID="save-apple">
                {loading ? <ActivityIndicator color="#111114" /> : (
                  <>
                    <SymbolView name="apple.logo" size={18} tintColor="#111114" type="monochrome" style={{ width: 18, height: 18, marginRight: 10 }} />
                    <Text style={s.whiteTxt}>Continue with Apple</Text>
                  </>
                )}
              </Pressable>
              {lastUsed === 'apple' ? <View style={s.lastTag} pointerEvents="none"><Text style={s.lastTxt}>Last used</Text></View> : null}
            </View>

            <View style={{ marginTop: 14 }}>
              <Pressable style={s.grey} onPress={() => { Haptics.selectionAsync(); setError(''); setEmailMode(true); }} testID="save-email">
                <Text style={s.greyTxt}>Continue with email</Text>
              </Pressable>
              {lastUsed === 'email' ? <View style={s.lastTag} pointerEvents="none"><Text style={s.lastTxt}>Last used</Text></View> : null}
            </View>

            {error ? <Text style={s.error}>{error}</Text> : null}

            <View style={s.footer}>
              <Text style={s.footTxt}>Privacy policy</Text>
              <Text style={s.footTxt}>Terms of service</Text>
            </View>
          </View>
        ) : (
          <View style={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <TextInput
              style={s.input}
              placeholder="Email"
              placeholderTextColor="#7d7d86"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance="dark"
            />
            <TextInput
              style={s.input}
              placeholder="Password"
              placeholderTextColor="#7d7d86"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              keyboardAppearance="dark"
            />

            {error ? <Text style={s.error}>{error}</Text> : null}

            <Pressable style={s.white} onPress={handleEmailSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#111114" /> : (
                <Text style={s.whiteTxt}>{authMode === 'signup' ? 'Create account' : 'Sign in'}</Text>
              )}
            </Pressable>

            <Pressable onPress={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setError(''); }} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={s.switchTxt}>
                {authMode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={{ color: '#ffffff', fontFamily: PJS.bold }}>{authMode === 'signup' ? 'Sign in' : 'Sign up'}</Text>
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPACE_BG },

  headerRow: { paddingTop: 8, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  skipBtn: { paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  skipTxt: { fontFamily: PJS.bold, fontSize: 14, color: '#ffffff' },
  progTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 2, overflow: 'hidden' },
  progFill:  { height: 4, backgroundColor: '#ffffff', borderRadius: 2 },

  // the logo sits where the reference's does: a little below the middle, over the dark of the planet
  logoWrap: { position: 'absolute', left: 0, right: 0, top: '53%', alignItems: 'center' },

  // everything below the logo is pushed to the bottom
  body: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20 },

  white: { width: '100%', height: 60, borderRadius: 999, backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  whiteTxt: { fontFamily: PJS.bold, fontSize: 16, color: '#111114', letterSpacing: -0.2 },
  grey: { width: '100%', height: 60, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  greyTxt: { fontFamily: PJS.bold, fontSize: 16, color: '#ffffff', letterSpacing: -0.2 },
  // the small dark tag on the corner of the button you used last
  lastTag: { position: 'absolute', right: 18, top: -9, height: 20, paddingHorizontal: 9, borderRadius: 10, backgroundColor: '#1b1b1f', alignItems: 'center', justifyContent: 'center' },
  lastTxt: { fontFamily: PJS.semibold, fontSize: 11, color: '#ffffff' },

  footer: { flexDirection: 'row', justifyContent: 'center', gap: 26, marginTop: 26 },
  footTxt: { fontFamily: PJS.medium, fontSize: 13.5, color: 'rgba(255,255,255,0.5)' },

  input: {
    width: '100%', height: 56, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18, fontFamily: PJS.medium, fontSize: 16, color: '#ffffff', marginBottom: 12,
  },

  error: { fontFamily: PJS.medium, fontSize: 13, color: '#ff7b84', marginTop: 14, marginBottom: 2, textAlign: 'center' },
  switchTxt: { fontFamily: PJS.medium, fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
});
