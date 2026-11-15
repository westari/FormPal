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
  closer:       'Step closer',
  phoneBack:    'Move your phone back',
  handsInView:  'Keep your hands in view',
  bodyInView:   'Keep your whole body in view',
  sideways:     'Turn sideways to the phone',
  facePhone:    'Face the phone',
  moreLight:    'Find more light',
  chestHeight:  'Put your phone at chest height',
  handsStart:   'Lower your hands',
  startPos:     'Get ready to start',
  raiseHands:   'Raise your hands overhead',
  lowerHands:   'Lower your hands',
  holdStill:    'Hold still',
  ready:        'Ready. Go!',
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
  if (/closer|too far/.test(t)) return GUIDE_LINES.closer;
  if (/too close|back up/.test(t)) return GUIDE_LINES.backUp;
  if (/phone back|too close|move back|step back|back up|tracking lost|can't see|cannot see|loses you|losing you/.test(t)) return hands ? GUIDE_LINES.backHands : GUIDE_LINES.backBody;
  if (/side-on|sideways|turn side/.test(t)) return GUIDE_LINES.sideways;
  if (/face (the )?(camera|phone)|face camera/.test(t)) return GUIDE_LINES.facePhone;
  if (/light|dark/.test(t)) return GUIDE_LINES.moreLight;
  if (/hands? (at|to) (your )?shoulders?/.test(t)) return GUIDE_LINES.handsStart;
  if (/start position|starting position|get in position|start again|adjust position|get ready/.test(t)) return hands && /press|overhead/i.test(exerciseId ?? '') ? GUIDE_LINES.handsStart : GUIDE_LINES.startPos;
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
  facing?: 'camera' | 'side';
}

export interface GuideDecision { line: string | null; why: string; reason: WhyCannotCount | 'hint' | 'none' }

/** Picks the real reason it cannot count. Pure: the same inputs always give the same answer. */
export function whyCannotCount(i: GuideInputs): WhyCannotCount {
  if (i.personMissing) return 'nobody';
  if (i.match.cut === 'frame') return 'frame-edge';
  if (i.match.cut === 'both') return 'cut-both';
  if (i.match.cut === 'top') return 'cut-top';
  if (i.match.cut === 'bottom') return 'cut-bottom';
  if (i.rejectedDark) return 'dark';
  if (i.rejectedLowQuality) return 'low-quality';
  if (i.outOfPlaneCue) return 'angle';
  if (i.match.haveData) return 'range-only';   // the camera sees the whole path fine; the strokes are just short (the Coach's job)
  return 'unknown';
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
    case 'low-quality': return hands ? GUIDE_LINES.handsInView : GUIDE_LINES.bodyInView;
    case 'angle':       return i.facing === 'camera' ? GUIDE_LINES.facePhone : GUIDE_LINES.sideways;
    // range-only / unknown: no single setup cause is known, but the user IS trying and nothing counts, so the Guide must still speak
    // (Ari 2026-11-13: 10 s of trying and the Guide said nothing). The one honest nudge: make sure the camera sees the moving joints.
    default:            return hands ? GUIDE_LINES.handsInView : GUIDE_LINES.bodyInView;
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
      if (now - shownSince >= G.minShowSec * 1000 && now - candSince >= G.changeConfirmSec * 1000) { shown = wanted; shownSince = now; cand = null; }
      return shown;
    },
    reset() { shown = null; shownSince = 0; cand = null; candSince = 0; },
  };
}

/**
 * A signal that only counts once it has held for `holdSec` without a break. The camera's own "step back / no person" signal flickers on and
 * off while the user stands still; the words and the confidence number only react to it once it has persisted (GUIDE.cuePersistSec).
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

/**
 * The ORDERED causes for a situation (Ari 2026-11-15: "Keep your hands in view" repeated for ever). The first tip is the most likely fix; when it has
 * shown tipRotateSec and nothing improved, the next one is tried, and so on (then it starts again). Starts with the tip the situation names.
 */
