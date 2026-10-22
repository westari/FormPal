# FormPal — project instructions

FormPal is a camera-based AI form-coach gym app (Expo SDK 54, React Native, TypeScript, Expo Router). The camera/CV is a native Swift module (`modules/athlt-camera`, ATHLTCameraModule) using Apple Vision pose estimation. See the global `~/.claude/CLAUDE.md` for the developer's overall workflow preferences (Windows/PowerShell, full-file replacements, no unapproved pushes, etc.) — this file only adds rules specific to this project.

## Exercise definitions: investigate before writing thresholds

Before writing any new exercise definition or threshold in `constants/exerciseDefinitions.ts` (repMetric, topAngle, repEnterThreshold, repExitThreshold, goodROMThreshold, or any formCheck condition value), never guess. Follow this process in order, every time, without being asked again:

1. **Read a working, verified exercise of a similar movement pattern first.** Find the closest existing family (e.g. `SQUAT_REP_METRIC`/`squatVariant()` for knee-dominant patterns, `CURL_REP_METRIC`/`curlVariant()`, `ROW_REP_METRIC`/`bentOverRowVariant()`/`seatedRowVariant()`, `SHOULDER_PRESS_REP_METRIC`, `TRICEP_REP_METRIC`, `LUNGE_REP_METRIC`, `PUSHUP_REP_METRIC`) and base the new one's structure and threshold *ranges* on it. State explicitly which existing exercise was used as the reference and why, before writing anything.

2. **For any genuinely new metric/threshold with no comparable existing exercise:** do not hardcode a guessed number. Set deliberately wide/permissive thresholds so reps register regardless of the real value, add an `onDebugLog` `[REP]` (or similar) line printing the actual measured value(s), and say explicitly: "these thresholds are placeholders — do N reps and send me the log, then I'll set the real values from your actual numbers." Label every such number as a placeholder in both the code comment and the response to the user.

3. **Never present a guessed number as final.** Any threshold not derived from an existing verified exercise or from the user's real device log is a placeholder — say so.

