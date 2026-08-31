/**
 * lib/activeTheme.ts
 *
 * Turns the user's selected `themeColor` option id into a ready-to-paint set
 * of colours for the form-check screen. Every screen that renders a
 * rank-colourable element (RepFeedback orb, rep counter, positioning-guide
 * glow, rep flash) reads a FormTheme from here — never a raw option id, never
 * a hardcoded hex.
 *
 * Adding a new colourable element = add a field to FormTheme + fill it in both
 * CLASSIC_THEME and resolveFormTheme, then consume it at the call site.
 */

import { useMemo } from 'react';

import { useCustomizationStore } from '../store/customizationStore';
import { optionById } from '../constants/customization';
import { TIER_META } from '../constants/tierPalette';

export interface FormTheme {
  id:        string;
  label:     string;
  isDefault: boolean;
  orbGood:   string; // ✓ orb tint
  orbBad:    string; // ✗ orb tint — RED on every theme, on purpose (see below)
  repText:   string; // rep-counter number
  accent:    string; // positioning-guide "ready" glow, "Ready — go!" tick, rep flash
  accentSoft: string; // translucent accent for fills
}

// Classic — the exact values RepFeedback / formcheck shipped with before the
// customization system. Selecting "Classic" (or any not-yet-unlocked option)
// resolves to this.
export const CLASSIC_THEME: FormTheme = {
  id:         'themeColor:default',
  label:      'Classic',
  isDefault:  true,
  orbGood:    '#32d74b',
  orbBad:     '#ff453a',
  repText:    '#ffffff',
  accent:     '#8affb0',
  accentSoft: 'rgba(50,215,75,0.14)',
};

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function resolveFormTheme(optionId: string): FormTheme {
  const opt = optionById(optionId);
  if (!opt || opt.category !== 'themeColor' || opt.payload.kind === 'default') {
    return CLASSIC_THEME;
  }

  const meta = TIER_META[opt.payload.tier];
  return {
    id:        opt.id,
    label:     opt.label,
    isDefault: false,
    // `lo` is each tier's saturated mid stop — the shade that actually reads
    // AS that metal. `hi` is near-white, `ink` near-black.
    orbGood:   meta.lo,
    // ✗ is ALWAYS red. A gold / teal / purple "bad rep" mark is genuinely
    // confusing — red-means-wrong is worth more than palette consistency.
    orbBad:    '#ff453a',
    repText:   meta.lo,
    accent:    meta.hi,
    accentSoft: hexToRgba(meta.lo, 0.16),
  };
}

// Hook form for screens. The Customize UI only lets you select an unlocked
// option, so this doesn't re-check the lock — but an unknown/removed id still
// falls back to Classic via resolveFormTheme.
export function useFormTheme(): FormTheme {
  const optionId = useCustomizationStore((s) => s.selected.themeColor);
  return useMemo(() => resolveFormTheme(optionId), [optionId]);
}
