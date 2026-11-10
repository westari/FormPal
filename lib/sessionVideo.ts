/**
 * lib/sessionVideo.ts
 *
 * Maps a session's timestamp back to the video clip recorded for it (logged
 * separately in "formpal_video_log" by app/formcheck.tsx's logSessionVideo,
 * keyed by the same Date.now() a session's own ts comes from) and generates
 * a small thumbnail frame from that clip, used by the session-list cards
 * (home tab, progress tab) so they show a real frame from the user's own
 * recording instead of a generic icon.
 *
 * VIDEO_LOG_KEY must stay byte-for-byte the same string as formcheck.tsx's
 * own VIDEO_LOG_KEY — this reads data that file already writes, not a new
 * store.
 *
 * WHY OLD WORKOUTS SHOWED THE FLAT ICON: the camera writes each clip into the app's temporary folder and the log
 * kept the full path. Two things kill that path later: iOS empties the temporary folder, and every new build
 * installed over the app moves the app's folder (the long path has a new random id in it). The clip is then
 * "missing", no frame can be made, and the card falls back to the muscle icon. So every clip that still exists is
 * now COPIED into the app's permanent Documents folder (formpal_videos), logged by a path relative to Documents (which
 * survives updates), and its thumbnail picture is saved there too and reused. Clips that were already gone before this
 * ran cannot be brought back.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

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
const KEEP_DIR = 'formpal_videos';
// A solo check's own ts and its videoUri log entry's ts are stamped from two
// separate Date.now() calls a few JS ticks apart — never exactly equal. 5s
// covers that gap. A WORKOUT is different: each set's video is logged when
// that set is stopped, but the workout's ts is when the whole workout
// finished, minutes later. So a workout owns the videos logged after the
// previous workout ended and up to its own end (never more than 3 hours back).
const MATCH_TOLERANCE_MS = 5000;
const MAX_WORKOUT_MS = 3 * 60 * 60 * 1000;

// uri = where the camera wrote it; rel = the permanent copy, relative to Documents; thumbs = saved pictures by time
type VideoLogEntry = { uri: string; ts: number; rel?: string; thumbs?: Record<string, string> };

const log = (...a: unknown[]) => { if (__DEV__) console.log('[THUMB]', ...a); };

function keepDir(): Directory | null {
  try {
    const d = new Directory(Paths.document, KEEP_DIR);
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    return d;
  } catch (e) { log('cannot make the videos folder', String(e)); return null; }
}
function fileOf(entry: VideoLogEntry): File | null {
  try {
    if (entry.rel) { const f = new File(Paths.document, entry.rel); if (f.exists) return f; }
    if (entry.uri) { const f = new File(entry.uri); if (f.exists) return f; }
  } catch {}
  return null;
}

// The log is tiny, so it is read from storage on every lookup (parsed again only when its text changed): the
// newest workout's clip is written a moment after the app has already read the log once.
let cachedRaw: string | null | undefined;
let cachedLog: VideoLogEntry[] = [];
async function readRaw(): Promise<VideoLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(VIDEO_LOG_KEY);
    if (raw !== cachedRaw) { cachedRaw = raw; cachedLog = raw ? JSON.parse(raw) : []; }
  } catch {
    cachedRaw = undefined; cachedLog = [];
  }
  return cachedLog;
}

// Write changed entries back, merging into a FRESH read so a clip the camera logged meanwhile is never lost.
async function saveChanges(changed: VideoLogEntry[]): Promise<void> {
  if (!changed.length) return;
  try {
    const raw = await AsyncStorage.getItem(VIDEO_LOG_KEY);
    const fresh: VideoLogEntry[] = raw ? JSON.parse(raw) : [];
    for (const c of changed) {
      const hit = fresh.find(e => e.ts === c.ts && e.uri === c.uri);
      if (hit) { if (c.rel) hit.rel = c.rel; if (c.thumbs) hit.thumbs = { ...(hit.thumbs || {}), ...c.thumbs }; }
    }
    const next = JSON.stringify(fresh);
    await AsyncStorage.setItem(VIDEO_LOG_KEY, next);
    cachedRaw = next; cachedLog = fresh;
  } catch (e) { log('could not save the log', String(e)); }
}

let moving: Promise<void> | null = null;
/** Copy every clip that still exists into the permanent folder (once each). */
export function keepVideosSafe(): Promise<void> {
  if (moving) return moving;
  moving = (async () => {
    const entries = await readRaw();
    const todo = entries.filter(e => !e.rel);
    if (!todo.length) return;
    const dir = keepDir();
    if (!dir) return;
    const changed: VideoLogEntry[] = [];
    for (const e of todo) {
      try {
        const src = new File(e.uri);
        if (!src.exists) { log('clip already gone, cannot keep it', e.ts, e.uri.slice(-40)); continue; }
        const name = `${e.ts}.mp4`;
        const dest = new File(dir, name);
        if (!dest.exists) src.copy(dest);
        changed.push({ ...e, rel: `${KEEP_DIR}/${name}` });
        log('kept a clip', e.ts, name);
      } catch (err) { log('could not copy a clip', e.ts, String(err)); }
    }
    await saveChanges(changed);
  })().finally(() => { moving = null; });
  return moving;
}

