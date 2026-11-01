// Tiny TS/TSX loader for node-side tests: transpiles .ts/.tsx on require and
// stubs every non-relative, non-"typescript" module (react-native, expo-*,
// AsyncStorage, ...) plus image assets with a permissive Proxy, so pure app
// logic (lib/*.ts) can run for real under node without a device.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function makeStub() {
  const fn = function () { return stub; };
  const stub = new Proxy(fn, {
    get(_t, prop) {
      if (prop === '__esModule') return false;
      if (prop === Symbol.toPrimitive) return () => 1;
      if (prop === 'create') return (o) => o; // StyleSheet.create
      return stub;
    },
    apply() { return stub; },
    construct() { return stub; },
  });
  return stub;
}

const STUB_ALLOW = new Set(['typescript', 'fs', 'path', 'os', 'url', 'child_process', 'playwright']);

module.exports = function installTsLoader() {
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (/\.(png|jpe?g|webp|gif|svg|mp3|wav|html)$/i.test(request)) return 1;
    if (!request.startsWith('.') && !path.isAbsolute(request) && !STUB_ALLOW.has(request) && !request.startsWith('node:')) {
      // only stub when required from app source, never from node_modules internals
      if (parent && parent.filename && !parent.filename.includes('node_modules')) return makeStub();
    }
    return origLoad.apply(this, arguments);
  };
  const compile = (module, filename) => {
    const src = fs.readFileSync(filename, 'utf8');
    const out = ts.transpileModule(src, {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019,
        jsx: ts.JsxEmit.React, esModuleInterop: true, importsNotUsedAsValues: 'remove',
      },
    }).outputText;
    module._compile(out, filename);
  };
  require.extensions['.ts'] = compile;
  require.extensions['.tsx'] = compile;
};
