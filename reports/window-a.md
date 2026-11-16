# Window A report (round 6, Ari's phone test)

Branch work-a. Merged origin/overnight-build first (Ari's design files).

## Items

1. Rings tappable: DONE. Each of the 3 Home rings opens `app/goal/[id].tsx` (this week by day, past weeks, what counts), same colours and style as the rings. Maths in `lib/goalDetail.ts`. Test: `scripts/test-goal-pages.js`.
2. Calendar: DONE in code. It is now always mounted (invisible), so the native glass exists before the first open, which is what caused the old look on the first open. Glass is slightly stronger (tint 0.2). Today's circle is centred (38x38 round, dot absolute). Tests: test-calendar-drop, test-home-header-taps. NOT verifiable off the phone: how the real Liquid Glass looks.
3. Cue card: DONE, with a limit. It is back and visible. The old layout tucked it under the week card, which is now hidden, so I made it a full-width card (margin, radius 26, padding 18) lined up with the rings. I could not put it back byte-for-byte because the card it hung from no longer exists. Test: test-home-cue.
4. Pencil: DONE. Preview uses SF Symbol "pencil", regular weight, size 20. It was already "pencil" (semibold 16), so tell me if you want a different symbol.
5. Music screen glitch: DONE, cause is an inference. The log showed the page drawing at 459ms, and the code showed a dark blank screen during the "loading" state. Now the loading state is white, and the "skip connect music" choice is read from a cache primed in `_layout`, so the screen decides before it draws. Needs the phone to confirm; look at the [MUSIC] line.
6. Done screen: DONE. Built from `greatjobanimation.html` as-is (not edited), shown by `components/DoneHost.tsx` as a transparent overlay mounted once in `_layout`, with a wash sweeping over the previous screen first. Titles: Workout complete, Form check complete, Session logged, Workout created, Weight logged. The grey line is real: reps and clean %, time, personal best, "N of M this week", exercises and reps, weight change since last time (`lib/doneInfo.ts`). It replaces DoneScreen.tsx in recap, rep-feedback (practice finish), create-workout, log-session and weight logging. Flows: workout -> done -> rep feedback -> Today's progress -> Done -> streak or This week -> Home; form check -> rep feedback -> done -> Home. Test: test-done-screen. Animation and haptic timing can only be judged on the phone.
7. Camera tips: DONE. `app/camera-tips.tsx` shows `cameratips.html` as-is right after onboarding, once (flag `formpal_camera_tips_seen`). Continue goes to Home. The Back arrow also goes to Home (same as Continue), because there is no earlier screen to return to. Test: test-camera-tips. The tips and done pages load web fonts, which need network.

## Tests
New: test-goal-pages, test-done-screen, test-camera-tips. Updated for the new flows: test-create-saved, test-log-saved, test-logged-session, test-haptics-screens, test-done-flow, test-home-header-taps, test-calendar-drop, test-demo-music, test-workout-preview, test-progress-ux, test-home-cue, test-home-clean, test-home-rings, test-weekly-goal.
`npx tsc --noEmit`: no errors in files I touched. Old errors elsewhere (ar-experiment, calibrate, formcheck, drillLibrary, onboarding `opaque`) are not mine.

## Blocked commands
None new this round.

## Files for you to delete (I did not)
- components/DoneScreen.tsx (no longer used)
- components/SavedCheck.tsx (no longer used)
- lib/doneTimeline.ts (check first, possibly unused)
- scripts/_dbg.js, _hdr.js, _hdr2.js, _ux_explore.js, _ux_prof.js, _ux_prof2.js, train_wk_webkit.png (scratch files)

## Questions
- Pencil: keep SF "pencil" regular 20, or do you want another symbol?
- Cue card: full-width card OK, or do you want the old week card back so it tucks under it again?
