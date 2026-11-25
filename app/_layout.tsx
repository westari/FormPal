import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { removeClipFiles } from '../lib/videoStore';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureAudioSession } from '../lib/audioFeedback';
import WarmSurfaces from '../components/WarmSurfaces';
import DesignPrewarm from '../components/DesignPrewarm';
import DoneHost from '../components/DoneHost';
import { setMusicSkipCache } from '../lib/musicGate';
import { usePlanStore } from '../store/planStore';
import { installDevLogger } from '../lib/devLogger';
import { installPressHaptics } from '../lib/haptics';
import { useTabReadyVersion, allTabsReady } from '../lib/tabReady';
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

const JS_STARTED_AT = Date.now();
const FONT_WAIT_MS = 1500;
const SPLASH_BACKSTOP_MS = 8000;   // the splash never stays longer than this, whatever the pages do
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

  // HARD STOP: the app never waits for fonts longer than FONT_WAIT_MS. The log showed 28 seconds between the last module line and the
  // first screen, with the loading screen up the whole time (nothing else in this layout waits). After the stop the app draws with the
  // system font and the real fonts swap in the moment they arrive.
  const [fontWaitOver, setFontWaitOver] = useState(false);
  useEffect(() => { const t = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS); return () => clearTimeout(t); }, []);
  const ready = fontsLoaded || !!fontError || fontWaitOver;
  // THE SPLASH STAYS UP UNTIL THE TAB PAGES HAVE REALLY PAINTED (Ari 2026-11-25: about 5 s of a white screen before the app showed). The log: the fonts were ready 0.5 s after the
  // app code started and the splash was hidden then, but the four tab pages (web views) only reported "ready" 5 s later (Train: 05.7 s to 10.8 s), so the screen showed the
  // empty white web views in between. Now the splash (the app's own cream splash, not white) covers that wait, with a backstop so it can never hang.
  useTabReadyVersion();
  const firstPageUp = allTabsReady();   // all four tab pages drawn: the tab bar's own white cover (page coloured) has nothing left to cover either
  const [splashBackstop, setSplashBackstop] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSplashBackstop(true), SPLASH_BACKSTOP_MS); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (ready && (firstPageUp || splashBackstop)) {
      if (__DEV__) console.log('[LAUNCH] first screen allowed ' + (Date.now() - JS_STARTED_AT) + 'ms after the app code started | fonts: ' + (fontsLoaded ? 'loaded' : fontError ? 'failed' : 'NOT loaded yet (hard stop after ' + FONT_WAIT_MS + 'ms)'));
      void SplashScreen.hideAsync();
      if (__DEV__) console.log('[LAUNCH] splash hidden ' + (Date.now() - JS_STARTED_AT) + 'ms after the app code started (' + (firstPageUp ? 'all four tab pages have painted' : 'backstop') + ')');
    }
  }, [ready, fontsLoaded, fontError, firstPageUp, splashBackstop]);
  useEffect(() => { if (fontsLoaded && __DEV__) console.log('[LAUNCH] fonts loaded ' + (Date.now() - JS_STARTED_AT) + 'ms after the app code started'); }, [fontsLoaded]);

  useEffect(() => { void pruneOldVideos(); }, []);
  useEffect(() => { void configureAudioSession(); }, []);
  // the saved "Don't show the music screen again" answer is read at app start, so the workout screen knows it on its first frame
  useEffect(() => { AsyncStorage.getItem('formpal_skip_connect_music').then(v => setMusicSkipCache(v === '1')).catch(() => {}); }, []);
  // the saved plan goes into the plan store at app start (Start workout reads the store; an empty store showed "No workout scheduled")
  useEffect(() => { void usePlanStore.getState().loadFromStorage().catch(() => {}); }, []);

  // Block render until fonts loaded (or failed — system font fallback is fine).
  if (!ready) return null;

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
      {/* The one done screen (Ari's greatjobanimation.html), above every screen and the tab bar: components/DoneHost.tsx */}
      <DoneHost />
    </SafeAreaProvider>
  );
}
