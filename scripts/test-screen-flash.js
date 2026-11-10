#!/usr/bin/env node
/**
 * scripts/test-screen-flash.js
 * Front-camera flash: the button exists only for the front camera, the white frame shows only while the flash is on AND the
 * front camera is on, brightness goes to the maximum and is put back, and without the native module (a build made before
 * expo-brightness was added) nothing crashes.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const Module = require('module');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

(async () => {
  // 1. with the native module: max brightness, then the old value is restored exactly
  const calls = []; let level = 0.37;
  const fake = { getBrightnessAsync: async () => level, setBrightnessAsync: async (v) => { calls.push(v); level = v; } };
  const prev = Module._load;
  Module._load = function (req) { if (req === 'expo-brightness') return fake; return prev.apply(this, arguments); };
  const flash = require('../lib/screenFlash.ts');
  check('flash on -> brightness goes to the maximum (1)', (await flash.setFlashBrightness(true)) === true && level === 1, `level ${level}`);
  await flash.setFlashBrightness(true);
  check('asking again does not overwrite the saved brightness', calls.filter((c) => c === 1).length >= 1);
  check('flash off -> the previous brightness (0.37) is put back', (await flash.setFlashBrightness(false)) === true && level === 0.37, `level ${level}`);
  check('turning it off twice does nothing odd', (await flash.setFlashBrightness(false)) === true && level === 0.37);
  Module._load = prev;

  // 2. without the module (an older build): a safe no-op that reports it
  delete require.cache[require.resolve('../lib/screenFlash.ts')];
  Module._load = function (req) { if (req === 'expo-brightness') throw new Error('native module missing'); return prev.apply(this, arguments); };
  const flash2 = require('../lib/screenFlash.ts');
  check('no native module: nothing crashes and it says the brightness part is unavailable', (await flash2.setFlashBrightness(true)) === false && (await flash2.setFlashBrightness(false)) === false);
  Module._load = prev;

  // 3. the screen wires it correctly
  const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
  check('the flash button is ALWAYS on screen (it was hidden unless the front camera was detected); on the back camera a tap flips to the front camera and turns the light on', /onPress=\{handleFlash\}/.test(fc) && !/camPosition === 'front' && \(\s*<LiquidGlassButton\s+onPress=\{\(\) => setFlashOn/.test(fc) && /const handleFlash = useCallback\(\(\) => \{\s*if \(camPosition === 'front'\) \{ setFlashOn\(v => !v\); return; \}\s*setFlashOn\(true\);\s*void flipCamera\(\)/.test(fc));
  check('the white frame shows only while flashOn AND the front camera is on, under every control', /const flashActive = flashOn && camPosition === 'front'/.test(fc) && /\{flashActive && \(\s*<View pointerEvents="none"/.test(fc) && fc.indexOf('{flashActive && (') < fc.indexOf('style={[s.topBar'));
  check('the camera position comes from the native camera state event', /if \(mounted && e\.position\) setCamPosition\(e\.position\)/.test(fc));
  check('brightness is restored when the flash goes off and when the screen closes', /useEffect\(\(\) => \{ void setFlashBrightness\(flashActive\); \}, \[flashActive\]\)/.test(fc) && /useEffect\(\(\) => \(\) => \{ void setFlashBrightness\(false\); \}, \[\]\)/.test(fc));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  check('expo-brightness is a dependency (needs a NEW native build to take effect)', !!pkg.dependencies['expo-brightness'], pkg.dependencies['expo-brightness']);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
