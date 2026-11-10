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

const EXACT: Record<string, string> = {
  'swinging — control the weight': 'Too much swing',
  'control it, no swinging': 'Too much swing',
  'control it. no swinging': 'Too much swing',
  'stop swinging': 'Too much swing',
  'stay upright, no swinging': 'Stay upright',
  'keep torso still. swinging body': 'Too much swing',
  'keep torso still. using body to push': 'Torso still',
  'elbows down and back, not out': 'Elbows back',
  'keep elbows in, don\'t flare': 'Elbows in',
  'face away from the camera, don\'t': 'Face away',
  'rushing — rep faster than your baseline': 'Too fast',
  'too fast — control the rep': 'Too fast',
  'slowing — rep slower than your baseline': 'Too slow',
  'cutting short — range dropped vs your start': 'Go deeper',
  'uneven — one side lagging': 'Uneven sides',
  'pull to your stomach. handle not reaching the torso': 'Pull to stomach',
  'return to start. forearm not returning to horizontal': 'Return to start',
  'reach forward. arm not fully extending between reps': 'Reach forward',
  'press all the way up': 'Press higher',
  'raise out to the sides': 'Raise wider',
  'lock out at top': 'Lock out',
  'drive elbows back': 'Elbows back',
  'knees tracking. lateral knee drift': 'Knees out',
  'tracking lost': 'Lost you',
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
