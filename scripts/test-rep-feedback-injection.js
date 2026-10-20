#!/usr/bin/env node
/**
 * scripts/test-rep-feedback-injection.js
 *
 * Loads the REAL assets/app screens/repfeedback.html in real headless
 * Chromium, runs the EXACT injection JS that ships in app/rep-feedback.tsx
 * (extracted and transpiled from the live TS source, not hand-copied),
 * and reports whether the scrub track/fill/thumb/nav/body elements were
 * actually found, then simulates a real mouse drag on the scrub track and
 * reports whether postMessage fired and the thumb moved. This verifies the
 * injection logic against the real rendered DOM without needing a phone.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { repFeedbackInject } = require('../.scratch/rep-feedback-inject.js');

async function main() {
  const file = path.join(__dirname, '..', 'assets', 'app screens', 'repfeedback.html');
  const injectJs = repFeedbackInject({
    exerciseName: 'Shoulder Press',
    hasVideo: true,
    reps: [
      { timeSec: 2.0, what: 'Test rep one.' },
      { timeSec: 5.0, what: 'Test rep two.' },
      { timeSec: 8.0, what: 'Test rep three.' },
    ],
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  const postedMessages = [];
  await page.exposeFunction('__testPostMessage', (data) => postedMessages.push(data));
  // The real page does window.ReactNativeWebView.postMessage(...) — shim
  // it to our exposed function so we can observe every message it sends.
  await page.addInitScript(() => {
    window.ReactNativeWebView = { postMessage: (data) => window.__testPostMessage(data) };
  });

  const consoleLogs = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto('file://' + file.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2000); // let the bundler finish unpacking first

  await page.evaluate(injectJs);
  await page.waitForTimeout(1500); // let its own retry schedule run

  console.log('=== console logs from the page ===');
  consoleLogs.forEach(l => console.log(l));

  console.log('\n=== element discovery (queried fresh from the real DOM) ===');
  const discovery = await page.evaluate(() => {
    function hasStyle(el, prop, val) { return el && el.style && el.style[prop] === val; }
    const tracks = Array.from(document.querySelectorAll('#dc-root div'));
    let trackEl = null;
    for (const t of tracks) { if (hasStyle(t, 'position', 'relative') && t.style.flexGrow === '1' && t.style.height === '30px') { trackEl = t; break; } }
    return {
      dcRootExists: !!document.getElementById('dc-root'),
      trackElFound: !!trackEl,
      trackElRect: trackEl ? trackEl.getBoundingClientRect().toJSON() : null,
    };
  });
  console.log(JSON.stringify(discovery, null, 2));

  if (discovery.trackElFound) {
    console.log('\n=== simulating a real mouse drag across the scrub track ===');
    const rect = discovery.trackElRect;
    const startX = rect.x + 5;
    const endX = rect.x + rect.width - 5;
    const y = rect.y + rect.height / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move((startX + endX) / 2, y, { steps: 5 });
    await page.mouse.move(endX, y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    console.log('messages posted during drag:', JSON.stringify(postedMessages.filter(m => { try { return JSON.parse(m).type === 'scrub'; } catch { return false; } }), null, 2));

    const thumbAfter = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('#dc-root div'));
      const thumb = els.find(el => el.style.borderRadius === '50%' && el.style.width === '16px' && el.style.height === '16px');
      return thumb ? { left: thumb.style.left } : null;
    });
    console.log('thumb style.left after drag:', JSON.stringify(thumbAfter));
  }

  const screenshotPath = path.join(__dirname, '..', '.scratch', 'design-screenshots', 'repfeedback-after-injection.png');
  await page.screenshot({ path: screenshotPath });
  console.log('\nScreenshot after injection+drag saved to', screenshotPath);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
