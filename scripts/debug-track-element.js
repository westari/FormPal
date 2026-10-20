const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const file = path.join(__dirname, '..', 'assets', 'app screens', 'repfeedback.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + file.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('#dc-root div'));
    const candidates = divs
      .filter(d => d.style.height === '30px' || getComputedStyle(d).height === '30px')
      .map(d => ({
        inlineCssText: d.getAttribute('style'),
        styleHeight: d.style.height,
        stylePosition: d.style.position,
        styleFlex: d.style.flex,
        styleFlexGrow: d.style.flexGrow,
        computedHeight: getComputedStyle(d).height,
        computedPosition: getComputedStyle(d).position,
        computedFlex: getComputedStyle(d).flex,
      }));
    return { count: divs.length, candidates };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
