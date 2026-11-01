// Loads the REAL inject builders out of app/recap.tsx (transpiled slice, not a
// hand copy) so Playwright tests run exactly the JS that ships.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

module.exports = function loadRecapInject(names, sourceText) {
  // Current code lives in lib/recapInject.ts; an older revision's source text
  // (still inside app/recap.tsx) is loaded by slicing it out.
  if (sourceText == null) {
    require('./ts-node-loader.js')();
    return require('../../lib/recapInject.ts');
  }
  const file = path.join(__dirname, '..', '..', 'app', 'recap.tsx');
  const src = sourceText != null ? sourceText : fs.readFileSync(file, 'utf8');
  const a = src.indexOf('function formatDuration');
  const b = src.indexOf('export default function RecapScreen');
  if (a < 0 || b < 0) throw new Error('recap.tsx markers not found');
  const slice = src.slice(a, b);
  const js = ts.transpileModule(slice, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText + `\nmodule.exports = { ${names.join(', ')} };`;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', '__DEV__', js)(m, m.exports, require, false);
  return m.exports;
};
