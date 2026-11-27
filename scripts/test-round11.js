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
check('round 12: the wheel AND the rank reveal reel draw every shield through one component (RankShield) that sizes it from the picture itself, with no animation or filter on the image (nothing can stretch it after a tap or a re-render)', /<RankShield key=\{r\.name\} src=\{r\.img\} boxW=\{SHIELD_BOX_W\} boxH=\{SHIELD_BOX_H\}/.test(rw) && !/Animated\.Image/.test(rw) && !/filter:/.test(rw) && /<RankShield src=\{r\.img\} boxW=\{76\} boxH=\{76\}/.test(read('components/onboarding/RankRevealScreen.tsx')) && !/Animated\.Image/.test(read('components/onboarding/RankRevealScreen.tsx')));
const sh = read('components/onboarding/RankShield.tsx');
check('round 12: RankShield gives the view the fitted size (fitInBox from the real pixel size) and the plain Image fills it with contain', /fitInBox\(a\?\.width \?\? 320, a\?\.height \?\? 320, boxW, boxH\)/.test(sh) && /<Image source=\{src\} resizeMode="contain"/.test(sh) && !/Animated/.test(sh));
const reel = ['bronze', 'champion'].map((n) => ({ n, ...fitInBox(png('assets/ranks/' + n + '.png').w, png('assets/ranks/' + n + '.png').h, 76, 76) }));
check('round 12: in the reel (a 76 x 76 box) Bronze is 76 x 76 and Champion keeps its shape (54 x 76), not squished into a square', reel[0].width === 76 && reel[0].height === 76 && reel[1].height === 76 && reel[1].width === 54, JSON.stringify(reel));
const rankRows = [...rw.matchAll(/\{ name: '(\w+)',[^}]*img: require\('\.\.\/\.\.\/assets\/ranks\/(\w+)\.png'\)/g)].map((m) => [m[1].toLowerCase(), m[2]]);
check('each rank name shows its OWN picture file (Bronze -> bronze.png ... Champion -> champion.png), Bronze first', rankRows.length === 7 && rankRows.every(([a, b]) => a === b) && rankRows[0][0] === 'bronze', JSON.stringify(rankRows));
check('each shield is its own view with its own key and a test id, and the wheel opens at the start (Bronze in the middle)', /key=\{r\.name\}/.test(rw) && /testID=\{'rank-shield-' \+ r\.name\}/.test(rw) && /contentOffset=\{\{ x: 0, y: 0 \}\}/.test(rw));

// ── 8 ──
const logo = png('assets/images/formpal-logo.png');
check('the REAL FormPal logo file is in the project (white viewfinder corners + the person with dumbbells, transparent background, 1012 x 1012), made from Ari\'s own formpallogo.html', logo.w === 1012 && logo.h === 1012 && logo.colorType === 6 && logo.bytes > 20000, JSON.stringify(logo));
const fl = read('components/onboarding/FormPalLogo.tsx');
check('the logo component shows that file and nothing drawn: no wordmark text, no drawn disc', /require\('\.\.\/\.\.\/assets\/images\/formpal-logo\.png'\)/.test(fl) && !/<Svg|<Circle|<Text/.test(fl));
const sp = read('components/onboarding/SaveProgressScreen.tsx');
check('the Save your progress screen: plain gradient background (round 12), the real logo, Apple logo 26 (was 18), no back button except on the e-mail form', /LinearGradient/.test(sp) && !/SpaceBackground|GymBackground/.test(sp) && /<FormPalLogo size=\{132\}/.test(sp) && /name="apple\.logo" size=\{26\}/.test(sp) && /\{emailMode \? <OnbBackButton/.test(sp) && (sp.match(/<OnbBackButton/g) || []).length === 1);
// ── 4 ──
const I = require('../lib/doneInfo.ts');
check('the done screen titles: "Form check complete!" and "Weight logged!" carry the exclamation mark', I.DONE_TITLES.formCheck === 'Form check complete!' && I.DONE_TITLES.weight === 'Weight logged!');
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
