/**
 * lib/musicGate.ts
 *
 * "Listen to music while you train" (assets/app screens/connectmusic.html) is shown before the first exercise of a workout until the user ticks
 * "Don't show this page again" (stored on the device); then it is skipped for good. (It used to stop after 2 showings as well: removed, the
 * tick box is enough.)
 */
/** skip: the stored "don't show again" flag ('1' or null). */
export function decideMusicGate(skip: string | null | undefined): boolean {
  return skip !== '1';
}
