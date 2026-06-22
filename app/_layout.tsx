import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, Modal, TouchableWithoutFeedback,
  Animated, StyleSheet, Alert,
} from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import GlassButton from '../components/GlassButton';

// ─── Action definitions ────────────────────────────────────────────────────────

const ACTIONS = [
  { id: 'form',    symbol: 'camera.fill',                         label: 'Quick Form Check' },
  { id: 'workout', symbol: 'figure.strengthtraining.traditional', label: 'Start Workout'    },
  { id: 'log',     symbol: 'square.and.pencil',                   label: 'Log a Session'    },
] as const;

const BTN    = 68;
const ICON   = 28;
const FAB_SZ = 62;

// ─── Persistent glass FAB ─────────────────────────────────────────────────────
// Rendered at root level so it floats above the native tab bar.

function PersistentFAB() {
  const segments = useSegments();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();

  // Only visible while inside the tabs section
  const inTabs = segments[0] === '(tabs)';

  const [menuOpen, setMenuOpen] = useState(false);
  const scrim  = useRef(new Animated.Value(0)).current;
  const slides = useRef(ACTIONS.map(() => new Animated.Value(36))).current;
  const scales = useRef(ACTIONS.map(() => new Animated.Value(0.72))).current;

  const animIn = useCallback(() => {
    scrim.setValue(0);
    ACTIONS.forEach((_, i) => { slides[i].setValue(36); scales[i].setValue(0.72); });
    Animated.timing(scrim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    ACTIONS.forEach((_, i) => {
      Animated.spring(slides[i], { toValue: 0, delay: i * 55, damping: 18, stiffness: 320, useNativeDriver: true }).start();
      Animated.spring(scales[i], { toValue: 1, delay: i * 55, damping: 18, stiffness: 320, useNativeDriver: true }).start();
    });
  }, [scrim, slides, scales]);

  const animOut = useCallback((done: () => void) => {
    Animated.timing(scrim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => done());
  }, [scrim]);

  const openMenu  = useCallback(() => { setMenuOpen(true); animIn(); }, [animIn]);
  const dismiss   = useCallback(() => { animOut(() => setMenuOpen(false)); }, [animOut]);

  const handleAction = useCallback((id: string) => {
    if (id === 'form') {
      animOut(() => { setMenuOpen(false); router.push('/formcheck'); });
    } else {
      Alert.alert('Coming soon');
    }
  }, [animOut, router]);

  if (!inTabs) return null;

  // Align FAB vertically with the floating tab bar pill.
  // iOS 26 pill sits above the safe area; we add a small margin on top of insets.
  const fabBottom = insets.bottom + 12;
  const actBottom = fabBottom + FAB_SZ + 14;

  return (
    <>
      {/* ── Glass FAB ──────────────────────────────────────────────────── */}
      {/*   No opacity changes on this Pressable or its glass child —
            LiquidGlassView.interactive handles native touch feedback.       */}
      <Pressable style={[s.fab, { bottom: fabBottom }]} onPress={openMenu}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={[StyleSheet.absoluteFill, { borderRadius: FAB_SZ / 2 }]}
            interactive
            colorScheme="dark"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.fabFallback]} />
        )}
        <SymbolView
          name="plus"
          size={26}
          type="monochrome"
          tintColor="white"
          style={{ width: 26, height: 26 }}
        />
      </Pressable>

      {/* ── Action overlay Modal ────────────────────────────────────────── */}
      <Modal visible={menuOpen} transparent animationType="none" onRequestClose={dismiss}>
        {/* Frosted dark scrim */}
        <TouchableWithoutFeedback onPress={dismiss}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrim }]}>
            <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.46)' }]} />
          </Animated.View>
        </TouchableWithoutFeedback>

        {/* Actions stacked above the FAB, slide+scale in */}
        <View style={[s.actCol, { bottom: actBottom }]} pointerEvents="box-none">
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
        </View>
      </Modal>
    </>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown:  false,
          contentStyle: { backgroundColor: '#0A0B0C' },
        }}
      />
      <PersistentFAB />
    </SafeAreaProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // FAB container — no opacity style here, ever
  fab: {
    position:       'absolute',
    right:          18,
    width:          FAB_SZ,
    height:         FAB_SZ,
    borderRadius:   FAB_SZ / 2,
    alignItems:     'center',
    justifyContent: 'center',
  },
  // Fallback for pre-iOS-26 devices
  fabFallback: {
    borderRadius:    FAB_SZ / 2,
    backgroundColor: 'rgba(28,29,34,0.92)',
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     'rgba(255,255,255,0.18)',
  },

  // Overlay action column
  actCol: {
    position:   'absolute',
    right:      18,
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
