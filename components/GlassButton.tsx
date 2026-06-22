import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  tintColor?: string;      // kept for API compat — unused
  circular?: number;
  isInteractive?: boolean; // kept for API compat — unused
};

export default function GlassButton({ children, onPress, style, circular }: Props) {
  const base: ViewStyle = {
    overflow:        'hidden',
    borderRadius:    circular ? circular / 2 : 100,
    ...(circular ? { width: circular, height: circular } : {}),
    backgroundColor: 'rgba(20,21,26,0.88)',
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     'rgba(255,255,255,0.18)',
    alignItems:      'center',
    justifyContent:  'center',
    ...style,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [base, pressed && s.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

const s = StyleSheet.create({
  pressed: { opacity: 0.62 },
});
