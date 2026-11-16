# Window B report (2026-11-16, evening round)

## Which native build the phone ran: the OLD Oct 8 build
Read from `C:\Users\arize\gym app\logs\latest.log` (newest session, 16:14 to 16:19):
- No native `ATTEMPT-MISSED` or `REP-QUALITY` lines anywhere (the new Swift prints them). The `[ATTEMPT]` lines are the JS mirror, not native.
- `expo-brightness is NOT in this build (old build)`, and setup is the old one (`rep metric trackable - starting 2.0s hold`, no whole-body check).
- The JS is NEW (the log has `[READY-GATE]`, `[COACH]`, the new `[CONFIDENCE]` lines). So: new JS on the old native build.
- So on the phone, half reps get NO X yet. That comes with the new iOS build. I did not start a build.
- I merged `origin/overnight-build` first (clean). I did not touch any done / complete screens.

## Camera screen look (1 to 6): all done in code, not seen on a phone
1. **Record button removed. Done.** A small Liquid Glass "Finish" pill (76 x 40) takes its place on the rep count's row, at the right edge (20 pt from the edge, so a two-digit count never touches it on a small phone). It only shows while tracking, because only then does it do anything. It does the same as the old button (`handleStop`).
2. **Pill centred, higher. Done.** I cannot see why it was off centre on your phone (my mock was centred). The likely cause: the glass was sized by its content and the native glass view put it off. It now has a FIXED width (240) placed from the screen's own middle, so it is centred exactly on every phone (a test checks all six sizes). It sits near the top of the brackets (12 pt below them) instead of 30% down. "Ready. Go!" sits at the same height.
3. **Cue stars back. Done.** The blue sparkle sits to the left of the Guide text inside the pill (same image as before).
4. **Set bars. Done.** Each set is its own thin (18 pt) Liquid Glass pill with 8 pt gaps. Finished and current sets have a bright white fill and a soft green glow, upcoming sets are plain dim glass.
5. **Timer icon. Done / nothing to fix in code.** The timer already used the real SF Symbol `stopwatch` (SymbolView), not a drawing. I made it bigger (16 pt, medium weight) and added a test that fails if a custom drawing ever replaces it. If it still looks wrong on the phone, send me a screenshot.
6. **Solo rep counter. Done.** It is now the same component as the workout: "3 / 10", the target is the exercise's default reps (`defaultReps` from the catalog, 10 if missing), same font.
- Six phone sizes (SE, 13 mini, 15, 16 Pro, 15 Pro Max, 16 Pro Max), workout and solo: `scripts\test-camera-hud-layout.js` (no overlaps, inside safe areas, pill centred exactly, Finish clear of the count and the demo drawer).
- Screenshots (my layout in Chromium next to your image): `.scratch\hud-compare2.png`, six sizes `.scratch\hud-sizes2.png`. Glass is only approximated there (browser, no Liquid Glass, no SF Pro).

## Coach and Guide logic (7 to 9)
**7. "Start your reps" once: done.** If he stands in frame after Go and no rep is counted and no stroke is tried for 6 seconds, the Guide says "Start your reps" once, for 4 seconds. It is dead for good as soon as any rep counts or a stroke is tried, so it never repeats and never shows in a rest between sets. It never shows with nobody in the picture. Standing still, confidence stays 100.
- Replay: in his log the first rep came 3.8 s after Go, so it was never shown (correct). Synthetic: standing 40 s shows it once at 6.0 s; reps then a 40 s rest shows it never. Test: `test-no-form-drop.js`.

**8. Confidence dropping during half reps: done (MAJOR).**
- Cause in the log: the "trying but no rep counted for 5 s" rule lowered the number (76 down to 33) while the log itself said "the camera sees 100". It treated a form problem as a camera problem.
- Now the "trying but nothing counts" drop only applies when there is a REAL camera problem: the camera's visibility score under 85, or the rep path cut at the top, bottom or frame edge right now (a cut older than 4 s is not evidence). When every needed joint is clearly seen, confidence stays where the camera sees it (100) and the Coach's X (from onAttemptMissed, new build) says "Go lower".
- BEFORE (phone): half-rep stretch 63 to 80 s after Go: 76 falling to 33, Guide silent, no X.
- AFTER (same log): 100 for the whole stretch, never "stuck"; the number never goes under 90 anywhere in the working part (5 to 90 s). A real camera problem still lowers it: when he walks out of frame at the end it falls to under 60 and the Guide speaks ("Step back further" / "Back up") no later than the drop.
- Old build: half reps still show no X. The number is now right, the X needs the new build.

**9. A check with no stroke: not found, nothing to fix.** All 10 checks the phone showed have a real stroke (25+ degrees of movement) in the 2.5 s before them, and there is no `[COACH]` line and no verdict during his 15 s of standing still (38 to 53 s after Go). One thing I looked at closely: native counted a "rep #1" (arms dropping to his sides, bottom 25.8) 0.6 s BEFORE Go; it got no check on the phone because reps before Go are ignored. The replay, which has no phase, would give it one, so that line is a replay artefact, not a phone event.

## What changed in the code
- `lib/cameraConfidence.ts`: the camera-problem rule; stale cuts no longer cap. `lib/coachTuning.ts`: `clearVisibleMin: 85` (PLACEHOLDER, my number, not from a log).
- `lib/guideCoach.ts`: `createStartReps`, the "Start your reps" Guide word and its evidence entry.
- `lib/cameraHudLayout.ts`, `app/formcheck.tsx`: the look.
- Tests: new `test-no-form-drop.js` (replays the new log, fixture `scripts\fixtures\shoulder-press-2026-11-16b.log.txt`); `test-camera-hud-layout.js` updated; `test-movement-match.js` rule changed on purpose (it used to demand "never 80+ while trying with no rep" even when everything was visible; that is exactly the bug).

## Differences I still could not match (from last round, unchanged unless noted)
- Real Liquid Glass and SF Pro cannot render in my screenshots. The flash icon is the bolt-slash (SF Symbols has no camera-slash).
- Your original image has no Finish pill and no demo strip; both are in my version.

## Not verified
- Nothing here was seen on a phone. Please send one screenshot of the workout camera screen at the end.
- Swift changes (onAttemptMissed, clip fix, keep-awake keeper, whole-body setup) still need the new iOS build.
