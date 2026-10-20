#!/usr/bin/env node
/**
 * scripts/extract-ts-function.js
 *
 * Extracts one function/const (by exact start text) out of a .ts/.tsx file
 * and transpiles ONLY that slice (not the whole file, which would need
 * every RN/expo import to resolve) down to plain runnable JS via the
 * TypeScript compiler API — so test scripts run the EXACT source that
 * ships, never a hand-copied, possibly-out-of-sync approximation of it.
 *
 * Usage: node scripts/extract-ts-function.js <file> <startMarker> <endMarkerLine>
 *   startMarker: exact text the function/const declaration starts with
 *   endMarkerLine: exact text of the line the function body ends on (its closing brace line)
 * Prints the transpiled JS to stdout.
 */
const fs = require('fs');
const ts = require('typescript');

const [, , file, startMarker, endMarkerLine] = process.argv;
if (!file || !startMarker || !endMarkerLine) {
  console.error('Usage: node extract-ts-function.js <file> <startMarker> <endMarkerLine>');
  process.exit(1);
}

const src = fs.readFileSync(file, 'utf8');
const startIdx = src.indexOf(startMarker);
if (startIdx === -1) { console.error('startMarker not found:', startMarker); process.exit(1); }
const endLineIdx = src.indexOf(endMarkerLine, startIdx);
if (endLineIdx === -1) { console.error('endMarkerLine not found after startMarker:', endMarkerLine); process.exit(1); }
const endIdx = endLineIdx + endMarkerLine.length;

const slice = src.slice(startIdx, endIdx);
const out = ts.transpileModule(slice, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
process.stdout.write(out);
