/**
 * components/onboarding/SaveProgressScreen.tsx
 *
 * "Save your progress" — sits right after the plan-ready page. Rebuilt to
 * match a Cal-AI-style reference the user supplied: left-aligned title, no
 * subtitle, "Sign in with Apple/Google" + "Continue with email", two
 * pre-checked agreement checkboxes underneath. Same white/Plus Jakarta Sans
 * language as the rest of onboarding.
 *
 * Apple / Google / email are UI-only for now: all three just advance. Real
 * auth (expo-apple-authentication + Google/email via Supabase) is a
 * follow-up — wire it in handleApple / handleGoogle / handleEmail, they're
 * isolated for that reason. The two checkboxes are local UI state only —
 * nothing reads them yet; wire into the same auth follow-up (a real ToS/
 * privacy acceptance needs to actually be recorded somewhere).
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import Svg, { Path } from 'react-native-svg';
import { LiquidGlassButton } from '../LiquidGlass';
import { PJS } from '../../constants/theme';

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 3-2.26 5.54-4.78 7.25l7.73 6c4.51-4.18 7.09-10.36 7.09-17.72z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

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
  onAdvance,
  onBack,
}: {
  topInset: number;
  progress?: number;
  onAdvance: () => void;
  onBack: () => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [agreeTips, setAgreeTips] = useState(true);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);

  const handleApple = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // TODO(auth): expo-apple-authentication -> Supabase session, then onAdvance()
    onAdvance();
  };
  const handleGoogle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // TODO(auth): Google sign-in via Supabase OAuth, then onAdvance()
    onAdvance();
  };
  const handleEmail = () => {
    Haptics.selectionAsync();
    // TODO(auth): email/password or magic-link via Supabase, then onAdvance()
    onAdvance();
  };

  return (
    // root carries the opaque white background and is NEVER animated — opacity
    // on the same view as the white bg fades the background out too, exposing
    // the Stack navigator's dark contentStyle behind it as a black flash.
    <View style={[s.root, { paddingTop: topInset }]}>
    <Animated.View style={{ flex: 1, opacity: fade }}>
      <View style={s.headerRow}>
        <LiquidGlassButton
          onPress={() => { Haptics.selectionAsync(); onBack(); }}
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

      <View style={s.body}>
        <Pressable style={s.apple} onPress={handleApple}>
          <SymbolView name="apple.logo" size={19} tintColor="#fff" type="monochrome" style={{ width: 19, height: 19, marginRight: 10 }} />
          <Text style={s.appleTxt}>Sign in with Apple</Text>
        </Pressable>

        <Pressable style={s.google} onPress={handleGoogle}>
          <View style={{ marginRight: 10 }}><GoogleG size={19} /></View>
          <Text style={s.googleTxt}>Sign in with Google</Text>
        </Pressable>

        <Pressable style={s.emailBtn} onPress={handleEmail}>
          <SymbolView name="envelope.fill" size={17} tintColor="#111114" type="monochrome" style={{ width: 17, height: 17, marginRight: 10 }} />
          <Text style={s.emailTxt}>Continue with email</Text>
        </Pressable>

        <View style={s.checks}>
          <CheckRow checked={agreeTerms} onToggle={() => setAgreeTerms((v) => !v)}>
            I agree to FormPal's Terms and Conditions and Privacy Policy
          </CheckRow>
          <CheckRow checked={agreeTips} onToggle={() => setAgreeTips((v) => !v)}>
            Send me tips, new features, and personalized offers from FormPal
          </CheckRow>
        </View>
      </View>
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
  google: {
    width: '100%', height: 58, borderRadius: 999, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#e4e4e9',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  googleTxt: { fontFamily: PJS.bold, fontSize: 16.5, color: '#111114', letterSpacing: -0.2 },
  emailBtn: {
    width: '100%', height: 58, borderRadius: 999, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#e4e4e9',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 22,
  },
  emailTxt: { fontFamily: PJS.bold, fontSize: 16.5, color: '#111114', letterSpacing: -0.2 },

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
