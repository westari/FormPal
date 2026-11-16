#!/usr/bin/env node
/**
 * scripts/test-build-safety.js
 *
 * "Make the next build work" (Ari 2026-11-16): the first iOS build since Oct 8 compiles every Swift change for the first time. Swift cannot be compiled
 * on Windows, so this runs the static checks that catch what a compiler would, plus build-config checks:
 *   1. scripts/check-swift-strings.js  string literals, interpolation, brackets (it found two lost-backslash strings that would have failed the build)
 *   2. scripts/check-swift-calls.js    ExerciseDefinition(...) argument labels, order, duplicates, required arguments
 *   3. scripts/check-imports.js        every imported package is in package.json, removed packages are gone, new native modules are guarded
 *   4. event names: every sendEvent("x") in the module is registered in Events(...), and the JS listeners use registered names
 *   5. app.json / package.json / workflow / plugin
 *   6. every JS call into native goes through callNative / safeListen (an old build without a function or event = skipped, never a crash)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

for (const [name, file] of [['Swift strings, interpolation and brackets', 'check-swift-strings.js'], ['Swift ExerciseDefinition(...) calls', 'check-swift-calls.js'], ['JS imports vs package.json', 'check-imports.js']]) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
  check(name, r.status === 0, (r.stdout.trim().split('\n').slice(-2).join(' | ')) || r.stderr.slice(0, 200));
}
{
  // the lexer really catches the bug (the version of ExerciseEngine.swift from before the fix, kept as a fixture)
  const bad = 'func f(def: Int) {\n    let msg = "[X] (def.id) reached=(String(format: "%.1f", 1.0))"\n}\n';
  const tmp = path.join(__dirname, 'fixtures', 'swift-lost-backslash.swift.txt');
  fs.writeFileSync(tmp, bad);
  const r = spawnSync(process.execPath, [path.join(__dirname, 'check-swift-strings.js'), tmp], { encoding: 'utf8' });
  check('the Swift string checker CATCHES a lost backslash (the 2026-11-16 bug), so a pass means something', r.status === 1 && /printf format/.test(r.stdout), r.stdout.split('\n')[0]);
}
{
  const mod = read('modules/athlt-camera/ios/ATHLTCameraModule.swift');
  const registered = new Set((/Events\(([^)]*)\)/.exec(mod)[1].match(/"[A-Za-z]+"/g) || []).map((x) => x.replace(/"/g, '')));
  const sent = [...new Set([...mod.matchAll(/sendEvent\("([A-Za-z]+)"/g)].map((m) => m[1]))];
  check('every sendEvent name is registered in Events(...) of the module (an unregistered event throws at runtime)', sent.every((e) => registered.has(e)), 'sent: ' + sent.join(', ') + ' | registered: ' + [...registered].join(', '));
  const idx = read('modules/athlt-camera/src/index.ts');
  const listened = [...idx.matchAll(/safeListen\('([A-Za-z]+)'/g)].map((m) => m[1]);
  check('every JS listener listens to a registered event name', listened.every((e) => registered.has(e)), listened.join(', '));
  check('JS: every call into native goes through callNative (skips a function an old build does not have) and every listener through safeListen (never throws)', !/ATHLTCameraNative\.\w+\(/.test(idx.replace(/\/\/.*$/gm, '')) && /safeListen\('onAttemptMissed'/.test(idx) && /export async function callNative/.test(idx));
  check('JS: the new native module expo-brightness is only loaded inside try/catch (an old build without it keeps working)', /try \{ mod = require\('expo-brightness'\); \} catch \{ mod = null; \}/.test(read('lib/screenFlash.ts')));
  const app = JSON.parse(read('app.json')).expo;
  check('app.json: the Sign In with Apple strip plugin is still in place, with expo-camera and the camera / microphone descriptions', app.plugins.includes('./plugins/withoutAppleSignIn') && app.plugins.includes('expo-camera') && !!app.ios.infoPlist.NSCameraUsageDescription && !!app.ios.infoPlist.NSMicrophoneUsageDescription);
  const plug = read('plugins/withoutAppleSignIn.js');
  check('the plugin file removes the com.apple.developer.applesignin entitlement and exports a function', /delete c\.modResults\['com\.apple\.developer\.applesignin'\]/.test(plug) && /module\.exports = function/.test(plug) && fs.existsSync(path.join(ROOT, 'plugins/withoutAppleSignIn.js')));
  const pkg = JSON.parse(read('package.json'));
  const lock = read('package-lock.json');
  check('package.json: the new native modules are declared at Expo SDK 54 versions (expo-brightness, expo-camera, expo-keep-awake, expo-apple-authentication) and are in the lock file', ['expo-brightness', 'expo-camera', 'expo-keep-awake', 'expo-apple-authentication'].every((p) => pkg.dependencies[p] && lock.includes('"node_modules/' + p + '"')), ['expo-brightness', 'expo-camera', 'expo-keep-awake', 'expo-apple-authentication'].map((p) => p + ' ' + pkg.dependencies[p]).join(', '));
  check('package.json: the removed packages (react-native-fs, static-server) are not dependencies', !pkg.dependencies['@dr.pogodin/react-native-fs'] && !pkg.dependencies['@dr.pogodin/react-native-static-server']);
  const wf = read('.github/workflows/ios-dev-build.yml');
  check('workflow: workflow_dispatch only, macos-26 / Xcode 26, npm install --legacy-peer-deps, then "eas build --platform ios --profile development --local"', /workflow_dispatch/.test(wf) && /macos-26/.test(wf) && /npm install --legacy-peer-deps/.test(wf) && /eas build --platform ios --profile development --local --non-interactive/.test(wf));
  check('workflow: the flaky "downloadPlatform" step retries and can no longer fail the whole build', /for i in 1 2 3/.test(wf) && /exit 0/.test(wf.split('Ensure iOS device platform is installed')[1].split('Confirm simulator runtimes')[0]));
  const eas = JSON.parse(read('eas.json'));
  check('eas.json: the development profile is a development client (internal distribution)', eas.build.development.developmentClient === true && eas.build.development.distribution === 'internal');
  const pod = read('modules/athlt-camera/athlt-camera.podspec');
  check('podspec: UIKit is linked (the keep-awake keeper uses UIApplication / UIScreen) and Swift 5.9', /'UIKit'/.test(pod) && /swift_version\s*=\s*'5\.9'/.test(pod) && /^import UIKit/m.test(mod));
}
{
  // CI 2026-11-15: "failed to produce diagnostic for expression" at definition(): a `?? NSNull()` / `as Any?` expression inside the Expo result builder
  const swift = fs.readFileSync(path.join(__dirname, '..', 'modules', 'athlt-camera', 'ios', 'ATHLTCameraModule.swift'), 'utf8');
  const a = swift.indexOf('public func definition() -> ModuleDefinition');
  const b = swift.indexOf('private func wireEngineCallbacks()');
  const body = a >= 0 && b > a ? swift.slice(a, b) : '';
  check('definition() holds no `?? NSNull()` / `as Any?` expression (they crash the Swift type-checker inside the Expo result builder; use the helpers above it)', body.length > 1000 && !/\?\? NSNull\(\)|as Any\?/.test(body));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
