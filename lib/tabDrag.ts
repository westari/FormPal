/**
 * lib/tabDrag.ts
 *
 * The maths of the tab bar's "press and drag" (components/GlassTabBar.tsx), pure so a test can run it under node.
 *
 * What is documented about iOS 26's tab bar: a long press on it turns the selection highlight into a larger glass "selection
 * bubble" (a lens, with refraction), it follows the finger across the bar, and you open the tab you let go on. Apple publishes
 * no numbers for the lens size or the springs. The numbers below are ESTIMATES (labelled), chosen to look like the system bar
 * and easy to tune in one place.
 */

export const TAB_COUNT = 4;

/** ESTIMATE: the lens is bigger than the resting highlight, so it stands out of the bar a little, like the system one. */
export const LENS_SCALE_X = 1.2;
export const LENS_SCALE_Y = 1.32;
/** ESTIMATE: springs. The lens lifts with a little bounce, follows the finger, and settles on the tab with a small overshoot. */
export const LIFT_SPRING = { damping: 14, stiffness: 320, mass: 0.8 } as const;
export const SETTLE_SPRING = { damping: 15, stiffness: 260, mass: 0.9 } as const;
/** ESTIMATE: how far past the first/last tab the lens may be pulled, and how much of the pull it follows (rubber band). */
export const RUBBER_MAX = 14;
export const RUBBER_FACTOR = 0.35;
/** ESTIMATE: stretch along the direction of travel: 1 + speed (px per ms) * STRETCH_PER_SPEED, at most STRETCH_MAX extra. */
export const STRETCH_PER_SPEED = 0.1;
export const STRETCH_MAX = 0.16;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Which tab (0..n-1) is under x, where x is measured from the left edge of the bar and tabs start after `pad`. */
export function tabIndexAt(x: number, itemW: number, pad: number, n: number = TAB_COUNT): number {
  if (!(itemW > 0)) return 0;
  return clamp(Math.floor((x - pad) / itemW), 0, n - 1);
}

/** Left edge (relative to the first tab's left edge) of the lens while the finger is at x: centred on the finger, with a rubber band at both ends. */
export function lensLeft(x: number, itemW: number, pad: number, n: number = TAB_COUNT): number {
  const raw = x - pad - itemW / 2;
  const max = (n - 1) * itemW;
  if (raw < 0) return -Math.min(RUBBER_MAX, -raw * RUBBER_FACTOR);
  if (raw > max) return max + Math.min(RUBBER_MAX, (raw - max) * RUBBER_FACTOR);
  return raw;
}

/** Horizontal stretch for a finger speed in px per ms (direction does not matter). */
export function lensStretch(vx: number): number {
  return 1 + Math.min(STRETCH_MAX, Math.abs(vx) * STRETCH_PER_SPEED);
}

/**
 * What a touch does, from where it began and where it ended: a tap on a tab = that tab, a drag = the tab you let go on.
 * `current` is the tab that is open now. Returns the tab to open (or null for "stay") and whether to play a tick on the way.
 */
export function releaseTarget(endX: number, itemW: number, pad: number, current: number, n: number = TAB_COUNT): { open: number | null } {
  const i = tabIndexAt(endX, itemW, pad, n);
  return { open: i === current ? null : i };
}
