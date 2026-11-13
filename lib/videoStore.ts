/**
 * lib/videoStore.ts
 *
 * Recorded set videos used to be left in the phone's temporary folder, and the saved log remembered that exact path. iOS
 * empties the temporary folder, and a reinstall changes the app's folder name, so the replay of an older workout
 * ("View recap" from Train, Home, Progress) pointed at a file that was gone and showed a black screen.
 *
 *   persistVideo(uri)      copies a finished recording into the app's permanent document folder and returns that path
 *   resolveVideoUri(uri)   the path to play right now: the file itself if it exists, else the same file name in the
 *                          permanent folder (survives a changed app folder name), else null (really gone: show no video)
 */
import { Directory, File, Paths } from 'expo-file-system';

const DIR_NAME = 'session-videos';
const baseName = (uri: string) => (uri.split('?')[0].split('/').pop() || '').trim();

function videosDir(): Directory | null {
  try {
    const dir = new Directory(Paths.document, DIR_NAME);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    return dir;
  } catch { return null; }
}

/** Copy a finished recording to permanent storage. Returns the permanent path, or the original path if the copy failed. */
export function persistVideo(uri: string): string {
  try {
    const dir = videosDir();
    const name = baseName(uri);
    if (!dir || !name) return uri;
    const dest = new File(dir, name);
    if (dest.exists) return dest.uri;
    new File(uri).copy(dest);
    return dest.uri;
  } catch { return uri; }
}

export function fileExists(uri: string): boolean {
  try { return new File(uri).exists; } catch { return false; }
}

/** The playable path for a remembered video, or null when the file is gone. */
export function resolveVideoUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (fileExists(uri)) return uri;
  try {
    const name = baseName(uri);
    const dir = videosDir();
    if (dir && name) {
      const f = new File(dir, name);
      if (f.exists) return f.uri;
    }
  } catch { /* fall through */ }
  return null;
}

// ── thumbnails live in the same permanent folder, named after their clip: thumb_<clip name>_<ms>.jpg ──
const thumbName = (clipUri: string, timeMs: number) => `thumb_${baseName(clipUri)}_${timeMs}.jpg`;

/** A thumbnail picture saved earlier for this clip and time (it outlives the clip file itself), or null. */
export function savedThumb(clipUri: string, timeMs: number): string | null {
  try {
    const dir = videosDir();
    if (!dir || !baseName(clipUri)) return null;
    const f = new File(dir, thumbName(clipUri, timeMs));
    return f.exists ? f.uri : null;
  } catch { return null; }
}

/** Keep a freshly made thumbnail in the permanent folder. Returns the permanent path (or the given one if the copy failed). */
export function persistThumb(clipUri: string, timeMs: number, thumbUri: string): string {
  try {
    const dir = videosDir();
    if (!dir || !baseName(clipUri)) return thumbUri;
    const dest = new File(dir, thumbName(clipUri, timeMs));
    if (!dest.exists) new File(thumbUri).copy(dest);
    return dest.uri;
  } catch { return thumbUri; }
}

/** True when this path is already inside the permanent folder. */
export function isPermanent(uri: string): boolean {
  return uri.indexOf('/' + DIR_NAME + '/') >= 0;
}

/**
 * The 30-day clean-up for ONE clip: its original file (if still there), its permanent copy and every thumbnail made from
 * it, so nothing is left behind in the permanent folder.
 */
export function removeClipFiles(uri: string): void {
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* already gone */ }
  try {
    const dir = videosDir();
    const name = baseName(uri);
    if (!dir || !name) return;
    for (const item of dir.list()) {
      const n = baseName(item.uri);
      if (n === name || n.indexOf('thumb_' + name + '_') === 0) { try { item.delete(); } catch { /* ignore */ } }
    }
  } catch { /* ignore */ }
}

/**
 * RECOVERY for a recording the camera did not hand back. The camera writes each clip to the app's temp folder as
 * athlt_<seconds>.mov; when the native stop call returns "no video" (the recording ended early with an error, or an older
 * build lost it), the file is often still there. listTempClips lists every such clip that has content; recoverRecentClip returns
 * the newest one made at or after `sinceMs`, else null. Never throws.
 */
export function listTempClips(): { uri: string; bytes: number; t: number }[] {
  const out: { uri: string; bytes: number; t: number }[] = [];
  try {
    const tmp = new Directory(Paths.cache.parentDirectory.parentDirectory, 'tmp');
    if (!tmp.exists) return out;
    for (const item of tmp.list()) {
      if (!(item instanceof File)) continue;
      if (!/^athlt_[0-9]+[.]mov$/.test(baseName(item.uri))) continue;
      let t = 0;
      try { const m = item.info().modificationTime ?? 0; t = m < 1e11 ? m * 1000 : m; } catch { t = 0; }
      const bytes = item.size ?? 0;
      if (bytes > 0) out.push({ uri: item.uri, bytes, t });
    }
  } catch { /* none */ }
  return out;
}

export function recoverRecentClip(sinceMs: number): { uri: string; bytes: number } | null {
  let best: { uri: string; bytes: number; t: number } | null = null;
  for (const c of listTempClips()) if (c.t >= sinceMs && (!best || c.t > best.t)) best = c;
  return best ? { uri: best.uri, bytes: best.bytes } : null;
}
