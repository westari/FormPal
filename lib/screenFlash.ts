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

/** How thick the white frame is on each side, in points (the top stays clear so the top buttons sit over the camera). */
export const FLASH_FRAME = { side: 38, bottom: 38 };
