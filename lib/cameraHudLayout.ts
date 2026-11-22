/**
 * The camera screen's layout (workout form check and solo form check), as plain numbers.
 * Ari's design (2026-11-16, measured from his 1206 x 2622 px screenshot of an iPhone 15 Pro, 393 x 852 pt, top inset 59):
 *   back button 38 pt at the top-left, three 38 pt buttons top-right, one thin glass pill per set (18 pt) with gaps,
 *   timer pill 91 x 31, white corner brackets (42 pt arms, 3 pt thick, 20 pt radius) 31 pt from each side,
 *   ONE glass pill (guide line + info icon + confidence % + green bar) in the upper-middle of the frame,
 *   the rep count at the bottom centre (the number about 66 pt tall, "/ 10" smaller and grey).
 * Everything is measured from the SAFE AREAS (never from the screen height alone), so nothing overlaps on any iPhone.
 * Kept as a pure function so a test can check six phone sizes without a phone.
 */

export const HUD_SIDE = 31;                 // brackets and the set bar sit 31 pt from each side
export const HUD_BTN = 38;                  // the round glass buttons
export const HUD_BTN_GAP = 8;
export const HUD_BTN_TOP = 6;               // below the top safe area
export const HUD_BAR_TOP_OFFSET = 65;       // set bar top, below the top safe area
export const HUD_BAR_HEIGHT = 18;          // each set is its own thin glass pill (Ari 2026-11-16 evening)
export const HUD_BAR_GAP = 8;              // the gap between the set pills
export const HUD_TIMER_TOP_OFFSET = 97;     // timer pill top, below the top safe area
export const HUD_TIMER_HEIGHT = 31;
export const HUD_TIMER_WIDTH = 91;
export const HUD_FRAME_TOP_WORKOUT = 164;   // brackets top, below the top safe area (workout: bar + timer above)
export const HUD_FRAME_TOP_SOLO = 62;       // solo: no bar or timer, the brackets start right under the buttons
export const HUD_PILL_WIDTH = 240;         // FIXED width, placed from the screen's own middle, so it is centred exactly (content-sized glass drifted off centre on the phone)
export const HUD_PILL_TOP_IN_FRAME = 12;   // the pill sits near the top of the brackets, out of the way of the body
export const HUD_PILL_MAX_HEIGHT = 112;     // two guide lines + the confidence row (a one-line pill is about 70)
export const HUD_PILL_VERDICT_HEIGHT = 52;  // while a Coach check / X shows, the Guide line is hidden and the pill is only its confidence row
export const HUD_COUNT_HEIGHT = 88;         // the rep count's own row
export const HUD_COUNT_GAP_BELOW = 10;      // between the count row and the demo drawer's peek
export const HUD_FRAME_GAP_BELOW = 14;      // between the brackets and the count row
export const HUD_FINISH_WIDTH = 76;
export const HUD_FINISH_RIGHT = 20;        // closer to the edge than the brackets, so a two-digit count ("10 / 10") never touches it on a small phone        // the small glass "Finish" pill (replaces the record button)
export const HUD_FINISH_HEIGHT = 40;
export const HUD_ORB_SIZE = 152 + 70;       // the Coach's check / X (152) and its reason pill below it

export interface Rect { top: number; left: number; width: number; height: number; }
export interface HudLayout {
  buttons: { top: number };
  bar: Rect;
  timer: Rect;
  frame: { top: number; bottom: number; left: number; right: number; height: number };
  pill: { top: number; left: number; width: number; maxHeight: number };
  count: Rect;
  stop: { bottom: number; right: number; width: number; height: number };
  /** where the Coach's check / X may draw: under the pill, above the count, inside the brackets */
  orb: { top: number; height: number; scale: number };
}

export function hudLayout(o: { width: number; height: number; insetTop: number; peekHeight: number; solo: boolean }): HudLayout {
  const { width: W, height: H, insetTop: T, peekHeight: PEEK } = o;
  const countBottom = PEEK + HUD_COUNT_GAP_BELOW;                      // distance from the screen bottom to the count row's bottom
  const frameBottomFromScreen = countBottom + HUD_COUNT_HEIGHT + HUD_FRAME_GAP_BELOW;
  const frameTop = T + (o.solo ? HUD_FRAME_TOP_SOLO : HUD_FRAME_TOP_WORKOUT);
  const frameHeight = Math.max(120, H - frameBottomFromScreen - frameTop);
  // the pill sits near the TOP of the brackets (Ari 2026-11-16 evening: higher, so it is not in the way of the body) and grows downward
  const pillTop = Math.round(frameTop + HUD_PILL_TOP_IN_FRAME);
  const pillWidth = Math.min(HUD_PILL_WIDTH, W - 2 * HUD_SIDE);
  const orbTop = pillTop + HUD_PILL_VERDICT_HEIGHT + 8;   // (the Guide is hidden while a verdict shows, so the pill is short then)
  const orbHeight = Math.max(0, frameTop + frameHeight - orbTop);
  return {
    buttons: { top: T + HUD_BTN_TOP },
    bar: { top: T + HUD_BAR_TOP_OFFSET, left: HUD_SIDE, width: W - 2 * HUD_SIDE, height: HUD_BAR_HEIGHT },
    timer: { top: T + HUD_TIMER_TOP_OFFSET, left: Math.round((W - HUD_TIMER_WIDTH) / 2), width: HUD_TIMER_WIDTH, height: HUD_TIMER_HEIGHT },
    frame: { top: frameTop, bottom: frameBottomFromScreen, left: HUD_SIDE, right: HUD_SIDE, height: frameHeight },
    pill: { top: pillTop, left: Math.round((W - pillWidth) / 2), width: pillWidth, maxHeight: HUD_PILL_MAX_HEIGHT },
    count: { top: H - countBottom - HUD_COUNT_HEIGHT, left: 0, width: W, height: HUD_COUNT_HEIGHT },
    stop: { bottom: countBottom + Math.round((HUD_COUNT_HEIGHT - HUD_FINISH_HEIGHT) / 2), right: HUD_FINISH_RIGHT, width: HUD_FINISH_WIDTH, height: HUD_FINISH_HEIGHT },
    orb: { top: orbTop, height: orbHeight, scale: orbHeight > 0 ? Math.min(1, orbHeight / HUD_ORB_SIZE) : 0 },
  };
}
