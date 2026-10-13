/**
 * lib/repFeedbackSentences.ts — exercise + cue -> a short, coach-voiced
 * "what happened" + "the fix" pair for the recap video's per-rep review
 * panel. Reviewed and approved as a table before this was written in (see
 * conversation) — exercise-specific, plain beginner language, no jargon,
 * every bad-rep line says exactly what to do differently.
 *
 * These are hand-written, static templates — NOT a live LLM call. Calling a
 * model per rep to generate this would be a real, ongoing API cost for
 * something that's the same handful of faults every time; well-written
 * fixed text per cue/exercise reads as genuine review without that cost.
 * If real per-rep LLM commentary is ever wanted, that's a separate,
 * cost-flagged feature.
 *
 * `what` and `fix` are two SEPARATE short clips, not one sentence split in
 * two for display — the recap screen renders them as two distinct lines
 * (bold "what happened" line, lighter "the fix" line underneath).
 *
 * Structure: every exercise id (from constants/exercises.ts /
 * exerciseDefinitions.ts) maps to a FAMILY — a group of exercises that
 * move the same way and share the same cues (e.g. every squat variant).
 * Each family has good-rep AND bad-rep-per-cue text as ARRAYS of
 * variants, not single strings — explicit ask: "even if they're not back
 * to back, [repeated issues] shouldn't repeat." Every lookup takes an
 * `occurrenceIndex` (how many times this exact case — this cue, or
 * "good" — has shown up so far in the set) and picks `variants[index %
 * variants.length]`, so the SAME issue happening on rep 1 and rep 4 (with
 * a good or different-issue rep in between) still reads differently, the
 * way a real coach varies their wording rather than repeating a script.
 *
 * IMPORTANT — only text changed, not lookup keys: cue strings (e.g.
 * 'GO DEEPER') are exactly what the CV engine already sends via
 * RepEventData.reason, and exercise ids are exactly what
 * constants/exercises.ts already uses — none of those were touched.
 *
 * Real per-rep numbers (the angle actually reached, which side was off)
 * are NOT available here today — only a cue string and an exercise id
 * reach this function. Threading real numbers through is a separate,
 * small follow-up (see the reviewed table's own note), not done here.
 */

export interface RepFeedbackText {
  what: string;
  fix:  string;
}

// Exercise id -> family key. Every id from constants/exercises.ts should
// have an entry; anything missing falls back to GENERIC_GOOD / the
// generic bad-rep fallback at the bottom of this file, not a crash.
const EXERCISE_FAMILY: Record<string, string> = {
  squat: 'squat', gobletSquat: 'squat', airSquat: 'squat', frontSquat: 'squat', backSquat: 'squat', sumoSquat: 'squat',
  lunge: 'lunge', splitSquat: 'lunge', reverseLunge: 'lunge', stepUp: 'lunge', bulgarianSplitSquat: 'lunge',
  legCurl: 'legcurl',
  pushup: 'pushup', inclinePushup: 'pushup', widePushup: 'pushup', diamondPushup: 'pushup', declinePushup: 'pushup', closegripPushup: 'pushup', kneePushup: 'pushup',
  curl: 'curl', hammerCurl: 'curl', concentrationCurl: 'curl', preacherCurl: 'curl', reverseCurl: 'curl', cableCurl: 'curl',
  chestPress: 'chestpress', barbellBenchPress: 'chestpress',
  dips: 'dips',
  shoulderPress: 'shoulderpress', overheadPress: 'shoulderpress', arnoldPress: 'shoulderpress', dumbbellShoulderPress: 'shoulderpress', machineShoulderPress: 'shoulderpress',
  latPulldown: 'latpulldown',
  lateralRaise: 'raise', frontRaise: 'raise',
  tricepPushdown: 'tricep', overheadTricepExtension: 'tricep', skullcrusher: 'tricep',
  bentOverRow: 'row', barbellRow: 'row', singleArmRow: 'row', invertedRow: 'row', tBarRow: 'row',
  seatedCableRow: 'seatedrow', machineRow: 'seatedrow',
  romanianDeadlift: 'hinge', deadlift: 'hinge', goodMorning: 'hinge', kettlebellSwing: 'hinge', singleLegRDL: 'hinge', cablePullThrough: 'hinge',
  facePull: 'facepull',
  pullup: 'pullup',
  jumpingJack: 'jj',
  crunch: 'situp',
};

