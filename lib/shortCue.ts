/**
 * lib/shortCue.ts
 *
 * Every line of live feedback on the camera screen is two or three words at most ("Too much swing", "Go lower"), never
 * a sentence. The engines produce long cue strings ("SWINGING — control the weight", "CHEST UP. Excessive forward
 * lean"); those strings stay as they are everywhere else (the spoken clips and the written explanations are looked up
 * by them), and this only shortens what is DRAWN on the camera screen.
 *
 * Rule: a few exact rewrites for the cues whose first clause would read badly, then the first clause (before ". ", " — ",
 * ",", ":" or ";"), without a leading "keep"/"try to", at most three words, sentence case.
 */

// Every cue the engines can produce, in plain body words a first-time user understands at a glance (2-3 words). Checked by
// scripts/test-attempts.js against the full list of cue strings in the app.
const EXACT: Record<string, string> = {
  "adjust position": "Adjust position",
  "arms higher": "Go higher",
  "arms straight up": "Arms straight up",
  "chest up": "Lift your chest",
  "chest up. excessive forward lean": "Lift your chest",
  "control it, no swinging": "Too much swing",
  "control it. no swinging": "Too much swing",
  "stop swinging": "Too much swing",
  "swinging — control the weight": "Too much swing",
  "curl further": "Curl higher",
  "curl further. not reaching full contraction": "Curl higher",
  "curl higher": "Curl higher",
  "cutting short — range dropped vs your start": "Full movement",
  "full range": "Full movement",
  "drive elbows back": "Elbows back",
  "elbows down and back, not out": "Elbows back",
  "drive knee down": "Knee down",
  "extend fully": "Straighten arms",
  "extend fully. not reaching full lockout": "Straighten arms",
  "full extension": "Straighten arms",
  "fully extend. arm not straightening at bottom": "Straighten arms",
  "fully extend. arms not returning straight overhead": "Straighten arms",
  "lock out at top": "Straighten arms",
  "face camera": "Face the camera",
  "face the camera": "Face the camera",
  "face away from the camera, don't": "Face away",
  "go deeper": "Go lower",
  "go deeper. not reaching parallel": "Go lower",
  "hinge deeper": "Go lower",
  "hinge deeper. not reaching enough depth": "Go lower",
  "lunge deeper": "Go lower",
  "lunge deeper. not reaching depth": "Go lower",
  "hips down": "Hips lower",
  "hips up": "Hips higher",
  "jump wider": "Jump wider",
  "keep ankles still — compensation": "Keep ankles still",
  "keep elbow still": "Keep elbow still",
  "keep elbows still — compensation": "Keep elbows still",
  "keep head still — compensation": "Keep head still",
  "keep hips still — compensation": "Keep hips still",
  "keep knees still — compensation": "Keep knees still",
  "keep shoulders still — compensation": "Keep shoulders still",
  "keep wrists still — compensation": "Keep wrists still",
  "keep elbows high": "Lift your elbows",
  "keep elbows in": "Tuck elbows in",
  "keep elbows in, don't flare": "Tuck elbows in",
  "keep heels down": "Heels on floor",
  "keep knees bent": "Soften your knees",
  "keep torso still. swinging body": "Keep body still",
  "keep torso still. using body to push": "Keep body still",
  "knees out": "Push knees out",
  "knees tracking. lateral knee drift": "Push knees out",
  "lower fully. arm not returning to straight": "Straighten arms",
  "lower fully. not returning arms down": "Lower your arms",
  "lower further": "Go lower",
  "lower more": "Go lower",
  "lower more. not returning to shoulder height": "Lower your arms",
  "press all the way up": "Go higher",
  "press higher": "Go higher",
  "press higher. not reaching overhead": "Go higher",
  "pull down further": "Pull lower",
  "pull down further. not reaching full contraction": "Pull lower",
  "pull farther": "Pull further",
  "pull higher": "Pull higher",
  "pull higher. not reaching elbow flexion": "Pull higher",
  "pull to your stomach": "Pull to stomach",
  "pull to your stomach. handle not reaching the torso": "Pull to stomach",
  "raise higher": "Lift higher",
  "raise higher. not reaching enough depth": "Lift higher",
  "raise out to the sides": "Arms out wide",
  "reach forward. arm not fully extending between reps": "Reach forward",
  "return to start. forearm not returning to horizontal": "Back to start",
  "rushing — rep faster than your baseline": "Slow down",
  "too fast — control the rep": "Slow down",
  "slowing — rep slower than your baseline": "Speed up",
  "sit up tall": "Sit up tall",
  "stand fully. not returning to standing": "Stand tall",
  "stand fully. not returning upright": "Stand tall",
  "stay upright": "Stand tall",
  "stay upright, no swinging": "Stand tall",
  "straighten your back": "Straighten your back",
  "turn side-on": "Turn sideways",
  "uneven — one side lagging": "Even it out",
  "tracking lost": "Step back",
};

const MAX_WORDS = 3;

function sentenceCase(s: string): string {
  const t = s.trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** The short (<= 3 words) version of a cue. Already-short text is only re-cased if it was ALL CAPS. */
export function shortCue(text: string | null | undefined): string {
  if (!text) return '';
  const raw = String(text).trim();
  const key = raw.toLowerCase();
  if (EXACT[key]) return EXACT[key];
  const clause = raw.split(/\s+[—–-]\s+|[.,:;]\s+|[.,:;]$/)[0].trim();
  let words = clause.split(/\s+/).filter(Boolean);
  // "KEEP ELBOWS STILL" -> "Elbows still"; "TRY TO ..." -> the rest
  while (words.length > MAX_WORDS && /^(keep|try|to|stop)$/i.test(words[0])) words = words.slice(1);
  if (words.length > MAX_WORDS) words = words.slice(0, MAX_WORDS);
  const out = words.join(' ');
  // mixed-case input that is already short ("Step back into frame") keeps its own casing
  return out === out.toUpperCase() ? sentenceCase(out) : out.charAt(0).toUpperCase() + out.slice(1);
}

// ── THE COACH's words ────────────────────────────────────────────────────────────────────────────────────────────
// The Coach is the check / X with a reason on each rep: form feedback only. Cues about WHERE THE USER STANDS or the camera are the
// Guide's (lib/guideCoach.ts) and are never Coach words.
export const SETUP_ONLY_CUES = new Set(['Adjust position', 'Face the camera', 'Face away', 'Turn sideways', 'Step back']);
const GUIDE_WORDS_IN_TEXT = /\b(phone|camera|frame|picture|light)\b/i;

/** The Coach's word list: every plain form cue the app can show on an X. Never a setup line. */
export const COACH_WORDS: string[] = Array.from(new Set(['Go higher', 'Go lower', 'Full movement', ...Object.values(EXACT)])).filter((w) => !SETUP_ONLY_CUES.has(w));

/** The Coach version of a cue (2-3 plain form words), or null when the text is a setup / camera line (that is the Guide's). */
export function coachLine(text: string | null | undefined): string | null {
  const s = shortCue(text);
  if (!s) return null;
  if (SETUP_ONLY_CUES.has(s) || GUIDE_WORDS_IN_TEXT.test(s)) return null;
  return s;
}
