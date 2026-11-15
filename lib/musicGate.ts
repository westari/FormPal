/**
 * lib/musicGate.ts
 *
 * "Listen to music while you train" (assets/app screens/connectmusic.html) is shown before the first exercise of a workout, but only the
 * FIRST 2 TIMES EVER (the number of times it was shown is kept on the device), then it is skipped for good. Ticking "Don't show this page
 * again" still skips it at once.
 */
export const MUSIC_MAX_SHOWS = 2;
export const MUSIC_SHOWN_KEY = 'formpal_music_shown_count';

/** skip: the stored "don't show again" flag ('1' or null); shownRaw: the stored count of times it was shown (a string or null). */
export function decideMusicGate(skip: string | null | undefined, shownRaw: string | null | undefined): { show: boolean; nextCount: number } {
  const shown = Math.max(0, parseInt(shownRaw ?? '0', 10) || 0);
  if (skip === '1' || shown >= MUSIC_MAX_SHOWS) return { show: false, nextCount: shown };
  return { show: true, nextCount: shown + 1 };
}
