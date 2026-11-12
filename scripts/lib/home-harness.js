// Opens the REAL assets/app screens/home.html with the EXACT injection the Home tab ships (scale-fit + buildHomeInjectJs),
// plus the shipped no-zoom/viewport guards. Used by the Home tests.
require('./ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module');
const origLoad = Module._load;
Module._load = function (req) { if (/constants\/api$/.test(req)) return { MYPAL_API_URL: 'http://localhost/none' }; return origLoad.apply(this, arguments); };
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const home = require('../../app/(tabs)/index.tsx');

const now = Date.now();
const plan = { id: 'p', profile: { goal: 'general', experience: 'beginner', daysPerWeek: 4, location: 'gym' }, currentWorkoutIndex: 0,
  workouts: [{ id: 'w', splitLabel: 'Upper Body', exercises: [{}, {}, {}, {}] }] };
const sessions = Array.from({ length: 3 }, (_, i) => ({ ts: now - i * 86400000, exerciseId: 'shoulderPress', displayName: 'Shoulder Press', reps: 10, goodReps: 8, pct: 80, formChecked: true }));

async function openHome({ inject = true, height = 844, inset = 47 } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height }, deviceScaleFactor: 3 });
  const msgs = [];
  await page.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'home.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  if (inject) {
    await page.evaluate(home.HOME_SCALE_FIT_JS);
    await page.evaluate(home.buildHomeInjectJs(plan, sessions, inset, 34));
    await page.waitForTimeout(1500);
  }
  return { browser, page, msgs, home };
}
module.exports = { openHome, home, ROOT, plan, sessions };
