/**
 * scripts/lib/onb-perf.js
 * Loads an onboarding design page in Chromium with the EXACT scripts the app injects (extracted from app/onboarding.tsx, or from another copy of it via
 * ONB_SRC), with the CPU slowed down like a phone (CDP CPU throttling), and measures a few seconds of it:
 *   - frames: every animation frame's length; "janky" = longer than 2 frames at 60 Hz (33 ms)
 *   - script: how much main-thread time JavaScript took (CDP Performance ScriptDuration)
 *   - observer / timer / message counts from the injected code
 */
const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const ts = require('typescript');
const ROOT = path.join(__dirname, '..', '..');
require('./ts-node-loader.js')();

function loadScripts(srcFile) {
  const SRC = fs.readFileSync(srcFile, 'utf8').split('\r\n').join('\n');
  const slice = (from, to) => { const a = SRC.indexOf(from); if (a < 0) return null; const b = to ? SRC.indexOf(to, a) : SRC.length; return b < 0 ? null : SRC.slice(a, b); };
  const run = (code, names, scope = {}) => { const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText; const keys = Object.keys(scope); return new Function(...keys, js + '\nreturn {' + names.map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(',') + '};')(...keys.map((k) => scope[k])); };
  const { computeGoalPlan } = require('../../lib/onboardingGoals.ts');
  const { CUE_ORB_JS, CUE_ORB_CSS } = require('../../lib/cueOrb.ts');
  const out = { CUE_ORB_JS };
  Object.assign(out, run(slice('const RESTART_GRAPH_ANIM_JS', 'const DURATION_YEARS'), ['planReadyInject', 'planReadyHeaderText'], { computeGoalPlan }));
  Object.assign(out, run(slice('const DC_CTA_RE', 'const FIT_BOTH_INJECT'), ['DC_PAGE_INJECT', 'VIEWPORT_JS'], {}));
  const gp = slice('const GENERATE_PLAN_INJECT', '\n`;'); out.GENERATE_PLAN_INJECT = gp ? new Function(gp.replace('const ', 'var ') + '\n`;\nreturn GENERATE_PLAN_INJECT;')() : '';
  const hd = slice('const ONB_INPAGE_HEADER_EXCLUDE', 'function OnboardingWebScreen');
  if (hd) Object.assign(out, run(hd, ['onbHeaderJs', 'ONB_SCROLL_REPORT_JS'], {}));
  out.FIT_BOTH = 'window.__dcFitBoth=1;';
  return out;
}

/** page: 'generatePlan' | 'planReady'. Returns the measurements. */
async function measure(browser, page, opts = {}) {
  const S = loadScripts(opts.src || path.join(ROOT, 'app', 'onboarding.tsx'));
  const file = { generatePlan: 'generateplan.html', planReady: 'planisreadynow.html' }[page];
  let html = fs.readFileSync(path.join(ROOT, 'assets', 'app screens', file), 'utf8');
  const answers = { weight: 180, goalWeight: 165, mainGoal: 'Lose fat / Lose weight', age: 30, height: `5'10"`, experience: 'Beginner' };
  if (page === 'planReady') { const { computeGoalPlan } = require('../../lib/onboardingGoals.ts'); const g = computeGoalPlan(answers); const esc = (s) => JSON.stringify(s).slice(1, -1); html = html.replace('{{HEADER}}', esc(S.planReadyHeaderText(g))).replace('{{SUBLINE}}', esc('Starting today')); }
  const tmp = path.join(ROOT, '.scratch', `perf-${page}.html`); fs.mkdirSync(path.dirname(tmp), { recursive: true }); fs.writeFileSync(tmp, html);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 793 }, deviceScaleFactor: 3 });
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle || 6 });
  await pg.addInitScript('window.__posts=0;window.ReactNativeWebView={postMessage:function(){window.__posts++;}};');
  await pg.addInitScript(S.VIEWPORT_JS); if (opts.cueOrb !== false) await pg.addInitScript(S.CUE_ORB_JS);
  await pg.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await pg.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  // the app's after-load script, exactly as app/onboarding.tsx builds it for this page
  const after = [S.DC_PAGE_INJECT, page === 'generatePlan' ? S.GENERATE_PLAN_INJECT : S.planReadyInject(answers)];
  if (opts.withHeader !== false && S.onbHeaderJs && page !== 'generatePlan' && page !== 'planReady') after.push(S.onbHeaderJs(0.5, false));
  if (S.ONB_SCROLL_REPORT_JS && opts.scrollReport !== false) after.push(S.ONB_SCROLL_REPORT_JS);
  if (opts.extra) after.push(opts.extra);
  const used = opts.only ? opts.only.map((k) => ({ dc: S.DC_PAGE_INJECT, page: after[1], scroll: S.ONB_SCROLL_REPORT_JS, extra: opts.extra })[k]).filter(Boolean) : after;
  if (used.length) await pg.evaluate(used.join('\n'));
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const res = await pg.evaluate((ms) => new Promise((done) => { const fr = []; let last = performance.now(); const t0 = last; (function f(t) { fr.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else done(fr.slice(1)); })(last); }), opts.ms || 6000);
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  await ctx.close();
  const janky = res.filter((d) => d > 33.4).length;
  return { page, frames: res.length, janky, worst: Math.round(Math.max(...res)), script: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), task: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), layout: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), recalc: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000) };
}
module.exports = { measure, loadScripts };
