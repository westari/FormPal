/**
 * constants/muscleWeights.ts
 *
 * How much each exercise works each muscle. The main muscle is 1.0, helpers are lower. This is what the rank system credits
 * (reps x weight), so a push-up moves chest the most, triceps and shoulders less, and biceps not at all.
 *
 * ALL NUMBERS ARE PLACEHOLDERS (a sensible gym-science guess from which muscles do the work, not measured). Change them
 * here, one line per exercise; nothing else needs to change. constants/exercises.ts applies this table to the catalog.
 * An exercise missing from the table keeps the muscles it was declared with.
 */
// The muscle names are the same strings as the Muscle enum in constants/exercises.ts. They are written out here (not imported)
// because exercises.ts imports THIS file, and an import back would be a cycle.
const M = {
  Chest: 'chest', Shoulders: 'shoulders', RearDelts: 'rearDelts', Biceps: 'biceps', Triceps: 'triceps', Forearms: 'forearms',
  Lats: 'lats', Traps: 'traps', LowerBack: 'lowerBack', Abs: 'abs', Quads: 'quads', Hamstrings: 'hamstrings', Glutes: 'glutes', Calves: 'calves',
} as const;
type W = Record<string, number>;

export const MUSCLE_WEIGHTS_ARE_PLACEHOLDERS = true;

