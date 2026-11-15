/**
 * lib/sessionVideo.ts
 *
 * Maps a session's timestamp back to the video clip recorded for it (logged separately in "formpal_video_log" by
 * app/formcheck.tsx's logSessionVideo, keyed by the same Date.now() a session's own ts comes from) and makes a small
 * thumbnail frame from that clip, used by the session-list cards (Home, Progress) so they show a real frame from the
 * user's own recording instead of the muscle icon.
 *
 * ONE permanent store, lib/videoStore.ts (folder "session-videos" in Documents):
 *   - formcheck.tsx copies each clip there the moment it is logged (persistVideo)
 *   - clips logged BEFORE that existed and are still in the temporary folder are copied there the first time this runs
 *   - a lookup finds a clip by the file name, so a changed app folder (reinstall) does not matter, and a clip whose file is
 *     really gone gives "no video" (never a path the player turns black on)
 *   - every thumbnail made is saved in the same folder (thumb_<clip>_<ms>.jpg), so the card keeps its picture even when
 *     the clip is gone. The 30-day clean-up (app/_layout.tsx) removes a clip and its pictures together.
 *
 * VIDEO_LOG_KEY must stay byte-for-byte the same string as formcheck.tsx's own VIDEO_LOG_KEY.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveVideoUri, persistVideo, persistThumb, savedThumb, isPermanent, removeClipFiles, listTempClips } from './videoStore';

// require() inside try/catch on purpose: expo-video-thumbnails reads its native module at IMPORT time, which throws
// synchronously on a build that has not been rebuilt with it linked in, and a plain top-level import would crash the app at
// launch. Every function below degrades to "no thumbnail" instead of throwing.
let VideoThumbnails: typeof import('expo-video-thumbnails') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  VideoThumbnails = require('expo-video-thumbnails');
} catch {
  VideoThumbnails = null;
}

const VIDEO_LOG_KEY = 'formpal_video_log';
// A solo check's own ts and its log entry's ts come from two Date.now() calls a few JS ticks apart. A WORKOUT owns the
// videos logged after the previous workout ended and up to its own end (never more than 3 hours back).
const MATCH_TOLERANCE_MS = 5000;
const MAX_WORKOUT_MS = 3 * 60 * 60 * 1000;
const ADOPT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type VideoLogEntry = { uri: string; ts: number };

const log = (...a: unknown[]) => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[THUMB]', ...a); };

// The log is tiny, so it is read from storage on every lookup (parsed again only when its text changed): the newest
// workout's clip is written a moment after the app has already read the log once.
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

const nameOf = (uri: string) => (uri.split('?')[0].split('/').pop() || '').trim();

/**
 * A clip the camera recorded but the app never logged (the native stop returned "no video", or the app was killed before the log was
 * written) still sits in the temp folder as athlt_<seconds>.mov. Adopt each one: copy it to the permanent folder and add it to the
 * video log with the time it was finished, so the workout it belongs to finds it. Never throws; logs [VIDEO].
 */
async function adoptOrphanClips(entries: VideoLogEntry[]): Promise<void> {
  try {
    const known = new Set(entries.map(e => nameOf(e.uri)));
    // Only clips from the last 30 days: the 30-day clean-up (app/_layout.tsx) would delete older ones at once, and the 2026-11-13 log shows the
    // first version copying 19 clips from July to October (about 240 MB) into the permanent folder for nothing.
    const horizon = Date.now() - ADOPT_MAX_AGE_MS;
    const orphans = listTempClips().filter(c => !known.has(nameOf(c.uri)) && c.t > horizon);
    if (!orphans.length) return;
    const next = entries.slice();
    for (const c of orphans) {
      const kept = persistVideo(c.uri);
      next.push({ uri: kept, ts: c.t });
      console.log('[VIDEO] adopted a clip the camera made but the app never logged: ' + nameOf(c.uri) + ' (' + c.bytes + ' bytes, finished ' + new Date(c.t).toISOString() + ')');
    }
    await AsyncStorage.setItem(VIDEO_LOG_KEY, JSON.stringify(next));
    cachedRaw = undefined;
    entries.splice(0, entries.length, ...next);
  } catch (e) { console.log("[VIDEO] adopt failed: " + String(e)); }
}

