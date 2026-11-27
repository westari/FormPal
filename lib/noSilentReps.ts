/**
 * lib/noSilentReps.ts
 *
 * NEVER MORE THAN ONE REP IN A ROW WITH NO RESULT (Ari 2026-11-25: he did 3 reps in a row that got no check and no cross, and the camera number did not change).
 * Every real rep attempt gets a check or a cross. A counted rep already gets its check from the engine. A stroke the screen's own attempt detector saw end as
 * "missed" or "rejected" (the engine rejected a rep without any event: the movement guard, the start-position gate, ...) and that got no verdict within a short grace
 * time gets a cross here, from the detector's own reason. (A stroke while Movement Match says he is not doing the exercise is not a real attempt: no verdict is right.)
 * If the engine rejected it because tracking was unreliable, the camera really cannot judge it: no cross, but the confidence falls and the Guide says why
 * (lib/cameraConfidence.ts / lib/guideCoach.ts), so that case is handed to the caller as "camera".
 *
 * ONE REP = ONE RESULT (Ari 2026-11-27): the attempt detector reports a stroke LATE (up to a few seconds after its low, it waits for the stroke to settle), and the
 * engine's own cross for that stroke had usually already been shown by then. The old check ("was anything answered after the attempt was REPORTED?") said no, so the
 * same half rep got a second "Go lower" from here. Now a stroke is answered when anything was answered after the stroke's own LOW (lowAt).
 *
 * STOP JUDGING OUT OF POSITION (Ari 2026-11-27): when he walks to the phone at the end (or is otherwise not clearly seen) nothing is judged: createPositionWatch.
 */
import { CONFIDENCE } from './coachTuning';

export const SILENT_GRACE_MS = 1300;   // PLACEHOLDER: how long a stroke may wait for the engine's own verdict before the screen gives it one
/** the detector sees the metric only about 2.5 times a second, so the low it reports can be up to one sample (~0.4 s) after the real low, where the engine's own
 *  verdict for that stroke may already have been shown (2026-11-27 log: low sample 33.34, cross 33.30 in a replay). PLACEHOLDER from the log's sample spacing. */
export const STROKE_LOW_SLACK_MS = 400;

export interface AttemptSeen { n: number; outcome: string; blocker?: string; /** when the stroke reached its low (the detector's own clock) */ lowAt?: number }
export type SilentResult = { kind: 'cross'; reason: 'short_bottom' | 'short_top' | 'rejected'; n: number } | { kind: 'camera'; n: number } | null;

export function crossReasonFor(blocker: string | undefined): 'short_bottom' | 'short_top' | 'rejected' {
  if (blocker === 'bottom-short') return 'short_bottom';
  if (blocker === 'top-short') return 'short_top';
  return 'rejected';   // "Full movement"
}

