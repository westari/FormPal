/**
 * lib/demoVideos.ts
 *
 * READY FOR REAL DEMO VIDEOS. There is no video yet, so the demo screen (app/workout/run.tsx, assets/app screens/demovideo.html) plays its
 * placeholder timeline: 18 seconds, with the instruction steps spread evenly over it. The steps are already timed: every step has a
 * START TIME in seconds, and the step that is lit is always "the last step whose start time has passed". So once a real video exists the
 * steps follow it exactly.
 *
 * HOW TO SET THE TIMES (when a demo video is added for an exercise):
 *   1. Watch the video and note the second where each instruction should light up (the first one is normally 0).
 *   2. Add an entry below, keyed by the exercise id (the `id` in constants/exercises.ts), with the video's length in seconds and one
 *      start time per instruction, in the same order as the instructions (the order lib/demoCues.ts getDemoCues returns them):
 *
 *        pushup: { videoLength: 24, stepStarts: [0, 8.5, 16] },
 *
 *   3. That is all: the progress bar, the "0:08" clock, the lit step and the tap-a-step jump (it seeks to that step's start) all use these
 *      numbers. If an exercise has 3 instructions, give 3 start times; fewer entries than instructions: the missing ones are spread over
 *      the rest of the video; more: the extras are ignored. Times must go up (they are sorted for you).
 *   4. Plugging in the video file itself is the next step (it replaces the grey "Drop demo video frame" box); the timing needs no change.
 *
 * Until an exercise has an entry it uses the placeholder timeline and `timed` is false (the app logs "[DEMO] placeholder timing").
 */
export interface DemoVideoConfig {
  /** Length of the real video in seconds. */
  videoLength: number;
  /** Start time (seconds) of each instruction step, in order. */
  stepStarts: number[];
}

export const DEMO_VIDEOS: Record<string, DemoVideoConfig> = {
  // pushup: { videoLength: 24, stepStarts: [0, 8.5, 16] },   <- example, not real
};

/** The placeholder timeline used until a real video is set up (seconds). */
export const PLACEHOLDER_LENGTH = 18;

export interface DemoStep { text: string; start: number }
export interface DemoTimeline { length: number; steps: DemoStep[]; timed: boolean }

/** The timed steps for an exercise: its instructions with a start time each. */
export function demoTimeline(exerciseId: string, cues: string[], configs: Record<string, DemoVideoConfig> = DEMO_VIDEOS): DemoTimeline {
  const cfg = configs[exerciseId];
  const n = cues.length;
  if (!cfg || !(cfg.videoLength > 0) || !Array.isArray(cfg.stepStarts) || cfg.stepStarts.length === 0) {
    return { length: PLACEHOLDER_LENGTH, timed: false, steps: cues.map((text, i) => ({ text, start: +(i * PLACEHOLDER_LENGTH / Math.max(n, 1)).toFixed(2) })) };
  }
  const given = cfg.stepStarts.filter(x => Number.isFinite(x) && x >= 0 && x < cfg.videoLength).slice().sort((a, b) => a - b).slice(0, n);
  const starts = given.slice();
  // missing ones: spread over what is left of the video after the last given start
  const rest = n - starts.length;
  if (rest > 0) {
    const from = starts.length ? starts[starts.length - 1] : 0;
    const gap = (cfg.videoLength - from) / (rest + (starts.length ? 1 : 0));
    for (let i = 0; i < rest; i++) starts.push(+(from + gap * (i + (starts.length ? 1 : 0))).toFixed(2));
  }
  return { length: cfg.videoLength, timed: true, steps: cues.map((text, i) => ({ text, start: starts[i] })) };
}
