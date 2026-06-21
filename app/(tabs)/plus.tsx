import React, { useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Animated, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Play, Edit3 } from 'lucide-react-native';

const BG      = '#141518';
const ACTIVE  = '#F2F2F4';
const INACTIVE = '#6B6B72';
const BORDER  = 'rgba(255,255,255,0.06)';
const APP_BG  = '#0A0B0C';

export default function PlusScreen() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(320)).current;

  // Re-open the sheet every time this tab gains focus — handles first tap AND
  // every subsequent tap without relying on component remounting.
  useFocusEffect(
    useCallback(() => {
      slideAnim.setValue(320);
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, damping: 26, stiffness: 320,
      }).start();

      return () => {
        // Reset on blur so the next focus always starts from off-screen.
        slideAnim.stopAnimation();
        slideAnim.setValue(320);
      };
    }, [slideAnim])
  );

  // Slide sheet down then navigate to Home tab.
  const close = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 320, duration: 180, useNativeDriver: true,
    }).start(() => router.navigate('/(tabs)'));
  }, [slideAnim, router]);

  // Slide down then push a new screen.
  const closeAndPush = useCallback((route: string) => {
    Animated.timing(slideAnim, {
      toValue: 320, duration: 180, useNativeDriver: true,
    }).start(() => router.push(route as any));
  }, [slideAnim, router]);

  const ACTIONS = [
    {
      id: 'form',
      icon: Camera,
      label: 'Quick Form Check',
      onPress: () => closeAndPush('/formcheck'),
    },
    {
      id: 'workout',
      icon: Play,
      label: 'Start Workout',
      onPress: () => Alert.alert('Coming soon', 'Start Workout is coming soon.'),
    },
    {
      id: 'log',
      icon: Edit3,
      label: 'Log a Session',
      onPress: () => Alert.alert('Coming soon', 'Log a Session is coming soon.'),
    },
  ];

  return (
    <View style={s.root}>
      {/* Semi-transparent backdrop — tapping anywhere outside the sheet closes it */}
      <TouchableWithoutFeedback onPress={close}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>

      {/* Action sheet — slides up from bottom, rendered on top of backdrop */}
      <Animated.View
        style={[
          s.sheet,
          { paddingBottom: Math.max(insets.bottom, 24), transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={s.handle} />
        {ACTIONS.map(({ id, icon: Icon, label, onPress }) => (
          <TouchableOpacity key={id} style={s.action} activeOpacity={0.7} onPress={onPress}>
            <View style={s.actionIcon}>
              <Icon size={20} color={ACTIVE} />
            </View>
            <Text style={s.actionLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: APP_BG,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: INACTIVE,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
    opacity: 0.35,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: ACTIVE,
  },
});