async function findEntry(sessionTs: number, prevSessionTs: number): Promise<VideoLogEntry | null> {
  await keepVideosSafe();
  const entries = await readRaw();
  const lo = Math.max(prevSessionTs + MATCH_TOLERANCE_MS, sessionTs - MAX_WORKOUT_MS);
  const hi = sessionTs + MATCH_TOLERANCE_MS;
  let best: VideoLogEntry | null = null;
  for (const entry of entries) {
    if (entry.ts > lo && entry.ts <= hi && (!best || entry.ts > best.ts)) best = entry;
  }
  return best;
}

/**
 * The video for a session/workout that finished at `sessionTs`. `prevSessionTs` is when the workout before it
 * finished (0 if unknown): videos logged before that belong to the earlier workout. Of the videos in the window,
 * the one closest to the end is used (the last set filmed), so the thumbnail and the replay are the same clip.
 */
export async function findSessionVideoUri(sessionTs: number, prevSessionTs: number = 0): Promise<string | null> {
  const entry = await findEntry(sessionTs, prevSessionTs);
  if (!entry) return null;
  const f = fileOf(entry);
  return f ? f.uri : entry.uri;
}

// In memory too, so one app run never decodes the same frame twice.
const thumbCache = new Map<string, string>();

export async function getSessionThumbnail(sessionTs: number, timeMs: number = 0, prevSessionTs: number = 0): Promise<string | null> {
  if (!VideoThumbnails) { log('no thumbnail module in this build'); return null; } // see the require() guard above

  const cacheKey = `${sessionTs}@${timeMs}@${prevSessionTs}`;
  const cached = thumbCache.get(cacheKey);
  if (cached) return cached;

  const entry = await findEntry(sessionTs, prevSessionTs);
  if (!entry) { log('no clip logged for workout', sessionTs); return null; } // not remembered: the clip may be logged a moment later

  // a picture saved earlier
  const saved = entry.thumbs && entry.thumbs[String(timeMs)];
  if (saved) {
    try { const f = new File(Paths.document, saved); if (f.exists) { thumbCache.set(cacheKey, f.uri); return f.uri; } } catch {}
  }

  const video = fileOf(entry);
  if (!video) { log('clip file is gone for workout', sessionTs, entry.rel || entry.uri.slice(-40)); return null; }
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(video.uri, { time: timeMs, quality: 0.5 });
    // keep the picture too, so it survives even if the clip is cleaned up later
    let out = uri;
    const dir = keepDir();
    if (dir) {
      try {
        const name = `${entry.ts}_${timeMs}.jpg`;
        const dest = new File(dir, name);
        if (!dest.exists) new File(uri).copy(dest);
        out = dest.uri;
        await saveChanges([{ ...entry, thumbs: { [String(timeMs)]: `${KEEP_DIR}/${name}` } }]);
      } catch (e) { log('could not keep the picture', String(e)); }
    }
    log('made a picture for workout', sessionTs, 'at', timeMs);
    thumbCache.set(cacheKey, out);
    return out;
  } catch (e) {
    log('picture failed for workout', sessionTs, String(e));
    return null;
  }
}
