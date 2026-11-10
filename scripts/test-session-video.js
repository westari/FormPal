#!/usr/bin/env node
/**
 * scripts/test-session-video.js
 * Past-workout thumbnails (lib/sessionVideo.ts), with a fake file system, storage and thumbnail maker:
 *   - a clip still in the temporary folder is copied into the permanent folder, logged by a RELATIVE path, and its
 *     picture is made once and saved (so the card shows a real frame, not the muscle icon)
 *   - after the app's folder "moves" (new build installed: the old absolute path is dead) the workout still gets its
 *     picture, from the permanent copy / saved picture
 *   - a clip that is already gone gives null (the icon) without crashing; a clip logged by the camera in between is not lost
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

const store = new Map();
const fsx = new Set();            // paths that exist
let docRoot = '/containerA/Documents';
const thumbsMade = [];
const join = (...p) => p.map(x => (typeof x === 'string' ? x : x.uri)).join('/').replace(/\/+/g, '/');
class FileX { constructor(...p) { this.uri = join(...p); } get exists() { return fsx.has(this.uri); } copy(dest) { fsx.add(dest.uri); } }
class DirX { constructor(...p) { this.uri = join(...p); } get exists() { return fsx.has(this.uri); } create() { fsx.add(this.uri); } }
const Paths = { get document() { return { uri: docRoot }; } };
const prev = Module._load;
Module._load = function (r) {
  if (r === '@react-native-async-storage/async-storage') return { __esModule: true, default: { getItem: async (k) => (store.has(k) ? store.get(k) : null), setItem: async (k, v) => { store.set(k, v); } } };
  if (r === 'expo-file-system') return { File: FileX, Directory: DirX, Paths };
  if (r === 'expo-video-thumbnails') return { getThumbnailAsync: async (uri, o) => { if (!fsx.has(uri)) throw new Error('no such file'); thumbsMade.push(uri); const out = '/cache/th_' + thumbsMade.length + '.jpg'; fsx.add(out); return { uri: out }; } };
  return prev.apply(this, arguments);
};

(async () => {
  const sv = () => { delete require.cache[require.resolve('../lib/sessionVideo.ts')]; return require('../lib/sessionVideo.ts'); };
  const T1 = 1_000_000, T2 = 5_000_000, T3 = 9_000_000;
  const tmpA = '/containerA/tmp/a.mp4', tmpB = '/containerA/tmp/b.mp4', tmpC = '/containerA/tmp/c.mp4';
  fsx.add(tmpA); fsx.add(tmpB);                                  // C is already gone
  store.set('formpal_video_log', JSON.stringify([{ uri: tmpA, ts: T1 - 2000 }, { uri: tmpB, ts: T2 - 2000 }, { uri: tmpC, ts: T3 - 2000 }]));

  let m = sv();
  const f1 = await m.getSessionThumbnail(T1, 1000, 0);
  const log1 = JSON.parse(store.get('formpal_video_log'));
  check('a clip in the temporary folder gets a real frame', !!f1 && /formpal_videos\/\d+_1000\.jpg$/.test(f1), f1);
  check('the clip was copied into the permanent folder and logged by a relative path', log1[0].rel === `formpal_videos/${T1 - 2000}.mp4` && fsx.has(`${docRoot}/${log1[0].rel}`), JSON.stringify(log1[0]));
  check('the picture is saved in the permanent folder too', !!log1[0].thumbs && /^formpal_videos\//.test(log1[0].thumbs['1000']) && fsx.has(`${docRoot}/${log1[0].thumbs['1000']}`));
  check('the other clip that still existed was kept as well', !!log1[1].rel);
  check('a clip that was already gone gives null (the muscle icon) and does not crash', (await m.getSessionThumbnail(T3, 1000, T2)) === null);

  // a new build is installed: the app's folder moves and the old temporary files are gone
  docRoot = '/containerB/Documents';
  [...fsx].filter(p => p.startsWith('/containerA/tmp')).forEach(p => fsx.delete(p));
  // (the permanent files moved with the app's data)
  [...fsx].filter(p => p.startsWith('/containerA/Documents')).forEach(p => { fsx.delete(p); fsx.add(p.replace('/containerA/', '/containerB/')); });
  m = sv();                                                       // a fresh app run: nothing in memory
  const before = thumbsMade.length;
  const f2 = await m.getSessionThumbnail(T1, 1000, 0);
  check('after an update moved the app folder the workout STILL shows its frame (saved picture, resolved in the new folder)', !!f2 && f2.startsWith('/containerB/Documents/formpal_videos/'), f2);
  check('...without decoding the video again', thumbsMade.length === before);
  const f3 = await m.getSessionThumbnail(T2, 0, T1);              // a picture time that was never saved: made from the kept clip
  check('...and a picture that was never saved is made from the permanent copy of the clip', !!f3 && /containerB/.test(f3) && thumbsMade[thumbsMade.length - 1].startsWith('/containerB/Documents/formpal_videos/'), String(f3));
  check('findSessionVideoUri (the replay) uses the permanent copy', (await m.findSessionVideoUri(T2, T1)) === `/containerB/Documents/formpal_videos/${T2 - 2000}.mp4`);

  // the camera logs a new clip while the keeper runs: it must not be lost
  const log = JSON.parse(store.get('formpal_video_log')); log.push({ uri: '/containerB/tmp/new.mp4', ts: T3 + 100000 }); store.set('formpal_video_log', JSON.stringify(log));
  fsx.add('/containerB/tmp/new.mp4');
  await m.keepVideosSafe();
  const log3 = JSON.parse(store.get('formpal_video_log'));
  check('a clip logged later is kept too and nothing is lost from the log', log3.length === 4 && !!log3[3].rel, JSON.stringify(log3.map(e => !!e.rel)));
  // 17. tapping a past workout twice must open ONE recap
  const { openRecap } = require('../lib/openRecap.ts');
  const pushed = []; const router = { push: (h) => pushed.push(h) };
  const r1 = openRecap(router, 111), r2 = openRecap(router, 111), r3 = openRecap(router, 222);
  check('17. a second tap while the recap is opening is ignored (one screen, not two)', r1 === true && r2 === false && r3 === false && pushed.length === 1 && pushed[0].params.ts === '111', JSON.stringify(pushed));
  await new Promise(r => setTimeout(r, 1100));
  check('17. a later tap on another workout opens it', openRecap(router, 222) === true && pushed.length === 2 && pushed[1].params.ts === '222');
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
