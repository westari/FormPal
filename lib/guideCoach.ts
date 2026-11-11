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
export const GUIDE_LINES = {
  intoPicture:  'Step into the picture',
  backHands:    'Step back so your hands show',
  backBody:     'Step back so your whole body shows',
  closer:       'Step closer to the phone',
  phoneBack:    'Move your phone back',
  handsInView:  'Keep your hands in view',
  bodyInView:   'Keep your whole body in view',
  sideways:     'Stand sideways to the phone',
  facePhone:    'Face the phone',
  moreLight:    'Find more light',
  chestHeight:  'Put your phone at chest height',
  handsStart:   'Hold your hands at your shoulders',
  startPos:     'Get into your starting position',
  raiseHands:   'Raise your hands over your head',
  lowerHands:   'Bring your hands back to your shoulders',
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
    default:            return null;   // range-only / unknown: nothing the camera setup can fix, so the Guide stays silent
  }
}

export interface Guide {
  decide(i: GuideInputs): GuideDecision;
  reset(): void;
}

export function createGuide(opts: { log?: (m: string) => void } = {}): Guide {
  let cur: { line: string; since: number; prio: number } | null = null;
  let lastLogLine = '', lastLogAt = 0;
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
      if (i.personMissing) { line = GUIDE_LINES.intoPicture; why = 'the camera finds nobody in the picture'; reason = 'nobody'; prio = 3; }
      else if (i.stuck) {
        const r = whyCannotCount(i);
        line = guideForReason(r, i); reason = r; prio = 2;
        why = line ? `you are trying but no rep counts: ${r}` : (r === 'range-only' ? 'no rep counts but the camera sees the whole path, so only the Coach speaks (each X)' : 'no rep counts and no setup fix is known');
      } else {
        const hint = guideLine(i.nativeCue, i.exerciseId) ?? guideLine(i.outOfPlaneCue, i.exerciseId) ?? guideLine(i.diag, i.exerciseId);
        if (hint) { line = hint; why = `the camera says "${i.nativeCue || i.outOfPlaneCue || i.diag}"`; reason = 'hint'; prio = 1; }
      }
      // a line stays up a few seconds before a weaker one may replace it (no flicker)
      if (cur && line !== cur.line && i.now - cur.since < G.holdSec * 1000 && prio <= cur.prio && line !== null) { line = cur.line; why = 'holding the last line'; }
      if (line) { if (!cur || cur.line !== line) cur = { line, since: i.now, prio }; else cur.prio = Math.max(cur.prio, prio); }
      else if (cur && i.now - cur.since >= G.holdSec * 1000) cur = null;
      else if (cur && prio === 0) { line = null; cur = null; }
      log(i.now, line, why);
      return { line, why, reason };
    },
    reset() { cur = null; lastLogLine = ''; lastLogAt = 0; },
  };
}

// ── THE COACH ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** A missed attempt that is about the camera (not the user's range) is never an X: it is the Guide's business. */
export function blockerIsRange(b: string | undefined): boolean { return b === 'bottom-short' || b === 'top-short' || b === 'none' || b === undefined; }

export interface CoachInput {
  now: number;
  match: MatchResult;
  /** 'native' = the engine counted a rep (good or with a form fault); 'soft' = the app counted it; 'attempt' = a stroke that did not count */
  source: 'native' | 'soft' | 'attempt';
  good?: boolean;
  /** the form reason (native) */
  reason?: string;
  /** attempts: why it did not count (lib/attemptDetector.ts Blocker) */
  blocker?: string;
  /** attempts: the range word the detector found for this stroke ("Go higher" / "Go lower") */
  rangeWord?: string;
  n?: number;
}
export interface CoachVerdict { show: 'check' | 'x' | null; reason: string; why: string }

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
      if (i.now - lastAt < K.oneVerdictPerSec * 1000) return out(i, { show: null, reason: '', why: 'a verdict was just shown' });
      if (i.source === 'attempt') {
        if (!i.match.trying) return out(i, { show: null, reason: '', why: 'Movement Match is not HIGH yet for this stroke' });
        if (!blockerIsRange(i.blocker)) return out(i, { show: null, reason: '', why: `the stroke did not count because of the camera (${i.blocker}); that is the Guide's job` });
        const word = coachLine(i.rangeWord) ?? (i.blocker === 'top-short' ? 'Go higher' : i.blocker === 'bottom-short' ? 'Go lower' : 'Full movement');
        return out(i, { show: 'x', reason: word, why: `attempt ${i.n ?? ''} stayed short (${i.blocker ?? 'range'})` });
      }
      if (i.source === 'soft') return out(i, { show: 'check', reason: '', why: 'the app counted a full stroke the engine had paused for' });
      if (i.good) return out(i, { show: 'check', reason: '', why: 'a rep counted with good form' });
      const word = coachLine(i.reason) ?? 'Full movement';
      return out(i, { show: 'x', reason: word, why: `a rep counted but the form check failed (${i.reason ?? 'no reason given'})` });
    },
    reset() { lastAt = -1e12; },
  };
}