export const MUSCLE_WEIGHTS: Record<string, W> = {
  // ── legs ──
  squat:               { [M.Quads]: 1, [M.Glutes]: 0.7, [M.Hamstrings]: 0.2 },
  airSquat:            { [M.Quads]: 1, [M.Glutes]: 0.6, [M.Hamstrings]: 0.15 },
  backSquat:           { [M.Quads]: 1, [M.Glutes]: 0.75, [M.LowerBack]: 0.3, [M.Hamstrings]: 0.25 },
  frontSquat:          { [M.Quads]: 1, [M.Glutes]: 0.6, [M.Abs]: 0.35 },
  gobletSquat:         { [M.Quads]: 1, [M.Glutes]: 0.7, [M.Abs]: 0.3 },
  sumoSquat:           { [M.Glutes]: 1, [M.Quads]: 0.8, [M.Hamstrings]: 0.2 },
  splitSquat:          { [M.Quads]: 1, [M.Glutes]: 0.75, [M.Hamstrings]: 0.2 },
  bulgarianSplitSquat: { [M.Quads]: 1, [M.Glutes]: 0.85, [M.Hamstrings]: 0.25 },
  lunge:               { [M.Quads]: 1, [M.Glutes]: 0.8, [M.Hamstrings]: 0.25 },
  reverseLunge:        { [M.Glutes]: 1, [M.Quads]: 0.8, [M.Hamstrings]: 0.3 },
  stepUp:              { [M.Quads]: 1, [M.Glutes]: 0.8, [M.Calves]: 0.15 },
  jumpingJack:         { [M.Calves]: 1, [M.Quads]: 0.7, [M.Shoulders]: 0.4, [M.Abs]: 0.2 },
  legCurl:             { [M.Hamstrings]: 1, [M.Glutes]: 0.3, [M.Calves]: 0.15 },
  // ── hinge ──
  deadlift:            { [M.Hamstrings]: 1, [M.Glutes]: 0.9, [M.LowerBack]: 0.7, [M.Quads]: 0.5, [M.Traps]: 0.3, [M.Forearms]: 0.2 },
  romanianDeadlift:    { [M.Hamstrings]: 1, [M.Glutes]: 0.8, [M.LowerBack]: 0.5, [M.Forearms]: 0.15 },
  goodMorning:         { [M.Hamstrings]: 1, [M.Glutes]: 0.7, [M.LowerBack]: 0.7 },
  kettlebellSwing:     { [M.Glutes]: 1, [M.Hamstrings]: 0.7, [M.LowerBack]: 0.4, [M.Shoulders]: 0.25, [M.Abs]: 0.2 },
  singleLegRDL:        { [M.Hamstrings]: 1, [M.Glutes]: 0.8, [M.LowerBack]: 0.4 },
  cablePullThrough:    { [M.Glutes]: 1, [M.Hamstrings]: 0.6, [M.LowerBack]: 0.25 },
  // ── push: chest ──
  pushup:              { [M.Chest]: 1, [M.Triceps]: 0.5, [M.Shoulders]: 0.4, [M.Abs]: 0.15 },
  kneePushup:          { [M.Chest]: 1, [M.Triceps]: 0.45, [M.Shoulders]: 0.35, [M.Abs]: 0.1 },
  inclinePushup:       { [M.Chest]: 1, [M.Triceps]: 0.5, [M.Shoulders]: 0.4, [M.Abs]: 0.1 },
  widePushup:          { [M.Chest]: 1, [M.Shoulders]: 0.4, [M.Triceps]: 0.35, [M.Abs]: 0.15 },
  declinePushup:       { [M.Chest]: 1, [M.Shoulders]: 0.6, [M.Triceps]: 0.5, [M.Abs]: 0.15 },
  diamondPushup:       { [M.Triceps]: 1, [M.Chest]: 0.65, [M.Shoulders]: 0.3, [M.Abs]: 0.15 },
  closegripPushup:     { [M.Triceps]: 1, [M.Chest]: 0.6, [M.Shoulders]: 0.3, [M.Abs]: 0.15 },
  chestPress:          { [M.Chest]: 1, [M.Triceps]: 0.45, [M.Shoulders]: 0.35 },
  barbellBenchPress:   { [M.Chest]: 1, [M.Triceps]: 0.5, [M.Shoulders]: 0.4 },
  dips:                { [M.Triceps]: 1, [M.Chest]: 0.8, [M.Shoulders]: 0.5 },
  // ── push: shoulders ──
  shoulderPress:         { [M.Shoulders]: 1, [M.Triceps]: 0.4, [M.Traps]: 0.1 },
  overheadPress:         { [M.Shoulders]: 1, [M.Triceps]: 0.4, [M.Traps]: 0.1 },
  dumbbellShoulderPress: { [M.Shoulders]: 1, [M.Triceps]: 0.4, [M.Traps]: 0.1 },
  arnoldPress:           { [M.Shoulders]: 1, [M.Triceps]: 0.35, [M.Traps]: 0.1 },
  machineShoulderPress:  { [M.Shoulders]: 1, [M.Triceps]: 0.35 },
  lateralRaise:          { [M.Shoulders]: 1, [M.Traps]: 0.25 },
  frontRaise:            { [M.Shoulders]: 1, [M.Chest]: 0.2, [M.Traps]: 0.15 },
  // ── triceps ──
  tricepPushdown:          { [M.Triceps]: 1, [M.Forearms]: 0.15 },
  overheadTricepExtension: { [M.Triceps]: 1, [M.Shoulders]: 0.15 },
  skullcrusher:            { [M.Triceps]: 1, [M.Shoulders]: 0.1 },
  // ── biceps ──
  curl:              { [M.Biceps]: 1, [M.Forearms]: 0.25 },
  hammerCurl:        { [M.Biceps]: 1, [M.Forearms]: 0.45 },
  concentrationCurl: { [M.Biceps]: 1, [M.Forearms]: 0.2 },
  preacherCurl:      { [M.Biceps]: 1, [M.Forearms]: 0.2 },
  reverseCurl:       { [M.Biceps]: 1, [M.Forearms]: 0.6 },
  cableCurl:         { [M.Biceps]: 1, [M.Forearms]: 0.2 },
  // ── pull ──
  bentOverRow:     { [M.Lats]: 1, [M.RearDelts]: 0.6, [M.Biceps]: 0.4, [M.Traps]: 0.3, [M.LowerBack]: 0.2 },
  barbellRow:      { [M.Lats]: 1, [M.RearDelts]: 0.6, [M.Biceps]: 0.4, [M.Traps]: 0.3, [M.LowerBack]: 0.25 },
  singleArmRow:    { [M.Lats]: 1, [M.RearDelts]: 0.55, [M.Biceps]: 0.4, [M.Traps]: 0.25 },
  invertedRow:     { [M.Lats]: 1, [M.RearDelts]: 0.6, [M.Biceps]: 0.45, [M.Abs]: 0.2 },
  tBarRow:         { [M.Lats]: 1, [M.RearDelts]: 0.6, [M.Biceps]: 0.4, [M.Traps]: 0.35, [M.LowerBack]: 0.25 },
  seatedCableRow:  { [M.Lats]: 1, [M.RearDelts]: 0.55, [M.Biceps]: 0.4, [M.Traps]: 0.3 },
  machineRow:      { [M.Lats]: 1, [M.RearDelts]: 0.55, [M.Biceps]: 0.4, [M.Traps]: 0.3 },
  latPulldown:     { [M.Lats]: 1, [M.Biceps]: 0.45, [M.RearDelts]: 0.3, [M.Traps]: 0.2 },
  pullup:          { [M.Lats]: 1, [M.Biceps]: 0.5, [M.RearDelts]: 0.3, [M.Traps]: 0.25, [M.Forearms]: 0.2, [M.Abs]: 0.15 },
  facePull:        { [M.RearDelts]: 1, [M.Traps]: 0.5, [M.Shoulders]: 0.2 },
  // ── core ──
  crunch:          { [M.Abs]: 1 },
};

/** The catalog's `muscles` list for one exercise, strongest first; 1.0 entries stay plain muscles. */
export function creditsFor(id: string): (string | { muscle: string; weight: number })[] | null {
  const w = MUSCLE_WEIGHTS[id];
  if (!w) return null;
  return Object.entries(w)
    .filter(([, wt]) => wt > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, weight]) => (weight === 1 ? muscle : { muscle, weight }));
}
