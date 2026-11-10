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
