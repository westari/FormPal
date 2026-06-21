#!/usr/bin/env node
/**
 * scripts/listCandidates.js
 * Re-downloads yuhonas/free-exercise-db and prints all exercises matching
 * each search term so you can manually pick the best ID for each curated move.
 *
 * Run from project root:  node scripts/listCandidates.js
 */

'use strict';

const https = require('https');

const DATASET_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

const TERMS = [
  'squat',
  'lunge',
  'curl',
  'bench press',
  'shoulder press',
  'deadlift',
  'glute bridge',
  'hip bridge',
  'bridge',
  'push',
  'pull',
  'plank',
  'leg press',
  'lat pulldown',
];

// ─── Fetch ────────────────────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(fetchJson(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      const chunks = [];
      res.on('data',  c => chunks.push(c));
      res.on('end',   () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  process.stdout.write(`Downloading dataset... `);
  const data = await fetchJson(DATASET_URL);
  const list = Array.isArray(data) ? data : data.exercises ?? [];
  console.log(`${list.length} exercises\n`);

  for (const term of TERMS) {
    const tl      = term.toLowerCase();
    const matches = list.filter(ex => ex.name.toLowerCase().includes(tl));

    const hdr = `── "${term}" (${matches.length}) `;
    console.log(hdr + '─'.repeat(Math.max(0, 100 - hdr.length)));

    if (matches.length === 0) {
      console.log('  (no matches)\n');
      continue;
    }

    for (const ex of matches) {
      const muscles = Array.isArray(ex.primaryMuscles) ? ex.primaryMuscles[0] ?? '—' : '—';
      const id      = String(ex.id      ?? '').padEnd(42);
      const name    = String(ex.name    ?? '').padEnd(50);
      const level   = String(ex.level   ?? '—').padEnd(14);
      const equip   = String(ex.equipment ?? '—').padEnd(18);
      console.log(`  ${id} ${name} ${level} ${equip} ${muscles}`);
    }
    console.log('');
  }
}

main().catch(err => {
  console.error('✗', err.message);
  process.exit(1);
});
