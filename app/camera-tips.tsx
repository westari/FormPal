/**
 * app/camera-tips.tsx
 *
 * "Quick workout tips" right after onboarding finishes, ONCE. Ari's design assets/app screens/cameratips.html used as it is (lib/cameraTips.ts only
 * fits it to the screen, hides its fake status bar and wires its two buttons). Continue (and the back arrow) remember that it was seen and
 * go to Home. The first workout's camera flow is unchanged.
 */
import React, { useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { CAMERA_TIPS_BEFORE_JS, CAMERA_TIPS_AFTER_JS, CAMERA_TIPS_KEY } from '../lib/cameraTips';
import * as Haptics from '../lib/haptics';

const HTML = require('../assets/app screens/cameratips.html');

export default function CameraTipsScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const left = useRef(false);
  const leave = () => {
    if (left.current) return; left.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    AsyncStorage.setItem(CAMERA_TIPS_KEY, '1').catch(() => {});
    router.replace('/(tabs)' as any);
  };
  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <WebView
          source={HTML}
          originWhitelist={['*']}
          style={s.web}
          injectedJavaScriptBeforeContentLoaded={CAMERA_TIPS_BEFORE_JS}
          injectedJavaScript={CAMERA_TIPS_AFTER_JS}
          onMessage={(e) => {
            const m = e.nativeEvent.data;
            if (m === 'tipsShown') Animated.timing(fade, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
            else if (m === 'tipsContinue' || m === 'tipsBack') leave();
          }}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          cacheEnabled
        />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f4f6' },
  web: { flex: 1, backgroundColor: '#f4f4f6' },
});
