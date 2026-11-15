/**
 * lib/leaveToTabs.ts
 *
 * Leaving the post-workout screens (recap, streak, progress photo) back to the tabs. These used to call router.replace('/(tabs)/...'),
 * which builds a SECOND tabs screen on top of the stack: all four tab pages loaded again from scratch (the log: "layout mounted",
 * "TRAIN mounted", "home shown again | page already visible: NO", a 1s cover, pages ready 1 to 2s later) - the 5 seconds you waited
 * after Done. dismissTo pops back to the tabs that are still there underneath, with all four pages still loaded: instant.
 */
export function leaveToTabs(router: { dismissTo?: (href: any) => void; replace: (href: any) => void }, dest: string): void {
  try {
    if (typeof router.dismissTo === 'function') { router.dismissTo(dest as any); return; }
  } catch { /* fall through to replace */ }
  router.replace(dest as any);
}
