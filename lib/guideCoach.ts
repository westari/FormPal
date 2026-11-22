/**
 * lib/guideCoach.ts
 *
 * THE GUIDE and THE COACH (docs/movement-match.md). Two jobs that must never mix:
 *
 *   THE GUIDE = the live line with the Cue stars. Its ONLY job: get the camera able to SEE the user so reps can be detected (where to
 *               stand, where the phone goes, light). Setup only. NEVER form advice.
 *   THE COACH = the check / X with a reason on each rep. Its ONLY job: form feedback on reps the camera actually saw. NEVER setup advice.
 *
 * They have separate word lists (GUIDE_LINES here, COACH_WORDS in lib/shortCue.ts) and a test enforces that no line is in both.
 * Every line is one plain line a first-time user understands, starting with a capital letter. Thresholds: lib/coachTuning.ts.
 */
import { GUIDE as G, COACH as K } from './coachTuning';
import { COACH_WORDS, coachLine } from './shortCue';
import type { MatchResult } from './movementMatch';

// ── THE GUIDE's words (setup only) ──────────────────────────────────────────────────────────────────────────────────
// Each line = ONE simple physical action a first-time user understands at once (no "so your hands show").
export const GUIDE_LINES = {
  intoPicture:  'Step into view',   // ONLY when nobody is in the picture
  backUp:       'Back up',          // too close (Ari 2026-11-15)
  backHands:    'Step back further',
  backBody:     'Step back further',
  phoneBack:    'Move your phone back',
  handsInView:  'Keep your hands in view',
  bodyInView:   'Keep your whole body in view',
  sideways:     'Turn sideways to the phone',
  facePhone:    'Face the phone',
  moreLight:    'Find more light',
  holdStill:    'Hold still',
  ready:        'Ready. Go!',
  startReps:    'Start your reps', // ONCE, when he stands in frame after Go and nothing has moved for ~6 s (Ari 2026-11-16 evening)
} as const;
export const GUIDE_WORDS: string[] = Object.values(GUIDE_LINES);
export { COACH_WORDS };

/** Exercises where the hands are what leave the frame (overhead / arm movements). */
export function handsMatter(exerciseId: string | undefined): boolean {
  return /press|overhead|raise|curl|extension|skullcrusher|pushdown|row|pulldown|pullup/i.test(exerciseId ?? '');
}

/**
 * The Guide version of any camera-side text (native hints, the "why not counting" diagnosis, setup steps), or null when the text is not
 * a setup line (a form cue is the Coach's and is never shown on the Guide).
 */
