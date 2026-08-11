/**
 * lib/cueClips.ts — cue text → bundled audio clip.
 *
 * Every distinct corrective cue string the app can show/speak, mapped to a
 * pre-generated MP3 file in assets/sounds/cues/. This is the FULL, exhaustive
 * set gathered from all three places cues are produced:
 *   - constants/exerciseDefinitions.ts  (formCheck cue + insufficientROMCue)
 *   - constants/exerciseStandards.ts    (romCue / extendCue / staticChecks cue)
 *   - modules/athlt-camera/ios/{ExerciseEngine,UniversalQualityEngine}.swift
 *     (tempo/swing/symmetry/compensation cues, incl. the 7-way
 *     "KEEP <JOINT> STILL — compensation" template)
 *
 * Real voice clips, not silent placeholders — generated with generate_cue_clips.py
 * (edge-tts, free/keyless, en-US-AndrewNeural by default). Re-run that script
 * (see its own header) to switch voices or regenerate after editing a cue's
 * text below; it re-parses this exact file, so it can never drift from what's
 * actually mapped here.
 *
 * "GOOD" is intentionally absent — the good-rep chime already covers that,
 * see playGoodRepChime() in lib/audioFeedback.ts.
 */

export const CUE_CLIPS: Record<string, any> = {
  'ARMS STRAIGHT UP': require('../assets/sounds/cues/arms-straight-up.mp3'),
  'CHEST UP': require('../assets/sounds/cues/chest-up.mp3'),
  'CONTROL IT, NO SWINGING': require('../assets/sounds/cues/control-it-no-swinging.mp3'),
  'DRIVE ELBOWS BACK': require('../assets/sounds/cues/drive-elbows-back.mp3'),
  'DRIVE KNEE DOWN': require('../assets/sounds/cues/drive-knee-down.mp3'),
  'FACE THE CAMERA': require('../assets/sounds/cues/face-the-camera.mp3'),
  'FULL EXTENSION': require('../assets/sounds/cues/full-extension.mp3'),
  'HIPS DOWN': require('../assets/sounds/cues/hips-down.mp3'),
  'HIPS UP': require('../assets/sounds/cues/hips-up.mp3'),
  'KEEP ELBOW STILL': require('../assets/sounds/cues/keep-elbow-still.mp3'),
  'KEEP ELBOWS IN': require('../assets/sounds/cues/keep-elbows-in.mp3'),
  'KEEP HEELS DOWN': require('../assets/sounds/cues/keep-heels-down.mp3'),
  'KNEES OUT': require('../assets/sounds/cues/knees-out.mp3'),
  'LOWER MORE': require('../assets/sounds/cues/lower-more.mp3'),
  'RAISE OUT TO THE SIDES': require('../assets/sounds/cues/raise-out-to-the-sides.mp3'),
  'SIT UP TALL': require('../assets/sounds/cues/sit-up-tall.mp3'),
  'STAY UPRIGHT': require('../assets/sounds/cues/stay-upright.mp3'),
  'STAY UPRIGHT, NO SWINGING': require('../assets/sounds/cues/stay-upright-no-swinging.mp3'),
  'STOP SWINGING': require('../assets/sounds/cues/stop-swinging.mp3'),
  'STRAIGHTEN YOUR BACK': require('../assets/sounds/cues/straighten-your-back.mp3'),
  'TURN SIDE-ON': require('../assets/sounds/cues/turn-side-on.mp3'),
  'CURL HIGHER': require('../assets/sounds/cues/curl-higher.mp3'),
  'EXTEND FULLY': require('../assets/sounds/cues/extend-fully.mp3'),
  'GO DEEPER': require('../assets/sounds/cues/go-deeper.mp3'),
  'HINGE DEEPER': require('../assets/sounds/cues/hinge-deeper.mp3'),
  'LUNGE DEEPER': require('../assets/sounds/cues/lunge-deeper.mp3'),
  'PRESS HIGHER': require('../assets/sounds/cues/press-higher.mp3'),
  'PULL DOWN FURTHER': require('../assets/sounds/cues/pull-down-further.mp3'),
  'PULL HIGHER': require('../assets/sounds/cues/pull-higher.mp3'),
  'PULL TO YOUR STOMACH': require('../assets/sounds/cues/pull-to-your-stomach.mp3'),
  'RAISE HIGHER': require('../assets/sounds/cues/raise-higher.mp3'),
  'CURL FURTHER — not reaching full contraction': require('../assets/sounds/cues/curl-further-not-reaching-full-contraction.mp3'),
  'EXTEND FULLY — not reaching full lockout': require('../assets/sounds/cues/extend-fully-not-reaching-full-lockout.mp3'),
  'GO DEEPER — not reaching parallel': require('../assets/sounds/cues/go-deeper-not-reaching-parallel.mp3'),
  'HINGE DEEPER — not reaching enough depth': require('../assets/sounds/cues/hinge-deeper-not-reaching-enough-depth.mp3'),
  'LUNGE DEEPER — not reaching depth': require('../assets/sounds/cues/lunge-deeper-not-reaching-depth.mp3'),
  'PRESS HIGHER — not reaching overhead': require('../assets/sounds/cues/press-higher-not-reaching-overhead.mp3'),
  'PULL DOWN FURTHER — not reaching full contraction': require('../assets/sounds/cues/pull-down-further-not-reaching-full-contraction.mp3'),
  'PULL HIGHER — not reaching elbow flexion': require('../assets/sounds/cues/pull-higher-not-reaching-elbow-flexion.mp3'),
  'PULL TO YOUR STOMACH — handle not reaching the torso': require('../assets/sounds/cues/pull-to-your-stomach-handle-not-reaching-the-torso.mp3'),
  'RAISE HIGHER — not reaching enough depth': require('../assets/sounds/cues/raise-higher-not-reaching-enough-depth.mp3'),
  'FULLY EXTEND — arm not straightening at bottom': require('../assets/sounds/cues/fully-extend-arm-not-straightening-at-bottom.mp3'),
  'FULLY EXTEND — arms not returning straight overhead': require('../assets/sounds/cues/fully-extend-arms-not-returning-straight-overhead.mp3'),
  'LOWER FULLY — arm not returning to straight': require('../assets/sounds/cues/lower-fully-arm-not-returning-to-straight.mp3'),
  'LOWER FULLY — not returning arms down': require('../assets/sounds/cues/lower-fully-not-returning-arms-down.mp3'),
  'LOWER MORE — not returning to shoulder height': require('../assets/sounds/cues/lower-more-not-returning-to-shoulder-height.mp3'),
  'REACH FORWARD — arm not fully extending between reps': require('../assets/sounds/cues/reach-forward-arm-not-fully-extending-between-reps.mp3'),
  'RETURN TO START — forearm not returning to horizontal': require('../assets/sounds/cues/return-to-start-forearm-not-returning-to-horizontal.mp3'),
  'STAND FULLY — not returning to standing': require('../assets/sounds/cues/stand-fully-not-returning-to-standing.mp3'),
  'STAND FULLY — not returning upright': require('../assets/sounds/cues/stand-fully-not-returning-upright.mp3'),
  'CHEST UP — excessive forward lean': require('../assets/sounds/cues/chest-up-excessive-forward-lean.mp3'),
  'CONTROL IT — no swinging': require('../assets/sounds/cues/control-it-no-swinging-static.mp3'),
  'KEEP TORSO STILL — swinging body': require('../assets/sounds/cues/keep-torso-still-swinging-body.mp3'),
  'KEEP TORSO STILL — using body to push': require('../assets/sounds/cues/keep-torso-still-using-body-to-push.mp3'),
  'KNEES TRACKING — lateral knee drift': require('../assets/sounds/cues/knees-tracking-lateral-knee-drift.mp3'),
  'ADJUST POSITION': require('../assets/sounds/cues/adjust-position.mp3'),
  'TOO FAST — control the rep': require('../assets/sounds/cues/too-fast-control-the-rep.mp3'),
  'SWINGING — control the weight': require('../assets/sounds/cues/swinging-control-the-weight.mp3'),
  'UNEVEN — one side lagging': require('../assets/sounds/cues/uneven-one-side-lagging.mp3'),
  'CUTTING SHORT — range dropped vs your start': require('../assets/sounds/cues/cutting-short-range-dropped-vs-your-start.mp3'),
  'RUSHING — rep faster than your baseline': require('../assets/sounds/cues/rushing-rep-faster-than-your-baseline.mp3'),
  'SLOWING — rep slower than your baseline': require('../assets/sounds/cues/slowing-rep-slower-than-your-baseline.mp3'),
  'KEEP SHOULDERS STILL — compensation': require('../assets/sounds/cues/keep-shoulders-still-compensation.mp3'),
  'KEEP ELBOWS STILL — compensation': require('../assets/sounds/cues/keep-elbows-still-compensation.mp3'),
  'KEEP WRISTS STILL — compensation': require('../assets/sounds/cues/keep-wrists-still-compensation.mp3'),
  'KEEP HIPS STILL — compensation': require('../assets/sounds/cues/keep-hips-still-compensation.mp3'),
  'KEEP KNEES STILL — compensation': require('../assets/sounds/cues/keep-knees-still-compensation.mp3'),
  'KEEP ANKLES STILL — compensation': require('../assets/sounds/cues/keep-ankles-still-compensation.mp3'),
  'KEEP HEAD STILL — compensation': require('../assets/sounds/cues/keep-head-still-compensation.mp3'),
};