const FAMILY_GOOD: Record<string, RepFeedbackText[]> = {
  squat: [
    { what: 'Nice depth on that one.', fix: 'You lowered your hips until your thighs were flat and level with the floor, then stood back up strong.' },
    { what: "There it is, same depth again.", fix: 'Keep sitting all the way down like that every rep.' },
    { what: "That's the one, keep that.", fix: 'Full depth and a strong drive back up. Stay right there.' },
  ],
  lunge: [
    { what: 'Great depth on that lunge.', fix: 'Your back knee dropped down close to the floor before you stood back up with control.' },
    { what: 'Same depth again, nice.', fix: 'Keep dropping that back knee all the way down like that.' },
    { what: "That's the rhythm.", fix: 'Controlled down, controlled back up. Keep it there.' },
  ],
  legcurl: [
    { what: 'Full curl, nice and slow.', fix: 'You bent your knees to bring your heels all the way up, then lowered slowly.' },
    { what: 'Same full curl again.', fix: 'Keep bringing your heels all the way up like that.' },
    { what: "That's it, steady.", fix: "Nice slow lower each time. Don't rush it." },
  ],
  pushup: [
    { what: 'Full range, straight line.', fix: 'Your chest came down close to the floor and your body stayed in one straight line from your shoulders to your feet.' },
    { what: 'Same full range again.', fix: 'Keep that straight line and getting your chest all the way down.' },
    { what: "That's the one.", fix: 'Nice and controlled both ways. Stay right there.' },
  ],
  curl: [
    { what: 'Full squeeze, controlled down.', fix: 'You bent your elbow to bring the weight all the way up, then lowered it slowly.' },
    { what: 'Same full squeeze again.', fix: 'Keep bringing it all the way up like that.' },
    { what: "That's it, nice and slow.", fix: "Controlled the whole way down. Don't let it drop." },
  ],
  chestpress: [
    { what: 'All the way down, strong press.', fix: 'You lowered the weight until it touched your chest, then pushed it back up until your arms were straight.' },
    { what: 'Same full range again.', fix: 'Keep touching your chest before you press it back up.' },
    { what: "That's the one.", fix: 'Strong press, full lockout every time. Stay there.' },
  ],
  dips: [
    { what: 'Full range both ways.', fix: 'You bent your elbows to lower your body down, then pushed back up until your arms were straight.' },
    { what: 'Same full range again.', fix: 'Keep lowering that far down every rep.' },
    { what: "That's it, strong.", fix: 'Full lockout at the top each time. Keep that.' },
  ],
  shoulderpress: [
    { what: 'Arms fully overhead, steady.', fix: 'You pressed your arms straight up above your head without leaning your body.' },
    { what: 'Same full press again.', fix: 'Keep your body still and press it all the way up like that.' },
    { what: "That's the one.", fix: 'Straight arms overhead, no lean. Stay right there.' },
  ],
  latpulldown: [
    { what: 'All the way down, no swing.', fix: 'You pulled the bar down until it reached your chest, without leaning your body back.' },
    { what: 'Same full pull again.', fix: 'Keep pulling it down to your chest without leaning back.' },
    { what: "That's it, controlled.", fix: 'Nice and steady, no swing. Keep that.' },
  ],
  raise: [
    { what: 'Shoulder height, controlled.', fix: 'You raised your arms up to the height of your shoulders, with a slow and steady motion.' },
    { what: 'Same height again, nice.', fix: 'Keep raising it to shoulder height like that, no rushing.' },
    { what: "That's it, steady.", fix: 'Slow and controlled both ways. Stay right there.' },
  ],
  tricep: [
    { what: 'Full straighten, controlled back.', fix: 'You straightened your arms all the way, then slowly bent them back to lower the weight.' },
    { what: 'Same full range again.', fix: 'Keep straightening your arms all the way like that.' },
    { what: "That's it, nice and slow.", fix: 'Controlled on the way back too. Keep that.' },
  ],
  row: [
    { what: 'Pulled high, no swing.', fix: 'You pulled the weight up to your body without rocking or swinging.' },
    { what: 'Same high pull again.', fix: 'Keep your body still and pull it up high like that.' },
    { what: "That's it, controlled.", fix: 'No rocking, nice and steady. Stay right there.' },
  ],
  seatedrow: [
    { what: 'All the way in, tall posture.', fix: 'You pulled the handle all the way to your stomach while sitting up straight.' },
    { what: 'Same full pull again.', fix: 'Keep sitting up tall and pulling it all the way in.' },
    { what: "That's the one.", fix: 'Full pull, straight back every time. Keep that.' },
  ],
  hinge: [
    { what: 'Flat back, full hinge.', fix: 'You bent forward at your hips with your back flat, then stood back up to a full standing position.' },
    { what: 'Same flat back again.', fix: 'Keep bending from your hips like that, not your spine.' },
    { what: "That's it, strong.", fix: 'Full hinge, standing all the way up. Stay right there.' },
  ],
  facepull: [
    { what: 'All the way back, controlled.', fix: 'You pulled the band or handle all the way back to your face with a slow, steady motion.' },
    { what: 'Same full pull again.', fix: 'Keep pulling it all the way back to your face like that.' },
    { what: "That's it, steady.", fix: 'Slow and controlled both ways. Keep that.' },
  ],
  pullup: [
    { what: 'Chin over the bar, no swing.', fix: 'You pulled your whole body up until your chin passed above the bar, without swinging your legs.' },
    { what: 'Same full pull again.', fix: 'Keep pulling all the way up past the bar like that.' },
    { what: "That's it, controlled.", fix: 'No swinging, nice and steady. Stay right there.' },
  ],
  jj: [
    { what: 'Arms up, feet wide.', fix: 'Your arms reached all the way above your head and your feet landed wide apart each time.' },
    { what: 'Same full range again.', fix: 'Keep reaching all the way overhead and landing wide.' },
    { what: "That's the rhythm.", fix: 'Good tempo, keep it steady.' },
  ],
  situp: [
    { what: 'Full curl up, controlled.', fix: 'You curled your upper body all the way up off the floor each time, with a slow and controlled motion.' },
    { what: 'Same full curl again.', fix: 'Keep curling all the way up like that, nice and slow.' },
    { what: "That's it, steady.", fix: 'Controlled both up and down. Keep that.' },
  ],
};

