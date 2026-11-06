/**
 * components/CueOrb.tsx
 *
 * Cue's orb for native screens: the same glossy orb the Home tab shows (see lib/cueOrb.ts, which owns the look for
 * web pages and the SVG drawn here). Breathes like the design's orb (scale 1 -> 1.045, 4.2s).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { cueOrbSvg } from '../lib/cueOrb';

const XML = cueOrbSvg();

export default function CueOrb({ size = 28 }: { size?: number }) {
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [breathe]);
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale }] }} pointerEvents="none">
      <SvgXml xml={XML} width={size} height={size} />
    </Animated.View>
  );
}
