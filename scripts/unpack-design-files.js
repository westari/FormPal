#!/usr/bin/env node
/**
 * scripts/unpack-design-files.js
 *
 * Claude Design's standalone HTML export wraps the real screen inside a
 * "bundler" loader: the raw .html file is mostly base64 font data and a
 * generic unpacking script, with the ACTUAL markup/CSS/Component logic
 * living as a JSON-encoded string inside a
 * <script type="__bundler/template">...</script> tag. Reading the raw
 * file directly (grep, cat, etc.) shows that wrapper, not the real screen
 * — which is exactly how past sessions guessed wrong about selectors and
 * structure.
 *
 * This script decodes every .html file under "assets/app screens/" and
 * writes the REAL, readable HTML to .scratch/unpacked-designs/<name>.html
 * — always read the unpacked version before writing any injection code
 * against a design file, never the raw one.
 *
 * Usage: node scripts/unpack-design-files.js [optional-filename-filter]
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'app screens');
const OUT_DIR = path.join(__dirname, '..', '.scratch', 'unpacked-designs');

function unpackOne(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const m = raw.match(/<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    return { packed: false };
  }
  let decoded;
  try {
    const json = JSON.parse(m[1]);
    decoded = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
  } catch (e) {
    return { packed: true, error: String(e) };
  }
  return { packed: true, html: decoded };
}

function main() {
  const filter = process.argv[2];
  if (!fs.existsSync(SRC_DIR)) {
    console.error('Source dir not found:', SRC_DIR);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.html'));
  const results = [];
  for (const f of files) {
    if (filter && !f.includes(filter)) continue;
    const full = path.join(SRC_DIR, f);
    const res = unpackOne(full);
    if (!res.packed) {
      results.push({ file: f, status: 'NOT PACKED (no __bundler/template found) — read the raw file directly' });
      continue;
    }
    if (res.error) {
      results.push({ file: f, status: 'PACKED but failed to decode: ' + res.error });
      continue;
    }
    const outPath = path.join(OUT_DIR, f);
    fs.writeFileSync(outPath, res.html, 'utf8');
    results.push({ file: f, status: `unpacked -> .scratch/unpacked-designs/${f} (${res.html.length} bytes)` });
  }

  for (const r of results) console.log(`${r.file}: ${r.status}`);
  console.log(`\nDone. ${results.filter(r => r.status.startsWith('unpacked')).length}/${results.length} files unpacked into ${OUT_DIR}`);
}

main();
