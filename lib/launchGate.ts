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

/** Backstop: whatever happens, the hidden pages are allowed to load 8 seconds after the app started. */
export const LAUNCH_BACKSTOP_MS = 8000;
const backstop: any = setTimeout(markLaunchSettled, LAUNCH_BACKSTOP_MS);
if (backstop && typeof backstop.unref === 'function') backstop.unref(); // (node tests only: never keeps a process alive)
