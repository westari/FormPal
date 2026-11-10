/**
 * lib/openRecap.ts
 *
 * ONE way to open a past workout's recap, used by Progress and Home. Two things made tapping a past workout feel
 * laggy and glitchy:
 *   - a second tap while the screen was still sliding in pushed a SECOND recap on top of the first (two heavy screens
 *     mounting at once, the first one flashing away);
 *   - the recap's data and the clip's permanent copy were only looked for after the screen was already on its way.
 * Taps inside one second of the last open are now ignored, and the clip lookup is warmed the moment the tap lands.
 */
import { keepVideosSafe } from './sessionVideo';

let lastOpenAt = 0;
let lastTs: number | null = null;

export function openRecap(router: { push: (href: any) => void }, ts: number): boolean {
  const now = Date.now();
  if (lastTs === ts && now - lastOpenAt < 1000) return false; // the same workout tapped again while it is opening
  if (now - lastOpenAt < 400) return false;                    // any second tap in the middle of the slide
  lastOpenAt = now; lastTs = ts;
  if (__DEV__) console.log('[OPEN] recap tapped', ts);
  void keepVideosSafe();
  router.push({ pathname: '/recap', params: { ts: String(ts) } });
  return true;
}
