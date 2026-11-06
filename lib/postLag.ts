/**
 * lib/postLag.ts
 *
 * Timing log for the post-workout screens (Stop -> Workout complete -> rep feedback -> All sets -> muscle page).
 * Every line starts with "[POST-LAG]" so it can be found in logs\latest.log:
 *   [POST-LAG] +412ms (d38ms) recap: rank payload built
 * "+N" is the time since the last postLagStart() (Stop pressed / workout finished), "d" the time since the line before.
 * Development builds only; costs nothing in release.
 */
let t0 = 0;
let last = 0;

export function postLagStart(label: string): void {
  if (!__DEV__) return;
  t0 = last = Date.now();
  console.log(`[POST-LAG] +0ms START ${label}`);
}

export function postLag(label: string): void {
  if (!__DEV__) return;
  const now = Date.now();
  if (!t0) t0 = last = now;
  console.log(`[POST-LAG] +${now - t0}ms (d${now - last}ms) ${label}`);
  last = now;
}
