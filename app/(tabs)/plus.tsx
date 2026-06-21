import React, { useRef, useCallback } from 'react';
import {
  View, Text, TouchableWithoutFeedback,
  StyleSheet, Animated, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import GlassButton from '../../components/GlassButton';

const C = {
  bg:   '#0A0B0C',
  text: '#F0F0F2',
};

// Bottom-to-top ordering: index 0 appears at the bottom of the stack
const ACTIONS = [
  { id: 'form',    symbol: 'camera.fill',     label: 'Quick Form Check' },
  { id: 'workout', symbol: 'figure.run',       label: 'Start Workout'    },
  { id: 'log',     symbol: 'square.and.pencil',label: 'Log a Session'    },
] as const;

const ICON_SIZE   = 54;
const TAB_CLEAR   = 75; // extra padding above native tab bar

export default function PlusScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  // Scrim fades in/out. NOT a GlassView parent so opacity is fine.
  const scrimAnim = useRef(new Animated.Value(0)).current;
  // One translateY per action (indexed by ACTIONS order, bottom-first).
  // Do NOT use opacity here — glass parents must stay at opacity 1.
  const slideAnims = useRef(ACTIONS.map(() => new Animated.Value(80))).current;

  useFocusEffect(
    useCallback(() => {
      scrimAnim.setValue(0);
      slideAnims.forEach(a => a.setValue(80));

      Animated.timing(scrimAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      slideAnims.forEach((anim, i) => {
        Animated.spring(anim, {
          toValue: 0, delay: i * 60,
          damping: 22, stiffness: 280,
          useNativeDriver: true,
        }).start();
      });

      return () => {
        scrimAnim.setValue(0);
        slideAnims.forEach(a => a.setValue(80));
      };
    }, [])
  );

  const close = useCallback(() => {
    Animated.timing(scrimAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      router.navigate('/(tabs)');
    });
  }, [router]);

  const handleAction = useCallback((id: string) => {
    if (id === 'form') {
      Animated.timing(scrimAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
        router.push('/formcheck');
      });
    } else {
      Alert.alert('Coming soon');
    }
  }, [router]);

  const bottomOffset = insets.bottom + TAB_CLEAR;

  return (
    <View style={s.root}>
      {/* Scrim — NOT a GlassView, safe to animate opacity */}
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrimAnim }]}>
          <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        </Animated.View>
      </TouchableWithoutFeedback>

      {/*
        Action stack — bottom-to-top visual order.
        Rendered top-to-bottom in DOM (reversed), so ACTIONS[2] (Log)
        is first child (top), ACTIONS[0] (Form Check) is last (bottom).
        Each Animated.View wraps the row so translateY animates position
        without touching GlassView opacity.
      */}
      <View style={[s.col, { bottom: bottomOffset }]} pointerEvents="box-none">
        {[...ACTIONS].reverse().map((action, renderIndex) => {
          const origIndex = ACTIONS.length - 1 - renderIndex;
          return (
            <Animated.View
              key={action.id}
              style={{ transform: [{ translateY: slideAnims[origIndex] }] }}
            >
              <View style={s.row}>
                <Text style={s.label}>{action.label}</Text>
                <GlassButton
                  circular={ICON_SIZE}
                  onPress={() => handleAction(action.id)}
                >
                  <SymbolView
                    name={action.symbol as any}
                    size={22}
                    tintColor="rgba(240,240,242,0.95)"
                    type="monochrome"
                    style={{ width: 22, height: 22 }}
                  />
                </GlassButton>
              </View>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  col: {
    position:   'absolute',
    right:      22,
    alignItems: 'flex-end',
    gap:        14,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
  },
  label: {
    fontSize:        15,
    fontWeight:      '600',
    color:           C.text,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
