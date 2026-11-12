// Test helpers: pull the REAL shipped consts/functions out of the .tsx sources.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const ROOT = path.join(__dirname, '..', '..');

// Transpile a slice of a tsx file [startMarker, endMarker] and eval it, returning
// the exports object (slice must `export`-free; we append module.exports).
function extract(file, startMarker, endMarker, names) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('start not found: ' + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('end not found: ' + endMarker);
  const slice = src.slice(a, b + endMarker.length) + ((endMarker.startsWith('  return') || endMarker === '`;') ? '\n}' : '');
  const js = ts.transpileModule(slice, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const fn = new Function('require', 'module', 'exports', js + '\nmodule.exports = {' + names.join(',') + '};');
  const m = { exports: {} };
  fn(require, m, m.exports);
  return m.exports;
}

// Transpile + eval a whole self-contained lib file (no imports) and return its exports.
function loadLib(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', js)(require, m, m.exports);
  return m.exports;
}

// Like extract(), but with extra in-scope variables (stand-ins for the file's imports).
function extractWith(file, startMarker, endMarker, names, scope) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('start not found: ' + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('end not found: ' + endMarker);
  const slice = src.slice(a, b + endMarker.length) + ((endMarker.startsWith('  return') || endMarker === '`;') ? '\n}' : '');
  const js = ts.transpileModule(slice, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const keys = Object.keys(scope);
  const fn = new Function(...keys, 'module', js.replace(/^exports\.[A-Za-z_]+ = .*$/gm, '').replace(/^Object\.defineProperty\(exports.*$/gm, '') + '\nmodule.exports = {' + names.join(',') + '};');
  const m = { exports: {} };
  fn(...keys.map(k => scope[k]), m);
  return m.exports;
}

function fileUrl(rel) {
  return 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/').replace(/ /g, '%20');
}

module.exports = { extract, extractWith, loadLib, fileUrl, ROOT };

// ── recursive TS loader (relative requires), with module overrides ──
const _cache = new Map();
function loadTs(rel, overrides = {}) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  if (_cache.has(abs + JSON.stringify(Object.keys(overrides)))) return _cache.get(abs + JSON.stringify(Object.keys(overrides)));
  const src = fs.readFileSync(abs, 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  _cache.set(abs + JSON.stringify(Object.keys(overrides)), m.exports);
  const req = (id) => {
    if (overrides[id]) return overrides[id];
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(abs), id);
      for (const ext of ['.ts', '.tsx', '/index.ts']) { if (fs.existsSync(base + ext)) return loadTs(base + ext, overrides); }
      throw new Error('cannot resolve ' + id + ' from ' + abs);
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', '__DEV__', js)(req, m, m.exports, false);
  _cache.set(abs + JSON.stringify(Object.keys(overrides)), m.exports);
  return m.exports;
}
module.exports.loadTs = loadTs;
