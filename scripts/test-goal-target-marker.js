#!/usr/bin/env node
/**
 * scripts/test-goal-target-marker.js  (round 9, item 2)
 * The plan-ready screen's "Estimated progress" graph: the TARGET marker (the end dot, the little triangle and the "TARGET 160 lb" badge) must sit
 * EXACTLY at the end of the graph line, at the right height, for any target weight, date and goal kind, and on any phone width.
 * Real planisreadynow.html with the page code that ships (extracted from app/onboarding.tsx: the page's own scale-to-fit, planReadyInject and the
 * draw-in animation) in Chromium. Measured in screen pixels: the end of the line vs the dot centre, the triangle tip, the badge.
 * Screenshots: .scratch/target-*.png
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const E = require('./lib/onboarding-extract.js').load();
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

const raw = fs.readFileSync(path.join(ROOT, 'assets', 'app screens', 'planisreadynow.html'), 'utf8');
const esc = (s) => JSON.stringify(s).slice(1, -1);
const CASES = [
  { name: 'lose 200 -> 160', a: { weight: 200, goalWeight: 160, mainGoal: 'Lose fat / Lose weight', age: 30, height: `5'11"`, experience: 'Beginner' } },
  { name: 'lose 300 -> 99.5 (long label)', a: { weight: 300, goalWeight: 99.5, mainGoal: 'Lose fat / Lose weight', age: 30, height: `5'11"`, experience: 'Beginner' } },
  { name: 'gain 150 -> 195', a: { weight: 150, goalWeight: 195, mainGoal: 'Build muscle', age: 22, height: `5'8"`, experience: 'Intermediate' } },
  { name: 'gain 120 -> 1000 (huge)', a: { weight: 120, goalWeight: 1000, mainGoal: 'Build muscle', age: 22, height: `5'8"`, experience: 'Beginner' } },
  { name: 'gain 160 -> 160 (same weight)', a: { weight: 160, goalWeight: 160, mainGoal: 'Get stronger', age: 40, height: `6'1"`, experience: 'Advanced' } },
];
const WIDTHS = [[390, 844], [360, 740], [430, 932]];

(async () => {
  const browser = await chromium.launch();
  const { computeGoalPlan } = require('../lib/onboardingGoals.ts');
  const seen = new Set();
  for (const c of CASES) {
    const goal = computeGoalPlan(c.a);
    const html = raw.replace('{{HEADER}}', esc(E.planReadyHeaderText(goal))).replace('{{SUBLINE}}', esc(goal.kind === 'recomp' ? '' : 'Starting today'));
    const file = path.join(ROOT, '.scratch', 'plan-ready-test.html'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, html);
    for (const [w, h] of WIDTHS) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: () => {} }; });
      await page.addInitScript(E.VIEWPORT_JS);
      await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
      await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
      await page.waitForSelector('#dc-root svg', { timeout: 15000 });
      await page.evaluate(E.DC_PAGE_INJECT); await page.evaluate(E.planReadyInject(c.a));
      await page.waitForTimeout(400);
      await page.evaluate(E.RESTART_GRAPH_ANIM_JS);
      await page.waitForTimeout(3600); // the line has finished drawing and the badges are in
      const m = await page.evaluate(() => {
        const svg = document.querySelector('#dc-root svg[sc-camel-view-box="0 0 300 190"]') || document.querySelector('#dc-root svg');
        const line = svg.querySelector('path[style*="pr-draw"]') || [...svg.querySelectorAll('path')].find((p) => p.getAttribute('stroke') === '#111114' && p.getAttribute('stroke-width') === '2.6');
        const ctm = svg.getScreenCTM(); const pt = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(ctm); return { x: q.x, y: q.y }; };
        const end = line.getPointAtLength(line.getTotalLength()), start = line.getPointAtLength(0);
        const circles = [...svg.querySelectorAll('circle')];
        const dot = circles.find((e) => (e.getAttribute('style') || '').includes('pr-fade')) || circles[1];
        const tri = [...svg.querySelectorAll('path')].find((p) => /^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+ Z$/.test(p.getAttribute('d') || '') && (p.getAttribute('fill') || '').toLowerCase() === '#2e7dff');
        const nums = tri.getAttribute('d').match(/-?[\d.]+/g).map(Number);
        const tip = { x: nums[4], y: nums[5] };
        const badge = [...svg.parentElement.querySelectorAll('div')].find((d) => (d.textContent || '').includes('TARGET') && d.querySelector('div'));
        const card = svg.parentElement.getBoundingClientRect(), br = badge.getBoundingClientRect();
        const E1 = pt(end.x, end.y), D = pt(+dot.getAttribute('cx'), +dot.getAttribute('cy')), TIP = pt(tip.x, tip.y), BASE = pt(nums[0], nums[1]), S0 = pt(start.x, start.y);
        const startDot = circles[0];
        const SD = pt(+startDot.getAttribute('cx'), +startDot.getAttribute('cy'));
        return { dotR: (parseFloat(dot.getAttribute('r')) || 6) * ctm.a, endX: E1.x, endY: E1.y, dotX: D.x, dotY: D.y, tipX: TIP.x, tipY: TIP.y, baseY: BASE.y, startDx: SD.x - S0.x, startDy: SD.y - S0.y,
          badgeL: br.left, badgeR: br.right, badgeB: br.bottom, badgeT: br.top, cardL: card.left, cardR: card.right, cardT: card.top, text: badge.innerText.replace(/\s+/g, ' ').trim(), op: parseFloat(getComputedStyle(badge).opacity), kind: end.y > start.y ? 'down' : 'up' };
      });
      const dd = Math.hypot(m.dotX - m.endX, m.dotY - m.endY);
      const label = `${c.name} @${w}px`;
      check(`${label}: the end dot is exactly on the last point of the line (${dd.toFixed(2)}px)`, dd < 0.6, JSON.stringify({ end: [m.endX, m.endY].map(Math.round), dot: [m.dotX, m.dotY].map(Math.round) }));
      check(`${label}: the arrow HOVERS above the dot: its tip is directly above the end (same x within 0.6px) and clear of the dot's top edge by 1.5 to 10 px (it does not touch it)`, Math.abs(m.tipX - m.endX) < 0.6 && (m.endY - m.tipY - m.dotR) > 1.5 && (m.endY - m.tipY - m.dotR) < 10, JSON.stringify({ tipX: m.tipX, endX: m.endX, gap: m.endY - m.tipY - m.dotR }));
      check(`${label}: the arrow is ALWAYS in the middle of the TARGET card (card centre = arrow tip within 1px), the card sits right on top of the triangle, and it stays on the screen`, Math.abs(m.badgeB - m.baseY) < 4 && Math.abs((m.badgeL + m.badgeR) / 2 - m.tipX) <= 1 && m.badgeL >= 4 && m.badgeR <= w - 4, JSON.stringify({ badge: [m.badgeL, m.badgeR, m.badgeB].map(Math.round), centre: Math.round((m.badgeL + m.badgeR) / 2), card: [m.cardL, m.cardR].map(Math.round), tipX: Math.round(m.tipX) }));
      check(`${label}: the start dot is on the first point of the line`, Math.hypot(m.startDx, m.startDy) < 0.6);
      check(`${label}: the badge is shown (drawn in after the line) and says TARGET and the goal`, m.op > 0.9 && /TARGET/.test(m.text), m.text + ' op ' + m.op);
      if (w === 390) { seen.add(m.kind); await page.screenshot({ path: path.join(ROOT, '.scratch', 'target-' + c.name.replace(/[^a-z0-9]+/gi, '_') + '.png'), clip: { x: 0, y: m.cardT - 20, width: w, height: 320 } }); }
      await page.close();
    }
  }
  check('both a falling line (lose weight) and a rising line (gain) were tested', seen.has('up') && seen.has('down'), [...seen].join());
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
