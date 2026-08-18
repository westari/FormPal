/**
 * lib/planGenerator.ts
 *
 * Pure function: generatePlan(profile) → Plan.
 * No side effects, no randomness, no external calls — completely deterministic.
 *
 * SPLIT SELECTION LOGIC (threshold-driven, degrades gracefully):
 *
 *   Currently (3 exercises: squat, pushup, curl):
 *     Lower bucket: 1 exercise  → below threshold
 *     Upper bucket: 2 exercises → below threshold
 *     → Always picks FULL BODY. Works well: every session trains everything.
 *
 *   When catalog grows to, e.g., 8+ exercises:
 *     Lower: squat, lunge, deadlift → 3 exercises → threshold met
 *     Upper: pushup, curl, row, press → 4 → threshold met + daysPerWeek >= 4
 *     → Switches to UPPER/LOWER automatically.
 *
 *   At 15+ exercises with 6 days/week:
 *     Push, Pull, Legs each hit threshold → PUSH/PULL/LEGS.
 *
 * VARIATION IN FULL BODY:
 *   With only 3 exercises, variation comes from rotating which exercise is first
 *   (the "prime" slot gets the freshest energy — Enoka 2008). This produces 3
 *   distinct session flavors that repeat in a cycle.
 */

import { EXERCISE_CATALOG, LOCATION_EQUIPMENT, SPLIT_THRESHOLDS,
         SplitCategory, muscleCreditParts, type ExerciseDef, type Muscle } from '../constants/exercises';
import { goalParams }                        from './goalParams';
import { TIER_ORDER, tierIndex, type MuscleTiers } from './sessionLog';
import type { Plan, Workout, PlannedExercise, PlanProfile,
              ExerciseProgressionState, SplitType } from '../types/plan';

// ─── Rationale strings ────────────────────────────────────────────────────────
// Shown in the UI to explain why each session is structured this way.

const FULL_BODY_RATIONALES: Record<string, string[]> = {
  strength:   [
    'Full body strength — every compound movement, maximum load.',
    'Full body — heavy and deliberate. Quality over quantity.',
    'Full body strength — building neuromuscular power from the ground up.',
  ],
  toned: [
    'Full body — sculpting every muscle group in one session.',
    'Full body — moderate reps to build definition and burn fat.',
    'Full body — balanced stimulus for a lean, strong physique.',
  ],
  general: [
    'Full body — building your base with balanced movement.',
    'Full body — hitting every muscle group while you\'re fresh.',
    'Full body — finishing the week with a complete session.',
  ],
  weightloss: [
    'Full body circuit — maximum calorie burn, minimum rest.',
    'Full body — high reps, short rest, constant movement.',
    'Full body circuit — elevating your metabolism for hours.',
  ],
};

const UPPER_RATIONALES = ['Upper body — chest, shoulders, and arms.', 'Upper — pressing and pulling for a strong upper frame.'];
const LOWER_RATIONALES = ['Lower body — legs and glutes.', 'Lower — building power from the ground up.'];
const PUSH_RATIONALE   = 'Push day — chest, shoulders, triceps.';
const PULL_RATIONALE   = 'Pull day — back and biceps.';
const LEGS_RATIONALE   = 'Legs day — quads, hamstrings, glutes.';

// ─── Split selection ──────────────────────────────────────────────────────────

function selectSplit(eligible: ExerciseDef[], daysPerWeek: number): SplitType {
  const MIN = SPLIT_THRESHOLDS.minPerBucket;

  const countIn = (cat: SplitCategory) =>
    eligible.filter(ex => ex.splitCategories.includes(cat)).length;

  // Push/Pull/Legs: needs 5+ days and >= MIN in each of Push, Pull, Lower
  // (was 6 — 5-6 days/week is the actual PPL convention this was meant to
  // match; 6 was an off-by-one that silently fell back to Upper/Lower for
  // every 5-day profile instead).
  if (
    daysPerWeek >= 5 &&
    countIn(SplitCategory.Push)  >= MIN &&
    countIn(SplitCategory.Pull)  >= MIN &&
    countIn(SplitCategory.Lower) >= MIN
  ) {
    return 'pushPullLegs';
  }

  // Upper/Lower: needs 4+ days and >= MIN in Upper and Lower
  if (
    daysPerWeek >= 4 &&
    countIn(SplitCategory.Upper) >= MIN &&
    countIn(SplitCategory.Lower) >= MIN
  ) {
    return 'upperLower';
  }

  // Default — full body (current reality with 3 exercises)
  return 'fullBody';
}

// ─── Exercise ordering (rotate for variety) ──────────────────────────────────

function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length === 0) return arr;
  const shift = by % arr.length;
  return [...arr.slice(shift), ...arr.slice(0, shift)];
}

