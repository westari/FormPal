/**
 * lib/sessionVideo.ts
 *
 * Maps a session's timestamp back to the video clip recorded for it (logged
 * separately in "formpal_video_log" by app/formcheck.tsx's logSessionVideo,
 * keyed by the same Date.now() a session's own ts comes from) and generates
 * a small cached thumbnail frame from that clip — used by the session-list
 * cards (home tab, progress tab) so they show a real frame from the user's
 * own recording instead of a generic dumbbell icon.
 *
 * VIDEO_LOG_KEY must stay byte-for-byte the same string as formcheck.tsx's
 * own VIDEO_LOG_KEY — this reads data that file already writes, not a new
 * store.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// require() inside try/catch on purpose — same pattern as
// components/LiquidGlass.tsx's native module guard. expo-video-thumbnails
// reads its native module at IMPORT time, which throws synchronously
// ("Cannot find native module 'ExpoVideoThumbnails'") on any build that
// hasn't been rebuilt with this package linked in yet — a plain top-level
// `import` crashed the whole app on launch, not just this feature, since
// this file is imported from the home and progress tabs. Safe until a
// build that includes the native module exists; every function below
// degrades to "no thumbnail" instead of throwing.
let VideoThumbnails: typeof import('expo-video-thumbnails') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  VideoThumbnails = require('expo-video-thumbnails');
} catch {
  VideoThumbnails = null;
}

const VIDEO_LOG_KEY = 'formpal_video_log';
// A session's own ts and the videoUri log entry's ts are both stamped at
// workout-finish time from two separate Date.now() calls a few JS ticks
// apart — never exactly equal. 5s comfortably covers that gap without
// risking a false match against an adjacent session.
const MATCH_TOLERANCE_MS = 5000;

type VideoLogEntry = { uri: string; ts: number };

let cachedLog: VideoLogEntry[] | null = null;
async function loadVideoLog(): Promise<VideoLogEntry[]> {
  if (cachedLog) return cachedLog;
  try {
    const raw = await AsyncStorage.getItem(VIDEO_LOG_KEY);
    cachedLog = raw ? JSON.parse(raw) : [];
  } catch {
    cachedLog = [];
  }
  return cachedLog!;
}

export async function findSessionVideoUri(sessionTs: number): Promise<string | null> {
  const log = await loadVideoLog();
  let best: VideoLogEntry | null = null;
  let bestDist = Infinity;
  for (const entry of log) {
    const dist = Math.abs(entry.ts - sessionTs);
    if (dist < bestDist) { bestDist = dist; best = entry; }
  }
  return best && bestDist <= MATCH_TOLERANCE_MS ? best.uri : null;
}

// In-memory only (not persisted) — regenerated once per app run per
// session, which is cheap (a single decoded frame) and avoids the
// complexity of a disk cache that would need its own invalidation.
const thumbCache = new Map<string, string | null>();

export async function getSessionThumbnail(sessionTs: number): Promise<string | null> {
  if (!VideoThumbnails) return null; // native module not in this build — see the require() guard above

  const cacheKey = String(sessionTs);
  if (thumbCache.has(cacheKey)) return thumbCache.get(cacheKey)!;

  const videoUri = await findSessionVideoUri(sessionTs);
  if (!videoUri) { thumbCache.set(cacheKey, null); return null; }

  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality: 0.5 });
    thumbCache.set(cacheKey, uri);
    return uri;
  } catch {
    thumbCache.set(cacheKey, null);
    return null;
  }
}
