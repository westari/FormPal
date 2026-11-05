#!/usr/bin/env node
/**
 * scripts/test-tabs.js
 * The tab bar registers Home, Train, Plus, Progress and Profile, and every registered tab has its screen file with a
 * default export. Parses app/(tabs)/_layout.tsx with the TypeScript compiler (the real file, not a copy).
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const ROOT = path.join(__dirname, '..');
const TABS = path.join(ROOT, 'app', '(tabs)');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const src = fs.readFileSync(path.join(TABS, '_layout.tsx'), 'utf8');
const sf = ts.createSourceFile('_layout.tsx', src, ts.ScriptTarget.ES2019, true, ts.ScriptKind.TSX);
const triggers = [];
(function walk(n) {
  if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText() === 'NativeTabs.Trigger') {
    const a = n.attributes.properties.find((p) => p.name && p.name.getText() === 'name');
    if (a && a.initializer) triggers.push({ name: a.initializer.text, label: null, node: n.parent });
  }
  ts.forEachChild(n, walk);
})(sf);
for (const t of triggers) {
  const kids = t.node.children || [];
  const label = kids.find((k) => /^<Label/.test(k.getText()));
  t.label = label ? label.getText() : '';
  t.hasIcon = kids.some((k) => /^<Icon/.test(k.getText()));
}
const names = triggers.map((t) => t.name);
check('the tab bar registers exactly Home, Train, Plus, Progress, Profile in that order', names.join(',') === 'index,train,plus,progress,profile', names.join(','));
for (const t of triggers) {
  const file = path.join(TABS, t.name + '.tsx');
  const ok = fs.existsSync(file) && /export default/.test(fs.readFileSync(file, 'utf8'));
  check(`tab "${t.name}" has app/(tabs)/${t.name}.tsx with a default export`, ok);
}
const train = triggers.find((t) => t.name === 'train');
check('Train has an icon and the label "Train", and is not hidden', !!train && train.hasIcon && /Train<\/Label>/.test(train.label) && !/hidden/.test(train.label), train && train.label);
const listed = /TAB_NAMES = \['index', 'train', 'plus', 'progress', 'profile'\]/.test(src);
check('TAB_NAMES (logged at runtime as [TABS]) matches the registered tabs', listed);
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
