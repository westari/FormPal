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
import { resolveVideoUri } from './videoStore';

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
// A solo check's own ts and its videoUri log entry's ts are stamped from two
// separate Date.now() calls a few JS ticks apart — never exactly equal. 5s
// covers that gap. A WORKOUT is different: each set's video is logged when
// that set is stopped, but the workout's ts is when the whole workout
// finished, minutes later. So a workout owns the videos logged after the
// previous workout ended and up to its own end (never more than 3 hours back).
const MATCH_TOLERANCE_MS = 5000;
const MAX_WORKOUT_MS = 3 * 60 * 60 * 1000;

type VideoLogEntry = { uri: string; ts: number };

// BUG FOUND ("my newest workout shows the flat icon, older ones show a frame"): the log used to be read ONCE per
// app run and kept forever, and a failed lookup was remembered as "no video" forever too. Home/Progress read it at
// launch, long before the new workout's clip was written, so the newest workout never saw its own clip until the
// app was restarted. The log is tiny, so it is now read from storage on every lookup (parsed again only when its
// text changed), and only a thumbnail that was really made is remembered.
let cachedRaw: string | null | undefined;
let cachedLog: VideoLogEntry[] = [];
async function loadVideoLog(): Promise<VideoLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(VIDEO_LOG_KEY);
    if (raw !== cachedRaw) { cachedRaw = raw; cachedLog = raw ? JSON.parse(raw) : []; }
  } catch {
    cachedRaw = undefined; cachedLog = [];
  }
  return cachedLog;
}

/**
 * The video for a session/workout that finished at `sessionTs`. `prevSessionTs` is when the workout before it
 * finished (0 if unknown): videos logged before that belong to the earlier workout. Of the videos in the window,
 * the one closest to the end is used (the last set filmed), so the thumbnail and the replay are the same clip.
 */
export async function findSessionVideoUri(sessionTs: number, prevSessionTs: number = 0): Promise<string | null> {
  const log = await loadVideoLog();
  const lo = Math.max(prevSessionTs + MATCH_TOLERANCE_MS, sessionTs - MAX_WORKOUT_MS);
  const hi = sessionTs + MATCH_TOLERANCE_MS;
  // newest clip first; one whose file is gone (iOS empties the temp folder, a reinstall changes the app folder) is skipped
  // instead of being handed to the player, which showed a black screen
  const inWindow = log.filter((e) => e.ts > lo && e.ts <= hi).sort((x, y) => y.ts - x.ts);
  for (const entry of inWindow) {
    const ok = resolveVideoUri(entry.uri);
    if (ok) return ok;
  }
  return null;
}

// In-memory only (not persisted) — regenerated once per app run per
// session, which is cheap (a single decoded frame) and avoids the
// complexity of a disk cache that would need its own invalidation.
const thumbCache = new Map<string, string>();

export async function getSessionThumbnail(sessionTs: number, timeMs: number = 0, prevSessionTs: number = 0): Promise<string | null> {
  if (!VideoThumbnails) return null; // native module not in this build — see the require() guard above

  const cacheKey = `${sessionTs}@${timeMs}@${prevSessionTs}`;
  const cached = thumbCache.get(cacheKey);
  if (cached) return cached;

  const videoUri = await findSessionVideoUri(sessionTs, prevSessionTs);
  if (!videoUri) return null; // not remembered: the clip may be logged a moment later

  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: timeMs, quality: 0.5 });
    thumbCache.set(cacheKey, uri);
    return uri;
  } catch {
    return null;
  }
}
