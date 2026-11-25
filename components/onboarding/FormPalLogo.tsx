/**
 * components/onboarding/FormPalLogo.tsx
 *
 * The REAL FormPal logo (Ari's own design, file `formpallogo.html`): four rounded camera-viewfinder corners around a person curling a dumbbell, white. It is
 * drawn from that file's own shapes (the four corner strokes, and the person as the file's own mask image) and saved once as assets/images/formpal-logo.png
 * (white on a transparent background, 1012 x 1012), so it sits on any dark background. No wordmark: the logo is the picture.
 */
import React from 'react';
import { Image, View } from 'react-native';

const LOGO = require('../../assets/images/formpal-logo.png');

export default function FormPalLogo({ size = 128 }: { size?: number }) {
  return (
    <View accessibilityRole="image" accessibilityLabel="FormPal" style={{ width: size, height: size }}>
      <Image source={LOGO} style={{ width: size, height: size }} resizeMode="contain" testID="formpal-logo" />
    </View>
  );
}
