# First run on the new build (overnight-build) — what to look for in the log

Run "iOS Dev Build" on the **overnight-build** branch (not master). When it is installed, open the camera, do 3 full reps and 3 half reps (stop short on purpose), stand still 20 seconds, stop, open the rep feedback. Then send `C:\Users\arize\gym app\logs\latest.log`. These are the lines that prove each native fix:

| What | Line to find in the log | What it must show |
| --- | --- | --- |
| The build is really the new one | `[GLASS] real Liquid Glass: ON` (or OFF with a reason) | ON means Xcode 26 built it with glass |
| Keep-awake keeper (native) | `[DEBUG] [AWAKE] native: idle timer disabled = true (session started), app state active, brightness 0.xx, low power false` then a line about every 20 s (`(tick)`) and one on `(app became active)` | `idle timer disabled = true` every time. If the screen still dims, the lines before the dim say why (`app state inactive`, low power, brightness) |
| Half reps (engine) | `[DEBUG] [ATTEMPT-MISSED] shoulderPress short_bottom reached=62.0 needed=50.0 size=0.55R frames=9 (min 0.35R, PLACEHOLDER)` once per half rep, and right after it `[ATTEMPT-MISSED] from the engine: short_bottom ...` and `[COACH] X "Go lower" because the engine saw a stroke start like a rep and not count` | One line per half rep, none while standing still, none for a full rep. Send these so the 35% line can be set from your numbers |
| Rep quality | `[DEBUG] [REP-QUALITY] shoulderPress entry-to-exit=1.20s unreliable=0/38 (0%) travel=45.1` for every rep that reaches the gate | Real numbers for the reliability cap |
| Whole-body setup | `[DEBUG] [SETUP] shoulderPress whole body in view — leftShoulder=0.91 ... leftHip=0.74 ...` before Ready, or `NOT ready: whole body not in view — missing leftHip` | Ready only with every listed joint |
| Press return-to-start gate | `[DEBUG] [REP-GATE] shoulderPress counted at the start position: gate=... ` and, when a rep is held back, `[REP-WAIT] ... not counted yet` | |
| Person lost / back | `[DEBUG] [TRACK] person lost` then `[TRACK] person back` | One pair per absence |
| Pause and resume | `[DEBUG] [ACTIVITY] state=active reason=returned_to_start_position` and the reps count again afterwards | Counting resumes after a pause of 8+ seconds |
| Video saving | `[VIDEO] stop: camera returned a clip (athlt_....mov), NNs tracked` (NOT "NO clip"), then the rep feedback page has the video | Native: `recording saved: ... (N bytes)` is in the Xcode log only; in Metro look for the `[VIDEO]` line |
| Brightness (flash) | `[BRIGHTNESS] flash on: brightness set to 1 (was 0.xx)` and `[BRIGHTNESS] flash off: brightness put back to 0.xx` | If you see `expo-brightness is NOT in this build`, this is still the old build |
| Guide tells the truth | `[GUIDE] says "..." because real camera problem, evidence: ...` | A tip always names its evidence. During half reps with every joint seen: `[GUIDE] says nothing (every joint is seen all through the stroke; the strokes are just short ...)` |

If the build FAILS: the failing Swift file and line are in the "Build iOS dev client (local)" step of the workflow run. Send that step's last 60 lines.
If the app opens but crashes on the camera screen: send the log; `[AWAKE]`, `[GLASS]` and `[SETUP]` lines show how far it got.
