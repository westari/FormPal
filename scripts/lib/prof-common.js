const { chromium } = require('playwright');
const { loadTs, loadLib, fileUrl } = require('./test-helpers');
const AS = { getItem: async () => null, setItem: async () => {} };
const sessionLog = loadTs('lib/sessionLog.ts', { '@react-native-async-storage/async-storage': { default: AS } });
const profileData = loadTs('lib/profileData.ts', { '@react-native-async-storage/async-storage': { default: AS } });
const helpers = loadLib('lib/dcWebviewHelpers.ts');
const patch = loadLib('lib/dcLogicPatch.ts');
const inject = loadLib(process.env.INJECT_FILE || 'lib/profileInject.ts');
const BEFORE = helpers.DC_VIEWPORT_JS + helpers.CONSOLE_FORWARD_JS + helpers.DC_SETTLE_JS + loadLib('lib/tabHeader.ts').TAB_HEADER_JS + patch.dcLogicPatchJs(inject.PROFILE_LOGIC_EXT) + inject.PROFILE_DOM_JS;
const DAY = 86400000;
function sessions(kind) {
  if (kind === 'empty') return [];
  const out = []; const now = Date.now();
  for (let d = 0; d < 12; d++) { const ts = now - d * DAY - 3600e3; out.push({ ts, exerciseId: 'pushup', displayName: 'Push-ups', reps: 12, goodReps: d % 3 === 0 ? 12 : 10, pct: 90, formChecked: true }); }
  return out;
}
function data(kind, seed = 1) {
  const ss = sessions(kind);
  return profileData.buildProfileData({ seedVersion: seed, name: kind === 'empty' ? 'Athlete' : 'Ari', email: 'ari@example.com', sessions: ss, streak: sessionLog.calcStreak(ss),
    planProfile: kind === 'empty' ? null : { goal: 'toned', experience: 'intermediate', daysPerWeek: 4, location: 'gym' }, planGeneratedAt: Date.now() - 30 * DAY,
    location: 'home', latestWeightLb: kind === 'empty' ? null : 182.4, details: kind === 'empty' ? {} : { age: '27', height: `5'11"`, sex: 'Male' },
    audio: { enabled: true, voiceFrequency: 'correctionsOnly' }, appVersion: 'FormPal 1.0.0 (7)', insets: { top: 62, bottom: 34 } });
}
async function open(kind, { rate = 1, width = 393, height = 852 } = {}) {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  if (rate > 1) { const c = await p.context().newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate }); }
  const msgs = [];
  await p.exposeFunction('__rnPost', m => { try { msgs.push(JSON.parse(m)); } catch { msgs.push(m); } });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: m => window.__rnPost(m) }; });
  await p.addInitScript(BEFORE);
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  const d = data(kind);
  const t0 = Date.now(); await p.goto(fileUrl('assets/app screens/profile.html'), { waitUntil: 'commit' });
  let pushed = false;
  while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 60000) {
    if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(patch.athltSetDataJs(d)).catch(() => {}); }
    await p.waitForTimeout(80);
  }
  return { b, p, msgs, d, ready: msgs.some(m => m.type === 'ready'), readyMs: Date.now() - t0 };
}
module.exports = { open, data, patch };
