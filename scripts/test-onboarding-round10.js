#!/usr/bin/env node
/**
 * scripts/test-onboarding-round10.js  (Ari 2026-11-25)
 *   - "Your info" on the plan-ready page shows ONLY what he answered. A skipped answer is blank: never the design's sample values (195 lb, 184 lb, 5'11", 27,
 *     Beginner) and never a made-up default. The pencil on a blank row still works.
 *   - no back button and no progress bar from "building your plan" onward (generatePlan, planReady, trialTimeline, Save your progress, Try for free);
 *     the e-mail form on Save your progress keeps a way back to the sign-in choices.
 *   - the native back button is the standard glass one with the chevron nudged left; the paywall's back button sits in a clear glass bubble.
 * Real planisreadynow.html with the page code that ships (extracted from app/onboarding.tsx) in Chromium.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const E = require('./lib/onboarding-extract.js').load();
const { computeGoalPlan } = require('../lib/onboardingGoals.ts');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d && !ok ? '  -> ' + d : ''}`); if (!ok) failed++; };
const raw = fs.readFileSync(path.join(ROOT, 'assets', 'app screens', 'planisreadynow.html'), 'utf8');
const esc = (s) => JSON.stringify(s).slice(1, -1);

(async () => {
  const browser = await chromium.launch();
  const load = async (answers) => {
    const goal = computeGoalPlan(answers);
    const html = raw.replace('{{HEADER}}', esc(E.planReadyHeaderText(goal, E.planReadyNoNumber(answers)))).replace('{{SUBLINE}}', esc(goal.kind === 'recomp' ? '' : 'Starting today'));
    const file = path.join(ROOT, '.scratch', 'plan-ready-r10.html'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (m) => { (window.__posts = window.__posts || []).push(m); } }; });
    await page.addInitScript(E.VIEWPORT_JS);
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.waitForSelector('#dc-root svg', { timeout: 15000 });
    await page.evaluate(E.DC_PAGE_INJECT); await page.evaluate(E.planReadyInject(answers));
    await page.waitForTimeout(2500);
    return page;
  };
  const rowTexts = (page) => page.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('#dc-root div,#dc-root span')).filter((e) => !e.children.length);
    const fields = {}; const inBadge = (e) => { let q = e.parentElement; for (let k = 0; k < 3 && q; k++, q = q.parentElement) if ((q.textContent || '').includes('TARGET') && (q.textContent || '').length < 30) return true; return false; };
    leaves.filter((e) => e.getAttribute('data-pr-field') && !inBadge(e)).forEach((e) => { fields[e.getAttribute('data-pr-field')] = (e.textContent || '').trim(); });
    const texts = leaves.map((e) => (e.textContent || '').trim());
    return { fields, samples: ['184 lb', '195 lb', '27', 'Beginner'].filter((t) => texts.includes(t)).concat(texts.some((t) => t.includes("5'11")) ? ["5'11\""] : []) };
  });

  console.log('--- "Your info": a skipped onboarding shows "–" (Ari 2026-11-27: not blank) ---');
  let p = await load({});
  let r = await rowTexts(p);
  check('nothing answered: Weight, Height, Age and Experience all show "–" (not blank)', ['weight', 'height', 'age', 'experience'].every((k) => r.fields[k] === '–'), JSON.stringify(r.fields));
  const title = await p.evaluate(() => { const h = Array.from(document.querySelectorAll('#dc-root span')).find((e) => /Your goal is to/.test(e.textContent || '')); return h ? h.textContent.replace(/\s+/g, ' ').trim() : ''; });
  check('nothing answered: the title says "Your goal is to gain – lbs" (no made-up "0 lbs by Dec 4")', title === 'Your goal is to gain – lbs', title);
  check('nothing answered: none of the design\'s sample values is left on the page (184 lb, 195 lb, 5\'11", 27, Beginner)', r.samples.length === 0, JSON.stringify(r.samples));
  // the pencil on a blank row still opens the in-place edit
  const edit = await p.evaluate(() => {
    const blank = Array.from(document.querySelectorAll('#dc-root [data-pr-field="weight"]'))[0];
    const row = blank.closest('div[style*="justify-content: space-between"]') || blank.parentElement.parentElement;
    const pencil = row.querySelector('svg[style*="cursor: pointer"],svg[style*="cursor:pointer"]');
    if (!pencil) return { pencil: false };
    pencil.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { pencil: true, editable: blank.contentEditable === 'true', w: Math.round(blank.getBoundingClientRect().width) };
  });
  check('the pencil next to a "–" value still works (tap opens the edit) and it has a tap area', edit.pencil && edit.editable && edit.w >= 40, JSON.stringify(edit));
  const typed = await p.evaluate(() => { const el = document.querySelector('#dc-root [data-pr-field="weight"]'); el.textContent = '181'; el.blur(); el.dispatchEvent(new Event('blur')); return { text: el.textContent, posts: (window.__posts || []).filter((m) => /^editvalue:weight/.test(m)) }; });
  check('typing a value over the "–" saves it ("181 lb", editvalue:weight:181)', typed.text === '181 lb' && typed.posts.includes('editvalue:weight:181'), JSON.stringify(typed));
  const leftEmpty = await p.evaluate(() => { const el = document.querySelector('#dc-root [data-pr-field="age"]'); const row = el.closest('div[style*="justify-content: space-between"]') || el.parentElement.parentElement; const pen = row.querySelector('svg[style*="cursor: pointer"],svg[style*="cursor:pointer"]'); pen.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); el.blur(); el.dispatchEvent(new Event('blur')); return { text: el.textContent, posts: (window.__posts || []).filter((m) => /^editvalue:age/.test(m)) }; });
  check('opening the edit and leaving it empty keeps "–" (and saves nothing, not the dash)', leftEmpty.text === '–' && leftEmpty.posts.every((m) => m === 'editvalue:age:'), JSON.stringify(leftEmpty));
  const badgeTxt = await p.evaluate(() => { const svg = document.querySelector('#dc-root svg'); const b = [...svg.parentElement.querySelectorAll('div')].find((d) => (d.textContent || '').includes('TARGET') && d.querySelector('div')); return [...b.querySelectorAll('div,span')].filter((e) => !e.children.length).map((e) => (e.textContent || '').trim()); });
  check('no target: the Target card shows a dash (the card is not empty)', badgeTxt.includes('–') && badgeTxt.some((t) => /TARGET/.test(t)), JSON.stringify(badgeTxt));
  await p.waitForTimeout(1500);   // the card pops in at 3.05 s
  const centre = await p.evaluate(() => { const svg = document.querySelector('#dc-root svg'); const b = [...svg.parentElement.querySelectorAll('div')].find((d) => (d.textContent || '').includes('TARGET') && d.querySelector('div')); const dash = [...b.querySelectorAll('div,span')].find((e) => !e.children.length && (e.textContent || '').trim() === '–'); const rg = document.createRange(); rg.selectNodeContents(dash); const t = rg.getBoundingClientRect(), c = b.getBoundingClientRect(); return { dashMid: t.left + t.width / 2, cardMid: c.left + c.width / 2, w: t.width }; });
  check('the "–" is CENTRED in the Target card (within 1 px; it used to sit at the left of a 56 px box)', Math.abs(centre.dashMid - centre.cardMid) <= 1 && centre.w > 0, JSON.stringify(centre));
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'plan-ready-blank.png') });
  await p.close();

  p = await load({ weight: 200, goalWeight: 180, mainGoal: 'Lose fat / Lose weight', age: 31, height: `5'9"`, experience: 'Intermediate' });
  r = await rowTexts(p);
  const badgeTxt2 = await p.evaluate(() => { const svg = document.querySelector('#dc-root svg'); const bb = [...svg.parentElement.querySelectorAll('div')].find((d) => (d.textContent || '').includes('TARGET') && d.querySelector('div')); return [...bb.querySelectorAll('div,span')].filter((e) => !e.children.length).map((e) => (e.textContent || '').trim()); });
  check('with a target the Target card shows it (no dash)', badgeTxt2.some((t) => /180/.test(t)) && !badgeTxt2.includes('–'), JSON.stringify(badgeTxt2));
  const title3 = await p.evaluate(() => { const h = Array.from(document.querySelectorAll('#dc-root span')).find((e) => /Your goal is to/.test(e.textContent || '')); return h ? h.textContent.replace(/\s+/g, ' ').trim() : ''; });
  check('with real numbers the title keeps the number and the date ("lose 20 lbs by ...")', /^Your goal is to lose 20 lbs by \w+ \d+$/.test(title3), title3);
  check('everything answered: his own answers show (weight, height, age, experience, goal)', r.fields.weight === '200 lb' && r.fields.height === `5'9"` && r.fields.age === '31' && r.fields.experience === 'Intermediate' && /180/.test(r.fields.goal), JSON.stringify(r.fields));
  await p.close();
  p = await load({ weight: 200, mainGoal: 'Build muscle' });
  r = await rowTexts(p);
  check('only some answered: the answered ones show, the skipped ones show "–" (weight 200 given; height, age, experience, goal skipped)', r.fields.weight === '200 lb' && r.fields.height === '–' && r.fields.age === '–' && r.fields.experience === '–' && r.fields.goal === '–', JSON.stringify(r.fields));
  const title2 = await p.evaluate(() => { const h = Array.from(document.querySelectorAll('#dc-root span')).find((e) => /Your goal is to/.test(e.textContent || '')); return h ? h.textContent.replace(/\s+/g, ' ').trim() : ''; });
  check('no goal weight: the title is "Your goal is to gain – lbs"', title2 === 'Your goal is to gain – lbs', title2);
  await p.close();
  await browser.close();

  console.log('--- the headers ---');
  const ob = read('app/onboarding.tsx');
  check('no back button and no bar for generatePlan, planReady and trialTimeline', ob.includes("ONB_NO_HEADER_KEYS: string[] = ['generatePlan', 'planReady', 'trialTimeline']") && ob.includes('(noHeader || !headerOn || backHidden) ? null : (') && ob.includes('&& !noHeader;'));
  const sp = read('components/onboarding/SaveProgressScreen.tsx'), tf = read('components/onboarding/TryForFreeScreen.tsx');
  check('Save your progress: no back button and no bar (only its e-mail form keeps a way back to the sign-in choices); Try for free: none at all', sp.includes('{emailMode ? <OnbBackButton') && !sp.includes('progress != null && (') && !tf.includes('<OnbBackButton') && !tf.includes('progress != null &&'));
  const gb = read('components/GlassBackButton.tsx'), ob2 = read('components/onboarding/OnbBackButton.tsx');
  check('the onboarding back button is the standard real glass (not the light imitation) and the chevron is nudged a little left (1.5 pt)', ob2.includes('scheme="standard"') && gb.includes("STANDARD_GLASS.colorScheme") && gb.includes('translateX: -1.5'));
  check('the paywall back button is the ONE standard real glass button, with a shadow outside the glass so it can be seen, and both it and Restore are fixed (nothing moves with the page)', ob.includes('shadowOpacity: 0.22, shadowRadius: 9') && !ob.includes('translateY: headerY') && !/headerY/.test(ob) && !ob.includes('variant="clear" colorScheme="light"'));
  check('the progress bar is part of the page (flat, scrolls with it), the back button fades away once the page has scrolled', ob.includes("var b = document.createElement('div'); b.style.cssText = 'flex:none;width:34px;height:34px;pointer-events:none;';") && ob.includes('toValue: hide ? 0 : 1'));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
