/**
 * constants/customization.ts
 *
 * The rank-unlock customization CATALOG — one flat, data-driven list of every
 * cosmetic a user can unlock by climbing ranks. This is the ONLY place the
 * option set is defined; the store, the Customize screen, and the form-check
 * theme resolver all read from here.
 *
 * To add a new cosmetic later:
 *   • same KIND (another colour): push another entry into CUSTOMIZATIONS.
 *   • new KIND (rep-counter styles, celebration animations, orb shapes):
 *       1. add the id to CustomizationCategory
 *       2. add a CUSTOMIZATION_CATEGORIES entry
 *       3. add its options to CUSTOMIZATIONS with a category-specific `payload`
 *       4. teach lib/activeTheme.ts (or a new resolver) how to apply the payload
 *       5. render it in app/customize.tsx (it already maps over the categories)
 * Nothing else in the app hardcodes the option list.
 *
 * UNLOCKS ARE PERMANENT. `unlockTier` is checked against the user's PEAK rank
 * (components/MuscleTierMap.computeOverallPeak) — the highest tier ever
 * reached across any muscle, which never decays. Climbing never removes an
 * option; a long lay-off that drops your CURRENT rank doesn't either.
 */

import { TIER_ORDER, type Tier } from '../lib/sessionLog';

// ─── Categories ─────────────────────────────────────────────────────────────

export type CustomizationCategory = 'themeColor';
// Future: | 'repCounterStyle' | 'celebration' | 'orbShape'

export interface CustomizationCategoryMeta {
  id:    CustomizationCategory;
  label: string; // section header on the Customize screen
  blurb: string; // one-liner under the header
}

export const CUSTOMIZATION_CATEGORIES: CustomizationCategoryMeta[] = [
  {
    id:    'themeColor',
    label: 'Rank colour',
    blurb: 'Tints your ✓ orb, rep counter and accent glow on the form-check screen.',
  },
];

// ─── Options ────────────────────────────────────────────────────────────────

export type CustomizationPayload =
  | { kind: 'default' }
  | { kind: 'tier'; tier: Tier };

export interface CustomizationOption {
  id:          string;               // stable, unique — persisted as the selection
  category:    CustomizationCategory;
  label:       string;
  description: string;
  // null  → always available (every paying user has it from day one)
  // Tier  → unlocked once PEAK rank first reaches that tier, then kept forever
  unlockTier:  Tier | null;
  payload:     CustomizationPayload;
}

const TITLE = (t: string) => t[0].toUpperCase() + t.slice(1);

// One colour option per rank tier — palette itself is pulled from TIER_META at
// resolve time (lib/activeTheme.ts), so this stays colour-free and can't drift.
const TIER_COLOR_OPTIONS: CustomizationOption[] = TIER_ORDER.map((t) => ({
  id:          `themeColor:${t}`,
  category:    'themeColor' as const,
  label:       TITLE(t),
  description: `${TITLE(t)} rank colour`,
  unlockTier:  t,
  payload:     { kind: 'tier' as const, tier: t },
}));

export const CUSTOMIZATIONS: CustomizationOption[] = [
  {
    id:          'themeColor:default',
    category:    'themeColor',
    label:       'Classic',
    description: 'The original green / red look.',
    unlockTier:  null,
    payload:     { kind: 'default' },
  },
  ...TIER_COLOR_OPTIONS,
];

// ─── Lookups ────────────────────────────────────────────────────────────────

// What a fresh install has selected in every category.
export const DEFAULT_SELECTION: Record<CustomizationCategory, string> = {
  themeColor: 'themeColor:default',
};

export function optionsInCategory(cat: CustomizationCategory): CustomizationOption[] {
  return CUSTOMIZATIONS.filter((o) => o.category === cat);
}

export function optionById(id: string): CustomizationOption | undefined {
  return CUSTOMIZATIONS.find((o) => o.id === id);
}

// Unlocked = always-available, OR the user's permanent peak rank has reached
// this option's required tier.
export function isOptionUnlocked(option: CustomizationOption, peakTier: Tier | null): boolean {
  if (option.unlockTier === null) return true;
  if (!peakTier) return false;
  return TIER_ORDER.indexOf(peakTier) >= TIER_ORDER.indexOf(option.unlockTier);
}

// Count unlocked / total across everything — for the "7 / 8 unlocked" summary.
export function unlockProgress(peakTier: Tier | null): { unlocked: number; total: number } {
  const total = CUSTOMIZATIONS.length;
  const unlocked = CUSTOMIZATIONS.filter((o) => isOptionUnlocked(o, peakTier)).length;
  return { unlocked, total };
}
