/**
 * lib/repFeedbackSentences.ts — cue text → a natural, coach-voiced sentence
 * for the recap video's per-rep MyPal review panel.
 *
 * These are hand-written, static templates — NOT a live LLM call. Calling a
 * model per rep to generate this would be a real, ongoing API cost for
 * something that's the same handful of faults every time; a well-written
 * fixed sentence per cue reads as genuine review without that cost. If real
 * per-rep LLM commentary is ever wanted, that's a separate, cost-flagged
 * feature — raise it explicitly rather than assuming this should become that.
 *
 * Keys match lib/cueClips.ts's CUE_CLIPS exactly (same 69 cues) so the two
 * files can be sanity-checked against each other. GOOD_REP_SENTENCES is a
 * short rotation (picked by rep index, not random, so it's stable across
 * re-renders) rather than a single repeated line.
 */

export const GOOD_REP_SENTENCES: string[] = [
  "Clean rep — full range and good control the whole way through.",
  "That's the one. Strong form from start to finish.",
  "Nice work — controlled tempo and full range on that rep.",
  "Solid rep. That's exactly the form to keep building on.",
  "Good extension and steady control — no notes on this one.",
];

export function goodRepSentence(repIndex: number): string {
  return GOOD_REP_SENTENCES[repIndex % GOOD_REP_SENTENCES.length];
}

