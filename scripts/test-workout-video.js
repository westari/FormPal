#!/usr/bin/env node
/**
 * scripts/test-workout-video.js
 *
 * Workout complete lost its video (grey "Drop replay frame", no "View rep feedback", dark All sets tiles). All three come from ONE
 * thing: the set ended with no video path (hasVideo false). This test makes that hard to miss and hard to repeat:
 *   1. rescue: when the camera hands back NO clip, the stop code looks for the clip file itself (recoverRecentClip) and logs [VIDEO]
 *   2. a clip that exists flows end to end: stop -> navParams.videoUri -> recap (hasVideo true) -> rep feedback button, All sets video tile
 *   3. with no video the page never shows the design's "Drop replay frame" placeholder (it says so in plain words)
 *   4. the native side (next build) hands back a finished clip even when the recording ended early with an error
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

(async () => {
  // 1. recoverRecentClip with a fake file system
  {
    const now = Date.now();
    const meta = {};
    class File { constructor(u, n) { this.uri = n ? u.uri + '/' + n : (typeof u === 'string' ? u : u.uri); } get size() { return (meta[this.uri] || [0, 0])[1]; } info() { return { modificationTime: (meta[this.uri] || [0, 0])[0] }; } }
    const names = ['athlt_1.mov', 'athlt_2.mov', 'athlt_3.mov', 'other.txt', 'athlt_4.mov'];
    class Directory {
      constructor(p, n) { this.uri = (typeof p === 'string' ? p : p.uri) + (n ? '/' + n : ''); }
      get exists() { return this.uri.endsWith('/tmp'); }
      get parentDirectory() { return new Directory(this.uri.split('/').slice(0, -1).join('/')); }
      list() { return names.map((n) => new File(this.uri + '/' + n)); }
    }
    const cache = new Directory('file:///c/Library/Caches');
    const tmpUri = 'file:///c/tmp';
    const vals = { 'athlt_1.mov': [now - 600000, 5000], 'athlt_2.mov': [now - 30000, 9000], 'athlt_3.mov': [now - 10000, 0], 'other.txt': [now - 1000, 10], 'athlt_4.mov': [now - 4000, 7000] };
    for (const [n, v] of Object.entries(vals)) meta[tmpUri + '/' + n] = v;
    const orig = Module._load;
    Module._load = function (req) {
      if (req === 'expo-file-system') return { File, Directory, Paths: { cache, document: new Directory('file:///c/Documents') } };
      return orig.apply(this, arguments);
    };
    delete require.cache[require.resolve('../lib/videoStore.ts')];
    const vs = require('../lib/videoStore.ts');
    const got = vs.recoverRecentClip(now - 60000);
    check('rescue: picks the newest athlt clip made during the set that has content (not the empty one, not an old one, not other files)', !!got && got.uri.endsWith('athlt_4.mov') && got.bytes === 7000, JSON.stringify(got));
    check('rescue: nothing made during the set -> null (never a fake video)', vs.recoverRecentClip(now) === null);
    Module._load = orig;
  }

  // 2. the stop code
  const fc = read('app/formcheck.tsx');
  const stop = fc.slice(fc.indexOf('const handleStop = useCallback'), fc.indexOf('const handleReviewDone'));
  check('stop: logs what the camera handed back ([VIDEO] clip / NO clip) and how long it tracked', stop.includes("console.log('[VIDEO] stop: camera returned '"));
  check('stop: with no clip from the camera it looks for the file itself, and says what it found', stop.includes('recoverRecentClip(startTimestamp.current - 5000)') && stop.includes('[VIDEO] rescued the clip') && stop.includes('[VIDEO] no clip file found'));
  check('stop: the rescue happens BEFORE the clip is logged and handed to the recap (hasVideo is decided after it)', stop.indexOf('recoverRecentClip') < stop.indexOf('logSessionVideo(final.videoUri)') && stop.indexOf('recoverRecentClip') < stop.indexOf('hasVideo: !!navParams.videoUri'));
  check('stop: the clip is copied into the permanent documents folder the moment it exists', fc.includes('persistVideo(uri)'));
  check('stop: the clip travels to the recap as videoUri (not dropped)', /videoUri: final\.videoUri \?\? ''/.test(stop));

  // 3. the page, with and without a video
  const recap = require('../lib/recapInject.ts');
  const WARM = require('../components/WarmSurfaces.tsx');
  const browser = await chromium.launch();
  async function openRecap(hasVideo) {
    const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
    const posts = [];
    await page.exposeFunction('__post', (d) => { try { posts.push(JSON.parse(d)); } catch {} });
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await page.addInitScript(WARM.BASE_JS.recap);
    await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'workoutrecap.html')).href, { waitUntil: 'commit' });
    const t0 = Date.now(); while (Date.now() - t0 < 9000 && !posts.some((m) => m.type === 'warm')) await page.waitForTimeout(30);
    await page.waitForTimeout(600);
    await page.evaluate(recap.recapDataJs({ totalReps: 20, moves: 2, pct: 88, hasFormData: true, durationSec: 600, overview: 'x', hasVideo }));
    const t1 = Date.now(); while (Date.now() - t1 < 6000 && !posts.some((m) => m.type === 'ready')) await page.waitForTimeout(30);
    await page.waitForTimeout(500);
    return { page, posts };
  }
  {
    const { page } = await openRecap(true);
    const st = await page.evaluate(() => { const l = document.querySelector('#dc-root a[href="Workout Recap v2.dc.html"]'); const slot = document.getElementById('recap-replay'); return { link: !!l && getComputedStyle(l).display !== 'none', slot: slot ? getComputedStyle(slot).display : 'none', note: /No video was saved/.test(document.body.innerText) }; });
    check('WITH a video: "View rep feedback" is there, the placeholder is hidden, no "no video" note', st.link && st.slot === 'none' && !st.note, JSON.stringify(st));
    await page.close();
  }
  {
    const { page } = await openRecap(false);
    await page.screenshot({ path: path.join(ROOT, '.scratch', 'recap-no-video.png') });
    const st = await page.evaluate(() => { const l = document.querySelector('#dc-root a[href="Workout Recap v2.dc.html"]'); const slot = document.getElementById('recap-replay'); return { link: !!l && getComputedStyle(l).display !== 'none', placeholder: !!slot && getComputedStyle(slot).display !== 'none', note: /No video was saved for this workout/.test(document.body.innerText) }; });
    check('WITHOUT a video: the design placeholder ("Drop replay frame") never shows; the page says "No video was saved for this workout"', !st.placeholder && st.note, JSON.stringify(st));
    check('WITHOUT a video: "View rep feedback" is hidden (nothing real to review)', !st.link);
    await page.close();
  }
  await browser.close();

  // 3b. All sets payload
  const AS = require('../lib/allSetsInject.ts');
  const t1 = AS.setTilesFor([{ displayName: 'Shoulder Press', reps: 5, goodReps: 4 }], true, 'Shoulder Press');
  const t0 = AS.setTilesFor([{ displayName: 'Shoulder Press', reps: 5, goodReps: 4 }], false, 'Shoulder Press');
  check('All sets: with a video the first tile is the video tile (videoIdx 0, hasVideo true)', t1.videoIdx === 0 && t1.tiles[0].hasVideo === true);
  check('All sets: without a video no tile claims a video (so nothing is left transparent over an empty player)', t0.videoIdx === null && t0.tiles.every((t) => !t.hasVideo));

  // 4. native: a finished clip is handed back even after an early error
  const sw = read('modules/athlt-camera/ios/ATHLTCameraModule.swift');
  check('native: a recording that ended with an error still returns its clip when the file exists with content (AVErrorRecordingSuccessfullyFinishedKey)', sw.includes('AVErrorRecordingSuccessfullyFinishedKey') && sw.includes('lastFinishedClipURL'));
  check('native: stopTracking while not recording hands back the last finished clip instead of "no video"', /not recording now; last finished clip/.test(sw) && /"videoUri": self\.lastFinishedClipURL\?\.absoluteString \?\? NSNull\(\)/.test(sw));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
