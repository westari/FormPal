/**
 * lib/cueClips.ts — cue text → bundled audio clip.
 *
 * Every distinct corrective cue string the app can show/speak, mapped to a
 * pre-generated WAV file in assets/sounds/cues/. This is the FULL, exhaustive
 * set gathered from all three places cues are produced:
 *   - constants/exerciseDefinitions.ts  (formCheck cue + insufficientROMCue)
 *   - constants/exerciseStandards.ts    (romCue / extendCue / staticChecks cue)
 *   - modules/athlt-camera/ios/{ExerciseEngine,UniversalQualityEngine}.swift
 *     (tempo/swing/symmetry/compensation cues, incl. the 7-way
 *     "KEEP <JOINT> STILL — compensation" template)
 *
 * Placeholder files: every .wav in assets/sounds/cues/ was generated as
 * 0.2s of true silence so `require()` below resolves and the app builds
 * right now. Replace a file's CONTENTS (same filename, same path) with a
 * real recording to activate it — no code change needed. Until replaced,
 * that cue plays silence instead of a robotic TTS voice, which is the
 * deliberate interim behavior (see lib/audioFeedback.ts).
 *
 * "GOOD" is intentionally absent — the good-rep chime already covers that,
 * see playGoodRepChime() in lib/audioFeedback.ts.
 */