const FAMILY_CUES: Record<string, Record<string, RepFeedbackText[]>> = {
  squat: {
    'GO DEEPER': [
      { what: 'You stood back up before your hips got low enough.', fix: 'Bend your knees and hips until your thighs are flat and level with the floor, then stand back up.' },
      { what: 'That one came up early again.', fix: 'Sit lower before you stand, same as last time.' },
    ],
    'CHEST UP': [
      { what: 'Your chest leaned forward and down as you squatted.', fix: "Keep your chest pointed up and forward the whole time. Don't let it drop toward the floor." },
      { what: 'Your chest dropped forward again.', fix: 'Keep it up and pointed forward this time.' },
    ],
  },
  lunge: {
    'LUNGE DEEPER': [
      { what: 'You stood back up before your back knee got close to the floor.', fix: 'Lower your back knee down closer to the floor before pushing back up.' },
      { what: "That one didn't go low enough either.", fix: 'Get that back knee closer to the floor this time.' },
    ],
    'CHEST UP': [
      { what: 'Your chest leaned forward during the lunge.', fix: 'Keep your chest up and your body tall as you lower down.' },
      { what: 'Your chest leaned forward again.', fix: 'Keep it up this time.' },
    ],
  },
  legcurl: {
    'CURL FURTHER': [
      { what: "You didn't bend your knees enough to bring your heels all the way up.", fix: 'Bend your knees more so your heels come closer to the back of your legs, then lower slowly.' },
      { what: "That one didn't curl all the way up either.", fix: 'Bring your heels in further before lowering.' },
    ],
  },
  pushup: {
    'GO DEEPER': [
      { what: 'Your chest stopped too far above the floor.', fix: 'Lower your body down further, until your chest gets close to the floor, before pushing back up.' },
      { what: 'That one stayed high again.', fix: 'Get your chest closer to the floor this time.' },
    ],
    'HIPS DOWN': [
      { what: 'Your hips dropped down toward the floor.', fix: 'Tighten your stomach and keep your hips in a straight line with your shoulders and feet.' },
      { what: 'Your hips dropped again.', fix: 'Keep that straight line through your hips this time.' },
    ],
    'HIPS UP': [
      { what: 'Your hips rose up higher than your shoulders.', fix: 'Lower your hips so your body makes one straight line from your shoulders to your feet.' },
      { what: 'Your hips came up again.', fix: 'Bring them back in line with your body this time.' },
    ],
  },
  curl: {
    'CURL HIGHER': [
      { what: "You didn't bend your elbow enough to bring the weight all the way up.", fix: 'Bend your elbow more so the weight comes closer to your shoulder.' },
      { what: "That one didn't curl all the way up either.", fix: 'Bring it closer to your shoulder this time.' },
    ],
    'FULL EXTENSION': [
      { what: "Your arm didn't straighten all the way at the bottom.", fix: 'Let your elbow straighten all the way before bending it to curl again.' },
      { what: "Your arm didn't straighten again.", fix: 'Let it fully straighten this time before curling.' },
    ],
    'KEEP ELBOW STILL': [
      { what: 'Your elbow moved away from your side during the curl.', fix: 'Keep your elbow pinned against your side so only your forearm is moving.' },
      { what: 'Your elbow moved again.', fix: 'Keep it pinned against your side this time.' },
    ],
    'STOP SWINGING': [
      { what: 'You moved your back and shoulders to help lift the weight.', fix: 'Keep your back and shoulders still, and lift the weight using only your arm.' },
      { what: 'You used your body to help again.', fix: 'Keep your shoulders still this time.' },
    ],
  },
  chestpress: {
    'LOWER FURTHER': [
      { what: 'You stopped lowering the weight before it reached your chest.', fix: 'Lower the weight all the way down until it touches your chest.' },
      { what: 'That one stopped short of your chest again.', fix: 'Bring it all the way down this time.' },
    ],
    'PRESS ALL THE WAY UP': [
      { what: 'You stopped pressing before your arms were fully straight.', fix: 'Push the weight up until your elbows are completely straight.' },
      { what: 'Stopped short at the top again.', fix: 'Push until your elbows are fully straight this time.' },
    ],
  },
  dips: {
    'GO DEEPER': [
      { what: "You didn't lower your body down far enough.", fix: 'Bend your elbows more to lower your body further before pushing back up.' },
      { what: 'That one stayed high again.', fix: 'Bend your elbows more this time before pressing up.' },
    ],
    'LOCK OUT AT TOP': [
      { what: 'You stopped pushing before your arms were fully straight at the top.', fix: 'Push all the way up until your elbows are completely straight.' },
      { what: 'Stopped short at the top again.', fix: 'Push all the way up this time.' },
    ],
  },
  shoulderpress: {
    'PRESS HIGHER': [
      { what: 'You stopped pressing before your arms were straight above your head.', fix: 'Push the weight all the way up until your arms are completely straight overhead.' },
      { what: 'That one stopped short overhead again.', fix: 'Push it all the way up this time.' },
    ],
    'STAY UPRIGHT': [
      { what: 'Your body leaned backward to help push the weight up.', fix: 'Keep your body straight up and down, and push the weight using only your shoulders and arms.' },
      { what: 'Your body leaned again.', fix: 'Keep it still and upright this time.' },
    ],
    'ARMS STRAIGHT UP': [
      { what: 'Your arms stopped before they were straight above your head.', fix: 'Press the weight up until your arms are fully straight, directly above your head.' },
      { what: 'Stopped short overhead again.', fix: 'Press until your arms are fully straight this time.' },
    ],
  },
  latpulldown: {
    'PULL DOWN FURTHER': [
      { what: 'You stopped pulling before the bar reached your chest.', fix: 'Pull the bar down further, until it gets close to your chest.' },
      { what: 'Stopped short of your chest again.', fix: 'Pull it all the way down this time.' },
    ],
    'STAY UPRIGHT, NO SWINGING': [
      { what: 'You leaned your body backward to help pull the bar down.', fix: 'Keep your back straight and still, and pull the bar down using your arms and back muscles.' },
      { what: 'You leaned back again.', fix: 'Keep your back straight this time.' },
    ],
    'ELBOWS DOWN AND BACK, NOT OUT': [
      { what: 'Your elbows moved out to the sides as you pulled.', fix: 'Keep your elbows close to your body and pull them down and back.' },
      { what: 'Your elbows flared out again.', fix: 'Keep them close to your body this time.' },
    ],
  },
  raise: {
    'RAISE HIGHER': [
      { what: 'You stopped raising your arms before they reached shoulder height.', fix: 'Raise your arms up until they are level with your shoulders.' },
      { what: 'Stopped short again.', fix: 'Bring it up to shoulder height this time.' },
    ],
    'CONTROL IT, NO SWINGING': [
      { what: 'You jerked your body to help raise the weight.', fix: 'Keep your body still and raise the weight slowly using only your shoulder muscles.' },
      { what: 'You jerked it again.', fix: 'Slow it down this time.' },
    ],
    'RAISE OUT TO THE SIDES': [
      { what: 'You raised your arms toward the front of your body instead of out to the sides.', fix: "Raise your arms straight out to your sides, like you're making a T shape." },
      { what: 'Drifted forward again.', fix: 'Raise it straight out to the side this time.' },
    ],
  },
  tricep: {
    'EXTEND FULLY': [
      { what: 'You stopped before your arms were fully straight.', fix: 'Push the weight until your elbows are completely straight.' },
      { what: 'Stopped short again.', fix: 'Push until your arms are fully straight this time.' },
    ],
    'KEEP ELBOWS IN': [
      { what: 'Your elbows moved away from your sides.', fix: 'Keep your elbows pinned against your sides the whole time.' },
      { what: 'Your elbows moved again.', fix: 'Keep them pinned to your sides this time.' },
    ],
    'STAY UPRIGHT': [
      { what: 'Your body leaned to help move the weight.', fix: 'Keep your body still and upright, and move the weight using only your arms.' },
      { what: 'Your body leaned again.', fix: 'Keep it still this time.' },
    ],
  },
  row: {
    'PULL HIGHER': [
      { what: 'You stopped pulling before your elbow came up high enough.', fix: "Pull your elbow up higher, past your back, so it's higher than your body." },
      { what: 'Stopped short again.', fix: 'Pull your elbow higher this time.' },
    ],
    'STOP SWINGING': [
      { what: 'You rocked your body backward to help pull the weight up.', fix: 'Keep your body still, and pull the weight up using your back and arm muscles.' },
      { what: 'You rocked again.', fix: 'Keep your body still this time.' },
    ],
  },
  seatedrow: {
    'PULL TO YOUR STOMACH': [
      { what: 'You stopped pulling before the handle reached your stomach.', fix: 'Pull the handle all the way in until it touches your stomach.' },
      { what: 'Stopped short again.', fix: 'Pull it all the way to your stomach this time.' },
    ],
    'SIT UP TALL': [
      { what: 'Your back curved forward as you pulled.', fix: 'Sit up straight with your back flat, not curved, the whole time.' },
      { what: 'Your back curved again.', fix: 'Sit up tall this time.' },
    ],
    'DRIVE ELBOWS BACK': [
      { what: 'Your elbows stopped before they moved far enough behind you.', fix: 'Pull your elbows further back, past your body, until your shoulder blades squeeze together.' },
      { what: 'Stopped short again.', fix: 'Pull them further back this time.' },
    ],
  },
  hinge: {
    'HINGE DEEPER': [
      { what: 'You stood back up before bending forward enough at your hips.', fix: 'Push your hips back further and bend forward more before standing back up.' },
      { what: 'You stood up early again.', fix: 'Bend forward more this time before standing.' },
    ],
    'STRAIGHTEN YOUR BACK': [
      { what: 'Your back curved instead of staying flat.', fix: 'Keep your back flat like a tabletop, and bend forward from your hips, not your spine.' },
      { what: 'Your back curved again.', fix: 'Keep it flat this time.' },
    ],
  },
  facepull: {
    'PULL FARTHER': [
      { what: 'You stopped pulling before it reached your face.', fix: 'Pull it further back, closer to your face, before letting it go forward again.' },
      { what: 'Stopped short again.', fix: 'Pull it closer to your face this time.' },
    ],
  },
  pullup: {
    'PULL HIGHER': [
      { what: 'You stopped pulling before your chin got above the bar.', fix: 'Pull yourself up higher, until your chin is above the bar.' },
      { what: 'Stopped short again.', fix: 'Pull until your chin clears the bar this time.' },
    ],
    'STOP SWINGING': [
      { what: 'You swung your legs and body to help pull yourself up.', fix: 'Keep your body still, and pull yourself up using only your arms and back.' },
      { what: 'You swung again.', fix: 'Keep your body still this time.' },
    ],
  },
  jj: {
    'ARMS HIGHER': [
      { what: 'Your arms stopped before reaching above your head.', fix: 'Raise your arms all the way up above your head each time you jump.' },
      { what: 'Stopped short again.', fix: 'Raise them all the way overhead this time.' },
    ],
    'JUMP WIDER': [
      { what: 'Your feet landed too close together.', fix: 'Jump your feet further apart to each side.' },
      { what: 'Landed close together again.', fix: 'Jump your feet out further this time.' },
    ],
  },
  situp: {
    'FULL RANGE': [
      { what: "You didn't curl your upper body up far enough.", fix: 'Curl your shoulders further up off the floor each time.' },
      { what: "Didn't come up far enough again.", fix: 'Curl up higher this time.' },
    ],
    'KEEP KNEES BENT': [
      { what: 'Your legs straightened out instead of staying bent.', fix: 'Keep your knees bent with your feet flat on the floor the whole time.' },
      { what: 'Your legs straightened again.', fix: 'Keep them bent this time.' },
    ],
    "DON'T SWING ARMS": [
      { what: 'You swung your arms forward to help pull yourself up.', fix: 'Keep your arms still, and use your stomach muscles to lift your body.' },
      { what: 'You swung your arms again.', fix: 'Use your stomach muscles this time instead.' },
    ],
  },
};

