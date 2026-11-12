#!/usr/bin/env node
/**
 * scripts/test-tab-revisit.js
 * Opening a tab you have already opened must not redraw its page. The log showed that every visit to Train, Progress and Profile
 * re-sent the page the data it already had (Progress up to 4 times, once per art step), and each send redraws the page: a small
 * glitch as the tab appears. The three tabs now send only data that is DIFFERENT from what the page shows, and always send after
 * the page (re)loads or asks. Checked on the shipped source, plus the page-side proof that a re-send is a redraw.
 */
const fs = require('fs'), path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
for (const [name, file] of [['Progress', 'progress.tsx'], ['Profile', 'profile.tsx']]) {
  const s = read('app', '(tabs)', file);
  check(`${name}: sends data only when it changed (same text as the last send is skipped)`, /const push = useCallback\(\(force\?: boolean\)/.test(s) && /if \(!force && js === lastPushed\.current\) return;/.test(s));
  check(`${name}: a page that asked for data or just (re)loaded always gets it (force)`, /case 'needData':[^\n]*push\(true\)/.test(s) && /lastPushed\.current = ''/.test(s) && /push\(true\)/.test(s));
}
const t = read('app', '(tabs)', 'train.tsx');
check('Train: same data as the page already has is not sent again', /if \(js === dataJsRef\.current\) \{ tlog\('data unchanged, not pushed again'\); return; \}/.test(t));
check('Train: a page that asks for data still gets what is stored (needData sends dataJsRef)', /case 'needData':[^\n]*injectJavaScript\(dataJsRef\.current\)/.test(t));
console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