// ─── Movement families (for de-dup + within-family rotation) ────────────────
// Groups the catalog's own "-family variants" blocks (see constants/
// exercises.ts's section comments — squat/pushup/shoulder-press/lunge/row/
// hinge/raise families are already grouped there, just not machine-
// readable). Kept HERE rather than as a new field on ExerciseDef: this is
// purely a plan-generation concern (which variants are interchangeable for
// "don't schedule two squats in one session"), not a fact about the
// exercise itself that other consumers (form-check, CV engine) need. An id
// missing from this map is its own singleton family (no de-dup partner).
const MOVEMENT_FAMILY: Record<string, string> = {
  squat: 'squat', gobletSquat: 'squat', airSquat: 'squat', frontSquat: 'squat', backSquat: 'squat', sumoSquat: 'squat',
  pushup: 'pushup', kneePushup: 'pushup', inclinePushup: 'pushup', widePushup: 'pushup', diamondPushup: 'pushup', declinePushup: 'pushup', closegripPushup: 'pushup',
  curl: 'curl', hammerCurl: 'curl', concentrationCurl: 'curl', preacherCurl: 'curl', reverseCurl: 'curl', cableCurl: 'curl',
  lunge: 'lunge', splitSquat: 'lunge', reverseLunge: 'lunge', stepUp: 'lunge', bulgarianSplitSquat: 'lunge',
  shoulderPress: 'shoulderPress', overheadPress: 'shoulderPress', arnoldPress: 'shoulderPress', dumbbellShoulderPress: 'shoulderPress', machineShoulderPress: 'shoulderPress',
  chestPress: 'chestPress', barbellBenchPress: 'chestPress',
  tricepPushdown: 'tricep', overheadTricepExtension: 'tricep', skullcrusher: 'tricep',
  bentOverRow: 'row', barbellRow: 'row', singleArmRow: 'row', invertedRow: 'row', tBarRow: 'row', seatedCableRow: 'row', machineRow: 'row',
  romanianDeadlift: 'hinge', deadlift: 'hinge', goodMorning: 'hinge', kettlebellSwing: 'hinge', singleLegRDL: 'hinge', cablePullThrough: 'hinge',
  lateralRaise: 'raise', frontRaise: 'raise',
};
function movementFamily(ex: ExerciseDef): string {
  return MOVEMENT_FAMILY[ex.id] ?? ex.id;
}

// ─── Rank-weighted exercise scoring ───────────────────────────────────────────
// Untrained muscles score highest, Champion lowest — the generator should
// prioritize whatever's weakest, the same "weakest link" logic the rank UI
// itself already uses (see computeOverallStanding in MuscleTierMap.tsx).
// An exercise's score sums this priority across every muscle it targets,
// weighted by MuscleCredit (a primary mover counts more than an assist).
function musclePriority(muscle: Muscle, tiers: MuscleTiers): number {
  const info = tiers[muscle];
  if (!info) return TIER_ORDER.length; // untrained — highest priority of all
  return TIER_ORDER.length - 1 - tierIndex(info.tier);
}

function exerciseScore(ex: ExerciseDef, tiers: MuscleTiers): number {
  return ex.muscles.reduce((sum, entry) => {
    const { muscle, weight } = muscleCreditParts(entry);
    return sum + musclePriority(muscle, tiers) * weight;
  }, 0);
}

// Caps how many exercises land in one session — the pool used to be handed
// through unfiltered (a "Legs Day" pool of e.g. all matching catalog
// entries), which meant no rank-driven variety could show through; a real
// session has a bounded number of slots to actually compete for.
const MAX_EXERCISES_PER_SESSION = 6;