// Cues that apply the same way no matter which exercise is being done —
// tempo, swinging, "stay still"/compensation, camera framing, and the ROM
// em-dash variants (a separate cue source from exerciseStandards.ts, not
// the per-exercise ones above).
const UNIVERSAL_CUES: Record<string, RepFeedbackText[]> = {
  'DRIVE KNEE DOWN': [
    { what: "Your back knee didn't drop low enough.", fix: 'Lower it closer to the floor next time.' },
    { what: "Still didn't drop low enough.", fix: 'Get that knee closer to the floor this time.' },
  ],
  'FACE THE CAMERA': [
    { what: 'You were turned away from the camera.', fix: 'Keep your chest facing the camera the whole time.' },
    { what: 'Turned away again.', fix: 'Face the camera this time.' },
  ],
  'KEEP HEELS DOWN': [
    { what: 'Your heels came up off the ground.', fix: 'Keep your heels flat on the floor the whole time.' },
    { what: 'Your heels came up again.', fix: 'Keep them flat this time.' },
  ],
  'KNEES OUT': [
    { what: 'Your knees caved in toward each other.', fix: 'Push them out so they line up with your toes.' },
    { what: 'Your knees caved in again.', fix: 'Push them out this time.' },
  ],
  'LOWER MORE': [
    { what: "You didn't lower it far enough.", fix: 'Go a little lower before coming back up.' },
    { what: "Still didn't lower far enough.", fix: 'Go lower this time.' },
  ],
  'TURN SIDE-ON': [
    { what: "You weren't turned sideways to the camera.", fix: 'Turn so the camera sees you from the side.' },
    { what: "Still not sideways to the camera.", fix: 'Turn so the camera sees your side this time.' },
  ],
  'CURL FURTHER. Not reaching full contraction': [
    { what: 'You stopped just short of a full squeeze at the top.', fix: 'Curl it a little higher to get that squeeze.' },
    { what: 'Stopped just short again.', fix: 'Curl it a bit higher this time.' },
  ],
  'EXTEND FULLY. Not reaching full lockout': [
    { what: 'You stopped just short of fully straight at the top.', fix: 'Straighten your arms all the way next time.' },
    { what: 'Stopped just short again.', fix: 'Straighten all the way this time.' },
  ],
  'GO DEEPER. Not reaching parallel': [
    { what: 'You stopped just above the right depth.', fix: 'Go just a little lower to get there.' },
    { what: 'Still just above depth.', fix: 'Go a touch lower this time.' },
  ],
  'HINGE DEEPER. Not reaching enough depth': [
    { what: 'You came back up a little early.', fix: 'Let your hips go further back before standing up.' },
    { what: 'Came up early again.', fix: 'Let your hips go back further this time.' },
  ],
  'LUNGE DEEPER. Not reaching depth': [
    { what: 'Your lunge stopped a little high.', fix: 'Go just a bit lower to finish the rep.' },
    { what: 'Stopped a bit high again.', fix: 'Go a bit lower this time.' },
  ],
  'PRESS HIGHER. Not reaching overhead': [
    { what: 'You stopped just below fully overhead.', fix: 'Press that last little bit all the way up.' },
    { what: 'Stopped short again.', fix: 'Press that last bit up this time.' },
  ],
  'PULL DOWN FURTHER. Not reaching full contraction': [
    { what: 'Close, but not quite all the way down.', fix: 'Bring it down just a little further.' },
    { what: 'Close again, not quite.', fix: 'Bring it down further this time.' },
  ],
  'PULL HIGHER. Not reaching elbow flexion': [
    { what: 'That pull stopped just short of the top.', fix: 'Drive your elbow up a little more.' },
    { what: 'Stopped short again.', fix: 'Drive your elbow up more this time.' },
  ],
  'PULL TO YOUR STOMACH. Handle not reaching the torso': [
    { what: 'The handle stopped just short of your stomach.', fix: 'Pull it all the way in next time.' },
    { what: 'Stopped short again.', fix: 'Pull it all the way in this time.' },
  ],
  'RAISE HIGHER. Not reaching enough depth': [
    { what: 'Your raise came up just short.', fix: 'Take it a little higher next time.' },
    { what: 'Came up short again.', fix: 'Take it a little higher this time.' },
  ],
  'FULLY EXTEND. Arm not straightening at bottom': [
    { what: "Your arm didn't fully straighten at the bottom.", fix: 'Let it go all the way straight before curling again.' },
    { what: "Didn't straighten again.", fix: 'Let it go fully straight this time.' },
  ],
  'FULLY EXTEND. Arms not returning straight overhead': [
    { what: "Your arms didn't go fully straight overhead.", fix: 'Straighten them all the way before lowering.' },
    { what: "Didn't go fully straight again.", fix: 'Straighten them all the way this time.' },
  ],
  'LOWER FULLY. Arm not returning to straight': [
    { what: "Your arm didn't go fully straight between reps.", fix: 'Let it fully straighten before the next rep.' },
    { what: "Didn't return fully straight again.", fix: 'Let it extend completely this time.' },
  ],
  'LOWER FULLY. Not returning arms down': [
    { what: "Your arms didn't come all the way down.", fix: 'Lower them fully before the next rep.' },
    { what: "Didn't come all the way down again.", fix: 'Lower them fully this time.' },
  ],
  'LOWER MORE. Not returning to shoulder height': [
    { what: "Your arms didn't come back down to shoulder height.", fix: 'Lower them a bit more between reps.' },
    { what: 'Still above shoulder height.', fix: 'Lower them more this time.' },
  ],
  'REACH FORWARD. Arm not fully extending between reps': [
    { what: "Your arm didn't fully reach out between reps.", fix: 'Reach it all the way out each time.' },
    { what: "Didn't reach out fully again.", fix: 'Reach it all the way out this time.' },
  ],
  'RETURN TO START. Forearm not returning to horizontal': [
    { what: "Your forearm didn't come back level between reps.", fix: 'Reset it fully flat before the next rep.' },
    { what: "Didn't come back level again.", fix: 'Reset it flat this time.' },
  ],
  'STAND FULLY. Not returning to standing': [
    { what: "You didn't stand all the way back up.", fix: 'Stand up fully straight between reps.' },
    { what: "Didn't stand all the way again.", fix: 'Stand up fully this time.' },
  ],
  'STAND FULLY. Not returning upright': [
    { what: "You didn't come all the way back upright.", fix: 'Stand up tall before starting the next rep.' },
    { what: "Didn't come back upright again.", fix: 'Stand up tall this time.' },
  ],
  'CHEST UP. Excessive forward lean': [
    { what: 'You leaned too far forward.', fix: 'Keep your chest up and your body more upright.' },
    { what: 'Leaned forward again.', fix: 'Keep your chest up this time.' },
  ],
  'CONTROL IT. No swinging': [
    { what: 'You used a swing to move the weight instead of your muscles.', fix: 'Slow it down and keep the movement steady.' },
    { what: 'Used a swing again.', fix: 'Keep it steady this time.' },
  ],
  'KEEP TORSO STILL. Swinging body': [
    { what: 'Your upper body swayed back and forth.', fix: 'Tighten your core and keep your body still.' },
    { what: 'Swayed again.', fix: 'Keep your body still this time.' },
  ],
  'KEEP TORSO STILL. Using body to push': [
    { what: 'You used your body to help push the weight.', fix: 'Keep your body still and let the muscle do the work.' },
    { what: 'Used your body again.', fix: 'Let the muscle work this time.' },
  ],
  'KNEES TRACKING. Lateral knee drift': [
    { what: 'Your knee drifted to the side.', fix: 'Keep it lined up with your toes.' },
    { what: 'Drifted again.', fix: 'Keep it lined up this time.' },
  ],
  'ADJUST POSITION': [
    { what: 'The camera lost a clear view of you.', fix: 'Move so your whole body is in the frame.' },
    { what: 'Lost a clear view again.', fix: 'Get your whole body in frame this time.' },
  ],
  'TOO FAST — control the rep': [
    { what: 'That rep went too fast.', fix: 'Slow down both lifting it and lowering it.' },
    { what: 'Went fast again.', fix: 'Slow it down this time.' },
  ],
  'SWINGING — control the weight': [
    { what: 'The weight swung instead of moving smoothly.', fix: 'Keep it steady and under control.' },
    { what: 'Swung again.', fix: 'Keep it steady this time.' },
  ],
  'UNEVEN — one side lagging': [
    { what: 'One side lagged behind the other.', fix: 'Focus on moving both sides together.' },
    { what: 'One side lagged again.', fix: 'Try to match both sides this time.' },
  ],
  'CUTTING SHORT — range dropped vs your start': [
    { what: "This rep didn't go as far as your earlier ones.", fix: 'Try to match how deep you went at the start.' },
    { what: 'Came up short again.', fix: 'Try to match your starting depth this time.' },
  ],
  'RUSHING — rep faster than your baseline': [
    { what: 'That rep was faster than the rest.', fix: 'Slow back down to your normal pace.' },
    { what: 'Went fast again.', fix: 'Slow back down to your pace this time.' },
  ],
  'SLOWING — rep slower than your baseline': [
    { what: 'That rep was much slower than the rest.', fix: "Make sure you're not stalling out partway through." },
    { what: 'Went slow again.', fix: "Make sure you're not stalling this time." },
  ],
  'KEEP SHOULDERS STILL — compensation': [
    { what: 'Your shoulders moved to help lift the weight.', fix: 'Keep them still and let the right muscle do the work.' },
    { what: 'Your shoulders moved again.', fix: 'Keep them still this time.' },
  ],
  'KEEP ELBOWS STILL — compensation': [
    { what: 'Your elbows moved to help lift the weight.', fix: 'Keep them still and let the muscle do the work.' },
    { what: 'Your elbows moved again.', fix: 'Keep them still this time.' },
  ],
  'KEEP WRISTS STILL — compensation': [
    { what: 'Your wrists bent to help move the weight.', fix: 'Keep them straight and steady.' },
    { what: 'Your wrists bent again.', fix: 'Keep them straight this time.' },
  ],
  'KEEP HIPS STILL — compensation': [
    { what: 'Your hips shifted to help move the weight.', fix: 'Keep them still and let the muscle do the work.' },
    { what: 'Your hips shifted again.', fix: 'Keep them still this time.' },
  ],
  'KEEP KNEES STILL — compensation': [
    { what: 'Your knees moved to help lift the weight.', fix: 'Keep them steady through the whole rep.' },
    { what: 'Your knees moved again.', fix: 'Keep them steady this time.' },
  ],
  'KEEP ANKLES STILL — compensation': [
    { what: 'Your ankles shifted to help balance.', fix: 'Keep them steady and planted.' },
    { what: 'Your ankles shifted again.', fix: 'Keep them steady this time.' },
  ],
  'KEEP HEAD STILL — compensation': [
    { what: 'Your head moved to help with the rep.', fix: 'Keep it still and let your body do the work.' },
    { what: 'Your head moved again.', fix: 'Keep it still this time.' },
  ],
};

