import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureAudioSession } from '../lib/audioFeedback';
import WarmSurfaces from '../components/WarmSurfaces';
import { installDevLogger } from '../lib/devLogger';
import {
  useFonts,
  BricolageGrotesque_300Light,
  BricolageGrotesque_400Regular,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

installDevLogger();

// Hold splash until fonts are ready — prevents unstyled-text flash.
SplashScreen.preventAutoHideAsync();

const VIDEO_LOG_KEY  = 'formpal_video_log';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function pruneOldVideos() {
  try {
    const raw = await AsyncStorage.getItem(VIDEO_LOG_KEY);
    if (!raw) return;
    const log: { uri: string; ts: number }[] = JSON.parse(raw);
    const cutoff   = Date.now() - THIRTY_DAYS_MS;
    const surviving: typeof log = [];
    for (const entry of log) {
      if (entry.ts < cutoff) {
        await FileSystem.deleteAsync(entry.uri, { idempotent: true });
      } else {
        surviving.push(entry);
      }
    }
    await AsyncStorage.setItem(VIDEO_LOG_KEY, JSON.stringify(surviving));
  } catch {}
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_300Light,
    BricolageGrotesque_400Regular,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => { void pruneOldVideos(); }, []);
  useEffect(() => { void configureAudioSession(); }, []);

  // Block render until fonts loaded (or failed — system font fallback is fine).
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown:  false,
          contentStyle: { backgroundColor: '#0A0B0C' },
        }}
      >
        {/* "Start Workout" -> this screen used the default native push (a
            hard slide-in from the right), reported as feeling like a
            jarring "pan" rather than a clean transition — fade reads as
            intentional instead. Scoped to just this one screen; every
            other route keeps the normal push. */}
        <Stack.Screen name="workout/run" options={{ animation: 'fade' }} />
        {/* The post-workout cards are drawn by the persistent WebViews in
            <WarmSurfaces /> (above this navigator), which can't slide in with
            the screen — so these two fade instead of pushing. */}
        <Stack.Screen name="recap" options={{ animation: 'fade' }} />
        <Stack.Screen name="rep-feedback" options={{ animation: 'fade' }} />
      </Stack>
      {/* Persistent, already-loaded artboard WebViews (Workout Complete, rep
          feedback, muscle page). See that file's header. */}
      <WarmSurfaces />
    </SafeAreaProvider>
  );
}
