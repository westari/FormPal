#!/usr/bin/env node
/**
 * scripts/test-session-video.js
 * ONE permanent store (lib/videoStore.ts) used by the thumbnails (lib/sessionVideo.ts), the recap video and the clean-up,
 * run with a fake file system, storage and thumbnail maker:
 *   - a clip still in the temporary folder is copied to the permanent folder and its picture is made once and saved
 *   - after an update moves the app folder (old absolute path dead) the workout STILL gets its picture and its video
 *   - a clip that is gone gives no video (null) without crashing, and a saved picture still shows when the clip is gone
 *   - the 30-day clean-up removes the clip AND its pictures from the permanent folder (nothing orphaned)
 *   - tapping a past workout twice opens ONE recap
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

const store = new Map();
const fsx = new Set();
let docRoot = '/containerA/Documents';
const thumbsMade = [];
const join = (...p) => p.map(x => (typeof x === 'string' ? x : x.uri)).join('/').replace(/\/+/g, '/');
class FileX { constructor(...p) { this.uri = join(...p); } get exists() { return fsx.has(this.uri); } copy(d) { fsx.add(d.uri); } delete() { fsx.delete(this.uri); } }
class DirX {
  constructor(...p) { this.uri = join(...p); }
  get exists() { return fsx.has(this.uri); }
  create() { fsx.add(this.uri); }
  list() { return [...fsx].filter(p => p.startsWith(this.uri + '/')).map(p => new FileX(p)); }
}
const Paths = { get document() { return { uri: docRoot }; } };
const prev = Module._load;
Module._load = function (r) {
  if (r === '@react-native-async-storage/async-storage') return { __esModule: true, default: { getItem: async (k) => (store.has(k) ? store.get(k) : null), setItem: async (k, v) => { store.set(k, v); } } };
  if (r === 'expo-file-system') return { File: FileX, Directory: DirX, Paths };
  if (r === 'expo-video-thumbnails') return { getThumbnailAsync: async (uri) => { if (!fsx.has(uri)) throw new Error('no such file'); thumbsMade.push(uri); const out = '/cache/th_' + thumbsMade.length + '.jpg'; fsx.add(out); return { uri: out }; } };
  return prev.apply(this, arguments);
};

(async () => {
  const fresh = () => { delete require.cache[require.resolve('../lib/sessionVideo.ts')]; delete require.cache[require.resolve('../lib/videoStore.ts')]; return { sv: require('../lib/sessionVideo.ts'), vs: require('../lib/videoStore.ts') }; };
  const T1 = 1_000_000, T2 = 5_000_000, T3 = 9_000_000;
  const tmpA = '/containerA/tmp/a.mp4', tmpB = '/containerA/tmp/b.mp4', tmpC = '/containerA/tmp/c.mp4';
  fsx.add(tmpA); fsx.add(tmpB);                                  // C is already gone
  store.set('formpal_video_log', JSON.stringify([{ uri: tmpA, ts: T1 - 2000 }, { uri: tmpB, ts: T2 - 2000 }, { uri: tmpC, ts: T3 - 2000 }]));

  let { sv, vs } = fresh();
  const f1 = await sv.getSessionThumbnail(T1, 1000, 0);
  check('a clip in the temporary folder gets a real frame, saved in the permanent folder', !!f1 && /containerA\/Documents\/session-videos\/thumb_a\.mp4_1000\.jpg$/.test(f1), f1);
  check('the clip itself was copied into the permanent folder (old clips that still exist are kept)', fsx.has(`${docRoot}/session-videos/a.mp4`) && fsx.has(`${docRoot}/session-videos/b.mp4`));
  check('a clip that was already gone gives no video and no picture, without crashing', (await sv.getSessionThumbnail(T3, 1000, T2)) === null && (await sv.findSessionVideoUri(T3, T2)) === null);

  // a new build is installed: the app folder moves, the temporary files are gone, the permanent ones moved with the data
  docRoot = '/containerB/Documents';
  [...fsx].filter(p => p.startsWith('/containerA/tmp')).forEach(p => fsx.delete(p));
  [...fsx].filter(p => p.startsWith('/containerA/Documents')).forEach(p => { fsx.delete(p); fsx.add(p.replace('/containerA/', '/containerB/')); });
  ({ sv, vs } = fresh());
  const made = thumbsMade.length;
  const f2 = await sv.getSessionThumbnail(T1, 1000, 0);
  check('after the app folder moved the workout STILL shows its saved picture (found by file name)', !!f2 && f2.startsWith('/containerB/Documents/session-videos/'), f2);
  check('...without decoding the video again', thumbsMade.length === made);
  const f3 = await sv.getSessionThumbnail(T2, 0, T1);
  check('...and a picture never saved is made from the permanent copy of the clip', !!f3 && thumbsMade[thumbsMade.length - 1] === '/containerB/Documents/session-videos/b.mp4', String(thumbsMade[thumbsMade.length - 1]));
  check('the recap video resolves to the permanent copy too (one store for both)', (await sv.findSessionVideoUri(T2, T1)) === '/containerB/Documents/session-videos/b.mp4');

  // the clip is deleted but its picture was saved: the card keeps the picture, the recap gets no video
  fsx.delete('/containerB/Documents/session-videos/a.mp4');
  ({ sv, vs } = fresh());
  check('when only the clip is gone the saved picture still shows, and the recap has no video (no black screen)', (await sv.getSessionThumbnail(T1, 1000, 0)) === '/containerB/Documents/session-videos/thumb_a.mp4_1000.jpg' && (await sv.findSessionVideoUri(T1, 0)) === null);

  // the 30-day clean-up removes the clip and every picture made from it
  fsx.add('/containerB/Documents/session-videos/a.mp4'); fsx.add('/containerB/Documents/session-videos/thumb_a.mp4_0.jpg');
  vs.removeClipFiles('/containerA/tmp/a.mp4');
  const left = [...fsx].filter(p => /session-videos\/(thumb_)?a\.mp4/.test(p));
  check('the clean-up removes the clip AND its pictures from the permanent folder (nothing orphaned)', left.length === 0, left.join());
  check('...and leaves other workouts\' files alone', fsx.has('/containerB/Documents/session-videos/b.mp4') && fsx.has('/containerB/Documents/session-videos/thumb_b.mp4_0.jpg'));

  // 17. tapping a past workout twice must open ONE recap
  const { openRecap } = require('../lib/openRecap.ts');
  const pushed = []; const router = { push: (h) => pushed.push(h) };
  const r1 = openRecap(router, 111), r2 = openRecap(router, 111), r3 = openRecap(router, 222);
  check('a second tap while the recap is opening is ignored (one screen, not two)', r1 === true && r2 === false && r3 === false && pushed.length === 1 && pushed[0].params.ts === '111', JSON.stringify(pushed));
  await new Promise(r => setTimeout(r, 1100));
  check('a later tap on another workout opens it', openRecap(router, 222) === true && pushed.length === 2 && pushed[1].params.ts === '222');
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
