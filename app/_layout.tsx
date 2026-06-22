import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VIDEO_LOG_KEY    = 'formpal_video_log';
const THIRTY_DAYS_MS   = 30 * 24 * 60 * 60 * 1000;

async function pruneOldVideos() {
  try {
    const raw = await AsyncStorage.getItem(VIDEO_LOG_KEY);
    if (!raw) return;
    const log: { uri: string; ts: number }[] = JSON.parse(raw);
    const cutoff = Date.now() - THIRTY_DAYS_MS;
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
  useEffect(() => { void pruneOldVideos(); }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown:  false,
          contentStyle: { backgroundColor: '#0A0B0C' },
        }}
      />
    </SafeAreaProvider>
  );
}
