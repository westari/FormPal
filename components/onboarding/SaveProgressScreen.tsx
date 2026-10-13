/**
 * components/onboarding/SaveProgressScreen.tsx
 *
 * "Save your progress" — sits right after the plan-ready page. Cal-AI-style:
 * left-aligned title, no subtitle, Sign in with Apple + Continue with email,
 * two pre-checked agreement checkboxes underneath.
 *
 * Real auth now wired (was UI-only before — see the old TODO(auth) comments
 * this replaces): Apple via expo-apple-authentication + Supabase
 * signInWithIdToken, email via Supabase signUp/signInWithPassword. No
 * Google — explicit instruction ("No Google for now"), so that button is
 * gone rather than left as a dead/fake "coming soon" tap target.
 *
 * On success: pushes the onboarding answers + local plan to Supabase, OR —
 * if this is actually a RETURNING user signing back in with existing cloud
 * data — pulls that down instead, so re-onboarding never clobbers a real
 * account's history. See handleAuthed below.
 */

import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, TextInput, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SymbolView } from 'expo-symbols';
import { LiquidGlassButton } from '../LiquidGlass';
import { PJS } from '../../constants/theme';
import { supabase } from '../../constants/supabase';
import { saveOnboardingAnswersToCloud, loadAllUserDataFromCloud } from '../../lib/formpalSync';
import { savePlan, saveProfile } from '../../lib/planStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SESSION_LOG_KEY } from '../../lib/sessionLog';

function CheckRow({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Pressable style={s.checkRow} onPress={onToggle} hitSlop={6}>
      <View style={[s.checkbox, checked && s.checkboxOn]}>
        {checked && <SymbolView name="checkmark" size={11} tintColor="#fff" type="monochrome" style={{ width: 11, height: 11 }} />}
      </View>
      <Text style={s.checkTxt}>{children}</Text>
    </Pressable>
  );
}

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
  const fade = useRef(new Animated.Value(0)).current;
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [agreeTips, setAgreeTips] = useState(true);
  const [emailMode, setEmailMode] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);

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
      await handleAuthed();
    } catch (e: any) {
      setLoading(false);
      setError(e?.message ?? 'Something went wrong.');
    }
  };

  return (
    // root carries the opaque white background and is NEVER animated — opacity
    // on the same view as the white bg fades the background out too, exposing
    // the Stack navigator's dark contentStyle behind it as a black flash.
    <View style={[s.root, { paddingTop: topInset }]}>
    <Animated.View style={{ flex: 1, opacity: fade }}>
      <View style={s.headerRow}>
        <LiquidGlassButton
          onPress={() => { Haptics.selectionAsync(); emailMode ? setEmailMode(false) : onBack(); }}
          hitSlop={12}
          radius={17}
          variant="regular"
          fallbackColor="rgba(255,255,255,0.92)"
          style={s.backBtn}
        >
          <SymbolView name="chevron.left" size={15} tintColor="#1b1f27" type="monochrome" style={{ width: 15, height: 15 }} />
        </LiquidGlassButton>
        {progress != null && (
          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <View style={s.progTrack}><View style={[s.progFill, { width: `${progress * 100}%` }]} /></View>
          </View>
        )}
      </View>

      <Text style={s.h1}>Save your progress</Text>

      <View style={s.spacer} />

      {!emailMode ? (
        <View style={s.body}>
          <Pressable style={s.apple} onPress={handleApple} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <SymbolView name="apple.logo" size={19} tintColor="#fff" type="monochrome" style={{ width: 19, height: 19, marginRight: 10 }} />
                <Text style={s.appleTxt}>Sign in with Apple</Text>
              </>
            )}
          </Pressable>

          <Pressable style={s.emailBtn} onPress={() => { Haptics.selectionAsync(); setError(''); setEmailMode(true); }}>
            <SymbolView name="envelope.fill" size={17} tintColor="#111114" type="monochrome" style={{ width: 17, height: 17, marginRight: 10 }} />
            <Text style={s.emailTxt}>Continue with email</Text>
          </Pressable>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <View style={s.checks}>
            <CheckRow checked={agreeTerms} onToggle={() => setAgreeTerms((v) => !v)}>
              I agree to FormPal's Terms and Conditions and Privacy Policy
            </CheckRow>
            <CheckRow checked={agreeTips} onToggle={() => setAgreeTips((v) => !v)}>
              Send me tips, new features, and personalized offers from FormPal
            </CheckRow>
          </View>
        </View>
      ) : (
        <View style={s.body}>
          <TextInput
            style={s.input}
            placeholder="Email"
            placeholderTextColor="#9a9aa2"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={s.input}
            placeholder="Password"
            placeholderTextColor="#9a9aa2"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={s.error}>{error}</Text> : null}

          <Pressable style={s.apple} onPress={handleEmailSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={s.appleTxt}>{authMode === 'signup' ? 'Create account' : 'Sign in'}</Text>
            )}
          </Pressable>

          <Pressable onPress={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setError(''); }} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={s.switchTxt}>
              {authMode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={{ color: '#111114', fontFamily: PJS.bold }}>{authMode === 'signup' ? 'Sign in' : 'Sign up'}</Text>
            </Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },

  headerRow: { paddingTop: 8, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  progTrack: { height: 4, backgroundColor: 'rgba(17,24,39,0.08)', borderRadius: 2, overflow: 'hidden' },
  progFill:  { height: 4, backgroundColor: '#111114', borderRadius: 2 },
  backBtn: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)',
    ...({ boxShadow: '0px 2px 8px rgba(0,0,0,0.10)' } as any),
  },

  h1: { fontFamily: PJS.extrabold, fontSize: 32, color: '#111114', letterSpacing: -1, lineHeight: 38, paddingHorizontal: 28, paddingTop: 22 },

  // Fixed gap between the title and the buttons, not vertical centering —
  // matches the reference's proportions (buttons sit well below the title,
  // not right underneath it, with empty space left under them too).
  spacer: { height: 260 },

  body: { paddingHorizontal: 28 },
  apple: {
    width: '100%', height: 58, borderRadius: 999, backgroundColor: '#111114',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  appleTxt: { fontFamily: PJS.bold, fontSize: 16.5, color: '#fff', letterSpacing: -0.2 },
  emailBtn: {
    width: '100%', height: 58, borderRadius: 999, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#e4e4e9',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 22,
  },
  emailTxt: { fontFamily: PJS.bold, fontSize: 16.5, color: '#111114', letterSpacing: -0.2 },

  input: {
    width: '100%', height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: '#e4e4e9',
    paddingHorizontal: 18, fontFamily: PJS.medium, fontSize: 15.5, color: '#111114', marginBottom: 12,
  },

  error: { fontFamily: PJS.medium, fontSize: 13, color: '#e0454f', marginBottom: 14, textAlign: 'center' },
  switchTxt: { fontFamily: PJS.medium, fontSize: 13.5, color: '#6e6e77' },

  checks: { gap: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, marginTop: 1,
    borderWidth: 1.5, borderColor: '#d5d5db', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#111114', borderColor: '#111114' },
  checkTxt: { flex: 1, fontFamily: PJS.medium, fontSize: 12.5, color: '#6e6e77', lineHeight: 17 },
});
