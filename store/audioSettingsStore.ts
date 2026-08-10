/**
 * store/audioSettingsStore.ts
 *
 * User preferences for spoken/audio rep feedback (see lib/audioFeedback.ts).
 * Uses zustand's built-in persist middleware (AsyncStorage-backed) rather than
 * the manual load/save pattern in planStore.ts — this is a small flat
 * preferences object with no cross-store sync-layer concerns, which is
 * exactly what persist() is for.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type VoiceFrequency = 'off' | 'correctionsOnly' | 'correctionsAndCounts';

interface AudioSettingsState {
  audioEnabled:       boolean;         // master toggle — mutes voice AND chime
  soundEffectEnabled: boolean;         // good-rep chime, independently mutable
  voiceFrequency:     VoiceFrequency;  // how much the voice talks
  voiceIdentifier:    string | null;   // AVSpeechSynthesisVoice identifier; null = system default

  setAudioEnabled:       (v: boolean) => void;
  setSoundEffectEnabled: (v: boolean) => void;
  setVoiceFrequency:     (v: VoiceFrequency) => void;
  setVoiceIdentifier:    (id: string | null) => void;
}

export const useAudioSettingsStore = create<AudioSettingsState>()(
  persist(
    (set) => ({
      audioEnabled:       true,
      soundEffectEnabled: true,
      voiceFrequency:     'correctionsOnly',
      voiceIdentifier:    null,

      setAudioEnabled:       (v) => set({ audioEnabled: v }),
      setSoundEffectEnabled: (v) => set({ soundEffectEnabled: v }),
      setVoiceFrequency:     (v) => set({ voiceFrequency: v }),
      setVoiceIdentifier:    (id) => set({ voiceIdentifier: id }),
    }),
    {
      name:    'formpal_audio_settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