export function guideLine(text: string | null | undefined, exerciseId?: string): string | null {
  if (!text) return null;
  const t = String(text).trim().toLowerCase();
  if (!t) return null;
  const hands = handsMatter(exerciseId);
  if (/step into|get in frame|get back in frame|no person|into the frame|in the picture/.test(t)) return GUIDE_LINES.intoPicture;
  if (/too close|back up/.test(t)) return GUIDE_LINES.backUp;
  if (/phone back|too close|move back|step back|back up|tracking lost|can't see|cannot see|loses you|losing you/.test(t)) return hands ? GUIDE_LINES.backHands : GUIDE_LINES.backBody;
  if (/side-on|sideways|turn side/.test(t)) return GUIDE_LINES.sideways;
  if (/face (the )?(camera|phone)|face camera/.test(t)) return GUIDE_LINES.facePhone;
  if (/light|dark/.test(t)) return GUIDE_LINES.moreLight;
  // ("Hands at shoulders" / "Get in position" are the counter waiting for a start position, not a camera problem: no Guide line. It used to say "Lower your hands".)
  if (/hold still|stand still|stay still|steady/.test(t) && !/keep (body|hips|knees|elbows?|head|wrists?|ankles?|shoulders?)/.test(t)) return GUIDE_LINES.holdStill;
  return null;
}

// ── why the camera cannot count (the Guide's real setup fix) ────────────────────────────────────────────────────────
export type WhyCannotCount = 'nobody' | 'frame-edge' | 'cut-top' | 'cut-bottom' | 'cut-both' | 'dark' | 'low-quality' | 'angle' | 'range-only' | 'unknown';

export interface GuideInputs {
  now: number;
  exerciseId?: string;
  /** Vision found nobody at all (onDebugStats.personDetected === false) */
  personMissing: boolean;
  /** native in-rep framing cue (stats.trackingCue) */
  nativeCue?: string | null;
  /** native foreshortening hint (stats.outOfPlaneCue) */
  outOfPlaneCue?: string | null;
  /** the "why aren't reps counting" diagnosis text (lib/repDiagnostics.ts) */
  diag?: string | null;
  match: MatchResult;
  /** Movement Match HIGH with no rep counted for ~5 s / 2 attempts (lib/cameraConfidence.ts) */
  stuck: boolean;
  /** the camera rejected reps for low joint quality recently, and how dark it was */
  rejectedLowQuality?: boolean;
  rejectedDark?: boolean;
  /** which joints the camera rejected a rep for (name + best confidence), from the native "tracking unreliable" line */
  rejectedJoints?: { name: string; max: number }[];
  facing?: 'camera' | 'side';
}

export interface GuideDecision { line: string | null; why: string; reason: WhyCannotCount | 'hint' | 'none'; /** the evidence the line rests on (logged with every [GUIDE] line) */ evidence: string }

/** Picks the real reason it cannot count. Pure: the same inputs always give the same answer. */
export function whyCannotCount(i: GuideInputs): WhyCannotCount {
  if (i.personMissing) return 'nobody';
  // a cut is evidence only while it is FRESH (the window remembers 12 s; a line must not hang on after its evidence is gone)
  const ago = i.match.cutAgo ?? { top: 0, bottom: 0, frame: 0 };
  const fTop = ago.top <= G.cutFreshSec, fBot = ago.bottom <= G.cutFreshSec, fFrame = ago.frame <= G.frameCutFreshSec;
  if (i.match.cut === 'frame' && fFrame) return 'frame-edge';
  if (i.match.cut === 'both' && fTop && fBot) return 'cut-both';
  if ((i.match.cut === 'top' || i.match.cut === 'both') && fTop) return 'cut-top';
  if ((i.match.cut === 'bottom' || i.match.cut === 'both') && fBot) return 'cut-bottom';
  if (i.rejectedDark) return 'dark';
  if (i.rejectedLowQuality) return 'low-quality';
  if (i.outOfPlaneCue) return 'angle';
  if (i.match.haveData) return 'range-only';   // the camera sees the whole path fine; the strokes are just short (the Coach's job)
  return 'unknown';
}

/** The evidence behind a camera problem, in plain words (it goes into every [GUIDE] log line). */
export function evidenceFor(r: WhyCannotCount, i: GuideInputs): string {
  const m = i.match;
  switch (r) {
    case 'nobody':      return 'Vision finds nobody in the picture';
    case 'frame-edge':  return `the person was lost ${m.frameCuts} time(s) in the last 12 s (body cut off or too big in the frame)`;
    case 'cut-both':    return `the rep path stopped at BOTH ends (top ${m.topCuts}, bottom ${m.bottomCuts} in 12 s): joints lost at both ends`;
    case 'cut-top':     return `the metric samples stopped ${m.topCuts} time(s) near the TOP of the stroke in 12 s (hands / arms lost there)`;
    case 'cut-bottom':  return `the metric samples stopped ${m.bottomCuts} time(s) near the BOTTOM of the stroke in 12 s (legs / hips lost there)`;
    case 'dark':        return `the camera rejected a rep and even its best joint confidence was under 0.45 (${(i.rejectedJoints ?? []).map(j => j.name + ' max ' + j.max.toFixed(2)).join(', ') || 'low light or low quality overall'})`;
    case 'low-quality': return `the camera rejected a rep for low joint quality: ${(i.rejectedJoints ?? []).map(j => j.name + ' best ' + j.max.toFixed(2)).join(', ') || 'joints unclear'}`;
    case 'angle':       return `the camera says the angle is foreshortened ("${i.outOfPlaneCue}")`;
    case 'range-only':  return 'every joint is seen all through the stroke; the strokes are just short (a form problem, the Coach\'s job)';
    default:            return 'no data yet';
  }
}

export function guideForReason(r: WhyCannotCount, i: GuideInputs): string | null {
  const hands = handsMatter(i.exerciseId);
  switch (r) {
    case 'nobody':      return GUIDE_LINES.intoPicture;
    case 'frame-edge':  return GUIDE_LINES.phoneBack;
    case 'cut-both':    return GUIDE_LINES.phoneBack;
    case 'cut-top':     return hands ? GUIDE_LINES.handsInView : GUIDE_LINES.phoneBack;
    case 'cut-bottom':  return GUIDE_LINES.bodyInView;
    case 'dark':        return GUIDE_LINES.moreLight;
    case 'low-quality': {
      // hands only when the poorly seen joints really are the hands / arms (wrist or elbow); legs or hips = the whole body
      const names = (i.rejectedJoints ?? []).map(j => j.name);
      const armJoint = names.some(n => /wrist|elbow/i.test(n)), bodyJoint = names.some(n => /hip|knee|ankle/i.test(n));
      if (armJoint && !bodyJoint) return GUIDE_LINES.handsInView;
      return GUIDE_LINES.bodyInView;
    }
    case 'angle':       return i.facing === 'camera' ? GUIDE_LINES.facePhone : GUIDE_LINES.sideways;
    // range-only / unknown: NO camera problem is proven. Every joint is seen and the strokes are just short: that is a FORM problem, so the Guide
    // stays quiet and the Coach's half-rep X handles it (Ari 2026-11-15: it said "Keep your hands in view" while the hands were in view).
    default:            return null;
  }
}

/**
 * A calm line. What the Guide WANTS to say can change every 200ms; what the user SEES must not flicker (Ari's phone test: 3 different
 * lines in about 1 second). Rules (lib/coachTuning.ts GUIDE): a line stays at least minShowSec; a different line (or nothing) only takes
 * its place after it has been wanted, without a break, for changeConfirmSec. The text is never changed mid-way, so it cannot be cut off.
 */
export interface CalmLine { feed(now: number, wanted: string | null): string | null; reset(): void }
export function createCalmLine(): CalmLine {
  let shown: string | null = null, shownSince = 0;
  let cand: string | null = null, candSince = 0;
  return {
    feed(now, wanted) {
      if (wanted === shown) { cand = null; return shown; }
      if (shown === null) {                       // nothing is up: a new line must still be wanted for the confirm time, so a one-frame blip never shows
        if (wanted !== cand) { cand = wanted; candSince = now; }
        if (wanted !== null && now - candSince >= G.firstShowConfirmSec * 1000) { shown = wanted; shownSince = now; cand = null; }
        return shown;
      }
      if (wanted !== cand) { cand = wanted; candSince = now; }
      // the evidence is GONE (nothing wanted): hide soon (Ari 2026-11-16: a line must not hang around after its evidence has gone)
      if (wanted === null) {
        if (now - shownSince >= G.minShowGoneSec * 1000 && now - candSince >= G.goneConfirmSec * 1000) { shown = null; cand = null; }
        return shown;
      }
      if (now - shownSince >= G.minShowSec * 1000 && now - candSince >= G.changeConfirmSec * 1000) { shown = wanted; shownSince = now; cand = null; }
      return shown;
    },
    reset() { shown = null; shownSince = 0; cand = null; candSince = 0; },
  };
}

/**
 * EVIDENCE TABLE (Ari 2026-11-16): every Guide line, the exact evidence it needs, and whether the OLD (Oct 8) native build can provide it.
 * A line may only show when its evidence has been present for at least GUIDE.evidenceHoldSec, and is hidden again when the evidence is gone.
 * A line whose evidence the old build cannot provide is not in GUIDE_LINES at all (it comes back with the new build).
 */
export const GUIDE_EVIDENCE: Record<string, { evidence: string; oldBuild: boolean }> = {
  'Step into view':               { evidence: 'Vision finds nobody in the picture AND the person was never seen before (personDetected false, metric samples silent)', oldBuild: true },
  'Back up':                      { evidence: 'a person who WAS in the picture a moment ago is lost (personDetected false after being seen), or native says "Back up" / "too close" in setup', oldBuild: true },
  'Step back further':            { evidence: 'native says "Step back into frame" AND the metric samples really stop or pose gaps appear (a cue the samples contradict is ignored); or the path is cut at the frame edge', oldBuild: true },
  'Move your phone back':         { evidence: 'the rep path is cut at the frame edge or at BOTH ends (metric samples stop near both the top and the bottom)', oldBuild: true },
  'Keep your hands in view':      { evidence: 'metric samples stop near the TOP of the stroke (hands / arms lost there), or a rep was rejected and the poorly seen joints are the elbow / wrist', oldBuild: true },
  'Keep your whole body in view': { evidence: 'metric samples stop near the BOTTOM of the stroke, or a rep was rejected and the poorly seen joints are hips / knees / ankles', oldBuild: true },
  'Turn sideways to the phone':   { evidence: 'native out-of-plane cue (the angle is foreshortened) for an exercise filmed from the side', oldBuild: true },
  'Face the phone':               { evidence: 'native out-of-plane cue (the angle is foreshortened) for an exercise filmed from the front', oldBuild: true },
  'Find more light':              { evidence: 'a rep was rejected and even the best joint confidence was under 0.45', oldBuild: true },
  'Start your reps':              { evidence: 'tracking began (Go) at least 6 s ago, the person is in the picture, NO rep has counted, NO stroke attempt and no check / X since Go. Shown once per camera screen, for 4 s; never again, and never once any rep has counted (so never in a rest between sets)', oldBuild: true },
  'Hold still':                   { evidence: 'setup only: the native setup check is holding (every joint visible, the hold timer running)', oldBuild: true },
};
// REMOVED 2026-11-16 because the old build cannot give their evidence: "Step closer" (nothing tells us the person is too far), "Put your phone at chest height"
// (no evidence of the phone height), "Lower your hands" / "Raise your hands overhead" / "Get ready to start" (the "Hands at shoulders" message is the counter
// waiting for a start position; it said "Lower your hands" while his hands WERE down: wrong direction and not a camera problem).

export interface Guide {
  decide(i: GuideInputs): GuideDecision;
  reset(): void;
}

/**
 * A signal that only counts once it has held for `holdSec` without a break. The camera's own "step back / no person" signal flickers on and
 * off while the user stands still; the words only react to it once it has persisted (GUIDE.cuePersistSec).
 */
export function createCueHold(holdSec: number = G.cuePersistSec) {
  let since = 0;
  return {
    feed(now: number, active: boolean): boolean {
      if (!active) { since = 0; return false; }
      if (!since) since = now;
      return now - since >= holdSec * 1000;
    },
    reset() { since = 0; },
  };
}

/** Does the metric stream back up a native "step back / person lost" cue? True when the samples really stopped or the pose dropped. */
export function frameCueHasEvidence(i: { healthy: boolean }): boolean { return !i.healthy; }

/**
 * "Start your reps" (Ari 2026-11-16 evening): he stood still and fully in frame after Go: confidence 100, nothing happens, which is fine. But if no rep
 * comes for START_REPS_AFTER_SEC after Go, the Guide says "Start your reps" ONCE. It never repeats, and it is dead for good as soon as ANY rep counts or
 * a stroke is tried (so never in a rest between sets, never while he is working).
 */
export const START_REPS_AFTER_SEC = 6;       // PLACEHOLDER (Ari said about 6 s)
export const START_REPS_SHOW_SEC = 4;
export interface StartRepsInput {
  now: number;
  /** when tracking began (Go), ms */
  goAt: number;
  /** a rep was counted or a check / X was judged at or after Go */
  repSinceGo: boolean;
  /** Movement Match sees real strokes being tried (an attempt), counted or not */
  trying: boolean;
  /** the person is in the picture (Vision sees them) */
  personHere: boolean;
}
export function createStartReps(opts: { log?: (m: string) => void } = {}) {
  let state: 'wait' | 'showing' | 'done' = 'wait';
  let shownAt = 0;
  return {
    /** returns the line to show right now, or null */
    tick(i: StartRepsInput): string | null {
      if (state === 'done') return null;
      if (i.repSinceGo || i.trying) {
        if (state === 'showing') opts.log?.('[GUIDE] "Start your reps" hidden: he started (a rep or a stroke)');
        state = 'done'; return null;
      }
      if (state === 'wait') {
        if (i.now - i.goAt >= START_REPS_AFTER_SEC * 1000 && i.personHere) {
          state = 'showing'; shownAt = i.now;
          opts.log?.(`[GUIDE] says "${GUIDE_LINES.startReps}" because evidence: Go was ${((i.now - i.goAt) / 1000).toFixed(1)}s ago, he is in the picture, no rep counted and no stroke tried since (said once, never again)`);
          return GUIDE_LINES.startReps;
        }
        return null;
      }
      if (i.now - shownAt >= START_REPS_SHOW_SEC * 1000) { state = 'done'; return null; }
      return GUIDE_LINES.startReps;
    },
    state: () => state,
  };
}

export function createGuide(opts: { log?: (m: string) => void } = {}): Guide {
  const calm = createCalmLine();
  let lastLogLine = '', lastLogAt = 0;
  let ep = { key: '', since: 0, idx: 0, seen: 0 };
  let lastPick: string | null = null;
  let seenAt = 0;
  const evSince: Record<string, number> = {};
  const log = (now: number, line: string | null, why: string) => {
    if (!opts.log) return;
    const key = line ?? '';
    if (key === lastLogLine && now - lastLogAt < G.logEverySec * 1000) return;
    lastLogLine = key; lastLogAt = now;
    opts.log(line ? `[GUIDE] says "${line}" because ${why}` : `[GUIDE] says nothing (${why})`);
  };
  // evidence must have held for evidenceHoldSec before its line may show
  const held = (key: string, present: boolean, now: number, holdSec: number = G.evidenceHoldSec): boolean => {
    if (!present) { delete evSince[key]; return false; }
    if (!evSince[key]) evSince[key] = now;
    return now - evSince[key] >= holdSec * 1000;
  };
  return {
    decide(i) {
      const cands: { line: string; why: string; reason: GuideDecision['reason'] }[] = [];
      if (!i.personMissing) seenAt = i.now;
      // 1. nobody in the picture: "Step into view" only if they were never seen; someone who WAS in the picture a moment ago and is now lost is too close
      if (held('nobody', i.personMissing, i.now, 0)) {   // (the screen already holds the camera's own cue for GUIDE.cuePersistSec)
        const wasThere = seenAt > 0 && i.now - seenAt < 10000;
        cands.push({ line: wasThere ? GUIDE_LINES.backUp : GUIDE_LINES.intoPicture, why: wasThere ? 'evidence: the person was in the picture a moment ago and is now lost (too close)' : 'evidence: the camera finds nobody in the picture', reason: 'nobody' });
      }
      // 2. a camera problem proven by the movement itself (only while the user really moves, and only a cause the CAMERA can fix)
      const active = i.match.haveData && (i.match.trying || i.match.movingNow || !!i.match.cut);
      const cause = active && !i.personMissing ? whyCannotCount(i) : 'unknown';
      const causeLine = guideForReason(cause, i);
      if (held('cause:' + cause, !!causeLine, i.now) && causeLine) cands.push({ line: causeLine, why: 'real camera problem, evidence: ' + evidenceFor(cause, i), reason: cause });
      // 3. what the camera itself says (native cue, angle cue, the counter's diagnosis): only a line that has an evidence rule
      const hintSrc = i.nativeCue || i.outOfPlaneCue || i.diag || '';
      let hint = guideLine(i.nativeCue, i.exerciseId) ?? guideLine(i.outOfPlaneCue, i.exerciseId) ?? guideLine(i.diag, i.exerciseId);
      // the counter's generic diagnosis ("Move back") is weaker than a specific proven cause (which joints, which end): when a cause exists it speaks instead
      if (hint && !i.nativeCue && !i.outOfPlaneCue && causeLine) hint = null;
      // "Step into view" is only for a person who was never seen; someone who was in the picture a moment ago and is lost now is too close
      if (hint === GUIDE_LINES.intoPicture && seenAt > 0 && i.now - seenAt < 10000) hint = GUIDE_LINES.backUp;
      if (held('hint:' + (hint ?? ''), !!hint, i.now, i.nativeCue || i.outOfPlaneCue ? 0 : G.hintHoldSec) && hint) cands.push({ line: hint, why: `evidence: the camera says "${hintSrc}"`, reason: 'hint' });
      // distinct lines only, strongest first
      const lines: typeof cands = [];
      for (const c of cands) if (!lines.some((x) => x.line === c.line)) lines.push(c);

      // ROTATE only among causes that are ALL proven: the same tip for tipRotateSec with nothing improved -> the next proven cause. One cause = no rotation.
      let pick = lines[0] ?? null;
      if (lines.length > 1) {
        const key = lines.map((x) => x.line).join('|');
        if (ep.key !== key) {
          // a new proven cause appeared (or one went): stay on the tip that is showing; its 5 s clock keeps running
          const at = lines.findIndex((x) => x.line === lastPick);
          ep = { key, since: at >= 0 && ep.since ? ep.since : i.now, idx: at >= 0 ? at : 0, seen: i.now };
        } else ep.seen = i.now;
        if (i.now - ep.since >= G.tipRotateSec * 1000) { ep.idx += 1; ep.since = i.now; opts.log?.(`[GUIDE] same tip for ${G.tipRotateSec}s and nothing improved: next proven cause`); }
        pick = lines[ep.idx % lines.length];
      } else if (ep.key && i.now - ep.seen > 1500) ep = { key: '', since: 0, idx: 0, seen: 0 };

      lastPick = pick ? pick.line : null;
      let line: string | null = pick ? pick.line : null;
      let why = pick ? pick.why : (cause === 'range-only' ? 'nothing to fix: ' + evidenceFor('range-only', i) : 'nothing to fix: no camera problem is proven');
      const reason: GuideDecision['reason'] = pick ? pick.reason : 'none';
      const evidence = pick ? pick.why : (cause === 'range-only' ? evidenceFor('range-only', i) : '');
      // calm: a line stays up a short time and only changes when the new reason has held; it is HIDDEN soon after its evidence is gone
      const wantedLine = line;
      line = calm.feed(i.now, wantedLine);
      if (line !== wantedLine && line) why = 'holding the last line a moment (calm); ' + why;
      log(i.now, line, why);
      return { line, why, reason, evidence };
    },
    reset() { for (const k of Object.keys(evSince)) delete evSince[k]; seenAt = 0; calm.reset(); ep = { key: '', since: 0, idx: 0, seen: 0 }; lastLogLine = ''; lastLogAt = 0; },
  };
}

// ── THE COACH ───────────────────────────────────────────────────────────────────────────────────────────────────────
// ONE JUDGE (Ari 2026-11-15): the Coach shows a check or X ONLY from NATIVE events: a rep the engine counted (onRepDetected: a check, or an X with
// its form reason) or a stroke the engine saw start like a rep and not count (onAttemptMissed: X "Go higher" / "Go lower"). The JS attempt
// detector (lib/attemptDetector.ts) no longer judges anything. Exactly one verdict per native event, never two for one rep.

export interface CoachInput {
  now: number;
  match: MatchResult;
  /** 'native' = the engine counted a rep (good or with a form fault); 'missed' = the engine saw a stroke start like a rep and not count */
  source: 'native' | 'missed';
  good?: boolean;
  /** native rep: the form reason. */
  reason?: string;
  /** missed: which end was short, as the engine reported it ('short_top' | 'short_bottom') */
  missedReason?: string;
  /** native rep: did it stay on the exercise's path? false = it went far below it (the arms dropped, reaching for the phone): not this exercise, so no check and no X */
  onPath?: boolean;
}
export interface CoachVerdict { show: 'check' | 'x' | null; reason: string; why: string }

/** The X word for a missed stroke: the top was short -> "Go higher", the bottom was short -> "Go lower". */
export function missedWord(reason: string | undefined): string | null {
  if (reason === 'short_top') return 'Go higher';
  if (reason === 'short_bottom') return 'Go lower';
  return null;
}

export interface Coach {
  verdict(i: CoachInput): CoachVerdict;
  reset(): void;
}

export function createCoach(opts: { log?: (m: string) => void } = {}): Coach {
  let lastAt = -1e12;
  const out = (i: CoachInput, v: CoachVerdict): CoachVerdict => {
    if (v.show) lastAt = i.now;
    opts.log?.(v.show ? `[COACH] ${v.show === 'check' ? 'CHECK' : `X "${v.reason}"`} because ${v.why} (match ${i.match.score})` : `[COACH] withheld: ${v.why} (match ${i.match.score})`);
    return v;
  };
  return {
    verdict(i) {
      const lowMatch = i.match.haveData && i.match.notTrying;
      if (lowMatch) return out(i, { show: null, reason: '', why: 'Movement Match is LOW (not trying this exercise), so no check and no X' });
      if (i.source === 'native' && i.onPath === false) return out(i, { show: null, reason: '', why: 'the counted rep went far below the exercise path (arms dropped / reaching): it is not this exercise, so no check and no X' });
      if (i.source === 'missed') {
        // a missed stroke never stacks on a verdict that was just shown (a counted rep always gets its own)
        if (i.now - lastAt < K.oneVerdictPerSec * 1000) return out(i, { show: null, reason: '', why: 'a verdict was just shown' });
        const word = missedWord(i.missedReason);
        if (!word) return out(i, { show: null, reason: '', why: `unknown missed-stroke reason (${i.missedReason ?? 'none'})` });
        return out(i, { show: 'x', reason: word, why: `the engine saw a stroke start like a rep and not count (${i.missedReason})` });
      }
      if (i.good) return out(i, { show: 'check', reason: '', why: 'a rep counted with good form' });
      const word = coachLine(i.reason) ?? 'Full movement';
      return out(i, { show: 'x', reason: word, why: `a rep counted but the form check failed (${i.reason ?? 'no reason given'})` });
    },
    reset() { lastAt = -1e12; },
  };
}
