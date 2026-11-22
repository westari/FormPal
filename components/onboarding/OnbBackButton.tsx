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

export default function OnbBackButton({ onPress, scheme = 'light' }: { onPress: () => void; scheme?: 'light' | 'dark' }) {
  return (
    <View style={{ width: ONB_BACK_BOX, height: ONB_BACK_BOX, alignItems: 'center', justifyContent: 'center' }}>
      <GlassBackButton onPress={onPress} scheme={scheme} />
    </View>
  );
}
