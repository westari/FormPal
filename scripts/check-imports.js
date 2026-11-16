#!/usr/bin/env node
/**
 * scripts/check-imports.js
 *
 * Build safety: every package the app imports (import ... from 'x', require('x')) must be in package.json (or be a node/RN built-in alias), and every
 * package that has a NATIVE part and is NEW since the Oct 8 build (expo-brightness, expo-camera ...) must be either guarded (require inside try/catch)
 * or a known part of the old binary. Run before a build: a package that is missing from package.json fails the Metro bundle on the phone.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const have = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
const bundled = new Set(['react', 'react-native', 'expo', 'expo-router', 'expo-asset', '@react-navigation/bottom-tabs']);   // always present: expo and expo-router install them (expo-asset is a dependency of expo; bottom-tabs of expo-router)
const dirs = ['app', 'components', 'lib', 'store', 'constants', 'modules/athlt-camera/src'];
const exts = /\.(ts|tsx|js|jsx)$/;
const found = new Map();   // package -> [files]
function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (f.name === 'node_modules' || f.name.startsWith('.')) continue; walk(p); }
    else if (exts.test(f.name)) {
      const src = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const re = /(?:from\s+|require\(\s*|import\(\s*|import\s+)['"]([^'"]+)['"]/g; let m;
      while ((m = re.exec(src))) {
        const spec = m[1]; if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('~')) continue;
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (!found.has(name)) found.set(name, []);
        found.get(name).push(path.relative(ROOT, p));
      }
    }
  }
}
for (const d of dirs) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
let problems = 0;
for (const [name, files] of found) {
  if (have.has(name) || bundled.has(name)) continue;
  if (/^(node:|fs$|path$|os$|crypto$|stream$|events$|util$)/.test(name)) continue;
  console.log(`NOT IN package.json: ${name}  (${[...new Set(files)].slice(0, 3).join(', ')})`); problems++;
}
// packages removed from package.json since the last build must not be imported any more
for (const gone of ['@dr.pogodin/react-native-fs', '@dr.pogodin/react-native-static-server']) {
  if (found.has(gone)) { console.log(`REMOVED package still imported: ${gone} (${found.get(gone)[0]})`); problems++; }
}
// new native modules since Oct 8: the ones imported at the top level of a file must be in the old binary too, or the OLD build would fail at import
const guarded = [['lib/screenFlash.ts', "require('expo-brightness')"], ['app/onboarding.tsx', "require('expo-camera')"]];
for (const [f, needle] of guarded) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const i = s.indexOf(needle);
  const around = i < 0 ? '' : s.slice(Math.max(0, i - 200), i + 200);
  if (i < 0 || !/try\s*\{|catch/.test(around)) { console.log(`NOT GUARDED: ${needle} in ${f}`); problems++; }
}
console.log(problems ? `\n${problems} problem(s)` : `checked ${found.size} imported packages: all are in package.json, the removed packages are not imported, the new native modules are guarded`);
process.exit(problems ? 1 : 0);
