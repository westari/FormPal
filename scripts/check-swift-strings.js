#!/usr/bin/env node
/**
 * scripts/check-swift-strings.js
 *
 * A small Swift LEXER for the string problems a Windows editing session can create (Swift cannot be compiled here). It walks every .swift file in
 * modules/athlt-camera/ios, understanding comments, string literals, "\( ... )" interpolation (with nested strings and brackets) and multi-line strings,
 * and reports:
 *   - a string literal that is not closed on its line (single-line strings only)
 *   - an interpolation that is not closed
 *   - "code" that starts with a printf format such as %.1f (the signature of a LOST backslash: "(String(format: "%.1f", x))" inside a string, where the
 *     inner quotes end the literal early; 2026-11-16 found this in the [ATTEMPT-MISSED] and [REP-QUALITY] lines, which would have failed the build)
 *   - bracket imbalance per file ( { [ outside strings and comments
 * Exit code 1 on any finding.
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'modules', 'athlt-camera', 'ios');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.swift'));
let problems = 0;
const report = (f, line, msg) => { console.log(`${f}:${line}: ${msg}`); problems++; };

function lex(src, file) {
  const n = src.length; let i = 0, line = 1;
  const brackets = { '(': 0, '{': 0, '[': 0 };
  // contexts: code, or string (with the interpolation stack handled recursively)
  function readString(multiline, startLine) {
    // i is just after the opening quote(s)
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; if (!multiline) { report(file, startLine, 'string literal is not closed on its line'); return; } i++; continue; }
      if (c === '\\') {
        if (src[i + 1] === '(') { i += 2; readCode(1, true); continue; }
        i += 2; continue;
      }
      if (multiline) { if (src.startsWith('"""', i)) { i += 3; return; } i++; continue; }
      if (c === '"') { i++; return; }
      i++;
    }
    report(file, startLine, 'string literal runs to the end of the file');
  }
  // reads code until the matching ')' when depth>0 (interpolation), or to the end of the file at depth 0
  function readCode(depth, inInterp) {
    let atCodeStart = true;
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (src.startsWith('//', i)) { while (i < n && src[i] !== '\n') i++; continue; }
      if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); const chunk = src.slice(i, e < 0 ? n : e + 2); line += (chunk.match(/\n/g) || []).length; i = e < 0 ? n : e + 2; continue; }
      if (src.startsWith('"""', i)) { const sl = line; i += 3; readString(true, sl); continue; }
      if (c === '"') {
        const sl = line; i++;
        readString(false, sl);
        // right after a string closes, "code" that starts with %.<digit> is the lost-backslash signature
        if (/^%[.\d]*[dfsl@]/.test(src.slice(i, i + 6))) report(file, sl, 'text after a string literal looks like a printf format (a lost backslash before "(String(format: ...)" inside a string)');
        continue;
      }
      if (c === '(' ) { if (inInterp) depth++; else brackets['(']++; i++; continue; }
      if (c === ')') { if (inInterp) { depth--; i++; if (depth === 0) return; continue; } brackets['(']--; i++; continue; }
      if (c === '{') { brackets['{']++; i++; continue; }
      if (c === '}') { brackets['{']--; i++; continue; }
      if (c === '[') { brackets['[']++; i++; continue; }
      if (c === ']') { brackets[']'] = 0; brackets['[']--; i++; continue; }
      i++;
    }
    if (inInterp) report(file, line, 'interpolation \\( ... ) is not closed');
  }
  readCode(0, false);
  for (const k of Object.keys(brackets)) if (brackets[k] !== 0) report(file, line, `unbalanced ${k}: ${brackets[k]}`);
}
// optional: a path to check one file (used by the test to prove the lexer catches the lost-backslash bug)
if (process.argv[2]) lex(fs.readFileSync(process.argv[2], 'utf8'), path.basename(process.argv[2]));
else for (const f of files) lex(fs.readFileSync(path.join(dir, f), 'utf8'), f);
console.log(problems ? `\n${problems} problem(s)` : `checked ${files.length} Swift files: no string or bracket problems`);
process.exit(problems ? 1 : 0);