export function createSilentWatch() {
  let pending: { n: number; blocker?: string; at: number; strokeAt: number; unreliable: boolean }[] = [];
  let answeredAt = -1e12;
  return {
    /** an attempt (stroke) just ended, outcome counted | missed | rejected (the screen's attempt detector) */
    noteAttempt(a: AttemptSeen, now: number, unreliable = false) {
      // the engine counted it: it gets its check (that answers THIS stroke: its low, not the moment the detector got round to reporting it, which may be after the
      // next stroke's low already)
      if (a.outcome === 'counted') { answeredAt = Math.max(answeredAt, typeof a.lowAt === 'number' && isFinite(a.lowAt) && a.lowAt <= now ? a.lowAt : now); return; }
      if (a.outcome !== 'missed' && a.outcome !== 'rejected') return;
      const strokeAt = typeof a.lowAt === 'number' && isFinite(a.lowAt) && a.lowAt <= now ? a.lowAt : now;
      pending.push({ n: a.n, blocker: a.blocker, at: now, strokeAt, unreliable });
    },
    /** a check or a cross was shown (or withheld on purpose): every stroke whose low came before now is answered */
    noteAnswered(now: number) { answeredAt = Math.max(answeredAt, now); pending = pending.filter((p) => p.strokeAt - STROKE_LOW_SLACK_MS > now); },
    /** call every ~200 ms while tracking */
    tick(now: number, ctx: { notTrying: boolean; engineRejectedUnreliable: boolean; /** when the pose was last lost (a pose gap), 0 = never */ lastPoseGapAt?: number }): SilentResult {
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i];
        if (answeredAt >= p.strokeAt - STROKE_LOW_SLACK_MS) { pending.splice(i, 1); i--; continue; }   // this stroke already had its result (even before the detector reported it)
        if (now - p.at < SILENT_GRACE_MS) continue;
        pending.splice(i, 1);
        if (ctx.notTrying) return null;                                    // not a real attempt: no verdict is right
        if (p.unreliable || ctx.engineRejectedUnreliable) return { kind: 'camera', n: p.n };
        // (2026-11-27) the pose was lost after this stroke's low: the camera cannot judge it (walking to the phone, a stroke the engine never finished), so no guessed cross
        if (ctx.lastPoseGapAt && ctx.lastPoseGapAt >= p.strokeAt - STROKE_LOW_SLACK_MS) return { kind: 'camera', n: p.n };
        return { kind: 'cross', reason: crossReasonFor(p.blocker), n: p.n };
      }
      return null;
    },
    pendingCount() { return pending.length; },
    reset() { pending = []; answeredAt = -1e12; },
  };
}
export type SilentWatch = ReturnType<typeof createSilentWatch>;

/**
 * IN POSITION OR NOT (Ari 2026-11-27: "when he walks to the phone at the end it keeps firing results. Once he walks toward the camera or out of position, stop judging").
 * Out of position = nobody in the picture, or the pose was lost AGAIN AND AGAIN (POSITION_GAPS pose gaps within POSITION_GAP_WINDOW_MS). From the real logs: walking to the
 * phone loses the pose several times in a row (2026-11-27: 3 gaps in 2.8 s, then the person lost; 2026-11-16b end: 4 gaps in 3.2 s), while in the middle of a set a
 * single gap happens now and then and he is still in place (2026-11-15 before rep #5, 2026-11-15b, 2026-11-16 before rep #7): one gap alone never stops judging.
 * Judging comes back only after he has been clearly seen again (no repeated gaps AND the camera's own visibility at or above CONFIDENCE.clearVisibleMin) for
 * BACK_IN_POSITION_MS.
 */
export const POSITION_GAPS = 2;                // PLACEHOLDER (from the logs above)
export const POSITION_GAP_WINDOW_MS = 3000;    // PLACEHOLDER (from the logs above)
export const BACK_IN_POSITION_MS = 1000;       // PLACEHOLDER: clearly seen again for this long before reps are judged again

export function createPositionWatch() {
  let out = false, okSince = 0;
  return {
    /** recentGaps = pose gaps in the last POSITION_GAP_WINDOW_MS (counter signal gapsWithin) */
    update(now: number, s: { visibility: number; personMissing: boolean; recentGaps: number }): { out: boolean; changed: boolean; why: string } {
      const trigger = s.personMissing || s.recentGaps >= POSITION_GAPS;
      const ok = !trigger && s.visibility >= CONFIDENCE.clearVisibleMin;
      if (trigger && !out) { out = true; okSince = 0; return { out, changed: true, why: s.personMissing ? 'nobody is in the picture' : `the pose was lost ${s.recentGaps} times in ${POSITION_GAP_WINDOW_MS / 1000} s (camera sees ${Math.round(s.visibility)}): walking to the camera or out of position` }; }
      if (!ok) { okSince = 0; return { out, changed: false, why: '' }; }
      if (!okSince) okSince = now;
      if (out && now - okSince >= BACK_IN_POSITION_MS) { out = false; return { out, changed: true, why: `clearly seen again for ${BACK_IN_POSITION_MS} ms (camera sees ${Math.round(s.visibility)})` }; }
      return { out, changed: false, why: '' };
    },
    isOut() { return out; },
    reset() { out = false; okSince = 0; },
  };
}
export type PositionWatch = ReturnType<typeof createPositionWatch>;
