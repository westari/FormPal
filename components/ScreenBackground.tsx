import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Col } from '../constants/theme';
import type { ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Wraps every light-theme screen.
 * Provides the subtle vertical gradient (Col.bgGrad) so white cards float.
 * Replace flat backgroundColor: Col.bg with <ScreenBackground> at the root.
 */
export default function ScreenBackground({ children, style }: Props) {
  return (
    <LinearGradient
      colors={Col.bgGrad}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.root, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
