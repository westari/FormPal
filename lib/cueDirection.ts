/**
 * lib/cueDirection.ts
 *
 * WHICH WAY IS "FULL RANGE", PER EXERCISE (Ari 2026-11-27: a half shoulder press said "Go lower". A shoulder press needs "Go higher").
 *
 * The engine reports a half rep in METRIC terms, not body terms:
 *   short_bottom = the rep metric never got down to the rep line (the WORK end of the rep was short)
 *   short_top    = the stroke started before the metric was back up at the start value (the RETURN to the start position was short)
 * Every exercise's metric falls while the rep is worked (topAngle > rep line for all of them), but what that means for the body differs: for a squat the
 * knee angle falls as he goes DOWN, for a shoulder press the upper arm's angle from vertical falls as he presses UP. The old code turned short_bottom into
 * "Go lower" for every exercise, which is backwards for presses, curls, raises, rows, pull-ups, crunches, extensions.
 *
 * Now the words come from the exercise itself:
 *   short_bottom -> the exercise's own "not enough range" cue (constants/exerciseDefinitions.ts insufficientROMCue, the same words the engine puts on a
 *                   counted rep that was too short: "PRESS HIGHER", "GO DEEPER", "CURL HIGHER" ...), shortened for the screen (lib/shortCue.ts coachLine)
 *   short_top    -> RETURN_CUE below: how to get back to the start position (2-3 words)
 * scripts/test-cue-direction.js checks every exercise against an independent list of which way each one is worked, and fails if any cue points the wrong way.
 */
import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import { coachLine, RETURN_WORDS } from './shortCue';

/** short_top: the words for getting back to the start position, per exercise (every exercise in constants/exerciseDefinitions.ts has one; a test checks). */
export const RETURN_CUE: Record<string, (typeof RETURN_WORDS)[number]> = {
  // knee-dominant: the start is standing
  squat: 'Stand tall', gobletSquat: 'Stand tall', airSquat: 'Stand tall', frontSquat: 'Stand tall', backSquat: 'Stand tall', sumoSquat: 'Stand tall',
  lunge: 'Stand tall', splitSquat: 'Stand tall', reverseLunge: 'Stand tall', stepUp: 'Stand tall', bulgarianSplitSquat: 'Stand tall',
  // push-ups, bench, chest press, dips: the start is arms locked out
  pushup: 'Lock arms out', kneePushup: 'Lock arms out', inclinePushup: 'Lock arms out', widePushup: 'Lock arms out', diamondPushup: 'Lock arms out',
  declinePushup: 'Lock arms out', closegripPushup: 'Lock arms out', chestPress: 'Lock arms out', barbellBenchPress: 'Lock arms out', dips: 'Lock arms out',
  // shoulder presses: the start is the hands at the shoulders
  shoulderPress: 'Lower to shoulders', overheadPress: 'Lower to shoulders', arnoldPress: 'Lower to shoulders', dumbbellShoulderPress: 'Lower to shoulders',
  machineShoulderPress: 'Lower to shoulders',
  // jumping jack: the start is arms down at the sides
  jumpingJack: 'Arms down fully',
  // curls and rows: the start is the arms straight
  curl: 'Straighten arms', hammerCurl: 'Straighten arms', concentrationCurl: 'Straighten arms', preacherCurl: 'Straighten arms', reverseCurl: 'Straighten arms',
  cableCurl: 'Straighten arms', bentOverRow: 'Straighten arms', barbellRow: 'Straighten arms', singleArmRow: 'Straighten arms', invertedRow: 'Straighten arms',
  tBarRow: 'Straighten arms', seatedCableRow: 'Straighten arms', machineRow: 'Straighten arms', pullup: 'Straighten arms', facePull: 'Straighten arms',
  // triceps: the start is the elbows bent
  tricepPushdown: 'Bend elbows more', overheadTricepExtension: 'Bend elbows more', skullcrusher: 'Bend elbows more',
  // hinges: the start is standing tall
  romanianDeadlift: 'Stand tall', deadlift: 'Stand tall', goodMorning: 'Stand tall', kettlebellSwing: 'Stand tall', singleLegRDL: 'Stand tall', cablePullThrough: 'Stand tall',
  // raises: the start is the arms down
  lateralRaise: 'Lower arms fully', frontRaise: 'Lower arms fully',
  // lat pulldown: the start is the arms up
  latPulldown: 'Arms up fully',
  // leg curl: the start is the legs straight
  legCurl: 'Straighten legs',
  // crunch: the start is lying back
  crunch: 'Lie back down',
};

/** short_bottom words where the exercise's own ROM cue reads wrong for it (the definition's string stays: spoken clips are looked up by it) */
export const SHORT_CUE_OVERRIDE: Record<string, string> = {
  stepUp: 'Bend knee more',   // its ROM cue is "LUNGE DEEPER" ("Go lower"): a step-up is short when the knee barely bends on the step
  chestPress: 'Elbows further back',   // its ROM cue is "LOWER FURTHER" ("Go lower"): a seated chest press brings the handles BACK, nothing goes lower
  legCurl: 'Curl further',  // "CURL FURTHER" became "Curl higher": a seated leg curl moves the heel down and back, not higher
};

/** The X word for a half rep of this exercise. reason = the engine's short_bottom / short_top (or 'rejected'). */
export function shortRepCue(exerciseId: string | undefined, reason: string | undefined): string | null {
  const def = exerciseId ? (EXERCISE_DEFINITIONS as Record<string, any>)[exerciseId] : undefined;
  if (reason === 'short_bottom') return (exerciseId && SHORT_CUE_OVERRIDE[exerciseId]) || (def && coachLine(def.insufficientROMCue)) || 'Full movement';
  if (reason === 'short_top') return (exerciseId && RETURN_CUE[exerciseId]) || 'Full movement';
  return null;
}

/** A COUNTED rep's form reason, in screen words, for this exercise: the exercise's own "not enough range" cue uses the same words as a half rep. */
export function formCueFor(exerciseId: string | undefined, reason: string | undefined): string | null {
  const def = exerciseId ? (EXERCISE_DEFINITIONS as Record<string, any>)[exerciseId] : undefined;
  if (def && reason && def.insufficientROMCue && String(reason).trim().toLowerCase() === String(def.insufficientROMCue).trim().toLowerCase()) return shortRepCue(exerciseId, 'short_bottom');
  return coachLine(reason);
}
