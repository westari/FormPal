/**
 * components/onboarding/RankShield.tsx
 *
 * One rank shield picture, ALWAYS at its own real shape (round 12). It is drawn inside a box only as big as the box allows WITHOUT changing the picture's
 * proportions: Bronze to Master are square pictures (320 x 320) and Champion is taller than wide (226 x 320, with its crown). The size is worked out from
 * the picture's own pixel size (lib/fitInBox.ts) and given to a plain view; the image fills that view with `contain`. Nothing animates the image itself
 * (the moving and scaling is done by the parent), so a re-render or a tap can never stretch it. Used by the rank wheel and the rank reveal reel.
 */
import React from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import { fitInBox } from '../../lib/fitInBox';

export function shieldSize(src: ImageSourcePropType, boxW: number, boxH: number): { width: number; height: number } {
  const a = Image.resolveAssetSource(src as any);
  return fitInBox(a?.width ?? 320, a?.height ?? 320, boxW, boxH);
}

export default function RankShield({ src, boxW, boxH, shadow = false, testID }: { src: ImageSourcePropType; boxW: number; boxH: number; shadow?: boolean; testID?: string }) {
  const size = shieldSize(src, boxW, boxH);
  return (
    <View
      testID={testID}
      style={[size, shadow ? { shadowColor: '#111114', shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 14 } } : null]}
    >
      <Image source={src} resizeMode="contain" style={[{ width: size.width, height: size.height }, { resizeMode: 'contain' } as any]} />
    </View>
  );
}
