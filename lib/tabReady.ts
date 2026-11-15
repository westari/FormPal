/**
 * lib/tabReady.ts
 *
 * Which of the four tab pages (index, train, progress, profile) has its web page loaded and drawn. Each tab calls markTabReady when its
 * page says "ready" and markTabLoading when iOS killed the page and it loads again. components/GlassTabBar.tsx uses it so a tab whose
 * page is still loading is never shown half-drawn (the flash on the first Train tap): the launch cover waits for all four (hard stop at
 * LAUNCH_COVER_MAX_MS), and a tap on a tab that is not ready yet shows the page-coloured cover until it is (hard stop at TAP_COVER_MAX_MS).
 */
import { useSyncExternalStore } from 'react';

export type TabName = 'index' | 'train' | 'progress' | 'profile';
export const LAUNCH_COVER_MAX_MS = 2500;
export const TAP_COVER_MAX_MS = 1500;

const ready: Record<TabName, boolean> = { index: false, train: false, progress: false, profile: false };
let version = 0;
const subs = new Set<() => void>();
const bump = () => { version++; subs.forEach((f) => f()); };

export function markTabReady(n: TabName): void { if (!ready[n]) { ready[n] = true; bump(); } }
export function markTabLoading(n: TabName): void { if (ready[n]) { ready[n] = false; bump(); } }
export function isTabReady(n: string): boolean { return !!(ready as Record<string, boolean>)[n]; }
export function allTabsReady(): boolean { return ready.index && ready.train && ready.progress && ready.profile; }
/** Test helper only. */
export function resetTabReady(): void { (Object.keys(ready) as TabName[]).forEach((k) => { ready[k] = false; }); bump(); }

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** Re-renders when any tab's readiness changes. */
export function useTabReadyVersion(): number { return useSyncExternalStore(subscribe, () => version, () => version); }
