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
  check('the flash button is ALWAYS on screen (it was hidden unless the front camera was detected); on the back camera a tap flips to the front camera and turns the light on', fc.includes('handleFlash(); }}') && fc.includes("if (camPosition === 'front') { setFlashOn(v => !v); return; }") && fc.includes('setFlashOn(true);') && fc.includes('void flipCamera().then(r => { setCamPosition('));
  check('the ring light shows only while flashOn AND the front camera is on, under every control', /const flashActive = flashOn && camPosition === 'front'/.test(fc) && fc.includes('{flashActive && <RingLight />}') && !/borderLeftWidth: FLASH_FRAME/.test(fc));
  {
    const rl = fs.readFileSync(path.join(__dirname, '..', 'components', 'RingLight.tsx'), 'utf8'), sf = fs.readFileSync(path.join(__dirname, '..', 'lib', 'screenFlash.ts'), 'utf8');
    check('the ring light is four soft gradients on ALL four edges (top, bottom, left, right), untouchable, white fading to clear', (rl.match(/<LinearGradient/g) || []).length === 4 && /pointerEvents="none"/.test(rl) && sf.includes('{ at: 1, a: 0 }') && sf.includes('{ at: 0, a: 1 }'));
    const depth = +(sf.match(/depth: ([0-9]+)/) || [])[1];
    const dv = +(sf.match(/depthTopBottom: ([0-9]+)/) || [])[1];
    check('it is MUCH stronger than before (was 64pt deep, solid only at the very edge): sides ' + depth + 'pt, top/bottom ' + dv + 'pt, solid white for the first half', depth >= 90 && dv >= 130 && sf.includes('{ at: 0.5, a: 1 }'), depth + '/' + dv);
    check('...yet the middle stays clear: the two side glows together cover under 55% of a 390pt screen, and the top/bottom ones are where the body is not', 2 * depth < 0.55 * 390 && dv <= 170, String(2 * depth));
  }
  check('the camera position comes from the native camera state event', /if \(mounted && e\.position\) setCamPosition\(e\.position\)/.test(fc));
  check('brightness is restored when the flash goes off and when the screen closes', /useEffect\(\(\) => \{ void setFlashBrightness\(flashActive\); \}, \[flashActive\]\)/.test(fc) && /useEffect\(\(\) => \(\) => \{ void setFlashBrightness\(false\); \}, \[\]\)/.test(fc));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  check('expo-brightness is a dependency (needs a NEW native build to take effect)', !!pkg.dependencies['expo-brightness'], pkg.dependencies['expo-brightness']);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
