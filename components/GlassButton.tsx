import React from 'react';
import { Pressable, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  tintColor?: string;
  // Circular shorthand: sets width, height, borderRadius = size/2.
  // Omit for pill/rectangular — pass dimensions via style instead.
  circular?: number;
  isInteractive?: boolean;
};

export default function GlassButton({
  children, onPress, style, tintColor, circular, isInteractive = true,
}: Props) {
  const glassOk = isGlassEffectAPIAvailable();

  const outerStyle: ViewStyle = {
    overflow: 'hidden',
    borderRadius: circular ? circular / 2 : 100,
    ...(circular ? { width: circular, height: circular } : {}),
    ...style,
  };

  // CRITICAL: never set opacity < 1 on GlassView or any of its parents.
  // Animate position (translateY/translateX) on a wrapper, not opacity.
  const inner = glassOk ? (
    <GlassView
      glassEffectStyle="regular"
      tintColor={tintColor}
      isInteractive={isInteractive && !!onPress}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </GlassView>
  ) : (
    <BlurView
      intensity={55}
      tint="dark"
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
          backgroundColor: 'rgba(255,255,255,0.09)',
        }}
      />
      {children}
    </BlurView>
  );

  // Pressable does NOT change opacity on press — safe to wrap GlassView.
  // Never use TouchableOpacity here (changes opacity → breaks glass).
  if (onPress) {
    return <Pressable onPress={onPress} style={outerStyle}>{inner}</Pressable>;
  }
  return <View style={outerStyle}>{inner}</View>;
}
