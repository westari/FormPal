#!/usr/bin/env node
/**
 * scripts/test-guide-pill-one-line.js  (Ari 2026-11-27: "Short Guide lines must fit on ONE line in the pill." Then, later that day: "I do NOT like the wide pill.
 * Put it back to the smaller, square-ish size. Every Guide line must be 3 words or fewer.")
 * Measures every Guide line at the pill's real text style (17 pt, regular) in Chromium and checks it fits the pill's text room on ONE line on six iPhone sizes,
 * at the old pill width (BEFORE: 240) and the new one. Windows has no SF Pro, so Arial is measured and 8% is added (SF Pro Text is a little wider than Arial).
 * Also: the wording changes (Move back, Turn your side to the camera).
 */
require('./lib/ts-node-loader.js')();
const fs = require('fs'); const path = require('path');
const L = require('../lib/cameraHudLayout.ts');
const GC = require('../lib/guideCoach.ts');
const SG = require('../lib/setupGuide.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
const PHONES = [[375, 667, 20], [375, 812, 50], [393, 852, 59], [402, 874, 62], [430, 932, 59], [440, 956, 62]];
// the pill's text room: pill width - 2 x 18 padding - the 22 pt Cue stars - the 8 pt gap (app/formcheck.tsx s.pillInner / s.pillStars / s.pillGuideRow)
const pad = /pillInner:\s*\{[^}]*paddingHorizontal: (\d+)/.exec(fc), stars = /pillStars:\s*\{ width: (\d+)/.exec(fc), gap = /pillGuideRow: \{[^}]*gap: (\d+)/.exec(fc), size = /pillGuide:\s*\{[^}]*fontSize: (\d+)/.exec(fc);
check('the pill text style is read from the screen itself (padding, stars, gap, 17 pt)', pad && stars && gap && size && +size[1] === 17, JSON.stringify([pad && pad[1], stars && stars[1], gap && gap[1], size && size[1]]));
const room = (pillW) => pillW - 2 * +pad[1] - +stars[1] - +gap[1];

(async () => {
  const { chromium } = require('playwright');
  const br = await chromium.launch(); const pg = await br.newPage();
  const lines = GC.GUIDE_WORDS.filter((l, i, a) => a.indexOf(l) === i);
  const widths = await pg.evaluate(({ lines, px }) => { const c = document.createElement('canvas').getContext('2d'); c.font = `400 ${px}px Arial`; return lines.map((l) => c.measureText(l).width); }, { lines, px: +size[1] });
  await br.close();
  const est = lines.map((l, i) => ({ l, w: Math.ceil(widths[i] * 1.08), words: l.split(/\s+/).length }));
  console.log('  Guide lines (estimated SF width): ' + est.map((x) => `"${x.l}" ${x.w}`).join(', '));
  const longest = est.reduce((a, b) => (b.w > a.w ? b : a));
  check('EVERY Guide line is 3 words or fewer', est.every((x) => x.words <= 3), est.filter((x) => x.words > 3).map((x) => x.l).join(' / '));
  check('the pill is back to its small size (240 pt wide, 313 on the smallest iPhones it was already 240)', L.HUD_PILL_WIDTH === 240);
  for (const [w, h, top] of PHONES) {
    const l = L.hudLayout({ width: w, height: h, insetTop: top, peekHeight: 56, solo: true });
    const over = est.filter((x) => x.w > room(l.pill.width));
    check(`${w}x${h}: every Guide line fits on ONE line (pill ${l.pill.width}, text room ${room(l.pill.width)}, longest "${longest.l}" ${longest.w})`, over.length === 0, over.map((x) => x.l + ' ' + x.w).join(', '));
  }
  check('the pill text is ONE line, and only shrinks a little (to 80%) if a phone draws the text bigger than measured here', fc.includes('<Text style={s.pillGuide} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>'));
  console.log('--- the words ---');
  check('the long lines are rewritten: "Turn sideways", "Hands in view", "Body in view", "Move phone back"', GC.GUIDE_LINES.sideways === 'Turn sideways' && GC.GUIDE_LINES.handsInView === 'Hands in view' && GC.GUIDE_LINES.bodyInView === 'Body in view' && GC.GUIDE_LINES.phoneBack === 'Move phone back' && ['Turn sideways', 'Hands in view', 'Body in view', 'Move phone back'].every((l) => !!GC.GUIDE_EVIDENCE[l]));
  check('every Guide line has its evidence entry', GC.GUIDE_WORDS.filter((l) => !['Ready. Go!'].includes(l)).every((l) => !!GC.GUIDE_EVIDENCE[l]), GC.GUIDE_WORDS.filter((l) => !GC.GUIDE_EVIDENCE[l]).join(', '));
  const sg = SG.createSetupGuide().update({ now: 0, healthy: false, seen: false, frameHint: true, hintLine: GC.GUIDE_LINES.intoPicture, handsExercise: true });
  check('setting up, Vision finds no body (he is at the phone, too close): "Move back", not "Step into view"', sg.text === 'Move back', sg.text);
  check('during the set, a person who WAS seen and is lost (too close): "Move back"', GC.GUIDE_LINES.backUp === 'Move back' && !!GC.GUIDE_EVIDENCE['Move back']);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
