# FormPal — project instructions

FormPal is a camera-based AI form-coach gym app (Expo SDK 54, React Native, TypeScript, Expo Router). The camera/CV is a native Swift module (`modules/athlt-camera`, ATHLTCameraModule) using Apple Vision pose estimation. See the global `~/.claude/CLAUDE.md` for the developer's overall workflow preferences (Windows/PowerShell, full-file replacements, no unapproved pushes, etc.) — this file only adds rules specific to this project.

## Exercise definitions: investigate before writing thresholds

Before writing any new exercise definition or threshold in `constants/exerciseDefinitions.ts` (repMetric, topAngle, repEnterThreshold, repExitThreshold, goodROMThreshold, or any formCheck condition value), never guess. Follow this process in order, every time, without being asked again:

1. **Read a working, verified exercise of a similar movement pattern first.** Find the closest existing family (e.g. `SQUAT_REP_METRIC`/`squatVariant()` for knee-dominant patterns, `CURL_REP_METRIC`/`curlVariant()`, `ROW_REP_METRIC`/`bentOverRowVariant()`/`seatedRowVariant()`, `SHOULDER_PRESS_REP_METRIC`, `TRICEP_REP_METRIC`, `LUNGE_REP_METRIC`, `PUSHUP_REP_METRIC`) and base the new one's structure and threshold *ranges* on it. State explicitly which existing exercise was used as the reference and why, before writing anything.

2. **For any genuinely new metric/threshold with no comparable existing exercise:** do not hardcode a guessed number. Set deliberately wide/permissive thresholds so reps register regardless of the real value, add an `onDebugLog` `[REP]` (or similar) line printing the actual measured value(s), and say explicitly: "these thresholds are placeholders — do N reps and send me the log, then I'll set the real values from your actual numbers." Label every such number as a placeholder in both the code comment and the response to the user.

3. **Never present a guessed number as final.** Any threshold not derived from an existing verified exercise or from the user's real device log is a placeholder — say so.

4. **Check feasibility against the Metric framework before building a form check.** If a fault isn't reliably detectable with the available Metric primitives and Apple Vision's actual pose landmarks (e.g. no mid-spine landmark exists, so upper-back rounding can't be measured directly), say so up front and skip building it, rather than shipping a check that will fire randomly.

This applies to every future request to add or fix an exercise definition/threshold in this project.
