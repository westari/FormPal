/**
 * lib/noSilentReps.ts
 *
 * NEVER MORE THAN ONE REP IN A ROW WITH NO RESULT (Ari 2026-11-25: he did 3 reps in a row that got no check and no cross, and the camera number did not change).
 * Every real rep attempt gets a check or a cross. A counted rep already gets its check from the engine. A stroke the screen's own attempt detector saw end as
 * "missed" or "rejected" (the engine rejected a rep without any event: the movement guard, the start-position gate, ...) and that got no verdict within a short grace
 * time gets a cross here, from the detector's own reason. (A stroke while Movement Match says he is not doing the exercise is not a real attempt: no verdict is right.)
 * If the engine rejected it because tracking was unreliable, the camera really cannot judge it: no cross, but the confidence falls and the Guide says why
 * (lib/cameraConfidence.ts / lib/guideCoach.ts), so that case is handed to the caller as "camera".
 */
export const SILENT_GRACE_MS = 1300;   // PLACEHOLDER: how long a stroke may wait for the engine's own verdict before the screen gives it one

export interface AttemptSeen { n: number; outcome: string; blocker?: string }
export type SilentResult = { kind: 'cross'; reason: 'short_bottom' | 'short_top' | 'rejected'; n: number } | { kind: 'camera'; n: number } | null;

export function crossReasonFor(blocker: string | undefined): 'short_bottom' | 'short_top' | 'rejected' {
  if (blocker === 'bottom-short') return 'short_bottom';
  if (blocker === 'top-short') return 'short_top';
  return 'rejected';   // "Full movement"
}

export function createSilentWatch() {
  let pending: { n: number; blocker?: string; at: number; unreliable: boolean }[] = [];
  let answeredAt = -1e12;
  return {
    /** an attempt (stroke) just ended, outcome counted | missed | rejected (the screen's attempt detector) */
    noteAttempt(a: AttemptSeen, now: number, unreliable = false) {
      if (a.outcome === 'counted') { answeredAt = Math.max(answeredAt, now); return; }   // the engine counted it: it gets its check
      if (a.outcome !== 'missed' && a.outcome !== 'rejected') return;
      pending.push({ n: a.n, blocker: a.blocker, at: now, unreliable });
    },
    /** a check or a cross was shown (or withheld on purpose): every stroke that ended before now is answered */
    noteAnswered(now: number) { answeredAt = Math.max(answeredAt, now); pending = pending.filter((p) => p.at > now); },
    /** call every ~200 ms while tracking */
    tick(now: number, ctx: { notTrying: boolean; engineRejectedUnreliable: boolean }): SilentResult {
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i];
        if (answeredAt >= p.at) { pending.splice(i, 1); i--; continue; }
        if (now - p.at < SILENT_GRACE_MS) continue;
        pending.splice(i, 1);
        if (ctx.notTrying) return null;                                    // not a real attempt: no verdict is right
        if (p.unreliable || ctx.engineRejectedUnreliable) return { kind: 'camera', n: p.n };
        return { kind: 'cross', reason: crossReasonFor(p.blocker), n: p.n };
      }
      return null;
    },
    pendingCount() { return pending.length; },
    reset() { pending = []; answeredAt = -1e12; },
  };
}
export type SilentWatch = ReturnType<typeof createSilentWatch>;
