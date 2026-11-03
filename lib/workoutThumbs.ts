/**
 * lib/workoutThumbs.ts
 *
 * One picture per workout, shared by the Progress tab and the Home tab so both show the same thing:
 * a real frame of the workout's own video, or (when it has no video, or the clip is gone) the icon of
 * the muscle it worked most. Never a black box.
 *
 * A workout owns the videos logged since the previous (older) workout ended — see lib/sessionVideo.ts.
 */
import { File } from 'expo-file-system';
import { getSessionThumbnail } from './sessionVideo';
import { muscleIconUri } from './muscleIcons';
import type { Muscle } from '../constants/exercises';
import type { Tier } from './sessionLog';

/** A frame of the workout's video as a data: URI (the page can't load file:// paths), or null. */
export async function workoutFrame(ts: number, prevTs: number): Promise<string | null> {
  const uri = (await getSessionThumbnail(ts, 1000, prevTs)) ?? (await getSessionThumbnail(ts, 0, prevTs));
  if (!uri) return null;
  try { return `data:image/jpeg;base64,${await new File(uri).base64()}`; } catch { return null; }
}

/** The fallback picture: the workout's main muscle icon at that muscle's current tier. */
export function workoutFallbackIcon(muscle: string | null, tier: Tier | null | undefined): Promise<string | null> {
  return muscle ? muscleIconUri(muscle as Muscle, (tier ?? 'silver') as Tier) : Promise.resolve(null);
}
