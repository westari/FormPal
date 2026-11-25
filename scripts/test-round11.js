#!/usr/bin/env node
/**
 * scripts/test-round11.js
 * Round 11 items that are code-order / data checks:
 *  7. the onboarding rank wheel draws every shield at its own proportions (Bronze square, Champion taller), and each rank shows its own picture
 *  8. the Save your progress screen uses the real FormPal logo file (extracted from Ari's formpallogo.html), no drawn placeholder
 *  4. exclamation marks on two titles
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const png = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length, colorType: b[25] }; };

// ── 7 ──
const { fitInBox } = require('../lib/fitInBox.ts');
const BOX_W = 210 * 0.98, BOX_H = 300 * 0.96;
const names = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion'];
const sizes = names.map((n) => ({ n, ...png('assets/ranks/' + n + '.png') }));
const fits = sizes.map((p) => ({ n: p.n, ...fitInBox(p.w, p.h, BOX_W, BOX_H), aspect: p.w / p.h }));
console.log('      ', fits.map((f) => `${f.n} ${f.width}x${f.height}`).join(', '));
check('every shield keeps ITS OWN shape when fitted in the wheel box: width / height equals the picture\'s own proportion (within 1%)', fits.every((f) => Math.abs(f.width / f.height - f.aspect) / f.aspect < 0.01), JSON.stringify(fits));
check('Bronze is square (320 x 320), so it is drawn square, not stretched to the tall box; Champion (226 x 320, with its crown) is drawn tall', fits[0].width === fits[0].height && fits[6].height > fits[6].width && fits[6].width !== fits[0].width, JSON.stringify([fits[0], fits[6]]));
check('all shields fit inside the box', fits.every((f) => f.width <= BOX_W + 1 && f.height <= BOX_H + 1));
const rw = read('components/onboarding/RankWheelScreen.tsx');
check('the wheel draws each shield at its worked-out size (not one fixed width and height for all), with resizeMode in the style as well as the prop', /SHIELD_SIZES = RANKS\.map/.test(rw) && /Image\.resolveAssetSource\(r\.img\)/.test(rw) && /style=\{\[s\.shield, SHIELD_SIZES\[i\], \{ resizeMode: 'contain' \} as any\]\}/.test(rw) && !/shield: \{\s*width: ITEM_W \* 0\.98/.test(rw));
const rankRows = [...rw.matchAll(/\{ name: '(\w+)',[^}]*img: require\('\.\.\/\.\.\/assets\/ranks\/(\w+)\.png'\)/g)].map((m) => [m[1].toLowerCase(), m[2]]);
check('each rank name shows its OWN picture file (Bronze -> bronze.png ... Champion -> champion.png), Bronze first', rankRows.length === 7 && rankRows.every(([a, b]) => a === b) && rankRows[0][0] === 'bronze', JSON.stringify(rankRows));
check('each shield is its own view with its own key and a test id, and the wheel opens at the start (Bronze in the middle)', /key=\{r\.name\}/.test(rw) && /testID=\{'rank-shield-' \+ r\.name\}/.test(rw) && /contentOffset=\{\{ x: 0, y: 0 \}\}/.test(rw));

// ── 8 ──
const logo = png('assets/images/formpal-logo.png');
check('the REAL FormPal logo file is in the project (white viewfinder corners + the person with dumbbells, transparent background, 1012 x 1012), made from Ari\'s own formpallogo.html', logo.w === 1012 && logo.h === 1012 && logo.colorType === 6 && logo.bytes > 20000, JSON.stringify(logo));
const fl = read('components/onboarding/FormPalLogo.tsx');
check('the logo component shows that file and nothing drawn: no wordmark text, no drawn disc', /require\('\.\.\/\.\.\/assets\/images\/formpal-logo\.png'\)/.test(fl) && !/<Svg|<Circle|<Text/.test(fl));
const sp = read('components/onboarding/SaveProgressScreen.tsx');
check('the Save your progress screen: gym background (not space), the real logo, Apple logo 26 (was 18), no back button except on the e-mail form', /import GymBackground/.test(sp) && !/SpaceBackground/.test(sp) && /<FormPalLogo size=\{132\}/.test(sp) && /name="apple\.logo" size=\{26\}/.test(sp) && /\{emailMode \? <OnbBackButton/.test(sp) && (sp.match(/<OnbBackButton/g) || []).length === 1);
// ── 4 ──
const I = require('../lib/doneInfo.ts');
check('the done screen titles: "Form check complete!" and "Weight logged!" carry the exclamation mark', I.DONE_TITLES.formCheck === 'Form check complete!' && I.DONE_TITLES.weight === 'Weight logged!');
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