let keeping: Promise<void> | null = null;
/** Copy every logged clip that still sits outside the permanent folder into it (once; clips already kept are skipped). */
export function keepVideosSafe(): Promise<void> {
  if (keeping) return keeping;
  keeping = (async () => {
    const entries = await loadVideoLog();
    await adoptOrphanClips(entries);
    for (const e of entries) {
      try {
        if (isPermanent(e.uri)) continue;
        const live = resolveVideoUri(e.uri);          // the file itself, or already its copy by name
        if (!live) { log('clip already gone, cannot keep it', e.ts); continue; }
        if (!isPermanent(live)) { persistVideo(live); log('kept a clip', e.ts); }
      } catch (err) { log('could not keep a clip', e.ts, String(err)); }
    }
  })().finally(() => { keeping = null; });
  return keeping;
}

/** Remove the clips (and their pictures) of ONE workout and forget them in the video log. Used by "Delete workout". */
export async function removeSessionVideos(sessionTs: number, prevSessionTs: number = 0): Promise<number> {
  const mine = await entriesFor(sessionTs, prevSessionTs);
  if (!mine.length) return 0;
  for (const e of mine) removeClipFiles(e.uri);
  const gone = new Set(mine.map(e => e.ts + '|' + e.uri));
  try {
    const all = await loadVideoLog();
    await AsyncStorage.setItem(VIDEO_LOG_KEY, JSON.stringify(all.filter(e => !gone.has(e.ts + '|' + e.uri))));
  } catch { /* the files are gone either way */ }
  cachedRaw = undefined;
  for (const k of [...thumbCache.keys()]) if (k.startsWith(sessionTs + '@')) thumbCache.delete(k);
  return mine.length;
}

/** The clips that belong to this workout, newest first. */
async function entriesFor(sessionTs: number, prevSessionTs: number): Promise<VideoLogEntry[]> {
  const entries = await loadVideoLog();
  const lo = Math.max(prevSessionTs + MATCH_TOLERANCE_MS, sessionTs - MAX_WORKOUT_MS);
  const hi = sessionTs + MATCH_TOLERANCE_MS;
  return entries.filter(e => e.ts > lo && e.ts <= hi).sort((x, y) => y.ts - x.ts);
}

/**
 * The video for a session/workout that finished at `sessionTs`. `prevSessionTs` is when the workout before it
 * finished (0 if unknown): videos logged before that belong to the earlier workout. The newest clip whose file still
 * exists is used (the last set filmed), so the thumbnail and the replay are the same clip; null when every one is gone.
 */
export async function findSessionVideoUri(sessionTs: number, prevSessionTs: number = 0): Promise<string | null> {
  await keepVideosSafe();
  for (const entry of await entriesFor(sessionTs, prevSessionTs)) {
    const ok = resolveVideoUri(entry.uri);
    if (ok) return ok;
  }
  return null;
}

// In memory too, so one app run never decodes the same frame twice. Only pictures that were really made are kept.
const thumbCache = new Map<string, string>();

export async function getSessionThumbnail(sessionTs: number, timeMs: number = 0, prevSessionTs: number = 0): Promise<string | null> {
  const cacheKey = `${sessionTs}@${timeMs}@${prevSessionTs}`;
  const cached = thumbCache.get(cacheKey);
  if (cached) return cached;

  await keepVideosSafe();
  const entries = await entriesFor(sessionTs, prevSessionTs);
  if (!entries.length) {
    // say how close the nearest logged clip is, so a log shows whether the clip was never logged or just filed outside this workout's window
    const all = await loadVideoLog();
    const near = all.reduce<VideoLogEntry | null>((best, e) => (!best || Math.abs(e.ts - sessionTs) < Math.abs(best.ts - sessionTs) ? e : best), null);
    log('no clip logged for workout', sessionTs, near ? `| nearest logged clip ${near.ts} is ${Math.round((near.ts - sessionTs) / 1000)}s from it (window: ${Math.round(prevSessionTs / 1000)}s..+5s)` : '| the video log is empty');
    return null;
  } // not remembered: the clip may be logged a moment later

  for (const entry of entries) {
    // a picture saved earlier (works even when the clip file is gone)
    const saved = savedThumb(entry.uri, timeMs);
    if (saved) { thumbCache.set(cacheKey, saved); return saved; }
    const video = resolveVideoUri(entry.uri);
    if (!video) { log('clip file is gone for workout', sessionTs); continue; }
    if (!VideoThumbnails) { log('no thumbnail module in this build'); return null; }
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(video, { time: timeMs, quality: 0.5 });
      const kept = persistThumb(entry.uri, timeMs, uri);
      log('made a picture for workout', sessionTs, 'at', timeMs);
      thumbCache.set(cacheKey, kept);
      return kept;
    } catch (e) {
      log('picture failed for workout', sessionTs, String(e));
    }
  }
  return null;
}
