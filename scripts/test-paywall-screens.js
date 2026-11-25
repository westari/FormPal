#!/usr/bin/env node
/**
 * scripts/test-paywall-screens.js
 *
 * Ari 2026-11-22: the trial reminder ("We'll remind you before your trial ends") and the paywall were glitched on his phone, and the paywall had an X where a back
 * button belongs. Rendered here in real Chromium with the EXACT injected script the app ships (DC_PAGE_INJECT, taken from app/onboarding.tsx) at iPhone 15, 16,
 * 15 Pro Max and 16 Pro Max sizes.
 *
 * Causes found by rendering them:
 *   - the injected perf rules switched off every CSS mask and backdrop blur. The trial reminder's phone mock FADES OUT through a mask (without it the phone runs
 *     down under the "Remind me 2 days / 1 day before" rows), and the paywall's plan-card rim is a MASKED gradient (without the mask the whole card turned into a
 *     grey gradient under dark text).
 *   - the paywall's own round X chip stayed on screen under the native X (two X buttons).
 *   - when the artboard is scaled to fit, a pale strip showed down both sides.
 */
require('./lib/ts-node-loader.js')();
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'onboarding.tsx'), 'utf8').split('\r\n').join('\n');

// ── static ──
const a0 = src.indexOf("{(htmlKey === 'paywall' || htmlKey === 'giftOffer') ? (");
const a1 = src.indexOf('// Same top offset the native question header', a0);
const block = src.slice(a0, a1);
check('paywall and gift offer: the back control is the standard glass back button (GlassBackButton), at the same top as every other page', a0 > 0 && block.includes('<GlassBackButton') && block.includes('top: topInset + 12') && src.includes("import GlassBackButton from '../components/GlassBackButton';"));
check('paywall and gift offer: NO X (xmark) any more in that block', !/xmark/.test(block));
check('the header scrolls with the page too (Window A: headerY / ONB_SCROLL_REPORT_JS) and both injections are on the WebView', src.includes('translateY: headerY') && src.includes("' + ONB_SCROLL_REPORT_JS}") && src.includes('KEEP_FX_JS + ') && src.includes('<OnbBackButton'));
check('the paywall keeps its Restore', block.includes('Restore'));
check('the three pages keep their masks and blur (KEEP_FX_KEYS), set before the page loads', /KEEP_FX_KEYS: string\[\] = \['trialTimeline', 'paywall', 'giftOffer'\]/.test(src) && src.includes("(KEEP_FX_KEYS.includes(htmlKey) ? KEEP_FX_JS + '\\n' : '')") && src.includes("(window.__dcKeepFx ? '' : '[style*=\"mask-image\"]"));

// ── rendered ──
const a = src.indexOf('const DC_CTA_RE = '), b = src.indexOf('\n`;', src.indexOf('const DC_PAGE_INJECT = `')) + 3;
const DC = new Function(src.slice(a, b).replace(/^const /gm, 'var ') + '\nreturn DC_PAGE_INJECT;')();
const TIDY = require('./lib/paywall-harness.js').TIDY;
const sizes = [{ n: 'iPhone 15', w: 393, h: 852, top: 59 }, { n: 'iPhone 16', w: 402, h: 874, top: 62 }, { n: 'iPhone 15 Pro Max', w: 430, h: 932, top: 59 }, { n: 'iPhone 16 Pro Max', w: 440, h: 956, top: 62 }];

async function open(br, file, s, keepFx) {
  const ctx = await br.newContext({ viewport: { width: s.w, height: s.h - s.top }, deviceScaleFactor: 1 }); const p = await ctx.newPage();
  await p.addInitScript('window.ReactNativeWebView={postMessage:function(m){}};window.__dcFitBoth=1;' + (keepFx ? 'window.__dcKeepFx=1;' : ''));
  await p.goto('file://' + path.resolve(__dirname, '..', 'assets', 'app screens', file + '.html').split(path.sep).join('/'));
  await p.waitForTimeout(1500); await p.evaluate(DC); return { p, ctx };
}

(async () => {
  const br = await chromium.launch();
  for (const s of sizes) {
    // BEFORE (the old injection, no keep flag) vs AFTER, trial reminder
    const before = await open(br, 'trialreminder', s, false); await before.p.waitForTimeout(2000);
    const phoneMaskBefore = await before.p.evaluate(() => { const e = Array.from(document.querySelectorAll('#dc-root div')).find((d) => (d.getAttribute('style') || '').includes('width: 300px') && (d.getAttribute('style') || '').includes('height: 470px')); return getComputedStyle(e).webkitMaskImage || getComputedStyle(e).maskImage; });
    await before.ctx.close();
    const after = await open(br, 'trialreminder', s, true); await after.p.waitForTimeout(2000);
    const r = await after.p.evaluate(() => {
      const phone = Array.from(document.querySelectorAll('#dc-root div')).find((d) => (d.getAttribute('style') || '').includes('width: 300px') && (d.getAttribute('style') || '').includes('height: 470px'));
      const mask = getComputedStyle(phone).webkitMaskImage || getComputedStyle(phone).maskImage;
      const pb = phone.getBoundingClientRect();
      const rows = Array.from(document.querySelectorAll('#dc-root span')).filter((d) => Array.from(d.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').includes('Remind me')));
      const first = rows[0].getBoundingClientRect();
      // the phone is fully faded (transparent) from 81% of its height down: that is where the rows may start
      const fadeEnd = pb.top + pb.height * 0.81;
      return { mask, rowsFound: rows.length, firstRowTop: Math.round(first.top), phoneBottom: Math.round(pb.bottom), fadeEnd: Math.round(fadeEnd) };
    });
    check(`${s.n} trial reminder: BEFORE the old rules removed the phone's fade mask (the overlap)`, phoneMaskBefore === 'none', phoneMaskBefore);
    check(`${s.n} trial reminder: AFTER the phone keeps its fade mask`, r.mask && r.mask !== 'none', r.mask);
    check(`${s.n} trial reminder: the "Remind me" rows start below where the phone has faded out completely (${r.firstRowTop} >= ${r.fadeEnd})`, r.rowsFound === 2 && r.firstRowTop >= r.fadeEnd, JSON.stringify(r));
    await after.ctx.close();

    const pw = await open(br, 'paywallv2', s, true); await pw.p.evaluate(TIDY); await pw.p.waitForTimeout(2000);
    const q = await pw.p.evaluate(() => {
      const rim = Array.from(document.querySelectorAll('#dc-root div')).find((d) => /mask/.test(d.getAttribute('style') || '') && /pointer-events: none/.test(d.getAttribute('style') || ''));
      const close = document.querySelector('#dc-root a[aria-label="Close"]');
      const bgHtml = document.documentElement.style.background;
      return { rimMask: rim ? (getComputedStyle(rim).webkitMaskImage || getComputedStyle(rim).maskImage) : null, closeVisibility: close ? getComputedStyle(close).visibility : 'missing', htmlBg: !!bgHtml };
    });
    check(`${s.n} paywall: the plan-card rim keeps its mask (the card stays white inside a ring, not a grey block)`, q.rimMask !== null && q.rimMask !== 'none', JSON.stringify(q));
    check(`${s.n} paywall: the design's own X chip is hidden (only the native glass back button is left)`, q.closeVisibility === 'hidden', JSON.stringify(q));
    check(`${s.n} paywall: the page colour continues behind the artboard (no pale strips)`, q.htmlBg, JSON.stringify(q));
    await pw.ctx.close();
  }
  await br.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
