// Opens one of the REAL design files with the exact injection the app ships (lib/designScreens.ts) and real data.
require('./ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const DS = require('../../lib/designScreens.ts');
const { EXERCISE_CATALOG } = require('../../constants/exercises.ts');

const FILES = { create: 'createworkout.html', my: 'myworkouts.html', log: 'logsessionv2.html' };
const BEFORE = { create: DS.createWorkoutBeforeJs, my: DS.myWorkoutsBeforeJs, log: DS.logSessionBeforeJs };

async function openDesign(kind, data, { height = 844, withData = true } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height }, deviceScaleFactor: 2 });
  const msgs = [], logs = [];
  await page.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await page.addInitScript(BEFORE[kind]());
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', FILES[kind])).href, { waitUntil: 'load' });
  if (withData) {
    await page.waitForTimeout(900);
    await page.evaluate(DS.athltSetDataJs(data));
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-pready'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  return { browser, page, msgs, logs };
}
const catalog = () => DS.buildCatalog(EXERCISE_CATALOG);
module.exports = { openDesign, catalog, DS, ROOT, EXERCISE_CATALOG };
