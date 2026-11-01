/**
 * lib/progressPhotos.ts
 *
 * Progress photos, stored ON THE DEVICE (the photo file copied into the app's
 * document folder + an index in AsyncStorage). Saving never depends on the
 * network or being signed in — the old flow uploaded straight to Supabase and
 * reported "Couldn't save photo" whenever that failed. The cloud upload is now
 * a best-effort extra (see app/progress-photo-screen.tsx), never the save.
 *
 * Each photo also gets a small 3:4 thumbnail (data: URI) made with Skia, so the
 * Progress tab's WebView can show it without loading a multi-megabyte photo.
 * If a thumbnail can't be made the photo is still saved (thumb: null).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

export type PhotoPose = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id:    string;
  ts:    number;        // when it was taken (epoch ms)
  pose:  PhotoPose;
  uri:   string;        // file:// path of the full-size copy in the document folder
  thumb: string | null; // small JPEG data: URI
}

export const PROGRESS_PHOTOS_KEY = 'formpal_progress_photos';
const THUMB_W = 240;
const THUMB_H = 320;

export async function listProgressPhotos(): Promise<ProgressPhoto[]> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_PHOTOS_KEY);
    const arr = raw ? (JSON.parse(raw) as ProgressPhoto[]) : [];
    return arr.filter(p => p && p.id && p.uri).sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

async function makeThumb(fileUri: string): Promise<string | null> {
  try {
    // required lazily so a build without Skia linked can still save photos
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Skia, ImageFormat } = require('@shopify/react-native-skia');
    const b64 = await new File(fileUri).base64();
    const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(b64));
    if (!img) return null;
    // cover-crop to 3:4
    const iw = img.width(), ih = img.height();
    const targetAspect = THUMB_W / THUMB_H;
    let sw = iw, sh = ih;
    if (iw / ih > targetAspect) sw = ih * targetAspect; else sh = iw / targetAspect;
    const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    const surface = Skia.Surface.MakeOffscreen(THUMB_W, THUMB_H);
    if (!surface) return null;
    surface.getCanvas().drawImageRect(img, Skia.XYWHRect(sx, sy, sw, sh), Skia.XYWHRect(0, 0, THUMB_W, THUMB_H), Skia.Paint());
    surface.flush();
    const out = surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 72);
    return out ? `data:image/jpeg;base64,${out}` : null;
  } catch {
    return null;
  }
}

/** Copies the picked/taken photo into app storage, indexes it, returns the saved entry. Throws only if the copy itself fails. */
export async function addProgressPhoto(srcUri: string, pose: PhotoPose = 'front'): Promise<ProgressPhoto> {
  const dir = new Directory(Paths.document, 'progress-photos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const ts = Date.now();
  const id = `${ts}-${Math.random().toString(36).slice(2, 7)}`;
  const dest = new File(dir, `${id}.jpg`);
  new File(srcUri).copy(dest);
  const photo: ProgressPhoto = { id, ts, pose, uri: dest.uri, thumb: await makeThumb(dest.uri) };
  const all = await listProgressPhotos();
  await AsyncStorage.setItem(PROGRESS_PHOTOS_KEY, JSON.stringify([photo, ...all]));
  return photo;
}
