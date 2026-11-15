/**
 * lib/launchGate.ts
 *
 * The app opens its four tab pages first and nothing else. The big hidden pages (workout recap, the Create workout / My workouts /
 * Log a session warm-ups) used to start loading at the same moment, so the web engine and the JS thread were shared between ten
 * pages and the tabs were still not ready 6 seconds after launch (see [TAB-LAG] in the log). Those hidden pages now wait for
 * this gate. components/GlassTabBar.tsx opens it a moment after the tabs have been visited; a backstop opens it anyway.
 */
import { useSyncExternalStore } from 'react';

let settled = false;
const subs = new Set<() => void>();

export function markLaunchSettled(): void {
  if (settled) return;
  settled = true;
  subs.forEach((f) => f());
}
export function isLaunchSettled(): boolean { return settled; }
/** Test helper only. */
export function resetLaunchGate(): void { settled = false; }

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useLaunchSettled(): boolean { return useSyncExternalStore(subscribe, () => settled, () => settled); }

/** Backstop: whatever happens, the hidden pages are allowed to load this long after the TAB BAR mounted (not after the app's JS
 *  started: the log showed 28 seconds between the two, so a timer started at import time had already run out). */
export const LAUNCH_BACKSTOP_MS = 8000;
let backstopStarted = false;
export function startLaunchBackstop(): void {
  if (backstopStarted) return;
  backstopStarted = true;
  const t: any = setTimeout(markLaunchSettled, LAUNCH_BACKSTOP_MS);
  if (t && typeof t.unref === 'function') t.unref(); // (node tests only: never keeps a process alive)
}
