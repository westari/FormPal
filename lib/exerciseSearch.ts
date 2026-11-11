/**
 * lib/exerciseSearch.ts
 *
 * THE exercise search rule, used by Create workout and Log a session (and meant for the Train tab's edit picker and its
 * Practice Exercises search too, which still use the older "contains" rule):
 *
 *   1. names that START with what was typed        ("g" -> Goblet Squat, Good Morning)
 *   2. names where a LATER WORD starts with it      ("g" -> Close-grip Push-up ... only if a word begins with g)
 *   3. TYPOS: about one wrong letter per word is forgiven ("hqmmer" and even "hqm" find Hammer Curl, "squt" finds Squat), from 3
 *      letters on, and only AFTER every exact and word-start match. A 3-letter word must start with the right letter and have at
 *      most one wrong letter after it; 4+ letters may have one wrong, missing or extra letter anywhere. 1-2 letter queries are
 *      never fuzzy, so "g" never shows Squat.
 *   Each group A-Z. Never a match in the middle of a word: "g" must not find "Bodyweight Squat".
 *
 * Words are split on spaces, hyphens, slashes, dots and brackets.
 *
 * EXERCISE_SEARCH_PAGE_JS is the same rule as plain JS text for the design pages (they run inside a WebView and cannot import
 * this file); scripts/test-design-screens.js runs both on many inputs and requires identical answers.
 */

const SEP = /[-/_.()]+/g;
const squash = (s: string) => s.toLowerCase().replace(SEP, ' ').replace(/\s+/g, ' ').trim();
const norm = (s: string) => ' ' + squash(s);

export const FUZZY_MIN_LEN = 3;

/** Edit distance <= 1 (one wrong, missing or extra letter) between a and b. */
export function withinOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; } else if (la > lb) i++; else j++;
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** Does the query word match this name word with one typo (also compared with the word's start, for a word typed so far)? */
function fuzzyWord(qw: string, w: string): boolean {
  if (qw.length < FUZZY_MIN_LEN) return w.indexOf(qw) === 0;
  if (qw.length === 3) return w.length >= 3 && qw[0] === w[0] && (qw[1] === w[1] ? 0 : 1) + (qw[2] === w[2] ? 0 : 1) <= 1;
  if (withinOne(qw, w)) return true;
  for (const L of [qw.length - 1, qw.length, qw.length + 1]) if (L > 0 && L <= w.length && withinOne(qw, w.slice(0, L))) return true;
  return false;
}

/** 0 = starts with the query, 1 = a later word starts with it, 2 = every query word matches a name word allowing a typo, -1 = none. */
export function matchTier(name: string, query: string): 0 | 1 | 2 | -1 {
  const q = squash(query);
  if (!q) return -1;
  const n = norm(name);
  if (n.indexOf(' ' + q) === 0) return 0;
  if (n.indexOf(' ' + q, 1) > 0) return 1;
  const qs = q.split(' ');
  if (!qs.some(w => w.length >= FUZZY_MIN_LEN)) return -1; // nothing long enough to forgive a typo in
  const words = n.trim().split(' ');
  return qs.every(qw => words.some(w => fuzzyWord(qw, w))) ? 2 : -1;
}

/** Matching names, best first. */
export function searchExercises(names: readonly string[], query: string, limit = 12): string[] {
  const starts: string[] = [], later: string[] = [], typo: string[] = [];
  for (const n of names) {
    const t = matchTier(n, query);
    if (t === 0) starts.push(n); else if (t === 1) later.push(n); else if (t === 2) typo.push(n);
  }
  const az = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return starts.sort(az).concat(later.sort(az), typo.sort(az)).slice(0, limit);
}

/** The same rule as page-side JS: dsSearch(names, query) -> matching names, best first (no limit). */
export const EXERCISE_SEARCH_PAGE_JS = String.raw`
  function dsNorm(s) { return ' ' + String(s).toLowerCase().replace(/[-\/_.()]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function dsWithinOne(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la === lb) { i++; j++; } else if (la > lb) i++; else j++;
    }
    return edits + (la - i) + (lb - j) <= 1;
  }
  function dsFuzzyWord(qw, w) {
    if (qw.length < 3) return w.indexOf(qw) === 0;
    if (qw.length === 3) return w.length >= 3 && qw.charAt(0) === w.charAt(0) && (qw.charAt(1) === w.charAt(1) ? 0 : 1) + (qw.charAt(2) === w.charAt(2) ? 0 : 1) <= 1;
    if (dsWithinOne(qw, w)) return true;
    var Ls = [qw.length - 1, qw.length, qw.length + 1];
    for (var k = 0; k < Ls.length; k++) { var L = Ls[k]; if (L > 0 && L <= w.length && dsWithinOne(qw, w.slice(0, L))) return true; }
    return false;
  }
  function dsSearch(names, query) {
    var q = String(query || '').toLowerCase().replace(/[-\/_.()]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return [];
    var qs = q.split(' '), canFuzz = qs.some(function (w) { return w.length >= 3; });
    var starts = [], later = [], typo = [];
    for (var i = 0; i < names.length; i++) {
      var n = dsNorm(names[i]);
      if (n.indexOf(' ' + q) === 0) starts.push(names[i]);
      else if (n.indexOf(' ' + q, 1) > 0) later.push(names[i]);
      else if (canFuzz) {
        var words = n.trim().split(' ');
        if (qs.every(function (qw) { return words.some(function (w) { return dsFuzzyWord(qw, w); }); })) typo.push(names[i]);
      }
    }
    var az = function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };
    return starts.sort(az).concat(later.sort(az), typo.sort(az));
  }
`;
