import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { removeClipFiles } from '../lib/videoStore';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureAudioSession } from '../lib/audioFeedback';
import WarmSurfaces from '../components/WarmSurfaces';
import DesignPrewarm from '../components/DesignPrewarm';
import { installDevLogger } from '../lib/devLogger';
import { installPressHaptics } from '../lib/haptics';
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
installPressHaptics(); // every normal press gets the Light haptic unless it makes its own (lib/haptics.ts)

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
        removeClipFiles(entry.uri); // the clip, its permanent copy and every thumbnail made from it
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
        {/* Workout complete / rep feedback are drawn by <WarmSurfaces /> above this navigator, which does the one normal
            iOS slide itself (the page slides in from the right, the page under it shifts left a little). The native
            animation of these two routes is switched off so two animations never stack into a sideways fade. */}
        <Stack.Screen name="recap" options={{ animation: 'none' }} />
        <Stack.Screen name="rep-feedback" options={{ animation: 'none' }} />
        {/* The post-workout cards (<WarmSurfaces />, above this navigator)
            slide in themselves to match the normal iOS push these two routes
            use, so the page change is smooth and the card arrives with it. */}
      </Stack>
      {/* Persistent, already-loaded artboard WebViews (Workout Complete, rep
          feedback, muscle page). See that file's header. */}
      <WarmSurfaces />
      {/* Warms the web engine for Create workout / My workouts / Log a session so they open without a blank wait. */}
      <DesignPrewarm />
    </SafeAreaProvider>
  );
}
