/**
 * lib/repFeedbackSentences.ts — cue text → a short, coach-voiced "what
 * happened" + "the fix" pair for the recap video's per-rep review panel.
 *
 * These are hand-written, static templates — NOT a live LLM call. Calling a
 * model per rep to generate this would be a real, ongoing API cost for
 * something that's the same handful of faults every time; well-written
 * fixed text per cue reads as genuine review without that cost. If real
 * per-rep LLM commentary is ever wanted, that's a separate, cost-flagged
 * feature — raise it explicitly rather than assuming this should become that.
 *
 * `what` and `fix` are two SEPARATE short clips, not one sentence split in
 * two for display — the recap screen renders them as two distinct lines
 * (bold "what happened" line, lighter "the fix" line underneath). No em
 * dashes, no hedging — plain observation, plain instruction, the way a
 * trainer actually talks standing next to you.
 *
 * Keys match lib/cueClips.ts's CUE_CLIPS exactly (same 69 cues) so the two
 * files can be sanity-checked against each other.
 */

export interface RepFeedbackText {
  what: string;
  fix:  string;
}

const GOOD_REP_WHAT = 'Clean rep.';

const GOOD_REP_FIXES: string[] = [
  'Full range and good control the whole way through.',
  'Strong form from start to finish.',
  'Controlled tempo and full range on that rep.',
  "That's the form to keep building on.",
  'Good extension and steady control. Nothing to fix there.',
];

export function goodRepText(repIndex: number): RepFeedbackText {
  return { what: GOOD_REP_WHAT, fix: GOOD_REP_FIXES[repIndex % GOOD_REP_FIXES.length] };
}

