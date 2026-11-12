/**
 * lib/screenFlash.ts
 *
 * Front-camera "flash" (like Snapchat): the screen goes bright white around the camera view to light your face, and the
 * screen brightness is pushed to the maximum while it is on. Max brightness needs the native module expo-brightness; a
 * build made before it was added does not have it, so everything here is a safe no-op for the brightness part (the white
 * frame still shows). The previous brightness is always put back when the flash goes off.
 */
let mod: any = null;
let tried = false;
function brightness(): any {
  if (tried) return mod;
  tried = true;
  try { mod = require('expo-brightness'); } catch { mod = null; }
  return mod;
}

let saved: number | null = null;

/** Turn the max-brightness part on or off. Returns true if the native module exists (false = this build cannot change brightness). */
export async function setFlashBrightness(on: boolean): Promise<boolean> {
  const B = brightness();
  if (!B) return false;
  try {
    if (on) {
      if (saved === null) saved = await B.getBrightnessAsync();
      await B.setBrightnessAsync(1);
    } else if (saved !== null) {
      const back = saved; saved = null;
      await B.setBrightnessAsync(back);
    }
    return true;
  } catch {
    saved = null;
    return false;
  }
}

/**
 * The ring light: how far in from the screen edge the glow reaches (points) and its brightness curve (alpha at each fraction of
 * that depth: SOLID white for the first half, then fading to clear at the inner end). PLACEHOLDER look values, tuned by eye.
 * Ari's phone test 2026-11-12: "too weak in a dark room", so it is much deeper and stays solid white for longer than before
 * (was depth 64, solid only at the very edge). The sides stay shallow so the middle (the body and the framing guide) is never covered.
 */
export const RING_LIGHT = {
  depth: 96,            // sides (left / right)
  depthTopBottom: 150,  // top and bottom (the body is not there, so it can reach further in)
  stops: [{ at: 0, a: 1 }, { at: 0.5, a: 1 }, { at: 0.78, a: 0.55 }, { at: 1, a: 0 }],
};
