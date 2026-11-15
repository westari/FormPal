/**
 * lib/doneTimeline.ts
 *
 * The timeline of the shared Done screen (components/DoneScreen.tsx), as a pure function of time so it can be tested without a phone.
 * About 1.5 seconds: the green circle draws itself (slow and smooth), then the check draws inside it, then the title fades up, then the grey
 * line. A success haptic fires when the check finishes. Workout variant: the reps count up live. Streak variant: the flame grows.
 * ALL TIMES ARE PLACEHOLDERS (Ari asked for "about 1.5 seconds"); change them here, in one place.
 */
export type DoneVariant = 'small' | 'workout' | 'streak';

export const DONE_TIMES = {
  circleStart: 0, circleEnd: 750,       // the circle draws itself, slowly
  checkStart: 650, checkEnd: 1050,      // the check draws inside it
  hapticAt: 1050,                       // the success haptic: the moment the check is finished
  titleStart: 950, titleEnd: 1350,      // title fades up
  subStart: 1100, subEnd: 1450,         // the optional grey line
  countStart: 900, countEnd: 1450,      // workout: reps counting up
  flameStart: 500, flameEnd: 1100,      // streak: the flame grows
  total: 1500,                          // the animation is done
  hold: 200,                            // it stays up this long after, then the screen finishes by itself
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export interface DoneFrame {
  circle: number;      // 0-1 how much of the circle is drawn
  check: number;       // 0-1 how much of the check is drawn
  titleOpacity: number; titleRise: number;   // rise in points (10 -> 0)
  subOpacity: number;
  count: number;       // workout: the number shown (0 -> reps)
  flame: number;       // streak: scale 0 -> 1 (overshoots a little)
  hapticDue: boolean;  // t has passed the haptic moment
}

export function doneFrame(t: number, opts: { reps?: number } = {}): DoneFrame {
  const T = DONE_TIMES;
  const title = easeOut(seg(t, T.titleStart, T.titleEnd));
  return {
    circle: easeInOut(seg(t, T.circleStart, T.circleEnd)),
    check: easeInOut(seg(t, T.checkStart, T.checkEnd)),
    titleOpacity: title, titleRise: (1 - title) * 10,
    subOpacity: easeOut(seg(t, T.subStart, T.subEnd)),
    count: Math.round((opts.reps ?? 0) * easeOut(seg(t, T.countStart, T.countEnd))),
    flame: easeOutBack(seg(t, T.flameStart, T.flameEnd)),
    hapticDue: t >= T.hapticAt,
  };
}

/** The words each variant shows (the app passes the real numbers in). */
export function doneWords(variant: DoneVariant, p: { title?: string; subtitle?: string; streak?: number }): { title: string; subtitle: string | null } {
  if (variant === 'streak') {
    const n = Math.max(1, p.streak ?? 1);
    return { title: p.title ?? `${n}-day streak`, subtitle: p.subtitle ?? 'Come back tomorrow to keep it going.' };
  }
  if (variant === 'workout') return { title: p.title ?? 'Workout complete', subtitle: p.subtitle ?? null };
  return { title: p.title ?? 'Done', subtitle: p.subtitle ?? null };
}