const GENERIC_GOOD: RepFeedbackText[] = [
  { what: 'Nice rep!', fix: 'Full range and good control the whole way through.' },
  { what: 'Same again, nice.', fix: 'Keep that same range and control.' },
  { what: "That's the one.", fix: 'Keep doing exactly that.' },
];
const GENERIC_BAD: RepFeedbackText[] = [
  { what: 'This rep needs work.', fix: 'Focus on full range and control next time.' },
  { what: 'Same issue again.', fix: 'Focus on fixing that this time.' },
];

/**
 * Looks up the real feedback text. `exerciseId` should be the exercise's
 * id from constants/exercises.ts (e.g. "shoulderPress") — pass whatever
 * the current session's exercise id is; an unrecognized id just falls
 * back to the generic text below instead of throwing.
 *
 * `occurrenceIndex` should count how many times this EXACT case — "good"
 * for a good rep, or this exact cue string for a bad one — has shown up
 * so far in the set (not the overall rep index). That way the same issue
 * repeating later in the set, even with other reps in between, still
 * reads as different wording each time, instead of a verbatim repeat.
 */
export function repFeedbackText(good: boolean, reason: string, exerciseId: string, occurrenceIndex = 0): RepFeedbackText {
  const family = EXERCISE_FAMILY[exerciseId];
  if (good) {
    const variants = (family && FAMILY_GOOD[family]) || GENERIC_GOOD;
    return variants[occurrenceIndex % variants.length];
  }
  const variants = (family && FAMILY_CUES[family]?.[reason]) || UNIVERSAL_CUES[reason] || GENERIC_BAD;
  return variants[occurrenceIndex % variants.length];
}
