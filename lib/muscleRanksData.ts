/**
 * lib/muscleRanksData.ts
 *
 * Pure adapter for the after-workout muscle page (assets/app screens/
 * muscleranks.html, shown by app/recap.tsx): real rank, real progress, the
 * muscles THIS workout actually trained with their real gain, and the real
 * body map. Nothing here is a placeholder — a muscle with no gain says +0%.
 *
 * No React/RN so scripts/test-muscle-ranks.js can run it under node.
 */
import { getExerciseDef, muscleCreditParts, Muscle } from '../constants/exercises';
import { TIER_META } from '../constants/tierPalette';
import {
  TIER_ORDER, VOLUME_THRESHOLDS, tierIndex, tierProgress,
  type SessionEntry, type MuscleTiers, type MuscleTierInfo, type Tier,
} from './sessionLog';
import { bodyMapPairDataUri } from './bodyMapSvg';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Same progress-to-next-tier math as the Progress tab's muscle rows (0-100). */
export function muscleProgressPct(info: MuscleTierInfo): number {
  return 100 * tierProgress(info); // the one implementation lives in lib/sessionLog.ts
}

// Progress as a single number that keeps rising across tiers, so a rank-up
// mid-workout still reads as a positive gain (100 per tier + progress).
function absolute(info: MuscleTierInfo | undefined): number {
  return info ? tierIndex(info.tier) * 100 + muscleProgressPct(info) : 0;
}

/** Percentage-point gain for one muscle across this workout (never negative). */
export function muscleGainPct(before: MuscleTierInfo | undefined, after: MuscleTierInfo | undefined): number {
  if (!after) return 0;
  return Math.max(0, absolute(after) - absolute(before));
}

export interface StandingLike { tier: Tier; progress: number; atTop: boolean; muscle?: Muscle }

function standingAbs(s: StandingLike | null): number {
  return s ? tierIndex(s.tier) * 100 + (s.atTop ? 100 : s.progress * 100) : 0;
}

// Every number on the muscle page is shown to ONE decimal, always, so the
// arithmetic on screen visibly adds up (6.3% -> 7.0% is +0.7%).
const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmt1 = (n: number) => r1(n).toFixed(1);

/** "+12.0%", "+0.7%", "+0.0%". */
export function formatGain(pct: number): string {
  return `+${fmt1(Math.max(0, pct))}%`;
}

/** Muscles this workout trained, most-worked first (credit-weighted reps, as the rank system counts them). */
export function workedMuscles(entries: SessionEntry[]): { muscle: Muscle; credit: number }[] {
  const tally = new Map<Muscle, number>();
  for (const e of entries) {
    const def = getExerciseDef(e.exerciseId);
    if (!def) continue;
    for (const c of def.muscles) {
      const { muscle, weight } = muscleCreditParts(c);
      tally.set(muscle, (tally.get(muscle) ?? 0) + e.reps * weight);
    }
  }
  return [...tally.entries()]
    .filter(([, credit]) => credit > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, credit]) => ({ muscle, credit }));
}


/**
 * How far one muscle is toward `target` (the NEXT rank of the overall rank), 0-100:
 *  - ranked at the overall tier: its own progress toward the next tier
 *  - already above the overall tier: 100 (it has nothing left to do for this rank)
 *  - no data yet: Bronze 0% (there is no "Unranked")
 */
function progressToward(info: MuscleTierInfo | undefined, overallTier: Tier | null, _todayCredit: number): number {
  if (!info) return 0;
  if (overallTier && tierIndex(info.tier) > tierIndex(overallTier)) return 100;
  return muscleProgressPct(info);
}

export interface MuscleRanksPayload {
  rank: {
    has: boolean; atTop: boolean; tier: Tier | null; label: string; next: string;
    pct: number;            // overall progress toward `next` AFTER today, 0-100 (one decimal)
    pctLabel: string;       // header text: only the newest number, e.g. "9.0%"
    gained: string;         // the OVERALL gain: the exact sum of the muscle row percentages, number text without "+"/"%"
    beforePct: string;      // the OVERALL rank % before this workout (one decimal, no "%"); the page shows "before -> after"
    rankedUp: boolean;      // the overall rank itself went up (the % then starts over in the new rank)
    hi: string; lo: string; ink: string;
    emblem: string | null;
    count: number;          // how many muscles the overall rank averages (11): "The average of all 11 muscles"
    pctNum: number; beforePctNum: number; gainedNum: number; // the same three numbers as numbers, for the fill-up animation
  };
  note: string;
  /** One row per muscle that gained: "+7 reps · 113 to Gold" with a bar. Reps = good reps x muscle credit (what the rank counts). */
  hits: {
    name: string; gain: string; icon: string | null;
    muscle: string;
    reps: number;           // reps gained today (whole number, at least 1 when the muscle gained)
    toNext: number | null;  // reps still needed for this muscle's NEXT rank (null = top rank)
    nextLabel: string;      // "Gold" (empty at the top)
    barFrom: number; barTo: number; // this muscle's bar before / after today, 0-100 (a rank-up starts again from 0)
  }[];
  bodyMap: string;          // data: URI: trained muscles bright (their own rank colour), untrained grey
  /** muscle keys lit on the body: before today, and after (the page lights today's new ones one after another) */
  lit: { before: string[]; after: string[] };
}