export const REP_FEEDBACK_TEXT: Record<string, RepFeedbackText> = {
  'ARMS STRAIGHT UP': { what: "Arms didn't reach fully overhead.", fix: 'Press all the way up.' },
  'CHEST UP': { what: 'Chest dropped forward.', fix: 'Keep it lifted through the rep.' },
  'CONTROL IT, NO SWINGING': { what: 'That rep used momentum.', fix: 'Slow down, control the weight both ways.' },
  'DRIVE ELBOWS BACK': { what: "Elbows didn't drive back far enough.", fix: 'Pull them behind you for the full squeeze.' },
  'DRIVE KNEE DOWN': { what: "Back knee didn't drop enough.", fix: 'Sink it lower toward the floor.' },
  'FACE THE CAMERA': { what: "You weren't square to the camera.", fix: 'Keep your torso facing forward.' },
  'FULL EXTENSION': { what: 'That rep stopped short of full extension.', fix: 'Straighten all the way at the top.' },
  'HIPS DOWN': { what: 'Hips rose too early.', fix: 'Keep them level with your shoulders.' },
  'HIPS UP': { what: 'Hips sagged.', fix: 'Lift them back in line with your body.' },
  'KEEP ELBOW STILL': { what: 'Elbow drifted during the rep.', fix: 'Pin it in place and isolate the movement.' },
  'KEEP ELBOWS IN': { what: 'Elbows flared out.', fix: 'Keep them tucked close to your sides.' },
  'KEEP HEELS DOWN': { what: 'Heels lifted off the ground.', fix: 'Keep them planted through the rep.' },
  'KNEES OUT': { what: 'Knees caved inward.', fix: 'Push them out in line with your toes.' },
  'LOWER MORE': { what: "That rep didn't lower far enough.", fix: 'Take it deeper before reversing.' },
  'RAISE OUT TO THE SIDES': { what: 'Arms drifted forward instead of out.', fix: 'Keep the raise lateral.' },
  'SIT UP TALL': { what: 'Posture rounded.', fix: 'Sit up tall, keep your spine neutral.' },
  'STAY UPRIGHT': { what: 'Torso leaned.', fix: 'Stay upright, isolate the target muscle.' },
  'STAY UPRIGHT, NO SWINGING': { what: 'You leaned back and used momentum.', fix: 'Stay upright, control it with muscle.' },
  'STOP SWINGING': { what: 'That rep swung the weight.', fix: 'Slow down, kill the momentum.' },
  'STRAIGHTEN YOUR BACK': { what: 'Back rounded.', fix: 'Keep it flat, hinge from the hips.' },
  'TURN SIDE-ON': { what: "You weren't turned side-on to the camera.", fix: 'Give it a clean profile view.' },
  'CURL HIGHER': { what: 'That curl stopped short.', fix: 'Bring it higher for a full squeeze.' },
  'EXTEND FULLY': { what: "That rep didn't fully extend at the bottom.", fix: 'Straighten your arm all the way.' },
  'GO DEEPER': { what: 'That rep stayed too high.', fix: 'Sink lower to reach proper depth.' },
  'HINGE DEEPER': { what: 'That hinge stayed shallow.', fix: 'Push your hips back further.' },
  'LUNGE DEEPER': { what: 'That lunge stopped short.', fix: 'Drop your back knee closer to the floor.' },
  'PRESS HIGHER': { what: "That press didn't reach lockout.", fix: 'Press all the way overhead.' },
  'PULL DOWN FURTHER': { what: 'That pulldown stopped short.', fix: 'Pull the bar further toward your chest.' },
  'PULL HIGHER': { what: "Your elbow didn't come up high enough.", fix: 'Drive it up further.' },
  'PULL TO YOUR STOMACH': { what: 'That row stopped short of your stomach.', fix: 'Pull the handle all the way in.' },
  'RAISE HIGHER': { what: 'That raise stopped short.', fix: 'Bring your arms higher before lowering.' },
  'CURL FURTHER — not reaching full contraction': { what: 'That curl stopped just short of a full squeeze.', fix: 'Squeeze it a little higher next time.' },
  'EXTEND FULLY — not reaching full lockout': { what: 'That rep came up just short of lockout.', fix: 'Finish the extension completely.' },
  'GO DEEPER — not reaching parallel': { what: "That rep didn't quite reach parallel.", fix: 'A little more depth gets you there.' },
  'HINGE DEEPER — not reaching enough depth': { what: 'That hinge came up a bit early.', fix: 'Let your hips travel back further.' },
  'LUNGE DEEPER — not reaching depth': { what: 'That lunge stopped a touch high.', fix: 'A bit more depth completes the rep.' },
  'PRESS HIGHER — not reaching overhead': { what: 'That press stopped just below full overhead.', fix: 'Finish it out.' },
  'PULL DOWN FURTHER — not reaching full contraction': { what: 'Close, but not quite a full contraction.', fix: 'Bring it down a little further.' },
  'PULL HIGHER — not reaching elbow flexion': { what: 'That pull stopped just short.', fix: 'Drive the elbow up a bit more.' },
  'PULL TO YOUR STOMACH — handle not reaching the torso': { what: 'The handle stopped just short of your torso.', fix: 'Pull it all the way in.' },
  'RAISE HIGHER — not reaching enough depth': { what: 'That raise came up just short.', fix: 'Take it a little higher.' },
  'FULLY EXTEND — arm not straightening at bottom': { what: "Arm didn't fully straighten at the bottom.", fix: 'Extend completely before curling back up.' },
  'FULLY EXTEND — arms not returning straight overhead': { what: "Arms didn't return fully straight overhead.", fix: 'Lock them out before lowering again.' },
  'LOWER FULLY — arm not returning to straight': { what: "Arm didn't return to fully straight.", fix: 'Let it extend completely between reps.' },
  'LOWER FULLY — not returning arms down': { what: "Arms didn't return fully down.", fix: 'Lower them all the way between reps.' },
  'LOWER MORE — not returning to shoulder height': { what: "Arms didn't return to shoulder height.", fix: 'Lower them a bit further between reps.' },
  'REACH FORWARD — arm not fully extending between reps': { what: "Arm didn't fully extend forward between reps.", fix: 'Reach it out completely each time.' },
  'RETURN TO START — forearm not returning to horizontal': { what: "Forearm didn't return to horizontal.", fix: 'Reset fully before the next rep.' },
  'STAND FULLY — not returning to standing': { what: "You didn't return fully to standing.", fix: 'Straighten all the way up between reps.' },
  'STAND FULLY — not returning upright': { what: "You didn't come all the way back upright.", fix: 'Stand fully tall before the next rep.' },
  'CHEST UP — excessive forward lean': { what: 'You leaned too far forward.', fix: 'Keep your chest lifted, torso more upright.' },
  'CONTROL IT — no swinging': { what: 'That rep relied on swing, not control.', fix: 'Slow it down, keep the motion deliberate.' },
  'KEEP TORSO STILL — swinging body': { what: 'Torso swayed.', fix: 'Brace your core, keep your body still.' },
  'KEEP TORSO STILL — using body to push': { what: 'You used your body to help move the weight.', fix: 'Keep your torso still, let the muscle work.' },
  'KNEES TRACKING — lateral knee drift': { what: 'Knee drifted sideways.', fix: 'Keep it tracking in line with your toes.' },
  'ADJUST POSITION': { what: 'Tracking lost a clear view.', fix: 'Reposition so your full body is visible.' },
  'TOO FAST — control the rep': { what: 'That rep moved faster than a controlled tempo.', fix: 'Slow down through the lift and the lower.' },
  'SWINGING — control the weight': { what: 'The weight swung instead of moving under control.', fix: 'Steady it, control the path.' },
  'UNEVEN — one side lagging': { what: 'One side lagged behind the other.', fix: 'Focus on moving both sides together.' },
  'CUTTING SHORT — range dropped vs your start': { what: 'This rep came up shorter than your earlier reps.', fix: 'Try to match your starting depth.' },
  'RUSHING — rep faster than your baseline': { what: 'That rep was noticeably faster than your pace.', fix: 'Ease back into a controlled tempo.' },
  'SLOWING — rep slower than your baseline': { what: 'That rep was much slower than your pace.', fix: "Check you're not losing tension or stalling." },
  'KEEP SHOULDERS STILL — compensation': { what: 'Shoulders shifted to help move the weight.', fix: 'Keep them still, isolate the target muscle.' },
  'KEEP ELBOWS STILL — compensation': { what: 'Elbows moved to compensate.', fix: 'Keep them fixed, let the muscle do the work.' },
  'KEEP WRISTS STILL — compensation': { what: 'Wrists flexed to compensate.', fix: 'Keep them neutral and stable.' },
  'KEEP HIPS STILL — compensation': { what: 'Hips shifted to help move the weight.', fix: 'Keep them still, isolate the movement.' },
  'KEEP KNEES STILL — compensation': { what: 'Knees moved to compensate.', fix: 'Keep them steady through the movement.' },
  'KEEP ANKLES STILL — compensation': { what: 'Ankles shifted to compensate.', fix: 'Keep them stable and grounded.' },
  'KEEP HEAD STILL — compensation': { what: 'Head moved to compensate.', fix: 'Keep it still, let your body do the work.' },
};

/** Falls back to a plain, still-readable pair for any cue not in the map above (shouldn't happen — see file header). */
export function repFeedbackText(good: boolean, reason: string, repIndex: number): RepFeedbackText {
  if (good) return goodRepText(repIndex);
  return REP_FEEDBACK_TEXT[reason] ?? { what: 'This rep needs work.', fix: reason.toLowerCase() };
}
