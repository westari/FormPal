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
let H: any = null;
let tried = false;
function mod(): any {
  if (tried) return H;
  tried = true;
  try { H = require('expo-haptics'); } catch { H = null; }
  return H;
}

export type HapticKind = 'selection' | 'light' | 'medium' | 'warning' | 'success' | 'error';

export function haptic(kind: HapticKind): void {
  const h = mod();
  if (!h) return;
  try {
    switch (kind) {
      case 'selection': void h.selectionAsync(); break;
      case 'light':     void h.impactAsync(h.ImpactFeedbackStyle.Light); break;
      case 'medium':    void h.impactAsync(h.ImpactFeedbackStyle.Medium); break;
      case 'warning':   void h.notificationAsync(h.NotificationFeedbackType.Warning); break;
      case 'success':   void h.notificationAsync(h.NotificationFeedbackType.Success); break;
      case 'error':     void h.notificationAsync(h.NotificationFeedbackType.Error); break;
    }
  } catch { /* ignore */ }
}

export const isHapticKind = (k: unknown): k is HapticKind =>
  k === 'selection' || k === 'light' || k === 'medium' || k === 'warning' || k === 'success' || k === 'error';