export function buildMuscleRanksPayload(opts: {
  entries: SessionEntry[];
  tiersBefore: MuscleTiers;
  tiersAfter: MuscleTiers;
  standingBefore: StandingLike | null;
  standingAfter: StandingLike | null;
  labels: Record<string, string>;
  note?: string;
  iconFor: (m: Muscle) => string | null;
  emblem: string | null;
  /** The whole log INCLUDING this workout. Needed for muscles still below Bronze: their progress counts all the
   *  training they have ever had, not just today's. Defaults to this workout alone. */
  history?: SessionEntry[];
  /** how many muscles the overall rank averages (components/MuscleTierMap MUSCLE_DISPLAY_ORDER); default 11 */
  muscleCount?: number;
}): MuscleRanksPayload {
  const { entries, tiersBefore, tiersAfter, standingBefore, standingAfter, labels, iconFor, emblem } = opts;
  const worked = workedMuscles(entries);
  const credit = new Map(worked.map(w => [w.muscle, w.credit]));
  const name = (m: Muscle) => labels[m] ?? String(m);

  const tier = standingAfter?.tier ?? null;
  const idx = tier ? tierIndex(tier) : -1;
  const nextTier: Tier = tier ? (idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : tier) : 'silver'; // no rank yet = Bronze, so Silver is next
  const nextLabel = cap(nextTier);
  const meta = TIER_META[tier ?? 'bronze'];

  // ── The numbers, all from ONE per-muscle progress figure ───────────────────
  // Every muscle's progress is its OWN progress toward ITS next tier (0-100, the same math as the Progress
  // tab's muscle rows). It used to be measured toward the OVERALL next rank and capped at 100 for any muscle
  // already above the overall (weakest-link) tier, so training shoulders/triceps that were already past
  // Bronze could never show a gain: 100 before, 100 after, +0.0% (reported: "Bronze 53.2% -> 53.2%").
  //   MUSCLE ROW gain = that muscle's progress after - before (rank-ups count: tier*100 + progress), 0.1 steps
  //   OVERALL %       = computeOverallStanding().progress: the average own-progress over every ranked muscle, AFTER today (same on every screen)
  //   HEADER GAIN     = the change in that overall % this workout (one number; the rows keep their own %)
  const universe = new Set<Muscle>([...(Object.keys(tiersAfter) as Muscle[]), ...worked.map(w => w.muscle)]);
  // There is no "Unranked": a muscle with no training yet is Bronze 0% (before today), so its first workout shows a real gain
  // (30 good reps = +20% toward Silver). A muscle missing from a tier map is simply 0.
  const progAfter = (m: Muscle) => (tiersAfter[m] ? muscleProgressPct(tiersAfter[m]!) : 0);
  const absAfter = (m: Muscle) => (tiersAfter[m] ? absolute(tiersAfter[m]) : 0);
  const progBefore = (m: Muscle) => (tiersBefore[m] ? muscleProgressPct(tiersBefore[m]!) : 0);
  const absBefore = (m: Muscle) => (tiersBefore[m] ? absolute(tiersBefore[m]) : 0);
  const muscles = [...universe];
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const avg = (f: (m: Muscle) => number) => (muscles.length ? muscles.reduce((a, m) => a + f(m), 0) / muscles.length : 0);
  const gainOf = (m: Muscle) => Math.max(0, r1(absAfter(m)) - r1(absBefore(m)));
  // The header % is THE overall rank % every screen shows (computeOverallStanding().progress); only a brand-new user with
  // no ranked muscle yet falls back to today's partial progress toward Bronze.
  const afterAvg = standingAfter && !standingAfter.atTop ? r1(standingAfter.progress * 100) : r1(avg(progAfter));
  const beforeAvg = r1(avg(progBefore));
  const rankedUp = !!standingBefore && !!standingAfter && standingBefore.tier !== standingAfter.tier;

  // Rows: EVERY muscle that gained today (most-worked first). If nothing gained (e.g. a rep-counter move that moves no
  // bar), the two most-worked muscles are shown at +0.0% so the card is never empty.
  // A muscle with no art (forearms / lower back / calves are tracked but not surfaced in the app yet) gets no row.
  const hasArt = (m: Muscle) => iconFor(m) !== null;
  const gainers = worked.filter(w => r1(gainOf(w.muscle)) > 0 && hasArt(w.muscle));
  const withArt = worked.filter(w => hasArt(w.muscle));
  const shown = gainers.length ? gainers : (withArt.length ? withArt : worked).slice(0, 2);
  // A row never reads more than +99.9%: a muscle that jumps a whole rank in one workout has moved more than one bar, which would
  // look broken next to a 100% bar.
  const gains = shown.map(w => Math.min(99.9, r1(gainOf(w.muscle))));
  // The overall gain shown under "Bronze -> Silver" is how much the OVERALL rank really moved this workout (Ari, 2026-11-12): the overall
  // is the AVERAGE of every muscle's rank, so it moves by only a little (a muscle's gain divided by the number of muscles). It is NOT the
  // sum of the rows any more; the muscle rows keep their own %. Measured on the same scale as the overall: tier * 100 + progress.
  const overallGainTenths = Math.max(0, Math.round(r1(standingAbs(standingAfter)) * 10) - Math.round(r1(standingAbs(standingBefore)) * 10));

  // ── The rows, in REPS (Ari 2026-11-13): "Shoulders  +7 reps · 113 to Gold" and a bar. The math is untouched: reps = the muscle's good-rep
  // volume after minus before (good reps x credit, logged reps at half), the bar is the same tierProgress the % used.
  const volumeOf = (t: Tier) => VOLUME_THRESHOLDS.find(([x]) => x === t)![1];
  const nextTierOf = (t: Tier): Tier | null => { const i = tierIndex(t); return i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null; };
  const rows = shown.map((w, i) => {
    const m = w.muscle, a = tiersAfter[m], b = tiersBefore[m];
    const reps = gains[i] > 0 ? Math.max(1, Math.round((a?.volume ?? 0) - (b?.volume ?? 0))) : 0;
    const nt = nextTierOf(a?.tier ?? 'bronze');
    const toNext = nt ? Math.max(0, Math.ceil(volumeOf(nt) - (a?.volume ?? 0) - 1e-9)) : null;
    const sameTier = !!b && !!a && b.tier === a.tier;
    const barTo = a ? (nt ? r1(muscleProgressPct(a)) : 100) : 0;
    const barFrom = sameTier && b ? (nt ? r1(muscleProgressPct(b)) : 100) : (b && !a ? r1(muscleProgressPct(b)) : 0);
    const nextLabel = nt ? cap(nt) : '';
    const repsText = `+${reps} ${reps === 1 ? 'rep' : 'reps'}`;
    const gain = toNext === null ? `${repsText} · Top rank` : `${repsText} · ${toNext} to ${nextLabel}`;
    return { muscle: m, reps, toNext, nextLabel, barFrom: Math.min(barFrom, barTo), barTo, gain };
  });
  // The body: a muscle with ANY good reps is bright (in its own rank colour), every other muscle is grey: the user SEES why the overall
  // average moves slowly. Today's new ones are lit one after another by the page.
  const trainedAfter = (Object.keys(tiersAfter) as Muscle[]).filter(m => (tiersAfter[m]?.volume ?? 0) > 0);
  const litAfter = [...new Set<Muscle>([...trainedAfter, ...shown.map(w => w.muscle)])];
  const litBefore = (Object.keys(tiersBefore) as Muscle[]).filter(m => (tiersBefore[m]?.volume ?? 0) > 0);

  // Header: ONLY the newest number (no "old -> new").
  const pctLabel = standingAfter?.atTop ? 'Top rank' : `${fmt1(afterAvg)}%`;

  // A short coach note: how the session went (passed in), then one plain line about the rank. No sums, no maths.
  const joined = shown.length <= 2
    ? shown.map(w => name(w.muscle)).join(' and ')
    : `${name(shown[0].muscle)}, ${name(shown[1].muscle)} and ${shown.length - 2} more`;
  const rankLine = standingAfter?.atTop
    ? "You're at the top rank. Keep your form clean to stay there."
    : rankedUp
      ? `You reached ${cap(tier ?? 'bronze')}. Nice work.`
      : gains.some(g => g > 0) && joined
        ? `${joined} moved up. ${nextLabel} is next.`
        : '';
  const explain = !standingAfter && !muscles.length
    ? 'Train a few more reps to start earning ranks.'
    : [opts.note, rankLine].filter(Boolean).join(' ');

  return {
    rank: {
      has: true, // everyone has a rank: Bronze 0% to start
      atTop: !!standingAfter?.atTop,
      tier,
      label: tier ? cap(tier) : 'Bronze',
      next: nextLabel,
      pct: afterAvg,
      pctLabel,
      gained: fmt1(overallGainTenths / 10), // how much the overall rank (the average of every muscle) really moved
      beforePct: fmt1(standingBefore && !standingBefore.atTop ? standingBefore.progress * 100 : 0),
      rankedUp,
      hi: meta.hi, lo: meta.lo, ink: meta.ink,
      emblem,
      count: opts.muscleCount ?? 11,
      pctNum: afterAvg,
      beforePctNum: standingBefore && !standingBefore.atTop ? r1(standingBefore.progress * 100) : 0,
      gainedNum: overallGainTenths / 10,
    },
    note: explain,
    hits: shown.map((w, i) => ({
      name: name(w.muscle),
      gain: rows[i].gain,
      icon: iconFor(w.muscle),
      muscle: String(w.muscle),
      reps: rows[i].reps, toNext: rows[i].toNext, nextLabel: rows[i].nextLabel, barFrom: rows[i].barFrom, barTo: rows[i].barTo,
    })),
    bodyMap: bodyMapPairDataUri(litAfter, tiersAfter),
    lit: { before: litBefore.map(String), after: litAfter.map(String) },
  };
}

// Exposed so the test can check every number independently.
export const _internals = { progressToward };
