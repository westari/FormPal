/**
 * lib/audioFeedback.ts
 *
 * Spoken form-correction cues + a non-verbal good-rep chime, both mixed OVER
 * the user's own music rather than pausing it.
 *
 * DUCKING, HOW IT WORKS (two independent mechanisms, one per audio source):
 *
 *   1. The good-rep CHIME plays through an expo-audio AudioPlayer, which uses
 *      the app's own shared AVAudioSession. configureAudioSession() (called
 *      once, from app/_layout.tsx) sets that session's category to
 *      `interruptionMode: 'duckOthers'` — the same iOS mechanism apps like
 *      Google Maps use to briefly lower Spotify/Apple Music's volume for a
 *      turn-by-turn cue, then let it climb back up. It never pauses/stops
 *      the other app's playback.
 *
 *   2. Spoken CORRECTIONS go through expo-speech (AVSpeechSynthesizer).
 *      speak() is called with `useApplicationAudioSession: false` — Apple's
 *      documented default — which tells the synthesizer to use its OWN
 *      private audio session instead of the app's. That private session is
 *      pre-configured by Apple to automatically duck other audio for the
 *      duration of the utterance and hand focus back afterward, exactly like
 *      Siri or VoiceOver. This is intentionally NOT routed through the same
 *      session as the chime — the two features are independent apps of the
 *      same underlying duck-don't-stop iOS behavior.
 *
 *   Both paths are the standard, Apple-documented way to achieve
 *   duck-over-music behavior. NOT independently confirmed on a physical
 *   device with music actually playing in this session — do that test
 *   before shipping (play Spotify, start a FormPal session, trigger a good
 *   rep and a bad rep, confirm Spotify ducks and resumes rather than
 *   pausing).
 */

import * as Speech from 'expo-speech';
import { setAudioModeAsync, createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useAudioSettingsStore } from '../store/audioSettingsStore';

let sessionConfigured = false;

export async function configureAudioSession(): Promise<void> {
  if (sessionConfigured) return;
  sessionConfigured = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode:      true,
      interruptionMode:       'duckOthers',
      shouldPlayInBackground: false,
      allowsRecording:        false,
    });
  } catch (e) {
    // Non-fatal: chime still plays, just possibly without ducking (e.g. a
    // simulator quirk) — voice ducking is unaffected since it uses its own
    // session (see file header).
    console.warn('[audioFeedback] setAudioModeAsync failed', e);
  }
}

// ─── Good-rep chime ─────────────────────────────────────────────────────────

let chimePlayer: AudioPlayer | null = null;

function getChimePlayer(): AudioPlayer {
  if (!chimePlayer) {
    chimePlayer = createAudioPlayer(require('../assets/sounds/good-rep-chime.wav'));
  }
  return chimePlayer;
}

export function playGoodRepChime(): void {
  const { audioEnabled, soundEffectEnabled } = useAudioSettingsStore.getState();
  if (!audioEnabled || !soundEffectEnabled) return;
  try {
    const player = getChimePlayer();
    player.seekTo(0).catch(() => {}).finally(() => {
      try { player.play(); } catch { /* ignore */ }
    });
  } catch (e) {
    console.warn('[audioFeedback] chime playback failed', e);
  }
}

// ─── Spoken corrections ─────────────────────────────────────────────────────

function speak(text: string): void {
  const { voiceIdentifier } = useAudioSettingsStore.getState();
  Speech.stop();
  Speech.speak(text, {
    voice:                      voiceIdentifier ?? undefined,
    rate:                       1.0,
    pitch:                      1.0,
    useApplicationAudioSession: false,
  });
}

export function speakCorrection(text: string): void {
  const { audioEnabled, voiceFrequency } = useAudioSettingsStore.getState();
  if (!audioEnabled || voiceFrequency === 'off' || !text) return;
  speak(text);
}

// Milestone rep-count announcement — deliberately sparse (every 5th good
// rep), never every rep. 5 is a reasoned pacing choice, not a CV/exercise
// threshold, so it isn't subject to the exercise-definition investigate-first
// rule — adjust freely if it feels off in testing.
const COUNT_ANNOUNCE_INTERVAL = 5;

function speakRepCount(count: number): void {
  const { audioEnabled, voiceFrequency } = useAudioSettingsStore.getState();
  if (!audioEnabled || voiceFrequency !== 'correctionsAndCounts') return;
  speak(String(count));
}

export function previewVoice(identifier: string | null): void {
  Speech.stop();
  Speech.speak('This is how I sound.', {
    voice:                      identifier ?? undefined,
    rate:                       1.0,
    pitch:                      1.0,
    useApplicationAudioSession: false,
  });
}

// ─── Rep event entry point ──────────────────────────────────────────────────
//
// Wire this into the same addRepListener callback that drives the on-screen
// RepFeedback badge (see app/formcheck.tsx) — same event, same cue text,
// spoken instead of (or in addition to, for milestones) shown.

export function handleRepAudio(good: boolean, reason: string, goodReps: number): void {
  if (good) {
    playGoodRepChime();
    if (goodReps > 0 && goodReps % COUNT_ANNOUNCE_INTERVAL === 0) {
      // Small delay so the count doesn't talk over the chime's tail.
      setTimeout(() => speakRepCount(goodReps), 300);
    }
  } else {
    speakCorrection(reason);
  }
}