4. **Check feasibility against the Metric framework before building a form check.** If a fault isn't reliably detectable with the available Metric primitives and Apple Vision's actual pose landmarks (e.g. no mid-spine landmark exists, so upper-back rounding can't be measured directly), say so up front and skip building it, rather than shipping a check that will fire randomly.

This applies to every future request to add or fix an exercise definition/threshold in this project.

## Design files: use as-is, never rebuild

When the user provides exact design files for a screen, use those files as-is. NEVER rebuild, recreate, or redesign those screens, even if asked to fix bugs or performance. Always make the smallest possible change to the existing file. If a fix seems to require rebuilding, stop and ask first.

## Never ask the user to close and reopen the app

Do not suggest closing and reopening the app, or otherwise doing a full restart, as a troubleshooting step or way to pick up a fix. The user is always already closing and reopening between tests on their own — asking for it again wastes their time. If a fresh native rebuild (not just a reload) is genuinely required, say that plainly and explain why, but don't frame it as "close and reopen."

## Wiring Claude Design files: verify against the real rendered page, every time

This is the single biggest source of wasted rounds on this project: writing injected JS against assumptions about a design file's DOM structure, shipping it, and only finding out it's wrong when the user reports a glitch on their phone. Concrete proof this happens: the scrub bar in `repfeedback.html` was "fixed" across many rounds this project without ever actually working, because its selector checked `style.flex === '1'` — but the browser silently normalizes `flex: 1` to `flex: 1 1 0%` the instant it's parsed, so that check never matched, ever. The bug was invisible to code review and only caught by actually loading the file and reading the live DOM back.

**Every Claude Design `.html` export ships "packed"**: the real markup/CSS/Component logic is a JSON-encoded string inside a `<script type="__bundler/template">` tag, wrapped in a generic bundler loader that's mostly base64 font data. Reading the raw file directly (grep, cat, Read tool) shows that wrapper, not the real screen — this is exactly how past sessions guessed wrong.

Before writing or editing ANY injection code against a design file, in order, every time:

1. **Unpack it first.** Run `node scripts/unpack-design-files.js [name-filter]` — decodes the real HTML into `.scratch/unpacked-designs/<file>.html`. Read the UNPACKED file to find real selectors, real default text, real class/style patterns. Never guess structure from the raw packed file.
2. **Screenshot it.** Run `node scripts/screenshot-design-files.js [name-filter]` (Playwright + headless Chromium) — renders the file exactly as it would in a WebView and saves a PNG to `.scratch/design-screenshots/`. Look at it before writing a single line of injection code that depends on layout/position.
3. **Verify selectors against the real live DOM, not the source text.** Browsers normalize inline styles on parse — `flex: 1` → `style.flex` reads back `"1 1 0%"`, not `"1"` (use `style.flexGrow` instead). Don't assume a `style.xxx` property equals what the raw markup says; check it in a real browser (`page.evaluate(() => el.style.whatever)` via Playwright, or read `.scratch/unpacked-designs/` and reason about what the DOM API actually returns, not what the HTML attribute string says).
4. **For anything interactive (drag, tap, type), write a Playwright test that actually does it** before considering it done — load the real file, inject the real extracted JS (use `scripts/extract-ts-function.js` to pull the exact function out of the `.tsx` source via the TypeScript compiler API, not a hand-copied approximation, so the test runs the literal code that ships), simulate the real gesture (`page.mouse.down/move/up` for drags), and check the result (postMessage fired, element moved) in the console/DOM — not "this should work."
5. **Known WebView gotchas to check for on every new screen**, found the hard way on this project:
   - Any `<input>`/`<textarea>` with `font-size` under 16px triggers an iOS auto-zoom on focus, regardless of viewport `maximum-scale`/`user-scalable` — inject a `font-size: 16px !important` (or higher) override on it.
   - `window.innerHeight` can read `0` on a canvas-scaling script's very first call (before the WebView has actually laid out) — never use `vh = window.innerHeight || H` (silently applies a wrong scale that gets visibly corrected later); skip the frame entirely (`if(!vh) return;`) until a real height is available.
   - `animation: none` suppresses CSS `@keyframes` animations but NOT CSS `transition:` rules — suppress both (`transition: none !important` too) or an element's own opacity/transform transition on mount will still visibly play.
   - Never wrap one of these WebViews in `KeyboardAvoidingView` — shrinking the WebView's rendered height feeds straight into its own canvas-rescale math and reads as the whole screen zooming. If the keyboard needs to be avoided, shift the WebView's POSITION (`transform: translateY`), never its size.
   - A design file that ships as a self-extracting bundle (vs. a plain static page) can make the WebView fire what looks like repeated fresh page loads while it unpacks — injected JS that only tries once and gives up (or posts "ready" unconditionally) can reveal a half-unpacked page. Always retry on a schedule and only signal ready once the real elements are actually found.
6. **Finish the whole pass before asking for a device test.** Don't ask the user to check after every small change — verify as much as the tooling above allows first, batch every fix, and ask for one test only once everything in scope is done.
7. **Ask upfront, not mid-task.** If genuinely unsure about scope or an ambiguous requirement, ask at the start of the work, not after starting and hitting the ambiguity.

## Testing is YOUR job, not mine

- Never say "fixed" until you have tested it yourself with Playwright: load the real design file, do the exact action (drag the scrub bar, type in Cue, open the card), and take a before-and-after screenshot.
- If a bug only shows up on a real iPhone, say so and ask for one screenshot. Don't guess.
- Batch your work. Finish everything, then give me ONE short list to test on my phone. Never ask me to check in the middle.
- **Don't stop until it's actually done.** Once given a task, loop on it yourself — test with Playwright, find what's still broken, fix it, test again — without stopping to report back partway or asking "should I continue?" No excuses, no settling for "this needs more investigation" as a way to end the turn early. Keep going until the task is genuinely finished and verified, not until you've made some progress on it.
- The ONLY acceptable reasons to stop before the task is done: something that truly requires the user's phone (a bug Playwright can't reproduce, confirmed only on-device) or a real decision only the user can make (ambiguous scope, conflicting requirements). Even then, finish everything else in the batch first, and say exactly what's blocked and why — never use it as cover for stopping early on something you could have kept pushing on.
