/**
 * lib/screenHaptics.ts
 *
 * Retired: every screen now uses Window A's lib/haptics.ts directly (one place, one dedupe, the automatic press haptic knows when a
 * press already made its own). This file only re-exports it so nothing else breaks; delete it when convenient.
 */
export * from './haptics';
