/**
 * lib/postWorkoutFlow.ts
 *
 * Decides what the "after every workout" sequence shows, per the explicit
 * spec: streak screen every time (real streak.html); progress-photo screen
 * either the FIRST time ever, or once 14+ days have passed since it was
 * last shown (not since a photo was last actually taken — "prompt", not
 * "capture", per the wording) — otherwise skipped entirely.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRST_WORKOUT_KEY = 'formpal_first_workout_done';
const LAST_PROMPT_KEY   = 'formpal_last_progress_photo_prompt';
const PROMPT_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

export type ProgressPhotoVariant = 'first' | 'recurring' | null;

// Call once per completed workout, AFTER the streak screen — mutates the
// "first workout done" flag as a side effect (matches "shown after the
// user's FIRST workout" — this IS that one-time transition).
export async function decideProgressPhotoVariant(): Promise<ProgressPhotoVariant> {
  const firstDone = await AsyncStorage.getItem(FIRST_WORKOUT_KEY);
  if (!firstDone) {
    await AsyncStorage.setItem(FIRST_WORKOUT_KEY, 'true');
    await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
    return 'first';
  }
  const lastPromptRaw = await AsyncStorage.getItem(LAST_PROMPT_KEY);
  const lastPrompt = lastPromptRaw ? parseInt(lastPromptRaw, 10) : 0;
  const daysSince = lastPrompt ? Math.floor((Date.now() - lastPrompt) / (24 * 60 * 60 * 1000)) : Infinity;
  if (!lastPrompt || Date.now() - lastPrompt >= PROMPT_INTERVAL_MS) {
    await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
    return 'recurring';
  }
  return null;
}

export async function daysSinceLastPrompt(): Promise<number> {
  const raw = await AsyncStorage.getItem(LAST_PROMPT_KEY);
  if (!raw) return 0;
  return Math.floor((Date.now() - parseInt(raw, 10)) / (24 * 60 * 60 * 1000));
}
