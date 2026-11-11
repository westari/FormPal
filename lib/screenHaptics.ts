/**
 * lib/screenHaptics.ts
 *
 * One haptic per press, from one place, using expo-haptics directly. (Window A is writing lib/haptics.ts with the same mapping;
 * switch the imports to it after the next merge.) Every function is safe: a build without the module, or a failure, is ignored.
 *
 *   selection  toggles, pickers, chips, steppers, tabs                      selectionAsync
 *   light      a normal button / card / row press, a rep counted           impactAsync(Light)
 *   medium     main actions (Start, Save, Finish, Log)                     impactAsync(Medium)
 *   warning    a rep rejected (the X)                                      notificationAsync(Warning)
 *   success    workout complete, rank up                                   notificationAsync(Success)
 *   error      errors                                                      notificationAsync(Error)
 */
import { hapticSelect, hapticSoft, hapticMain, hapticSuccess, hapticWarning, hapticError } from './haptics';

export type HapticKind = 'selection' | 'light' | 'medium' | 'warning' | 'success' | 'error';

// Everything goes through lib/haptics.ts now (one mapping, one guard against doubles). The page's names keep working:
// 'selection' = the lightest tick, 'light' (a button / card / row that opens something) = Soft, 'medium' (a main action) = Light.
export function haptic(kind: HapticKind): void {
  switch (kind) {
    case 'selection': hapticSelect(); break;
    case 'light':     hapticSoft(); break;
    case 'medium':    hapticMain(); break;
    case 'warning':   hapticWarning(); break;
    case 'success':   hapticSuccess(); break;
    case 'error':     hapticError(); break;
  }
}

export const isHapticKind = (k: unknown): k is HapticKind =>
  k === 'selection' || k === 'light' || k === 'medium' || k === 'warning' || k === 'success' || k === 'error';
