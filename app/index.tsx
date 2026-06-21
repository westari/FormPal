import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Shared key — must match the one in app/onboarding.tsx
export const ONBOARDING_KEY = 'formpal_onboarding_complete';

export default function EntryGate() {
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then(val => {
        if (val === 'true') router.replace('/(tabs)');
        else router.replace('/onboarding');
      })
      .catch(() => router.replace('/onboarding'));
  }, []);

  // Dark screen — same colour as app bg so there's no visible flash
  return <View style={{ flex: 1, backgroundColor: '#0A0B0C' }} />;
}
