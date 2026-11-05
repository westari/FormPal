/**
 * lib/recapPrefetch.ts
 *
 * Hands the warm Workout Complete page (components/WarmSurfaces.tsx) its data
 * BEFORE the recap screen exists. The page is already loaded at app start; if
 * it is also already filled in when navigation happens, the card is on screen
 * in the very first frame of the recap screen — nothing left to wait for.
 *
 * recap.tsx builds the same string from the same inputs through
 * recapPageData(), so whichever side gets there first, the page ends up with
 * identical data (warmPrepare ignores a second, equal string).
 */
import { recapDataJs } from './recapInject';
import { warmPrepare } from '../components/WarmSurfaces';
import { useWorkoutSessionStore } from '../store/workoutSessionStore';

export function generateSummary(reps: number, goodReps: number, hasFormData = true): string {
  const pct = reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
  if (reps === 0)  return 'No reps were detected. Keep your full body in frame next time.';
  if (!hasFormData) return `${reps} reps counted. These moves are not form-scored.`;
  if (pct === 100) return `All ${reps} reps hit good form. Great consistency.`;
  if (pct >= 80)   return `${goodReps} of ${reps} reps hit good form (${pct}%). Solid session.`;
  if (pct >= 50)   return `${goodReps} of ${reps} reps hit good form (${pct}%). Slow down for full range.`;
  return `${goodReps} of ${reps} reps hit good form (${pct}%). Focus on control over speed.`;
}

export interface RecapPageInput {
  totalReps: number; totalGoodReps: number; moves: number; pct: number;
  hasFormData: boolean; durationSec?: number; hasVideo: boolean;
}

export function recapPageData(i: RecapPageInput): string {
  return recapDataJs({
    totalReps: i.totalReps, moves: i.moves, pct: i.pct,
    hasFormData: i.hasFormData, durationSec: i.durationSec,
    overview: generateSummary(i.totalReps, i.totalGoodReps, i.hasFormData),
    hasVideo: i.hasVideo,
  });
}

/** Call right before router.replace('/recap', { mode: 'workout' }). */
export function prefetchWorkoutRecap(): void {
  try {
    const st = useWorkoutSessionStore.getState();
    const summary = st.getSummary() ?? st.finishWorkout();
    if (!summary) return;
    warmPrepare('recap', recapPageData({
      totalReps: summary.totalReps, totalGoodReps: summary.totalGoodReps,
      moves: summary.results.filter(r => r.completed).length, pct: summary.overallFormScore,
      hasFormData: summary.results.some(r => r.completed && r.formChecked),
      durationSec: summary.durationSeconds, hasVideo: false,
    }));
    if (__DEV__) console.log('[warm:recap] prefetched before navigation (workout)');
  } catch (e) { if (__DEV__) console.warn('[warm:recap] prefetch failed', e); }
}

/** Call right before router.replace('/recap', ...) for a solo form check / analysed video. */
export function prefetchSoloRecap(p: { reps: number; goodReps: number; repCounter: boolean; durationSec?: number; hasVideo: boolean }): void {
  try {
    const formChecked = !p.repCounter;
    warmPrepare('recap', recapPageData({
      totalReps: p.reps, totalGoodReps: p.goodReps, moves: p.reps > 0 ? 1 : 0,
      pct: formChecked && p.reps > 0 ? Math.round((p.goodReps / p.reps) * 100) : 0,
      hasFormData: formChecked, durationSec: p.durationSec, hasVideo: p.hasVideo,
    }));
    if (__DEV__) console.log('[warm:recap] prefetched before navigation (solo)');
  } catch (e) { if (__DEV__) console.warn('[warm:recap] prefetch failed', e); }
}
