/**
 * lib/trainTemplate.ts
 *
 * The Train design file keeps its markup, with the full images, in a <script type="__bundler/template"> tag as a JSON
 * string. The page cuts those images off at the ';' of "data:image/webp;base64," when it renders (see train.tsx), so the app
 * reads the images from the FILE it is loading and hands them to the page. Pure (no React / RN) so a test can run it on
 * the real file.
 */
const URI = '(data:image/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+)';

export interface TrainImages { flame: string | null; photos: string[] }

export function extractTrainImages(html: string): TrainImages | null {
  const i = html.indexOf('<script type="__bundler/template"');
  if (i < 0) return null;
  const s0 = html.indexOf('>', i) + 1, e0 = html.indexOf('</script>', s0);
  if (s0 <= 0 || e0 < 0) return null;
  let t = html.slice(s0, e0);
  try { const j = JSON.parse(t); if (typeof j === 'string') t = j; } catch { /* use the raw text */ }
  const flame = new RegExp('aria-label="Streak"[^>]*?url[(]' + URI + '[)]').exec(t);
  const photos: string[] = [];
  const re = /style="([^"]*rotate[(]6deg[)][^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) { const u = new RegExp('url[(]' + URI + '[)]').exec(m[1]); if (u) photos.push(u[1]); }
  if (!flame && !photos.length) return null;
  return { flame: flame ? flame[1] : null, photos };
}
