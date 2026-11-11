/**
 * lib/tabBarMetrics.ts
 *
 * Size and position of the floating tab bar (components/GlassTabBar.tsx), in one place, so every screen that must scroll
 * clear of it (Home, Train, Progress, Profile) uses the same numbers as the bar itself. Pure: tests run it under node.
 */
export const TAB_BAR_H = 58;      // the Home / Train / Progress / Profile capsule
export const PLUS_SIZE = 64;      // the + button: bigger than the bar, on its own
export const TAB_BAR_SIDE = 16;   // gap to the screen edges
export const TAB_BAR_GAP = 12;    // gap between the capsule and the + button

/** Distance from the screen's bottom edge to the bar's bottom edge. */
export function tabBarBottom(insetBottom: number): number {
  return Math.max(insetBottom - 6, 10);
}

/** How much of the screen's bottom the bar covers (bar + its margin + a little air): content must scroll clear of this. */
export function tabBarCover(insetBottom: number): number {
  return tabBarBottom(insetBottom) + PLUS_SIZE + 10;
}
