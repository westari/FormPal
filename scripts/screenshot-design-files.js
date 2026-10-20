#!/usr/bin/env node
/**
 * scripts/screenshot-design-files.js
 *
 * Opens each Claude Design export in real headless Chromium (via
 * Playwright) and screenshots it, so the actual rendered appearance is
 * known instead of guessed from reading markup. The raw, still-packed
 * .html files are used directly here (not the unpacked versions) — they
 * self-extract via their own bundler script exactly like they do inside a
 * WebView, so this is also a decent proxy for "does it even render."
 *
 * Usage: node scripts/screenshot-design-files.js [optional-filename-filter]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'app screens');
const OUT_DIR = path.join(__dirname, '..', '.scratch', 'design-screenshots');

async function main() {
  const filter = process.argv[2];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.html'));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  const results = [];
  for (const f of files) {
    if (filter && !f.includes(filter)) continue;
    const full = path.join(SRC_DIR, f);
    try {
      await page.goto('file://' + full.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 20000 });
      // The bundler unpacks asynchronously (fonts, nested frames) — give
      // it real time to settle rather than screenshotting the loading
      // placeholder. 2.5s covers every file checked manually this session.
      await page.waitForTimeout(2500);
      const outPath = path.join(OUT_DIR, f.replace(/\.html$/, '.png'));
      await page.screenshot({ path: outPath });
      results.push(`${f}: OK -> .scratch/design-screenshots/${f.replace(/\.html$/, '.png')}`);
    } catch (e) {
      results.push(`${f}: FAILED (${e.message.split('\n')[0]})`);
    }
  }
  await browser.close();
  results.forEach(r => console.log(r));
  console.log(`\nDone. ${results.filter(r => r.includes('OK')).length}/${results.length} screenshotted into ${OUT_DIR}`);
}

main();
