/**
 * lib/demoCues.ts
 *
 * "Key form cues" for the demo screen (app/workout/run.tsx) and the
 * in-workout "watch it again" overlay (app/formcheck.tsx). WHICH faults to
 * show is pulled straight off the exercise's own LIVE formCheckDefs
 * (constants/exerciseDefinitions.ts) — no second, hand-written list of
 * which cues matter per exercise, which would eventually drift out of sync
 * (see isFormCheckable's own comment in run.tsx for a real example of
 * exactly that class of bug).
 *
 * What TEXT to show for each is a separate concern: formCheckDefs' own
 * `cue` field ("HIPS DOWN", "FULL EXTENSION") is written for the LIVE
 * overlay — a short, urgent, mid-rep correction. Read as a pre-exercise
 * "how to do this" tip it's just cryptic ("Hips Down"? down from what?).
 * DEMO_INSTRUCTIONS below rewrites each one as a real standalone
 * instruction a person reads BEFORE they start, keyed off the exact same
 * cue string so the two can never disagree about which fault they mean.
 */

import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';

// Every distinct cue string used anywhere in exerciseDefinitions.ts's
// formChecks, as of this writing — if a new exercise/check adds a cue not
// listed here, getDemoCues falls back to a title-cased version of the raw
// cue (see below) rather than silently dropping it.
const DEMO_INSTRUCTIONS: Record<string, string> = {
  'ARMS STRAIGHT UP': 'Press your arms all the way overhead at the top of each rep.',
  'CHEST UP': 'Keep your chest lifted and proud through the whole movement.',
  'CONTROL IT, NO SWINGING': "Control the weight in both directions. Don't use momentum to swing it up.",
  "DON'T SWING ARMS": "Keep your arms still. Don't swing them to build momentum.",
  'DRIVE ELBOWS BACK': 'Drive your elbows back and squeeze at the top of each rep.',
  'DRIVE KNEE DOWN': 'Let your back knee drop straight down toward the floor.',
  'ELBOWS DOWN AND BACK, NOT OUT': 'Keep your elbows pointed down and back, not flared out to the sides.',
  "FACE AWAY FROM THE CAMERA, DON'T TURN": 'Face away from the camera and keep your back to it for the whole set.',
  'FACE CAMERA': 'Face the camera directly so it can see your full movement.',
  'FACE THE CAMERA': 'Face the camera directly so it can see your full movement.',
  'FULL EXTENSION': 'Straighten all the way through at the top of each rep.',
  'HIPS DOWN': "Keep your hips level with your shoulders. Don't let them rise.",
  'HIPS UP': "Keep your hips in line with your body. Don't let them sag.",
  'JUMP WIDER': 'Jump your feet out wider on each rep.',
  'KEEP ELBOW STILL': 'Pin your elbow in place and isolate the movement to your forearm.',
  'KEEP ELBOWS HIGH': 'Keep your elbows up, level with your shoulders, throughout.',
  'KEEP ELBOWS IN': 'Keep your elbows tucked in close to your sides.',
  "KEEP ELBOWS IN, DON'T FLARE OUT": "Keep your elbows tucked in. Don't let them flare out to the sides.",
  'KEEP HEELS DOWN': 'Keep your heels planted on the ground the whole rep.',
  'KEEP KNEES BENT': 'Keep a slight bend in your knees throughout the movement.',
  'KNEES OUT': 'Push your knees out in line with your toes.',
  'LOCK OUT AT TOP': 'Lock out fully at the top of each rep before lowering back down.',
  'LOWER MORE': 'Lower all the way down before reversing direction.',
  'PRESS ALL THE WAY UP': 'Press all the way up until your arms are fully extended.',
  'RAISE OUT TO THE SIDES': 'Raise your arms straight out to the sides, not forward.',
  'SIT UP TALL': 'Sit up tall and keep your spine neutral.',
  'STAY UPRIGHT': 'Keep your torso upright and still. Let the target muscle do the work.',
  'STAY UPRIGHT, NO SWINGING': "Stay upright and control the weight. Don't lean back to swing it.",
  'STOP SWINGING': 'Lift with control, not momentum. No swinging the weight.',
  'STRAIGHTEN YOUR BACK': 'Keep your back flat and hinge from your hips.',
  'TURN SIDE-ON': 'Turn side-on to the camera for a clean profile view.',
  // The rest of these are insufficientROMCue values (a second, separate
  // field on the exercise def — its own short "go deeper" style cue,
  // distinct from formChecks) rather than formChecks cues. Several
  // exercises overlap with the formChecks list above (same text, e.g.
  // "GO DEEPER") and reuse those entries; these are the ones that don't.
  'ARMS HIGHER': 'Raise your arms higher for a full range of motion.',
  'CURL FURTHER': 'Curl all the way up for a full contraction.',
  'FULL RANGE': 'Use the full range of motion on every rep.',
  'LOWER FURTHER': 'Lower all the way down before reversing direction.',
  'PULL FARTHER': 'Pull all the way through for a full contraction.',
};

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

/**
 * Lowest `priority` number first (see FormCheckDef's own doc comment — 1 is
 * checked/shown first), capped at 3 so the demo card stays a quick skim,
 * not a wall of text.
 *
 * Many exercises define left/right pairs of the SAME fault (e.g. pushup's
 * hip_pike_l/hip_pike_r both cue "HIPS DOWN") so the live engine can check
 * whichever side the camera can actually see — correct there, but taking
 * the first 3 formChecks in priority order without deduping showed
 * "Hips Down / Hips Up / Hips Down" on the demo card (pike_l, sag_l,
 * pike_r). Dedupe by cue text first, so a left/right pair collapses to the
 * one instruction a person actually reads.
 *
 * A handful of exercises (jumpingJack among them) define only one or two
 * formChecks — real, not a bug (checked against the exercise data directly)
 * — which left the demo card looking sparse. Rather than invent fault
 * checks that don't exist, this also pulls in the exercise's own
 * insufficientROMCue (a second, already-real field every exercise defines —
 * its "not deep/high/far enough" cue) as a supplemental entry when there's
 * still room under the cap.
 */
export function getDemoCues(exerciseId: string): string[] {
  const def = EXERCISE_DEFINITIONS[exerciseId as keyof typeof EXERCISE_DEFINITIONS];
  if (!def) return [];
  const seen = new Set<string>();
  const cues: string[] = [];
  for (const c of [...def.formChecks].sort((a, b) => a.priority - b.priority)) {
    if (!c.enabled || seen.has(c.cue)) continue;
    seen.add(c.cue);
    cues.push(DEMO_INSTRUCTIONS[c.cue] ?? toTitleCase(c.cue));
    if (cues.length === 3) break;
  }
  if (cues.length < 3 && def.insufficientROMCue && !seen.has(def.insufficientROMCue)) {
    cues.push(DEMO_INSTRUCTIONS[def.insufficientROMCue] ?? toTitleCase(def.insufficientROMCue));
  }
  return cues;
}
