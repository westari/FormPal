#!/usr/bin/env node
/**
 * scripts/check-swift-calls.js
 *
 * Swift requires call arguments in the order the init declares them, and rejects duplicates and unknown labels ("extra argument 'phantomGuardFraction'
 * in call" broke an iOS build once). This reads the labels of ExerciseDefinition.init and of every `ExerciseDefinition(` call in
 * modules/athlt-camera/ios and checks: every label exists, none twice, in declared order, and every parameter WITHOUT a default is given.
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'modules', 'athlt-camera', 'ios');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const def = strip(fs.readFileSync(path.join(dir, 'ExerciseDefinition.swift'), 'utf8'));
const a = def.indexOf('init(id: String, displayName: String');
let d = 0, j = a; for (; j < def.length; j++) { if (def[j] === '(') d++; if (def[j] === ')') { d--; if (d === 0) break; } }
const sig = def.slice(a + 5, j);
const params = [];
{ let depth = 0, cur = ''; const parts = [];
  for (const ch of sig) { if ('([{<'.includes(ch)) depth++; if (')]}>'.includes(ch)) depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  for (const p of parts) { const m = /^\s*([A-Za-z_]\w*)\s*:/.exec(p); if (m) params.push({ name: m[1], hasDefault: /=/.test(p.replace(/<[^>]*>/g, '')) }); } }
console.log('init declares ' + params.length + ' parameters, ' + params.filter((p) => !p.hasDefault).length + ' without a default');
let problems = 0, calls = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.swift'))) {
  const src = strip(fs.readFileSync(path.join(dir, f), 'utf8'));
  let idx = 0;
  while ((idx = src.indexOf('ExerciseDefinition(', idx)) >= 0) {
    const before = src.slice(Math.max(0, idx - 12), idx);
    if (/struct\s+$|extension\s+$/.test(before)) { idx += 5; continue; }
    let depth = 0, k = idx + 'ExerciseDefinition'.length, start = k + 1;
    for (; k < src.length; k++) { if (src[k] === '(') depth++; if (src[k] === ')') { depth--; if (depth === 0) break; } }
    const body = src.slice(start, k);
    const labels = []; { let dp = 0, cur = '', parts = [], inStr = false;
      for (let q = 0; q < body.length; q++) { const ch = body[q]; if (ch === '"' && body[q - 1] !== '\\') inStr = !inStr; if (!inStr) { if ('([{'.includes(ch)) dp++; if (')]}'.includes(ch)) dp--; if (ch === ',' && dp === 0) { parts.push(cur); cur = ''; continue; } } cur += ch; }
      parts.push(cur);
      for (const p of parts) { const m = /^\s*([A-Za-z_]\w*)\s*:/.exec(p); if (m) labels.push(m[1]); } }
    if (labels.length === 0) { idx = k; continue; }
    calls++;
    const line = src.slice(0, idx).split('\n').length;
    const seen = new Set(); let last = -1;
    for (const l of labels) {
      const pi = params.findIndex((p) => p.name === l);
      if (pi < 0) { console.log(`${f}:~${line}: unknown argument label '${l}'`); problems++; continue; }
      if (seen.has(l)) { console.log(`${f}:~${line}: argument '${l}' given twice`); problems++; }
      seen.add(l);
      if (pi < last) { console.log(`${f}:~${line}: argument '${l}' is out of order (must follow the init's order)`); problems++; }
      last = Math.max(last, pi);
    }
    for (const p of params) if (!p.hasDefault && !seen.has(p.name)) { console.log(`${f}:~${line}: missing argument '${p.name}'`); problems++; }
    idx = k;
  }
}
console.log(problems ? `\n${problems} problem(s) in ${calls} calls` : `checked ${calls} ExerciseDefinition(...) calls: labels, order, duplicates and required arguments are all fine`);
process.exit(problems ? 1 : 0);