export const REP_FEEDBACK_SENTENCES: Record<string, string> = {
  'ARMS STRAIGHT UP': "Your arms didn't reach fully overhead on this rep — press them all the way up.",
  'CHEST UP': "Your chest dropped forward on this rep — keep it lifted and proud through the movement.",
  'CONTROL IT, NO SWINGING': "This rep used momentum instead of muscle — slow down and control the weight both ways.",
  'DRIVE ELBOWS BACK': "Your elbows didn't drive back far enough on this rep — pull them behind you for the full contraction.",
  'DRIVE KNEE DOWN': "Your back knee didn't drop enough on this rep — sink it lower toward the floor.",
  'FACE THE CAMERA': "You weren't quite square to the camera on this rep — the tracking needs your torso facing forward.",
  'FULL EXTENSION': "This rep stopped short of full extension — straighten all the way through at the top.",
  'HIPS DOWN': "Your hips rose too early on this rep — keep them level with your shoulders throughout.",
  'HIPS UP': "Your hips sagged on this rep — lift them back in line with your body.",
  'KEEP ELBOW STILL': "Your elbow drifted during this rep — pin it in place and isolate the movement.",
  'KEEP ELBOWS IN': "Your elbows flared out on this rep — keep them tucked in close to your sides.",
  'KEEP HEELS DOWN': "Your heels lifted off the ground on this rep — keep them planted through the movement.",
  'KNEES OUT': "Your knees caved inward on this rep — push them out in line with your toes.",
  'LOWER MORE': "This rep didn't lower far enough — take it deeper before reversing direction.",
  'RAISE OUT TO THE SIDES': "Your arms drifted forward instead of out to the sides on this rep — keep the raise lateral.",
  'SIT UP TALL': "Your posture rounded on this rep — sit up tall and keep your spine neutral.",
  'STAY UPRIGHT': "Your torso leaned on this rep — stay upright and keep the movement isolated to the target muscle.",
  'STAY UPRIGHT, NO SWINGING': "You leaned back and used momentum on this rep — stay upright and control it with muscle, not swing.",
  'STOP SWINGING': "This rep swung the weight instead of lifting it with control — slow down and eliminate the momentum.",
  'STRAIGHTEN YOUR BACK': "Your back rounded on this rep — keep it flat and hinge from the hips instead.",
  'TURN SIDE-ON': "You weren't turned side-on to the camera for this rep — the tracking needs a clean profile view.",
  'CURL HIGHER': "This curl stopped short — bring it higher for a full contraction at the top.",
  'EXTEND FULLY': "This rep didn't fully extend at the bottom — straighten your arm all the way before the next rep.",
  'GO DEEPER': "This rep stayed too high — sink lower to reach proper depth.",
  'HINGE DEEPER': "This hinge stayed shallow — push your hips back further for a deeper stretch.",
  'LUNGE DEEPER': "This lunge stopped short — drop your back knee closer to the floor.",
  'PRESS HIGHER': "This press didn't reach full lockout — press all the way overhead.",
  'PULL DOWN FURTHER': "This pulldown stopped short — pull the bar further down toward your chest.",
  'PULL HIGHER': "This pull didn't bring your elbow high enough — drive it up further.",
  'PULL TO YOUR STOMACH': "This row stopped short of your stomach — pull the handle all the way in.",
  'RAISE HIGHER': "This raise stopped short — bring your arms higher before lowering.",
  'CURL FURTHER — not reaching full contraction': "This curl stopped just short of a full contraction — squeeze it a little higher next time.",
  'EXTEND FULLY — not reaching full lockout': "This rep came up just short of full lockout — finish the extension completely.",
  'GO DEEPER — not reaching parallel': "This rep didn't quite reach parallel — a little more depth will get you there.",
  'HINGE DEEPER — not reaching enough depth': "This hinge came up a bit early — let your hips travel back further for full depth.",
  'LUNGE DEEPER — not reaching depth': "This lunge stopped a touch high — a bit more depth will complete the rep.",
  'PRESS HIGHER — not reaching overhead': "This press stopped just below full overhead extension — finish it out.",
  'PULL DOWN FURTHER — not reaching full contraction': "This pulldown was close but not quite a full contraction — bring it down a little further.",
  'PULL HIGHER — not reaching elbow flexion': "This pull stopped just short — drive the elbow up a bit more for full flexion.",
  'PULL TO YOUR STOMACH — handle not reaching the torso': "The handle stopped just short of your torso on this row — pull it all the way in.",
  'RAISE HIGHER — not reaching enough depth': "This raise came up just short of full height — take it a little higher.",
  'FULLY EXTEND — arm not straightening at bottom': "Your arm didn't fully straighten at the bottom of this rep — extend it completely before curling back up.",
  'FULLY EXTEND — arms not returning straight overhead': "Your arms didn't return fully straight overhead on this rep — lock them out before lowering again.",
  'LOWER FULLY — arm not returning to straight': "Your arm didn't return to fully straight on this rep — let it extend completely between reps.",
  'LOWER FULLY — not returning arms down': "Your arms didn't return fully down on this rep — lower them all the way before the next one.",
  'LOWER MORE — not returning to shoulder height': "Your arms didn't return to shoulder height on this rep — lower them a bit further between reps.",
  'REACH FORWARD — arm not fully extending between reps': "Your arm didn't fully extend forward between reps — reach it out completely each time.",
  'RETURN TO START — forearm not returning to horizontal': "Your forearm didn't return to horizontal on this rep — reset fully before the next one.",
  'STAND FULLY — not returning to standing': "You didn't return fully to standing on this rep — straighten all the way up between reps.",
  'STAND FULLY — not returning upright': "You didn't come all the way back upright on this rep — stand fully tall before the next one.",
  'CHEST UP — excessive forward lean': "You leaned too far forward on this rep — keep your chest lifted and your torso more upright.",
  'CONTROL IT — no swinging': "This rep relied on swing instead of control — slow it down and keep the motion deliberate.",
  'KEEP TORSO STILL — swinging body': "Your torso swayed on this rep — brace your core and keep your body still.",
  'KEEP TORSO STILL — using body to push': "You used your body to help move the weight on this rep — keep your torso still and let the target muscle do the work.",
  'KNEES TRACKING — lateral knee drift': "Your knee drifted sideways on this rep — keep it tracking in line with your toes.",
  'ADJUST POSITION': "The tracking lost a clear view on this rep — reposition so your full body is visible.",
  'TOO FAST — control the rep': "This rep moved faster than a controlled tempo — slow down through both the lift and the lower.",
  'SWINGING — control the weight': "The weight swung on this rep instead of moving under control — steady it and control the path.",
  'UNEVEN — one side lagging': "One side lagged behind the other on this rep — focus on moving both sides together.",
  'CUTTING SHORT — range dropped vs your start': "This rep's range came up shorter than your earlier reps — try to match your starting depth.",
  'RUSHING — rep faster than your baseline': "This rep was noticeably faster than your normal pace — ease back into a controlled tempo.",
  'SLOWING — rep slower than your baseline': "This rep was much slower than your normal pace — check that you're not losing tension or stalling.",
  'KEEP SHOULDERS STILL — compensation': "Your shoulders shifted to help move the weight on this rep — keep them still and isolate the target muscle.",
  'KEEP ELBOWS STILL — compensation': "Your elbows moved to compensate on this rep — keep them fixed and let the target muscle do the work.",
  'KEEP WRISTS STILL — compensation': "Your wrists flexed to compensate on this rep — keep them neutral and stable.",
  'KEEP HIPS STILL — compensation': "Your hips shifted to help move the weight on this rep — keep them still and isolate the movement.",
  'KEEP KNEES STILL — compensation': "Your knees moved to compensate on this rep — keep them steady through the movement.",
  'KEEP ANKLES STILL — compensation': "Your ankles shifted to compensate on this rep — keep them stable and grounded.",
  'KEEP HEAD STILL — compensation': "Your head moved to compensate on this rep — keep it still and let your body do the work.",
};

/** Falls back to a plain, still-readable sentence for any cue not in the map above (shouldn't happen — see file header). */
export function repFeedbackSentence(good: boolean, reason: string, repIndex: number): string {
  if (good) return goodRepSentence(repIndex);
  return REP_FEEDBACK_SENTENCES[reason] ?? `This rep needs work: ${reason.toLowerCase()}.`;
}
