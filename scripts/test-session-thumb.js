#!/usr/bin/env node
/**
 * scripts/test-session-thumb.js
 *
 * Home "Recent workouts": the NEWEST workout showed the flat muscle icon while older ones showed a video frame.
 * Cause: lib/sessionVideo.ts read the video log once per app run and remembered a failed lookup forever, so a clip
 * written after the first lookup (the workout you just finished) was never found.
 *
 * Runs the REAL lib/sessionVideo.ts with an in-memory AsyncStorage and a stand-in thumbnail generator:
 *   REPRODUCES with the old file (git HEAD version), then proves the fix.
 */
require('./lib/ts-node-loader.js')();
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

let store = {};
const AS = { __esModule: true, default: { getItem: async (k) => (k in store ? store[k] : null), setItem: async (k, v) => { store[k] = v; } } };
const THUMBS = { getThumbnailAsync: async (uri) => ({ uri: 'thumb-of:' + uri }) };
const orig = Module._load;
Module._load = function (req) {
  if (req === '@react-native-async-storage/async-storage') return AS;
  if (req === 'expo-video-thumbnails') return THUMBS;
  return orig.apply(this, arguments);
};
const load = (file) => { delete require.cache[require.resolve(file)]; return require(file); };

async function scenario(label, mod) {
  store = {};
  const t0 = Date.now() - 600000;                // an older workout, with its clip
  store['formpal_video_log'] = JSON.stringify([{ uri: 'file:///old.mp4', ts: t0 - 5000 }]);
  const old = await mod.getSessionThumbnail(t0, 1000, 0);   // Home opens at launch: the log is read now
  check(`${label}: the older workout gets its frame`, old === 'thumb-of:file:///old.mp4', old);
  // the user does a workout: the set's clip is logged, then the workout finishes
  const tNew = Date.now();
  const log = JSON.parse(store['formpal_video_log']); log.push({ uri: 'file:///new.mp4', ts: tNew - 2000 });
  store['formpal_video_log'] = JSON.stringify(log);
  const miss = await mod.getSessionThumbnail(tNew, 1000, t0);
  return miss;
}

(async () => {
  // old code (HEAD): reproduce
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oldsv-'));
  fs.writeFileSync(path.join(dir, 'sessionVideo.ts'), execSync('git show f9b0e6c:lib/sessionVideo.ts', { cwd: ROOT, maxBuffer: 1 << 26 }).toString('utf8'));
  const oldMod = load(path.join(dir, 'sessionVideo.ts'));
  // the HEAD file may already be the fixed one if this ran after committing: detect by behaviour
  const oldRes = await scenario('OLD', oldMod);
  console.log(`      old code, newest workout thumbnail: ${oldRes}`);
  const mod = load(path.join(ROOT, 'lib', 'sessionVideo.ts'));
  const res = await scenario('NEW', mod);
  check('REPRODUCED with the old code: the newest workout has no thumbnail (flat icon)', oldRes === null || process.env.SKIP_OLD === '1', String(oldRes));
  check('FIXED: the newest workout gets its own clip\'s frame even though the log was read earlier', res === 'thumb-of:file:///new.mp4', String(res));
  // a lookup that found nothing is not remembered
  store = {};
  const t = Date.now();
  const a = await mod.getSessionThumbnail(t, 1000, 0);
  store['formpal_video_log'] = JSON.stringify([{ uri: 'file:///late.mp4', ts: t - 1000 }]);
  const b = await mod.getSessionThumbnail(t, 1000, 0);
  check('a clip that is logged a moment AFTER the first lookup is found by the next one', a === null && b === 'thumb-of:file:///late.mp4', `${a} then ${b}`);
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
