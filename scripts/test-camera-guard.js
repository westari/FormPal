#!/usr/bin/env node
/**
 * scripts/test-camera-guard.js
 *
 * The crash: leaving the form check or flipping the camera showed the red "Uncaught Error" page ("hapticLight is not a function"),
 * and Back opened it again. Two causes were possible: JS calling a function that is not there (a renamed haptics export), or a
 * native function the INSTALLED build does not have. Both are now covered:
 *   1. every name imported from lib/haptics exists (also in test-haptics-screens.js)
 *   2. every call into the native camera module goes through callNative: a missing function, a throw or a rejected promise is
 *      skipped (the fallback is used), never an error
 *   3. the camera screens close back to the previous screen on any uncaught error, instead of a stuck error page
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

(async () => {
  const idx = read('modules/athlt-camera/src/index.ts');
  const direct = idx.split('\n').filter((l) => /ATHLTCameraNative\.[A-Za-z]+\(/.test(l) && !/^\s*\/\//.test(l));
  check('no call into the native module bypasses callNative', direct.length === 0, direct.join(' | '));
  check('every native event listener goes through safeListen (cannot throw)', !/return nativeEmitter\.addListener/.test(idx) && (idx.match(/safeListen\('/g) || []).length >= 6);

  // An OLD native build: some functions missing, some that throw, some that reject. (A fake native module, installed over the loader's stub.)
  const Module0 = require('module'); const orig0 = Module0._load;
  const oldBuild = {
    startSession: () => { throw new Error('native threw'); },
    flipCamera: async () => { throw new Error('native rejected'); },
    stopTracking: () => ({ reps: 3, goodReps: 2, videoUri: null }),
    // setMode, startTracking, setSkeletonVisible, setDiagnosticMode, stopSession, setExercise*, ... do not exist in this "old build"
  };
  Module0._load = function (req) {
    if (req === 'expo-modules-core') return { requireNativeModule: () => oldBuild, requireNativeViewManager: () => null, EventEmitter: class { addListener() { throw new Error('no emitter'); } } };
    return orig0.apply(this, arguments);
  };
  delete require.cache[require.resolve('../modules/athlt-camera/src/index.ts')];
  const cam = require('../modules/athlt-camera/src/index.ts');
  Module0._load = orig0;
  check('callNative: a function the installed build does not have -> the fallback, no error', (await cam.callNative('thisFunctionDoesNotExist', 'fallback', 1, 2)) === 'fallback');
  check('callNative: a native function that throws or rejects -> the fallback, no error', (await cam.callNative('startSession', 'fb1')) === 'fb1' && (await cam.callNative('flipCamera', 'fb2')) === 'fb2');
  check('callNative: a native function that works still returns its real answer', (await cam.stopTracking()).reps === 3);
  const results = await Promise.all([cam.flipCamera(), cam.stopTracking(), cam.startTracking(), cam.setMode('idle'), cam.setSkeletonVisible(true), cam.setDiagnosticMode(false), cam.stopSession(), cam.startSession(), cam.setExerciseDefinition(null), cam.setExerciseStandard(null), cam.setExercise('squat')].map((p) => p.then(() => 'ok', (e) => 'THREW ' + e.message)));
  check('every camera function resolves (never throws) on an old or broken native build', results.every((r) => r === 'ok'), results.join(','));
  check('a flip that fails keeps the camera where it was (back) instead of throwing', (await cam.flipCamera()).position === 'back');
  let listenErr = null; try { cam.addRepListener(() => {}).remove(); cam.addErrorListener(() => {}).remove(); } catch (e) { listenErr = e.message; }
  check('a native event listener that cannot attach does not throw', listenErr === null, listenErr);

  const fc = read('app/formcheck.tsx'), cal = read('app/calibrate.tsx'), g = read('components/CameraErrorGuard.tsx');
  check('the form check screen installs the error guard and exports the error screen (leaves at once)', fc.includes('useCameraErrorGuard();') && /export \{ ErrorBoundary \} from '..\/components\/CameraErrorGuard'/.test(fc));
  check('the calibrate screen does too', cal.includes('useCameraErrorGuard();') && /export \{ ErrorBoundary \} from '..\/components\/CameraErrorGuard'/.test(cal));
  check('on an uncaught error the guard logs [ERROR-GUARD] and goes back (or Home when there is nothing to go back to), once', g.includes('[ERROR-GUARD]') && g.includes('router.back()') && g.includes("router.replace('/' as any)") && g.includes('if (!handled)'));
  check('the guard puts the previous error handler back when the screen closes', g.includes('EU.setGlobalHandler(previous)'));

  // run the guard's handler logic for real
  {
    const calls = [];
    let handler = null;
    global.ErrorUtils = { getGlobalHandler: () => 'prev', setGlobalHandler: (h) => { handler = h; calls.push(h === 'prev' ? 'restored' : 'set'); } };
    const Module = require('module'); const orig = Module._load;
    let backs = 0, replaces = 0, canGo = true;
    Module._load = function (req) {
      if (req === 'react') return { useEffect: (fn) => { const cleanup = fn(); global.__cleanup = cleanup; }, createElement: () => null, default: {} };
      if (req === 'expo-router') return { useRouter: () => ({ canGoBack: () => canGo, back: () => { backs++; }, replace: () => { replaces++; } }) };
      if (req === 'react-native') return { View: 'View', Text: 'Text', StyleSheet: { create: (x) => x } };
      return orig.apply(this, arguments);
    };
    delete require.cache[require.resolve('../components/CameraErrorGuard.tsx')];
    const G = require('../components/CameraErrorGuard.tsx');
    const logs = [];
    G.useCameraErrorGuard((l) => logs.push(l));
    check('the guard takes over the global error handler while the screen is open', calls[0] === 'set' && typeof handler === 'function');
    handler(new Error('hapticLight is not a function'), false);
    handler(new Error('second error'), false);
    check('an uncaught error closes the screen ONCE (back), with a log line, instead of a stuck error page', backs === 1 && replaces === 0 && /ERROR-GUARD.*hapticLight/.test(logs[0]), `backs=${backs} logs=${logs.length}`);
    global.__cleanup();
    check('closing the screen restores the previous handler', calls[calls.length - 1] === 'restored');
    canGo = false; backs = 0; handler = null;
    G.useCameraErrorGuard((l) => logs.push(l));
    handler(new Error('x'), true);
    check('with nothing to go back to it goes Home', backs === 0 && replaces === 1);
    Module._load = orig;
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
