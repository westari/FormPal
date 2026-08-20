// ── OnboardingCTAFooter — shared bottom "Continue" bar for the onboarding
// interstitial screens. Pulled out because all 4 rebuilt interstitials
// (PlanGrowthMoment, EffortResultsMoment, FormMuscleMoment, InjuryRiskMoment)
// render their own full screen — InjuryRiskMoment needs to in order to let
// its bottom-bleed background image sit behind an absolutely-positioned
// footer — but must still match app/onboarding.tsx's shared footer
// pixel-for-pixel. Duplicating this style object 4x invited drift, so it
// lives here once instead.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FONT, Elev } from '../constants/theme';

const BTN_DARK = '#0B1020'; // matches app/onboarding.tsx's local L.btnDark

export default function OnboardingCTAFooter({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.bn}>
      <TouchableOpacity style={styles.cb} onPress={onPress} activeOpacity={0.85}>
        <Text style={styles.ct}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bn: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16 },
  cb: { backgroundColor: BTN_DARK, borderRadius: 100, paddingVertical: 18, alignItems: 'center', ...({ boxShadow: Elev.medium.shadow } as any) },
  ct: { fontFamily: FONT.displayBold, fontSize: 16, color: '#fff', letterSpacing: 0.1 },
});
