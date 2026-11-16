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

// The stored answer, remembered in memory so the workout screen knows it on its very first frame (see app/workout/run.tsx): without it the
// screen drew NOTHING (a dark blank, the stack's own background) while it read the answer from storage, and then the white music screen
// appeared: a dark-to-white flash on arrival. null = not read yet.
let skipCache: boolean | null = null;
export const getMusicSkipCache = (): boolean | null => skipCache;
export const setMusicSkipCache = (v: boolean): void => { skipCache = v; };
