/**
 * components/onboarding/OnbBackButton.tsx
 *
 * The onboarding screens' back button: the app's STANDARD Liquid Glass back button (components/GlassBackButton.tsx), the same one as the goal pages and the
 * workout preview. It sits in a 34 x 34 box (the size the old button had) so the progress bar next to it and everything below it stay exactly where they
 * were; the glass button is a little bigger (40) and simply spills over that box evenly.
 */
import React from 'react';
import { View } from 'react-native';
import GlassBackButton from '../GlassBackButton';

export const ONB_BACK_BOX = 34;

// (Ari 2026-11-25) always THE standard glass (components/StandardGlass.tsx: the camera Finish pill's real dark glass, white chevron): the old light glass over a light page read
// as a plain white disc. `scheme` is kept only so existing callers still compile.
export default function OnbBackButton({ onPress }: { onPress: () => void; scheme?: 'light' | 'dark' }) {
  return (
    <View style={{ width: ONB_BACK_BOX, height: ONB_BACK_BOX, alignItems: 'center', justifyContent: 'center' }}>
      <GlassBackButton onPress={onPress} scheme="standard" />
    </View>
  );
}
