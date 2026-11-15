// Opens the REAL traintab.html with the exact injection the Train tab ships and real data from buildTrainData(plan, sessions, insets, now).
// Returns { b, p, msgs, data }. Set WK=1 to use WebKit instead of Chromium.
const path = require('path'); const { chromium, webkit } = require('playwright'); const { pathToFileURL } = require('url');
require('./ts-node-loader.js')(); global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'x' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const train = require('../../app/(tabs)/train.tsx'); const { buildTrainData } = require('../../lib/trainData.ts'); const { athltSetDataJs } = require('../../lib/dcLogicPatch.ts');
module.exports = async function openTrain(plan, sessions, now) {
  const b = await (process.env.WK ? webkit : chromium).launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const msgs = []; await p.exposeFunction('__post', d => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: d => window.__post(d) }; }); await p.addInitScript(train.TRAIN_BEFORE);
  const data = { ...buildTrainData(plan, sessions, { top: 62, bottom: 34 }, now), insets: { top: 62, bottom: 34 } };
  await p.goto(pathToFileURL(path.join(__dirname, '..', '..', 'assets', 'app screens', 'traintab.html')).href, { waitUntil: 'commit' });
  let pushed = false; const t0 = Date.now();
  while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 20000) { if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); } await p.waitForTimeout(50); }
  await p.waitForTimeout(800);
  return { b, p, msgs, data };
};
