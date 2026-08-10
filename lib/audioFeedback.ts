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
 *   device with music actually playing — do that test once a dev-client
 *   build with both native modules linked exists (play Spotify, start a
 *   FormPal session, trigger a good rep and a bad rep, confirm Spotify ducks
 *   and resumes rather than pausing).
 *
 * NATIVE MODULE REQUIREMENT — READ BEFORE DEBUGGING "not working":
 *
 *   Both expo-speech (native id 'ExpoSpeech') and expo-audio (native id
 *   'ExpoAudio') ship real Swift/Kotlin code, not pure JS. Their JS entry
 *   points call requireNativeModule(id) at MODULE-EVALUATION time (i.e. the
 *   instant the package is imported, before any function is called) — see
 *   node_modules/expo-speech/build/ExponentSpeech.js and
 *   node_modules/expo-audio/build/AudioModule.js. If that native module
 *   isn't compiled into the current dev-client binary, requireNativeModule
 *   throws immediately and unconditionally on import.
 *
 *   A dev-client built before these packages were added to package.json
 *   will NOT have them — that's not a bug, it's exactly what "native module"
 *   means. A fresh EAS dev-client build (or local prebuild) that includes
 *   expo-speech and expo-audio in the dependency tree is required once.
 *   After that, no further rebuild is needed for JS-only changes to this
 *   file — same as every other native module in this app
 *   (modules/athlt-camera works the same way).
 *
 *   Both are therefore required with `require()` inside try/catch below —
 *   exactly the pattern modules/athlt-camera/src/index.ts already uses for
 *   ATHLTCameraNative — instead of a static top-level `import`, because a
 *   static import's underlying require() call happens outside any try/catch
 *   Babel/Metro would otherwise wrap it in, which is what crashed the whole
 *   app on launch before this fix (the exception fired while evaluating
 *   app/_layout.tsx's import chain, before RootLayout ever rendered).
 *   Every exported function below checks isVoiceAvailable()/isChimeAvailable()
 *   (or the module reference directly) before touching the native API, so a
 *   missing native module degrades to "audio feature silently does nothing"
 *   rather than crashing the app.
 */

import type * as SpeechNS from 'expo-speech';
import type * as AudioNS from 'expo-audio';
import { useAudioSettingsStore } from '../store/audioSettingsStore';

// Derived from the type-only SpeechNS import above rather than a separate
// `export type { Voice } from 'expo-speech'` re-export statement — that form
// is supposed to be elided by the TS/Babel transform, but this file exists
// specifically because a supposedly-safe expo-speech reference turned out
// not to be, so it isn't worth the risk of a transpiler edge case reviving
// the same crash for one type alias.
export type Voice = SpeechNS.Voice;

let SpeechModule: typeof SpeechNS | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SpeechModule = require('expo-speech');
} catch (e) {
  console.warn('[audioFeedback] expo-speech native module not linked — voice cues disabled until the next dev-client build.', e);
}

let AudioModule: typeof AudioNS | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AudioModule = require('expo-audio');
} catch (e) {
  console.warn('[audioFeedback] expo-audio native module not linked — good-rep chime disabled until the next dev-client build.', e);
}

export function isVoiceAvailable(): boolean { return SpeechModule !== null; }
export function isChimeAvailable(): boolean { return AudioModule !== null; }

// ─── Audio session (ducking) ────────────────────────────────────────────────

let sessionConfigured = false;

export async function configureAudioSession(): Promise<void> {
  if (sessionConfigured || !AudioModule) return;
  sessionConfigured = true;
  try {
    await AudioModule.setAudioModeAsync({
      playsInSilentMode:      true,
      interruptionMode:       'duckOthers',
      shouldPlayInBackground: false,
      allowsRecording:        false,
    });
  } catch (e) {
    // Non-fatal: chime still attempts to play, just possibly without
    // ducking (e.g. a simulator quirk) — voice ducking is unaffected since
    // it uses its own session (see file header).
    console.warn('[audioFeedback] setAudioModeAsync failed', e);
  }
}

// ─── Good-rep chime ─────────────────────────────────────────────────────────

let chimePlayer: AudioNS.AudioPlayer | null = null;

function getChimePlayer(): AudioNS.AudioPlayer | null {
  if (!AudioModule) return null;
  if (!chimePlayer) {
    try {
      chimePlayer = AudioModule.createAudioPlayer(require('../assets/sounds/good-rep-chime.wav'));
    } catch (e) {
      console.warn('[audioFeedback] failed to create chime player', e);
      return null;
    }
  }
  return chimePlayer;
}

export function playGoodRepChime(): void {
  const { audioEnabled, soundEffectEnabled } = useAudioSettingsStore.getState();
  if (!audioEnabled || !soundEffectEnabled) return;
  const player = getChimePlayer();
  if (!player) return;
  try {
    player.seekTo(0).catch(() => {}).finally(() => {
      try { player.play(); } catch { /* ignore */ }
    });
  } catch (e) {
    console.warn('[audioFeedback] chime playback failed', e);
  }
}

// ─── Spoken corrections ─────────────────────────────────────────────────────

function speak(text: string): void {
  if (!SpeechModule) return;
  const { voiceIdentifier } = useAudioSettingsStore.getState();
  try {
    SpeechModule.stop();
    SpeechModule.speak(text, {
      voice:                      voiceIdentifier ?? undefined,
      rate:                       1.0,
      pitch:                      1.0,
      useApplicationAudioSession: false,
    });
  } catch (e) {
    console.warn('[audioFeedback] speech playback failed', e);
  }
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
  if (!SpeechModule) return;
  try {
    SpeechModule.stop();
    SpeechModule.speak('This is how I sound.', {
      voice:                      identifier ?? undefined,
      rate:                       1.0,
      pitch:                      1.0,
      useApplicationAudioSession: false,
    });
  } catch (e) {
    console.warn('[audioFeedback] voice preview failed', e);
  }
}

export async function listAvailableVoices(): Promise<SpeechNS.Voice[]> {
  if (!SpeechModule) return [];
  try {
    return await SpeechModule.getAvailableVoicesAsync();
  } catch (e) {
    console.warn('[audioFeedback] getAvailableVoicesAsync failed', e);
    return [];
  }
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