// Picks which exercises fill a session: group the pool by movement family,
// rank families by their best (i.e. weakest-muscle-serving) score, take the
// top MAX_EXERCISES_PER_SESSION families, and rotate WHICH specific variant
// represents each family using `rotationSeed`. This is what makes plans
// vary: the FAMILY chosen every week is still driven by the user's actual
// rank profile (so two users with different weak muscles get different
// plans), but the SPECIFIC exercise for a given family rotates across
// weeks/sessions (so the same user doesn't see the exact same list every
// week) — e.g. week 1 gets airSquat, week 2 gets backSquat, for the same
// "squat" family slot.
function selectExercises(pool: ExerciseDef[], tiers: MuscleTiers, rotationSeed: number): ExerciseDef[] {
  const families = new Map<string, ExerciseDef[]>();
  for (const ex of pool) {
    const fam = movementFamily(ex);
    const arr = families.get(fam) ?? [];
    arr.push(ex);
    families.set(fam, arr);
  }

  const ranked = Array.from(families.values())
    .map(exs => ({ exs, score: Math.max(...exs.map(ex => exerciseScore(ex, tiers))) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_EXERCISES_PER_SESSION);

  return ranked.map(({ exs }, i) => exs[(rotationSeed + i) % exs.length]);
}

// ─── Workout builder ──────────────────────────────────────────────────────────

function buildWorkout(
  sessionIndex: number,
  eligible:     ExerciseDef[],
  splitType:    SplitType,
  profile:      PlanProfile,
  startReps:    number,
  startSets:    number,
  restSeconds:  number,
  tiers:        MuscleTiers,
): Workout {
  let pool:       ExerciseDef[];
  let splitLabel: string;
  let rationale:  string;

  if (splitType === 'fullBody') {
    pool       = eligible;
    splitLabel = 'Full Body';
    const rationaleSet = FULL_BODY_RATIONALES[profile.goal] ?? FULL_BODY_RATIONALES.general;
    rationale  = rationaleSet[sessionIndex % rationaleSet.length];

  } else if (splitType === 'upperLower') {
    const isUpper = sessionIndex % 2 === 0;
    pool          = eligible.filter(ex =>
      ex.splitCategories.includes(isUpper ? SplitCategory.Upper : SplitCategory.Lower)
    );
    splitLabel    = isUpper ? 'Upper Body' : 'Lower Body';
    const options = isUpper ? UPPER_RATIONALES : LOWER_RATIONALES;
    rationale     = options[Math.floor(sessionIndex / 2) % options.length];

  } else {
    // pushPullLegs — cycles Push → Pull → Legs → Push → Pull → Legs …
    const bucketIndex = sessionIndex % 3;
    const bucket      = [SplitCategory.Push, SplitCategory.Pull, SplitCategory.Lower][bucketIndex];
    pool              = eligible.filter(ex => ex.splitCategories.includes(bucket));
    splitLabel        = ['Push Day', 'Pull Day', 'Legs Day'][bucketIndex];
    rationale         = [PUSH_RATIONALE, PULL_RATIONALE, LEGS_RATIONALE][bucketIndex];
  }

  // Rank-weighted, family-deduped selection (see selectExercises) — picks
  // which movement families actually fill this session, biased toward the
  // user's weakest-ranked muscles, then rotates which specific variant
  // represents each family so the same user's plan varies week to week.
  const selected = selectExercises(pool, tiers, sessionIndex);
  // Rotate the chosen list's ORDER too — different exercise still gets the
  // "prime" first slot each session, same reasoning as before.
  const ordered = rotate(selected, sessionIndex);

  const exercises: PlannedExercise[] = ordered.map(ex => ({
    exerciseId:         ex.id,
    displayName:        ex.displayName,
    targetSets:         startSets,
    targetReps:         startReps,
    restSeconds,
    currentVariationId: ex.id,
  }));

  return {
    id:            `workout_${sessionIndex}_${Date.now()}`,
    sessionNumber: sessionIndex + 1,
    splitLabel,
    rationale,
    exercises,
    completed:     false,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

// How many weeks of workouts to generate upfront.
// The store auto-regenerates when the user approaches the end.
const PLAN_WEEKS = 4;

// `tiers` defaults to empty — a brand-new user with no session history has
// no rank profile yet, and every muscle scoring as equally "untrained"
// (see musclePriority) degrades gracefully to plain catalog order, so this
// is backward compatible for day-one plans.
export function generatePlan(profile: PlanProfile, tiers: MuscleTiers = {}): Plan {
  const params = goalParams(profile.goal, profile.experience);

  // Filter catalog to exercises reachable at this location
  const available = LOCATION_EQUIPMENT[profile.location];
  const eligible  = EXERCISE_CATALOG.filter(ex =>
    ex.equipment.length === 0 ||                                    // bodyweight: always ok
    ex.equipment.every(eq => available.includes(eq))                // equipment check
  );

  if (eligible.length === 0) {
    // Shouldn't happen in practice — bodyweight exercises have no equipment requirement
    throw new Error(`No exercises available for location "${profile.location}"`);
  }

  const splitType    = selectSplit(eligible, profile.daysPerWeek);
  const totalSessions = profile.daysPerWeek * PLAN_WEEKS;

  const workouts: Workout[] = Array.from({ length: totalSessions }, (_, i) =>
    buildWorkout(i, eligible, splitType, profile, params.startReps, params.startSets, params.restSeconds, tiers)
  );

  // Initialize progression state for every eligible exercise
  const progressionState: Record<string, ExerciseProgressionState> = {};
  for (const ex of eligible) {
    progressionState[ex.id] = {
      exerciseId:             ex.id,
      currentVariationId:     ex.id,
      currentReps:            params.startReps,
      currentSets:            params.startSets,
      sessionsAtCurrentLevel: 0,
    };
  }

  return {
    id:                  `plan_${Date.now()}`,
    profile,
    splitType,
    workouts,
    progressionState,
    generatedAt:         Date.now(),
    currentWorkoutIndex: 0,
  };
}