export const CUE_CLIPS: Record<string, any> = {
  'ARMS STRAIGHT UP': require('../assets/sounds/cues/arms-straight-up.wav'),
  'CHEST UP': require('../assets/sounds/cues/chest-up.wav'),
  'CONTROL IT, NO SWINGING': require('../assets/sounds/cues/control-it-no-swinging.wav'),
  'DRIVE ELBOWS BACK': require('../assets/sounds/cues/drive-elbows-back.wav'),
  'DRIVE KNEE DOWN': require('../assets/sounds/cues/drive-knee-down.wav'),
  'FACE THE CAMERA': require('../assets/sounds/cues/face-the-camera.wav'),
  'FULL EXTENSION': require('../assets/sounds/cues/full-extension.wav'),
  'HIPS DOWN': require('../assets/sounds/cues/hips-down.wav'),
  'HIPS UP': require('../assets/sounds/cues/hips-up.wav'),
  'KEEP ELBOW STILL': require('../assets/sounds/cues/keep-elbow-still.wav'),
  'KEEP ELBOWS IN': require('../assets/sounds/cues/keep-elbows-in.wav'),
  'KEEP HEELS DOWN': require('../assets/sounds/cues/keep-heels-down.wav'),
  'KNEES OUT': require('../assets/sounds/cues/knees-out.wav'),
  'LOWER MORE': require('../assets/sounds/cues/lower-more.wav'),
  'RAISE OUT TO THE SIDES': require('../assets/sounds/cues/raise-out-to-the-sides.wav'),
  'SIT UP TALL': require('../assets/sounds/cues/sit-up-tall.wav'),
  'STAY UPRIGHT': require('../assets/sounds/cues/stay-upright.wav'),
  'STAY UPRIGHT, NO SWINGING': require('../assets/sounds/cues/stay-upright-no-swinging.wav'),
  'STOP SWINGING': require('../assets/sounds/cues/stop-swinging.wav'),
  'STRAIGHTEN YOUR BACK': require('../assets/sounds/cues/straighten-your-back.wav'),
  'TURN SIDE-ON': require('../assets/sounds/cues/turn-side-on.wav'),
  'CURL HIGHER': require('../assets/sounds/cues/curl-higher.wav'),
  'EXTEND FULLY': require('../assets/sounds/cues/extend-fully.wav'),
  'GO DEEPER': require('../assets/sounds/cues/go-deeper.wav'),
  'HINGE DEEPER': require('../assets/sounds/cues/hinge-deeper.wav'),
  'LUNGE DEEPER': require('../assets/sounds/cues/lunge-deeper.wav'),
  'PRESS HIGHER': require('../assets/sounds/cues/press-higher.wav'),
  'PULL DOWN FURTHER': require('../assets/sounds/cues/pull-down-further.wav'),
  'PULL HIGHER': require('../assets/sounds/cues/pull-higher.wav'),
  'PULL TO YOUR STOMACH': require('../assets/sounds/cues/pull-to-your-stomach.wav'),
  'RAISE HIGHER': require('../assets/sounds/cues/raise-higher.wav'),
  'CURL FURTHER — not reaching full contraction': require('../assets/sounds/cues/curl-further-not-reaching-full-contraction.wav'),
  'EXTEND FULLY — not reaching full lockout': require('../assets/sounds/cues/extend-fully-not-reaching-full-lockout.wav'),
  'GO DEEPER — not reaching parallel': require('../assets/sounds/cues/go-deeper-not-reaching-parallel.wav'),
  'HINGE DEEPER — not reaching enough depth': require('../assets/sounds/cues/hinge-deeper-not-reaching-enough-depth.wav'),
  'LUNGE DEEPER — not reaching depth': require('../assets/sounds/cues/lunge-deeper-not-reaching-depth.wav'),
  'PRESS HIGHER — not reaching overhead': require('../assets/sounds/cues/press-higher-not-reaching-overhead.wav'),
  'PULL DOWN FURTHER — not reaching full contraction': require('../assets/sounds/cues/pull-down-further-not-reaching-full-contraction.wav'),
  'PULL HIGHER — not reaching elbow flexion': require('../assets/sounds/cues/pull-higher-not-reaching-elbow-flexion.wav'),
  'PULL TO YOUR STOMACH — handle not reaching the torso': require('../assets/sounds/cues/pull-to-your-stomach-handle-not-reaching-the-torso.wav'),
  'RAISE HIGHER — not reaching enough depth': require('../assets/sounds/cues/raise-higher-not-reaching-enough-depth.wav'),
  'FULLY EXTEND — arm not straightening at bottom': require('../assets/sounds/cues/fully-extend-arm-not-straightening-at-bottom.wav'),
  'FULLY EXTEND — arms not returning straight overhead': require('../assets/sounds/cues/fully-extend-arms-not-returning-straight-overhead.wav'),
  'LOWER FULLY — arm not returning to straight': require('../assets/sounds/cues/lower-fully-arm-not-returning-to-straight.wav'),
  'LOWER FULLY — not returning arms down': require('../assets/sounds/cues/lower-fully-not-returning-arms-down.wav'),
  'LOWER MORE — not returning to shoulder height': require('../assets/sounds/cues/lower-more-not-returning-to-shoulder-height.wav'),
  'REACH FORWARD — arm not fully extending between reps': require('../assets/sounds/cues/reach-forward-arm-not-fully-extending-between-reps.wav'),
  'RETURN TO START — forearm not returning to horizontal': require('../assets/sounds/cues/return-to-start-forearm-not-returning-to-horizontal.wav'),
  'STAND FULLY — not returning to standing': require('../assets/sounds/cues/stand-fully-not-returning-to-standing.wav'),
  'STAND FULLY — not returning upright': require('../assets/sounds/cues/stand-fully-not-returning-upright.wav'),
  'CHEST UP — excessive forward lean': require('../assets/sounds/cues/chest-up-excessive-forward-lean.wav'),
  'CONTROL IT — no swinging': require('../assets/sounds/cues/control-it-no-swinging-static.wav'),
  'KEEP TORSO STILL — swinging body': require('../assets/sounds/cues/keep-torso-still-swinging-body.wav'),
  'KEEP TORSO STILL — using body to push': require('../assets/sounds/cues/keep-torso-still-using-body-to-push.wav'),
  'KNEES TRACKING — lateral knee drift': require('../assets/sounds/cues/knees-tracking-lateral-knee-drift.wav'),
  'ADJUST POSITION': require('../assets/sounds/cues/adjust-position.wav'),
  'TOO FAST — control the rep': require('../assets/sounds/cues/too-fast-control-the-rep.wav'),
  'SWINGING — control the weight': require('../assets/sounds/cues/swinging-control-the-weight.wav'),
  'UNEVEN — one side lagging': require('../assets/sounds/cues/uneven-one-side-lagging.wav'),
  'CUTTING SHORT — range dropped vs your start': require('../assets/sounds/cues/cutting-short-range-dropped-vs-your-start.wav'),
  'RUSHING — rep faster than your baseline': require('../assets/sounds/cues/rushing-rep-faster-than-your-baseline.wav'),
  'SLOWING — rep slower than your baseline': require('../assets/sounds/cues/slowing-rep-slower-than-your-baseline.wav'),
  'KEEP SHOULDERS STILL — compensation': require('../assets/sounds/cues/keep-shoulders-still-compensation.wav'),
  'KEEP ELBOWS STILL — compensation': require('../assets/sounds/cues/keep-elbows-still-compensation.wav'),
  'KEEP WRISTS STILL — compensation': require('../assets/sounds/cues/keep-wrists-still-compensation.wav'),
  'KEEP HIPS STILL — compensation': require('../assets/sounds/cues/keep-hips-still-compensation.wav'),
  'KEEP KNEES STILL — compensation': require('../assets/sounds/cues/keep-knees-still-compensation.wav'),
  'KEEP ANKLES STILL — compensation': require('../assets/sounds/cues/keep-ankles-still-compensation.wav'),
  'KEEP HEAD STILL — compensation': require('../assets/sounds/cues/keep-head-still-compensation.wav'),
};
