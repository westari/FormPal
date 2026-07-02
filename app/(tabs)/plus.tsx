import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableWithoutFeedback,
  StyleSheet, Animated, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import GlassButton from '../../components/GlassButton';

const ACTIONS = [
  { id: 'form',    symbol: 'camera.fill',                         label: 'Quick Form Check' },
  { id: 'workout', symbol: 'figure.strengthtraining.traditional', label: 'Start Workout'    },
  { id: 'log',     symbol: 'square.and.pencil',                   label: 'Log a Session'    },
  { id: 'mypal',   symbol: 'sparkles',                            label: 'Ask MyPal'        },
] as const;

const BTN  = 68;
const ICON = 28;

export default function PlusScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [visible, setVisible] = useState(false);
  const scrim  = useRef(new Animated.Value(0)).current;
  const slides = useRef(ACTIONS.map(() => new Animated.Value(36))).current;
  const scales = useRef(ACTIONS.map(() => new Animated.Value(0.72))).current;

  const didNavigate = useRef(false);

  const animIn = useCallback(() => {
    // Reset to start positions before animating
    scrim.setValue(0);
    ACTIONS.forEach((_, i) => { slides[i].setValue(36); scales[i].setValue(0.72); });
    Animated.timing(scrim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    ACTIONS.forEach((_, i) => {
      Animated.spring(slides[i], { toValue: 0, delay: i * 55, damping: 18, stiffness: 320, useNativeDriver: true }).start();
      Animated.spring(scales[i], { toValue: 1, delay: i * 55, damping: 18, stiffness: 320, useNativeDriver: true }).start();
    });
  }, [scrim, slides, scales]);

  const animOut = useCallback((done: () => void) => {
    Animated.timing(scrim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      done();
    });
  }, [scrim]);

  useFocusEffect(useCallback(() => {
    if (didNavigate.current) {
      didNavigate.current = false;
      router.navigate('/(tabs)/');
      return;
    }
    setVisible(true);
    animIn();

    return () => {
      // Don't reset scrim here — it races with the native tab transition
      // and snaps the overlay invisible mid-dissolve (causes close flash).
      // The reset happens at the top of animIn() on the next open instead.
      setVisible(false);
    };
  }, [animIn, router]));

  const dismiss = useCallback(() => {
    animOut(() => {
      setVisible(false);
      router.navigate('/(tabs)/');
    });
  }, [animOut, router]);

  const handleAction = useCallback((id: string) => {
    if (id === 'form') {
      didNavigate.current = true;
      animOut(() => { setVisible(false); router.push('/exercise-picker' as any); });
    } else if (id === 'mypal') {
      didNavigate.current = true;
      animOut(() => { setVisible(false); router.push('/mypal'); });
    } else {
      Alert.alert('Coming soon');
    }
  }, [animOut, router]);

  const actBottom = insets.bottom + 80;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>

      {/*
        Dark base ALWAYS rendered outside the animated wrapper.
        This means the instant the plus tab becomes active (even before JS
        animation starts), there is a solid #0A0B0C background — never white.
      */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0B0C' }]} />

      {/* Blur + scrim fade in/out on top of the dark base */}
      <TouchableWithoutFeedback onPress={dismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrim }]}>
          <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        </Animated.View>
      </TouchableWithoutFeedback>

      {/* Action buttons */}
      <Animated.View
        style={[s.actCol, { bottom: actBottom, opacity: scrim }]}
        pointerEvents="box-none"
      >
        {[...ACTIONS].reverse().map((action, ri) => {
          const oi = ACTIONS.length - 1 - ri;
          return (
            <Animated.View
              key={action.id}
              style={{ transform: [{ translateY: slides[oi] }, { scale: scales[oi] }] }}
            >
              <View style={s.actRow}>
                <Text style={s.actLabel}>{action.label}</Text>
                <GlassButton circular={BTN} onPress={() => handleAction(action.id)}>
                  <SymbolView
                    name={action.symbol as any}
                    size={ICON}
                    tintColor="rgba(240,240,242,0.95)"
                    type="monochrome"
                    style={{ width: ICON, height: ICON }}
                  />
                </GlassButton>
              </View>
            </Animated.View>
          );
        })}
      </Animated.View>

    </View>
  );
}

const s = StyleSheet.create({
  actCol: {
    position:   'absolute',
    right:      20,
    alignItems: 'flex-end',
    gap:        16,
  },
  actRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
  },
  actLabel: {
    fontSize:   17,
    fontWeight: '600',
    color:      '#F0F0F2',
  },
});
