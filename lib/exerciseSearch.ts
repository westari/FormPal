/**
 * lib/exerciseSearch.ts
 *
 * THE exercise search rule, used by Create workout and Log a session (and meant for the Train tab's edit picker and its
 * Practice Exercises search too, which still use the older "contains" rule):
 *
 *   1. names that START with what was typed        ("g" -> Goblet Squat, Good Morning)
 *   2. names where a LATER WORD starts with it      ("g" -> Close-grip Push-up, Single Leg RDL ... only if a word begins with g)
 *   Each group A-Z. Never a match in the middle of a word: "g" must not find "Bodyweight Squat".
 *
 * Words are split on spaces, hyphens, slashes, dots and brackets.
 *
 * EXERCISE_SEARCH_PAGE_JS is the same rule as plain JS text for the design pages (they run inside a WebView and cannot import
 * this file); scripts/test-design-screens.js runs both on many inputs and requires identical answers.
 */

const SEP = /[-/_.()]+/g;
const norm = (s: string) => ' ' + s.toLowerCase().replace(SEP, ' ').replace(/\s+/g, ' ').trim();

/** 0 = starts with the query, 1 = a later word starts with it, -1 = no match. */
export function matchTier(name: string, query: string): 0 | 1 | -1 {
  const q = query.toLowerCase().replace(SEP, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return -1;
  const n = norm(name);
  if (n.indexOf(' ' + q) === 0) return 0;
  return n.indexOf(' ' + q, 1) > 0 ? 1 : -1;
}

/** Matching names, best first. */
export function searchExercises(names: readonly string[], query: string, limit = 12): string[] {
  const starts: string[] = [], later: string[] = [];
  for (const n of names) {
    const t = matchTier(n, query);
    if (t === 0) starts.push(n); else if (t === 1) later.push(n);
  }
  const az = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return starts.sort(az).concat(later.sort(az)).slice(0, limit);
}

/** The same rule as page-side JS: window.__dsSearch(names, query) -> matching names, best first (no limit). */
export const EXERCISE_SEARCH_PAGE_JS = String.raw`
  function dsNorm(s) { return ' ' + String(s).toLowerCase().replace(/[-\/_.()]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function dsSearch(names, query) {
    var q = String(query || '').toLowerCase().replace(/[-\/_.()]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return [];
    var starts = [], later = [];
    for (var i = 0; i < names.length; i++) {
      var n = dsNorm(names[i]);
      if (n.indexOf(' ' + q) === 0) starts.push(names[i]);
      else if (n.indexOf(' ' + q, 1) > 0) later.push(names[i]);
    }
    var az = function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };
    return starts.sort(az).concat(later.sort(az));
  }
`;
