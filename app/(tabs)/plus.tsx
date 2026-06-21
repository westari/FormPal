import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Animated, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Play, Edit3 } from 'lucide-react-native';

const BG      = '#141518';
const ACTIVE  = '#F2F2F4';
const INACTIVE = '#6B6B72';
const BORDER  = 'rgba(255,255,255,0.06)';
const APP_BG  = '#0A0B0C';

const ACTIONS = [
  { id: 'form',    icon: Camera, label: 'Quick Form Check', route: '/formcheck' as const },
  { id: 'workout', icon: Play,   label: 'Start Workout',    route: null },
  { id: 'log',     icon: Edit3,  label: 'Log a Session',    route: null },
] as const;

export default function PlusScreen() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const [open, setOpen] = useState(true);
  const slideAnim  = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220,
    }).start();
  }, []);

  const dismiss = (after?: () => void) => {
    Animated.timing(slideAnim, {
      toValue: 320, duration: 200, useNativeDriver: true,
    }).start(() => {
      setOpen(false);
      if (after) after();
      else router.navigate('/(tabs)');
    });
  };

  return (
    <View style={s.fill}>
      <Modal
        transparent
        visible={open}
        animationType="none"
        onRequestClose={() => dismiss()}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={() => dismiss()}>
          <View style={s.backdrop}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  s.sheet,
                  { paddingBottom: Math.max(insets.bottom, 24), transform: [{ translateY: slideAnim }] },
                ]}
              >
                <View style={s.handle} />
                {ACTIONS.map(({ id, icon: Icon, label, route }) => (
                  <TouchableOpacity
                    key={id}
                    style={s.action}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (route) dismiss(() => router.push(route));
                      else dismiss();
                    }}
                  >
                    <View style={s.actionIcon}>
                      <Icon size={20} color={ACTIVE} />
                    </View>
                    <Text style={s.actionLabel}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: APP_BG,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
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
