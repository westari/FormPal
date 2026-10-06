/**
 * lib/onboardingGoals.ts
 *
 * Turns the onboarding answers (mainGoal + weight/goalWeight + experience +
 * sex) into a single goal sentence and a real target date. Always the
 * conservative end of the stated rate ranges — this is a projection shown
 * to a new user before they've trained a single rep with the app, not a
 * promise, so it should under-sell rather than over-sell.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function addDays(days: number): Date {
  return new Date(Date.now() + days * 86400000);
}

// Capped at 6 months out — a projection further than that stops being
// useful (and starts looking made up).
const MAX_WEEKS = 26;

export type GoalKind = 'muscle' | 'fat' | 'recomp';

export interface GoalPlan {
  kind:          GoalKind;
  sentence:      string;   // "Lift at 90% clean form and build up to 185 lbs by Dec 1."
  shortGoal:     string;   // "185 lbs" | "Lose fat, gain muscle"
  goalDate:      Date;
  goalDateLabel: string;
  milestoneDate: Date;          // always today + 3 weeks
  milestoneDateLabel: string;
  deltaLbs?:     number;        // whole lbs — muscle/fat: the single delta; recomp: both directions
}

// Monthly % of bodyweight gained, by experience — halved for Female per
// the stated rule. Conservative (low) end of the usual hypertrophy-rate
// ranges: a beginner can add muscle fastest ("newbie gains"), advanced
// lifters slowest.
function musclePctPerMonth(experience: unknown, sex: unknown): number {
  const base =
    experience === 'Beginner' ? 1 :
    experience === 'Advanced' ? 0.25 :
    0.5; // 'Some experience' | 'Intermediate' | unknown
  return sex === 'Female' ? base / 2 : base;
}

function weeksCappedDate(weeks: number): Date {
  const capped = Math.max(1, Math.min(MAX_WEEKS, Math.round(weeks)));
  return addDays(capped * 7);
}

// goalpace.html's own relaxed/balanced/aggressive presets are 0.5/1.0/1.5
// — same range its drag track is clamped to (0.25-1.5), balanced (1.0)
// matching the pre-pace-screen default rates below exactly.
const PACE_MIN = 0.25;
const PACE_MAX = 1.5;
const PACE_DEFAULT = 1.0;

export function computeGoalPlan(answers: Record<string, any>): GoalPlan {
  const weight = typeof answers.weight === 'number' ? answers.weight : 160;
  const goalWeight = typeof answers.goalWeight === 'number' ? answers.goalWeight : weight;
  const milestoneDate = addDays(21);
  const milestoneDateLabel = formatDate(milestoneDate);
  const paceRaw = typeof answers.pace === 'number' ? answers.pace : PACE_DEFAULT;
  const pace = Math.max(PACE_MIN, Math.min(PACE_MAX, paceRaw));

  // Matched by prefix, not exact equality — mainGoal's stored value is
  // whatever the full option label is (e.g. "Lose fat / Lose weight"), and
  // exact-matching the old short string broke the moment the onboarding
  // copy changed. Prefix match is resilient to that.
  const goalStr = typeof answers.mainGoal === 'string' ? answers.mainGoal : '';
  if (goalStr.startsWith('Lose fat')) {
    // BUG FOUND (twice now): first `|| 10`, then `Math.max(1, ...)` —
    // weight/goalWeight above are ALREADY guaranteed real numbers (both
    // have their own safe-default fallback), so neither guard could ever
    // catch real NaN — their only actual effect was masking a
    // legitimately-zero delta (equal weight/goalWeight) as a fixed wrong
    // number. Explicit spec: X = 0 when they're equal. weeksCappedDate
    // below already floors at 1 week on its own, so a 0 delta here is
    // safe all the way through.
    const deltaLbs = Math.abs(Math.round(weight - goalWeight));
    const weeklyRate = weight * 0.005 * pace; // 0.5% of bodyweight per week, scaled by chosen pace
    const weeks = deltaLbs / weeklyRate;
    const goalDate = weeksCappedDate(weeks);
    const goalDateLabel = formatDate(goalDate);
    return {
      kind: 'fat', deltaLbs, goalDate, goalDateLabel, milestoneDate, milestoneDateLabel,
      shortGoal: `${Math.round(goalWeight)} lbs`,
      sentence: `Lift at 90% clean form and get down to ${Math.round(goalWeight)} lbs by ${goalDateLabel}.`,
    };
  }

  if (goalStr.startsWith('Recomp')) {
    // Fixed 12-week window (not scaled by pace — a faster pace changes how
    // much happens in that window, not the window itself) — 0.7 lbs/month
    // each direction — halved for Advanced, scaled by chosen pace.
    const perMonth = answers.experience === 'Advanced' ? 0.35 : 0.7;
    const deltaLbs = Math.max(1, Math.round(perMonth * 3 * pace));
    const goalDate = weeksCappedDate(12);
    const goalDateLabel = formatDate(goalDate);
    return {
      kind: 'recomp', deltaLbs, goalDate, goalDateLabel, milestoneDate, milestoneDateLabel,
      shortGoal: 'Lose fat, gain muscle',
      sentence: `Lift at 90% clean form, lose ${deltaLbs} lbs of fat and gain ${deltaLbs} lbs of muscle by ${goalDateLabel}.`,
    };
  }

  // Default: 'Build muscle' (also the fallback for any unexpected value).
  // Same fix as the fat branch above — X = 0 when weights are equal.
  const deltaLbs = Math.abs(Math.round(goalWeight - weight));
  const weeklyPct = musclePctPerMonth(answers.experience, answers.sex) / 4.33; // month -> week
  const weeklyRate = weight * (weeklyPct / 100) * pace;
  const weeks = deltaLbs / weeklyRate;
  const goalDate = weeksCappedDate(weeks);
  const goalDateLabel = formatDate(goalDate);
  return {
    kind: 'muscle', deltaLbs, goalDate, goalDateLabel, milestoneDate, milestoneDateLabel,
    shortGoal: `${Math.round(goalWeight)} lbs`,
    sentence: `Lift at 90% clean form and build up to ${Math.round(goalWeight)} lbs by ${goalDateLabel}.`,
  };
}
