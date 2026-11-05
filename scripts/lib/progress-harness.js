// Shared by the Progress tab tests: opens the REAL assets/app screens/progress.html in headless Chromium with the EXACT
// injection the app ships (DC_VIEWPORT_JS + DC_NO_ZOOM_JS + logic patch + DOM pass) and real data pushed the way the app does.
require('./ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const H = require('../../lib/dcWebviewHelpers.ts');
const { dcLogicPatchJs, athltSetDataJs } = require('../../lib/dcLogicPatch.ts');
const { PROGRESS_LOGIC_EXT, PROGRESS_DOM_JS } = require('../../lib/progressInject.ts');
const { buildProgressData } = require('../../lib/progressData.ts');

const DAY = 86400000;
const noon = (y, m, d) => new Date(y, m, d, 12).getTime();

// Real-looking history around "today": form scores on irregular days, weigh-ins every few days.
function makeData({ form, weights } = {}) {
  const now = Date.now();
  const data = buildProgressData([], {}, [], now, { insets: { top: 62, bottom: 34 } });
  data.form = form || [
    [-34, 64], [-30, 71], [-27, 58], [-22, 77], [-19, 69], [-15, 82], [-12, 74], [-8, 88], [-5, 79], [-2, 91],
  ].map(([d, pct]) => ({ ts: now + d * DAY, pct }));
  data.weight = weights || [
    [-40, 184.2], [-33, 183.6], [-27, 184.8], [-20, 182.9], [-13, 183.4], [-7, 181.7], [-3, 182.1], [0, 181.2],
  ].map(([d, w]) => { const t = new Date(now + d * DAY); return { d: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`, w }; });
  data.hasSessions = true;
  return data;
}

async function openProgress(data, opts = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: opts.height || 844 }, deviceScaleFactor: 2 });
  const msgs = [], logs = [];
  await page.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  page.on('console', (m) => { logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await page.addInitScript(H.DC_VIEWPORT_JS + H.DC_NO_ZOOM_JS + H.CONSOLE_FORWARD_JS + H.DC_SETTLE_JS + dcLogicPatchJs(PROGRESS_LOGIC_EXT) + PROGRESS_DOM_JS);
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'progress.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(athltSetDataJs(data));
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-pready'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);
  return { browser, page, msgs, logs };
}

module.exports = { openProgress, makeData, ROOT, DAY };
