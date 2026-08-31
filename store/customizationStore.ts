/**
 * store/customizationStore.ts
 *
 * Persisted user customization state: which unlocked cosmetic they've SELECTED
 * per category, their shareable display name, and which peak tier they've
 * already seen a rank-up celebration for.
 *
 * Uses zustand's persist middleware (AsyncStorage-backed), same pattern as
 * store/audioSettingsStore.ts — a small flat preferences object.
 *
 * What is NOT stored here: which options are UNLOCKED. That's derived live from
 * the session log every time (peak rank → constants/customization.isOptionUnlocked),
 * so it can never get out of sync with real training history.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_SELECTION, type CustomizationCategory } from '../constants/customization';
import type { Tier } from '../lib/sessionLog';

interface CustomizationState {
  // Shown on the shareable rank badge. No name is collected at onboarding, so
  // this defaults to a neutral placeholder the user can edit on the Customize
  // screen.
  displayName: string;

  // category → selected option id. Always points at an option the user has
  // unlocked (the Customize UI won't let you pick a locked one); if the
  // session log is ever wiped, activeTheme falls back to Classic rather than
  // painting a colour that's no longer earned.
  selected: Record<CustomizationCategory, string>;

  // Highest PEAK tier we've already congratulated the user on. Lets
  // RankUpBanner fire exactly once per newly-reached tier with no separate
  // event bus. null = never celebrated (fresh install, or pre-Bronze).
  celebratedTier: Tier | null;

  setDisplayName: (name: string) => void;
  select:         (category: CustomizationCategory, optionId: string) => void;
  markCelebrated: (tier: Tier) => void;
}

export const useCustomizationStore = create<CustomizationState>()(
  persist(
    (set) => ({
      displayName:    'Athlete',
      selected:       { ...DEFAULT_SELECTION },
      celebratedTier: null,

      setDisplayName: (name) =>
        set({ displayName: name.trim().slice(0, 24) || 'Athlete' }),
      select: (category, optionId) =>
        set((s) => ({ selected: { ...s.selected, [category]: optionId } })),
      markCelebrated: (tier) => set({ celebratedTier: tier }),
    }),
    {
      name:    'formpal_customization',
      storage: createJSONStorage(() => AsyncStorage),
      // `selected` gains keys as new categories ship — always merge the
      // current defaults under whatever was persisted so old installs get the
      // new category's default instead of `undefined`.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CustomizationState>;
        return {
          ...current,
          ...p,
          selected: { ...DEFAULT_SELECTION, ...(p.selected ?? {}) },
        };
      },
    },
  ),
);
