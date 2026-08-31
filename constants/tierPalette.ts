/**
 * constants/tierPalette.ts
 *
 * The rank tier colour palette, on its own so lightweight consumers (the
 * form-check theme resolver, and therefore the camera screen) don't have to
 * pull in components/MuscleTierMap and its ~90 PNG `require()`s just for a
 * lookup table.
 *
 * components/MuscleTierMap re-exports TIER_META from here, so every existing
 * `import { TIER_META } from '../components/MuscleTierMap'` keeps working.
 */

import type { Tier } from '../lib/sessionLog';

// Each tier is a real 3-stop material gradient (highlight → mid → ink), not a
// flat colour — used by the emblem art, the SVG-fallback icons, the body map,
// the badge card, and the form-check rank theme.
export const TIER_META: Record<Tier, { hi: string; lo: string; ink: string; label: string }> = {
  bronze:   { hi: '#F0C9A0', lo: '#B97A42', ink: '#7A4A22', label: 'Bronze' },
  silver:   { hi: '#FFFFFF', lo: '#C0C0C0', ink: '#585858', label: 'Silver' },
  gold:     { hi: '#FFEBB0', lo: '#E3B94D', ink: '#96701A', label: 'Gold' },
  platinum: { hi: '#E2FBF3', lo: '#7FE0C9', ink: '#1C9C82', label: 'Platinum' },
  diamond:  { hi: '#E3F7FF', lo: '#6FD3FF', ink: '#1789B8', label: 'Diamond' },
  master:   { hi: '#F1E4FF', lo: '#B98CFF', ink: '#6F3FC2', label: 'Master' },
  champion: { hi: '#FFF7DE', lo: '#FFD36E', ink: '#B9820A', label: 'Champion' },
};
