/**
 * lib/muscleIcons.ts
 *
 * The app's per-muscle Flaticon art (assets/images/muscle-icons/<muscle>-<tier>.png,
 * registered in components/MuscleTierMap's MUSCLE_ICON_SOURCES) as base64 data: URIs,
 * for the Progress tab's WebView. Same technique recap.tsx uses. Cached per muscle+tier.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { MUSCLE_ICON_SOURCES } from '../components/MuscleTierMap';
import type { Muscle } from '../constants/exercises';
import type { Tier } from './sessionLog';

const cache = new Map<string, string>();

export async function muscleIconUri(muscle: Muscle, tier: Tier): Promise<string | null> {
  const key = `${muscle}:${tier}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = MUSCLE_ICON_SOURCES[muscle]?.[tier];
  if (!src) return null;
  try {
    const asset = Asset.fromModule(src as number);
    await asset.downloadAsync();
    const b64 = await new File(asset.localUri || asset.uri).base64();
    const out = `data:image/png;base64,${b64}`;
    cache.set(key, out);
    return out;
  } catch {
    return null;
  }
}
