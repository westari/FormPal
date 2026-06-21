import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'formpal_onboarding_complete';

export default function ProfileScreen() {
  const router = useRouter();

  const resetOnboarding = async () => {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    router.replace('/onboarding');
  };

  return (
    <View style={s.c}>
      <Text style={s.t}>Profile — coming soon</Text>

      <TouchableOpacity style={s.devBtn} onPress={resetOnboarding} activeOpacity={0.7}>
        <Text style={s.devTxt}>Reset Onboarding (dev)</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  c:      { flex: 1, backgroundColor: '#0A0B0C', alignItems: 'center', justifyContent: 'center' },
  t:      { fontSize: 16, color: '#9A9AA2' },
  devBtn: {
    marginTop: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  devTxt: { fontSize: 13, color: '#62626A', fontWeight: '500' },
});
