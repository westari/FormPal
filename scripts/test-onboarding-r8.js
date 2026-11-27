#!/usr/bin/env node
/**
 * scripts/test-onboarding-r8.js  (round 8, item 8)
 *  - the back button next to the progress bar is the app's standard Liquid Glass back button on every onboarding screen
 *  - the "Don't miss a session" notification screen is gone (Connect Health goes straight to the ready-to-build beat)
 *  - "We want you to try FormPal for free"
 *  - the progress bar + back button scroll away with the page (native steps: inside the ScrollView; web pages: they follow the page's scroll)
 * Native screens are checked as source order (React Native cannot run under node); the page-side scroll reporter runs in Chromium.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const ob = read('app/onboarding.tsx');
const comps = ['RankRevealScreen', 'RankWheelScreen', 'SaveProgressScreen', 'StrengthAssessmentScreen', 'TryForFreeScreen'].map((n) => [n, read('components/onboarding/' + n + '.tsx')]);

// ── back button ──
check('every onboarding back button is the standard glass back button (OnbBackButton -> GlassBackButton -> LiquidGlassButton): question header, simple header, web screens, dark hero', (ob.match(/<OnbBackButton /g) || []).length >= 4 && /<OnbBackButton onPress=\{goBack\} \/>/.test(ob) && /<OnbBackButton onPress=\{onBack\} \/>/.test(ob) && /scheme=\{isDcPage \? 'light' : 'dark'\}/.test(ob) && /<OnbBackButton onPress=\{goBack\} scheme="dark" \/>/.test(ob));
check('and in the onboarding screens (rank reveal, rank wheel, save progress, strength); NOT in Try for free: from building the plan onward there is no back button (round 10)', comps.every(([n, t]) => (n === 'TryForFreeScreen' ? !/<OnbBackButton /.test(t) : /<OnbBackButton /.test(t))), comps.map(([n, t]) => n + ':' + (t.match(/<OnbBackButton /g) || []).length).join(' '));
check('no old hand-made back button is left (no chevron.left drawn inside a LiquidGlassButton in any onboarding screen)', !/<LiquidGlassButton[^>]*>\s*<SymbolView name="chevron\.left"/.test(ob) && comps.every(([n, t]) => !/<LiquidGlassButton[^>]*>\s*<SymbolView name="chevron\.left"/.test(t)));
const ob1 = read('components/onboarding/OnbBackButton.tsx');
check('OnbBackButton is the GlassBackButton (the standard real glass look) in a 34 x 34 box (so the progress bar and everything below stay exactly where they were)', ob1.includes("import GlassBackButton from '../GlassBackButton'") && /ONB_BACK_BOX = 34/.test(ob1) && ob1.includes('<GlassBackButton onPress={onPress} scheme="standard"'));
check('the paywall / gift X close buttons are left alone (they are not back buttons)', /name="xmark" size=\{14\}/.test(ob));

// ── notifications screen ──
check('the "Don\'t miss a session" notification screen is gone: no such text, no \'notifications\' state, not in the progress flow', !/Don't miss a session/.test(ob) && !/appState === 'notifications'/.test(ob) && !/setAppState\('notifications'\)/.test(ob) && !/'connectHealth' \| 'notifications'/.test(ob) && !/'connectHealth', 'notifications'/.test(ob));
check('Connect Health goes straight to the ready-to-build beat and Back from there returns to Connect Health', /onPress=\{\(\) => setAppState\('readyToBuild'\)\}[^>]*>\s*<Text style=\{s\.ct\}>Continue/.test(ob) && /onBackReadyToBuild=\{\(\) => setAppState\('connectHealth'\)\}/.test(ob) && !/onBackReadyToBuild=\{\(\) => setAppState\('notifications'\)\}/.test(ob));
const ch = ob.slice(ob.indexOf("if (appState === 'connectHealth') {"), ob.indexOf("if (appState === 'connectHealth') {") + 2200);
check('the ready-to-build page is still prewarmed one screen early (the prewarm pool now sits on Connect Health, and its trigger is connectHealth)', /<ShadowPrewarmPool/.test(ch) && /appState === 'connectHealth'\) \{ next\.readyToBuild = true/.test(ob));

// ── wording ──
const tf = read('components/onboarding/TryForFreeScreen.tsx');
check('"Try FormPal for free" is now "We want you to try FormPal for free"', /<Text style=\{s\.h1\}>We want you to try FormPal for free<\/Text>/.test(tf) && !/<Text style=\{s\.h1\}>Try FormPal for free<\/Text>/.test(tf));

// ── scrolls away: native steps ──
const sel = ob.slice(ob.indexOf("const isTrainTime = st.id === 'trainTime';"), ob.indexOf("const isTrainTime = st.id === 'trainTime';") + 1600);
check('native question steps: the back button + progress bar + question are INSIDE the scroll view (first thing in it), so they scroll away with the options', /<ScrollView[\s\S]{0,260}>\s*\{header\}\s*<Animated\.View style=\{\{ flexGrow: 1, opacity: fadeAnim/.test(sel) && !/\{header\}\s*<Animated\.View style=\{\{ flex: 1, opacity: fadeAnim, transform: \[\{ translateX: slideAnim \}\] \}\}>\s*<View style=\{s\.qBlock\}>[\s\S]{0,200}<ScrollView/.test(sel));
check('the Continue button stays at the bottom (outside the scroll), as before', /<\/ScrollView>\s*<View style=\{s\.bn\}>/.test(ob));

// ── scrolls away: web pages ──
check('web screens (2026-11-27): the header does not follow the page scroll and has no animated opacity (real glass): the back button is native glass in a sibling header, FIXED in place (never hidden by a scroll), the bar is part of the page', ob.includes('testID="onb-header"') && !ob.includes('translateY: headerY') && ob.includes('(noHeader || !headerOn) ? null : (') && !/m\.indexOf\('onbscroll:'\)/.test(ob));
check('no page sends scroll messages any more (so a scroll can never advance the screen or buzz)', !ob.includes("m.indexOf('onbscroll:')") && !/\+ ONB_SCROLL_REPORT_JS/.test(ob));

(async () => {
  const code = /const ONB_SCROLL_REPORT_JS = `([\s\S]*?)`;\n/.exec(ob);
  check('the page-side scroll reporter is found in the source', !!code);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const msgs = []; await page.exposeFunction('__post', (m) => msgs.push(m));
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (m) => window.__post(m) }; });
  await page.setContent('<html><body style="margin:0"><div style="height:2400px;background:linear-gradient(#fff,#ccc)">tall page</div><div id="small" style="position:fixed;top:0;left:0;width:100px;height:100px;overflow:auto"><div style="height:500px">x</div></div></body></html>');
  await page.evaluate(() => { window.ReactNativeWebView = { postMessage: (m) => window.__post(m) }; });
  await page.evaluate(code[1]);
  await page.evaluate(() => window.scrollTo(0, 120)); await page.waitForTimeout(150);
  await page.evaluate(() => window.scrollTo(0, 300)); await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('small').scrollTop = 80; }); await page.waitForTimeout(150);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
  console.log('      messages:', JSON.stringify(msgs));
  check('the page reports its scroll: 120, then 300, then back to 0 (one message per change)', JSON.stringify(msgs.filter((m) => /^onbscroll:/.test(m))) === JSON.stringify(['onbscroll:120', 'onbscroll:300', 'onbscroll:0']));
  check('a small inner scroller (a picker, a list box) is ignored: it never moves the header', !msgs.some((m) => m === 'onbscroll:80'));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
