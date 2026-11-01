/**
 * lib/rankImages.ts
 *
 * Rank emblem art as base64 data: URIs, for HTML artboards in a WebView (they
 * can't reach the app's bundled asset ids). Same technique recap.tsx already
 * uses for muscle icons (Asset.fromModule -> File.base64). Cached per tier.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import type { Tier } from './sessionLog';

const SOURCES: Record<Tier, number> = {
  bronze:   require('../assets/ranks/bronze.png'),
  silver:   require('../assets/ranks/silver.png'),
  gold:     require('../assets/ranks/gold.png'),
  platinum: require('../assets/ranks/platinum.png'),
  diamond:  require('../assets/ranks/diamond.png'),
  master:   require('../assets/ranks/master.png'),
  champion: require('../assets/ranks/champion.png'),
};

const cache = new Map<Tier, string>();

export async function tierDataUri(tier: Tier): Promise<string | null> {
  const hit = cache.get(tier);
  if (hit) return hit;
  try {
    const asset = Asset.fromModule(SOURCES[tier]);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    const b64 = await new File(uri).base64();
    const out = `data:image/png;base64,${b64}`;
    cache.set(tier, out);
    return out;
  } catch (err) {
    if (__DEV__) console.warn('[rankImages] failed for', tier, err);
    return null;
  }
}