export function tipOrder(base: string, exerciseId?: string): string[] {
  const hands = handsMatter(exerciseId);
  const L = GUIDE_LINES;
  const general = hands ? [L.handsInView, L.backHands, L.phoneBack, L.moreLight, L.chestHeight] : [L.bodyInView, L.backBody, L.phoneBack, L.moreLight, L.chestHeight];
  const special: Record<string, string[]> = {
    [L.intoPicture]: [L.intoPicture, L.backHands, L.moreLight],
    [L.backUp]: [L.backUp, L.backHands, L.phoneBack, L.moreLight],
    [L.sideways]: [L.sideways, L.facePhone, L.bodyInView],
    [L.facePhone]: [L.facePhone, L.sideways, L.bodyInView],
    [L.moreLight]: [L.moreLight, L.chestHeight, L.backHands],
    [L.closer]: [L.closer, L.chestHeight, L.moreLight],
  };
  const list = special[base] ?? general;
  return [base, ...list.filter(t => t !== base)];
}

export interface Guide {
  decide(i: GuideInputs): GuideDecision;
  reset(): void;
}

export function createGuide(opts: { log?: (m: string) => void } = {}): Guide {
  const calm = createCalmLine();
  let lastLogLine = '', lastLogAt = 0;
  let ep = { key: '', since: 0, idx: 0, seen: 0, base: '' };
  let seenAt = 0;
  const log = (now: number, line: string | null, why: string) => {
    if (!opts.log) return;
    const key = line ?? '';
    if (key === lastLogLine && now - lastLogAt < G.logEverySec * 1000) return;
    lastLogLine = key; lastLogAt = now;
    opts.log(line ? `[GUIDE] says "${line}" because ${why}` : `[GUIDE] says nothing (${why})`);
  };
  return {
    decide(i) {
      let line: string | null = null, why = 'nothing to fix', reason: GuideDecision['reason'] = 'none', prio = 0;
      if (!i.personMissing) seenAt = i.now;
      // nobody in the picture: "Step into view" only if they were never seen; someone who WAS in the picture a moment ago and is now lost is too close
      if (i.personMissing) {
        const wasThere = seenAt > 0 && i.now - seenAt < 10000;
        line = wasThere ? GUIDE_LINES.backUp : GUIDE_LINES.intoPicture;
        why = wasThere ? 'the person was in the picture a moment ago and is now lost: too close' : 'the camera finds nobody in the picture';
        reason = 'nobody'; prio = 3;
      }
      else if (i.stuck && (i.match.movingNow !== false || i.match.cut)) {   // (a cut path has no recent samples, so it cannot show "moving")
        const r = whyCannotCount(i);
        line = guideForReason(r, i); reason = r; prio = 2;
        why = `you are trying but no rep counts: ${r === 'range-only' || r === 'unknown' ? 'no exact cause found, general framing nudge' : r}`;
      } else {
        const hint = guideLine(i.nativeCue, i.exerciseId) ?? guideLine(i.outOfPlaneCue, i.exerciseId) ?? guideLine(i.diag, i.exerciseId);
        if (hint) { line = hint; why = `the camera says "${i.nativeCue || i.outOfPlaneCue || i.diag}"`; reason = 'hint'; prio = 1; }
      }
      // ROTATE: the same tip for tipRotateSec and nothing improved -> the next most likely fix (ordered list per situation)
      if (line) {
        const key = reason + "|" + line;
        if (ep.key !== key) ep = { key, since: i.now, idx: 0, seen: i.now, base: line };
        else ep.seen = i.now;
        if (i.now - ep.since >= G.tipRotateSec * 1000) { ep.idx += 1; ep.since = i.now; opts.log?.(`[GUIDE] same tip for ${G.tipRotateSec}s and nothing improved: next fix`); }
        const order = tipOrder(ep.base, i.exerciseId);
        line = order[ep.idx % order.length];
      } else if (ep.key && i.now - ep.seen > 1500) ep = { key: "", since: 0, idx: 0, seen: 0, base: "" };
      // calm: a line stays up at least minShowSec and only changes when the new reason has held for changeConfirmSec
      const wantedLine = line;
      line = calm.feed(i.now, wantedLine);
      if (line !== wantedLine) why = line ? 'holding the last line (calm: a line stays up a few seconds)' : why;
      void prio;
      log(i.now, line, why);
      return { line, why, reason };
    },
    reset() { seenAt = 0; calm.reset(); ep = { key: '', since: 0, idx: 0, seen: 0, base: '' }; lastLogLine = ''; lastLogAt = 0; },
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
