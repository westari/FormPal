import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, Modal, TouchableWithoutFeedback,
  StyleSheet, Animated, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import GlassButton from '../../components/GlassButton';

// Bottom-to-top visual order (index 0 = bottommost button)
const ACTIONS = [
  { id: 'form',    symbol: 'camera.fill',                         label: 'Quick Form Check' },
  { id: 'workout', symbol: 'figure.strengthtraining.traditional', label: 'Start Workout'    },
  { id: 'log',     symbol: 'square.and.pencil',                   label: 'Log a Session'    },
] as const;

const BTN  = 76;   // circular glass button diameter (px) — large and bold
const ICON = 32;   // SF Symbol point size inside button

export default function PlusScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [visible, setVisible] = useState(false);

  // Scrim opacity — fine to animate (BlurView is not a GlassView)
  const scrim  = useRef(new Animated.Value(0)).current;
  // Per-action translateY — never animate opacity on or above GlassView
  const slides = useRef(ACTIONS.map(() => new Animated.Value(72))).current;

  // When an action navigates to a route (e.g. /formcheck), this flag tells
  // useFocusEffect to redirect to home instead of re-opening the menu on return.
  const didNavigate = useRef(false);

  const animIn = useCallback(() => {
    scrim.setValue(0);
    slides.forEach(s => s.setValue(72));
    Animated.timing(scrim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    slides.forEach((s, i) =>
      Animated.spring(s, {
        toValue: 0, delay: i * 55,
        damping: 20, stiffness: 290,
        useNativeDriver: true,
      }).start()
    );
  }, [scrim, slides]);

  const animOut = useCallback((done: () => void) => {
    Animated.timing(scrim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => done());
  }, [scrim]);

  useFocusEffect(useCallback(() => {
    // If we're re-entering Plus tab after an action navigated away (e.g. user
    // back-gestured from formcheck), redirect to home so the menu doesn't reopen.
    if (didNavigate.current) {
      didNavigate.current = false;
      router.navigate('/(tabs)/index');
      return;
    }
    setVisible(true);
    animIn();
    return () => {
      // Instant cleanup — no animation needed when tab loses focus naturally.
      setVisible(false);
      scrim.setValue(0);
      slides.forEach(s => s.setValue(72));
    };
  }, [animIn, router, scrim, slides]));

  const dismiss = useCallback(() => {
    animOut(() => {
      setVisible(false);
      // Return to the Home tab. NativeTabs doesn't track "previous tab" in JS,
      // so we explicitly navigate to index rather than staying on Plus.
      router.navigate('/(tabs)/index');
    });
  }, [animOut, router]);

  const handleAction = useCallback((id: string) => {
    if (id === 'form') {
      didNavigate.current = true;
      animOut(() => {
        setVisible(false);
        router.push('/formcheck');
      });
    } else {
      Alert.alert('Coming soon');
    }
  }, [animOut, router]);

  // Position buttons above where the native tab bar sits visually.
  // Modal covers the entire screen (including the tab bar), but we keep
  // buttons in that zone so the layout feels anchored to the tab area.
  const btnBottom = insets.bottom + 90;

  return (
    // Transparent Plus tab content — all visible UI lives inside the Modal.
    // No backgroundColor here: makes the Plus tab itself invisible behind the modal.
    <View style={s.root}>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={dismiss}   // Android back button
      >
        {/*
          HOW THIS OVERLAY WORKS
          ──────────────────────
          React Native <Modal transparent> on iOS uses
          UIModalPresentationOverFullScreen, which layers above the entire
          UITabBarController (tab bar + all tab content). The BlurView fills
          it, creating a dark frosted-glass effect over whatever is behind
          the modal (the Plus tab's transparent RN view + the root Stack's
          #0A0B0C background). The native iOS 26 glass tab bar is also
          visible blurred underneath.

          Limitation: UITabBarController removes the previous tab's
          UIViewController from the visible layer stack when switching tabs,
          so the specific content of the tab the user came from cannot be
          shown through the blur in pure JS — only native code (e.g. view
          snapshots) could achieve that.
        */}

        {/* Layer 1 — Scrim: animates opacity (safe; this is not a GlassView) */}
        <TouchableWithoutFeedback onPress={dismiss}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrim }]}>
            <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.36)' }]} />
          </Animated.View>
        </TouchableWithoutFeedback>

        {/*
          Layer 2 — Action buttons.
          pointerEvents="box-none": the container View itself doesn't capture
          taps (they fall through to the scrim dismiss handler), but its
          children (GlassButton) still receive their own taps.
          Animated wrapper handles translateY — GlassView opacity is never touched.
        */}
        <View style={[s.col, { bottom: btnBottom }]} pointerEvents="box-none">
          {[...ACTIONS].reverse().map((action, ri) => {
            const oi = ACTIONS.length - 1 - ri; // original ACTIONS index
            return (
              <Animated.View key={action.id} style={{ transform: [{ translateY: slides[oi] }] }}>
                <View style={s.row}>
                  <Text style={s.label}>{action.label}</Text>
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
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    // No backgroundColor → transparent Plus tab. The content is in the Modal.
  },
  col: {
    position:   'absolute',
    right:      22,
    alignItems: 'flex-end',
    gap:        22,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           18,
  },
  label: {
    fontSize:         18,
    fontWeight:       '600',
    color:            '#F0F0F2',
    textShadowColor:  'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
});
