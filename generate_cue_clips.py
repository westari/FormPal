"""
generate_cue_clips.py — batch-generates all FormPal corrective-cue audio
clips using edge-tts: Microsoft Edge's online text-to-speech service, used
via a Python package that talks to it directly. NO API KEY, NO ACCOUNT, NO
SIGNUP — pip install and run. (Worth knowing: this is an unofficial use of
that service — Microsoft doesn't publish it as a public API, and the
community edge-tts package has been stable for years without issue, but
that's the honest tradeoff for "free and keyless.")

Reads the cue text -> filename mapping straight out of lib/cueClips.ts (the
same file lib/audioFeedback.ts imports at runtime), so this script and the
app can never drift out of sync — if you add/edit a cue in cueClips.ts later,
just re-run this.

FORMAT: edge-tts only outputs MP3 (no WAV/PCM option in the underlying
service) — cueClips.ts and the shipped placeholder files were switched from
.wav to .mp3 to match. expo-audio (already used by this app) plays MP3 just
as natively as WAV, so nothing else changes.

────────────────────────────────────────────────────────────────────────────
USAGE (Windows, from the gym app repo root, in PowerShell):
    py -m pip install edge-tts
    py generate_cue_clips.py

No key, no account, no signup — that's genuinely the whole setup.
────────────────────────────────────────────────────────────────────────────

VOICES: generates the DEFAULT voice straight into assets/sounds/cues/ (what
the app actually plays today), plus every voice in EXTRA_VOICES into its own
assets/sounds/cues/voices/<voice-name>/ subfolder. Those extra folders are
NOT wired into the app yet (no in-app voice picker exists for cue clips) —
they're generated so that feature has real audio to use whenever it's built,
without a second pass through every cue.

Picked for a calm, coach-like tone (edge-tts has no natural-language style
prompting like some cloud TTS APIs — the pick has to do the work, not a text
instruction):
    en-US-AndrewNeural   Male    "Warm, Confident, Authentic, Honest" <- default
    en-US-JennyNeural    Female  "Friendly, Considerate, Comfort"
    en-US-AriaNeural     Female  "Positive, Confident"
    en-US-GuyNeural      Male    "Passion"
Full US English list: AnaNeural, AndrewMultilingualNeural, AndrewNeural,
AriaNeural, AvaMultilingualNeural, AvaNeural, BrianMultilingualNeural,
BrianNeural, ChristopherNeural, EmmaMultilingualNeural, EmmaNeural,
EricNeural, GuyNeural, JennyNeural, MichelleNeural, RogerNeural,
SteffanNeural (run `py -m edge_tts --list-voices` for every language).
Change DEFAULT_VOICE below and re-run to switch the app's primary voice —
the manifest detects the change and regenerates automatically.

RE-RUN ANY TIME: a manifest (assets/sounds/cues/.generation_manifest.json)
tracks which voice+text each file was generated with, and skips anything
already up to date — safe to re-run after editing cues or adding voices.
"""

import asyncio
import hashlib
import json
import os
import re
import sys

try:
    import edge_tts
except ImportError:
    print("Missing dependency. Run:  py -m pip install edge-tts")
    sys.exit(1)

# ─── Config — edit these ────────────────────────────────────────────────────

DEFAULT_VOICE = "en-US-AndrewNeural"  # ships in assets/sounds/cues/ (what the app plays)

EXTRA_VOICES = [
    "en-US-JennyNeural",
    "en-US-AriaNeural",
    "en-US-GuyNeural",
]  # each gets its own assets/sounds/cues/voices/<name>/ folder — not wired into the app yet

# Set True to ignore the manifest and regenerate everything regardless of
# what's already done. Normally leave False — editing DEFAULT_VOICE/
# EXTRA_VOICES above already triggers a regen for whatever changed.
FORCE_REGENERATE_ALL = False

# ─── Paths ───────────────────────────────────────────────────────────────

REPO_ROOT     = os.path.dirname(os.path.abspath(__file__))
CUE_CLIPS_TS  = os.path.join(REPO_ROOT, "lib", "cueClips.ts")
OUT_DIR       = os.path.join(REPO_ROOT, "assets", "sounds", "cues")
VOICES_DIR    = os.path.join(OUT_DIR, "voices")
MANIFEST_PATH = os.path.join(OUT_DIR, ".generation_manifest.json")


def parse_cue_map(ts_path):
    """Extract [(cue text, filename slug), ...] from lib/cueClips.ts."""
    with open(ts_path, "r", encoding="utf-8") as f:
        src = f.read()
    pattern = re.compile(
        r"'((?:[^'\\]|\\.)*)':\s*require\('\.\./assets/sounds/cues/([^']+)\.mp3'\)"
    )
    pairs = []
    for m in pattern.finditer(src):
        text = m.group(1).replace("\\'", "'").replace("\\\\", "\\")
        slug = m.group(2)
        pairs.append((text, slug))
    return pairs


def text_hash(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def load_manifest():
    if FORCE_REGENERATE_ALL or not os.path.isfile(MANIFEST_PATH):
        return {}
    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def save_manifest(manifest):
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)


async def generate_one(text, out_path, voice):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)


async def run_voice(pairs, voice, out_dir, manifest, manifest_key):
    os.makedirs(out_dir, exist_ok=True)
    todo = []
    for text, slug in pairs:
        entry = manifest.get(manifest_key, {}).get(slug)
        if entry and entry.get("voice") == voice and entry.get("text_hash") == text_hash(text):
            continue
        todo.append((text, slug))

    skipped = len(pairs) - len(todo)
    print(f"\n=== {manifest_key} ({voice}) === {skipped} already done, {len(todo)} to generate")

    manifest.setdefault(manifest_key, {})
    ok = 0
    for i, (text, slug) in enumerate(todo, start=1):
        out_path = os.path.join(out_dir, f"{slug}.mp3")
        print(f"[{i}/{len(todo)}] {slug}.mp3  <-  \"{text}\"")
        try:
            await generate_one(text, out_path, voice)
            manifest[manifest_key][slug] = {"voice": voice, "text_hash": text_hash(text)}
            save_manifest(manifest)  # after every clip so an interruption loses no progress
            ok += 1
        except Exception as e:
            print(f"    FAILED: {e}")
    print(f"{manifest_key}: generated {ok}/{len(todo)} this run.")


async def main_async():
    if not os.path.isfile(CUE_CLIPS_TS):
        print(f"Can't find {CUE_CLIPS_TS} — run this script from the gym app repo root.")
        sys.exit(1)

    pairs = parse_cue_map(CUE_CLIPS_TS)
    if not pairs:
        print("Parsed zero cue -> filename pairs out of lib/cueClips.ts — its "
              "format may have changed; check the regex in parse_cue_map().")
        sys.exit(1)
    print(f"Found {len(pairs)} cues in lib/cueClips.ts.")

    manifest = load_manifest()

    # Default voice -> assets/sounds/cues/ (what the app actually plays).
    await run_voice(pairs, DEFAULT_VOICE, OUT_DIR, manifest, "__default__")

    # Extra voices -> assets/sounds/cues/voices/<name>/ (future voice-picker material).
    for voice in EXTRA_VOICES:
        voice_dir = os.path.join(VOICES_DIR, voice)
        await run_voice(pairs, voice, voice_dir, manifest, voice)

    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main_async())
