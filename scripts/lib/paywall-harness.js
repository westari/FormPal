/**
 * scripts/lib/paywall-harness.js
 * Pulls the EXACT scripts the app injects into the trial reminder / paywall WebViews out of app/onboarding.tsx, so a test can run them in Chromium.
 */
require('./ts-node-loader.js')();
const fs = require('fs'); const path = require('path');
const { CUE_ORB_JS, CUE_ORB_CSS } = require('../../lib/cueOrb.ts');
const src = fs.readFileSync(process.env.PW_SRC || path.join(__dirname, '..', '..', 'app', 'onboarding.tsx'), 'utf8').split('\r\n').join('\n');
const a = src.indexOf('const DC_CTA_RE = '), b = src.indexOf('\n`;', src.indexOf('const DC_PAGE_INJECT = `')) + 3;
const DC = new Function(src.slice(a, b).replace(/^const /gm, 'var ') + '\nreturn DC_PAGE_INJECT;')();
function grab(name) { const i = src.indexOf('const ' + name + ' = `'); const j = src.indexOf('`;', i) + 2; return new Function('CUE_ORB_CSS', src.slice(i, j).replace(/^const /, 'var ') + '\nreturn ' + name + ';')(CUE_ORB_CSS); }
const sizes = [{ n: 'iPhone 15', w: 393, h: 852, top: 59 }, { n: 'iPhone 16', w: 402, h: 874, top: 62 }, { n: 'iPhone 15 Pro Max', w: 430, h: 932, top: 59 }, { n: 'iPhone 16 Pro Max', w: 440, h: 956, top: 62 }];
module.exports = { DC, TIDY: grab('PAYWALL_TIDY_JS'), EARLY: grab('PAYWALL_EARLY_JS'), TRIAL: grab('TRIAL_TIDY_JS'), PAUSE: src.includes('const ONB_PAUSE_JS = `') ? grab('ONB_PAUSE_JS') : '', CUE_ORB_JS, sizes };
