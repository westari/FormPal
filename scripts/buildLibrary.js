#!/usr/bin/env node
/**
 * scripts/buildLibrary.js
 *
 * One-time script: downloads the free-exercise-db dataset (public domain,
 * yuhonas/free-exercise-db on GitHub) and writes:
 *
 *   constants/exerciseLibrary.ts  — full ~873-exercise library
 *   constants/moves.ts            — 12 curated "Learn the Moves" entries
 *
 * No API key. No rate limiting. Run from project root:
 *   node scripts/buildLibrary.js
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT       = path.join(__dirname, '..');
const MOVES_TS   = path.join(ROOT, 'constants', 'moves.ts');
const LIBRARY_TS = path.join(ROOT, 'constants', 'exerciseLibrary.ts');

// ─── Dataset URLs (tried in order) ───────────────────────────────────────────
const CANDIDATE_URLS = [
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json',
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/master/dist/exercises.json',
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises.json',
];

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

// ─── Curated moves: display name → exact dataset id ──────────────────────────
// Edit this list to change which exercises appear in "Learn the Moves".
const CURATED = [
  { displayName: 'Squat',          id: 'Bodyweight_Squat'           },
  { displayName: 'Push-up',        id: 'Pushups'                    },
  { displayName: 'Pull-up',        id: 'Pullups'                    },
  { displayName: 'Lunge',          id: 'Bodyweight_Walking_Lunge'   },
  { displayName: 'Plank',          id: 'Plank'                      },
  { displayName: 'Bicep Curl',     id: 'Dumbbell_Bicep_Curl'        },
  { displayName: 'Bench Press',    id: 'Dumbbell_Bench_Press'       },
  { displayName: 'Lat Pulldown',   id: 'Wide-Grip_Lat_Pulldown'     },
  { displayName: 'Leg Press',      id: 'Leg_Press'                  },
  { displayName: 'Shoulder Press', id: 'Cable_Shoulder_Press'       },
  { displayName: 'Deadlift',       id: 'Clean_Deadlift'             },
  { displayName: 'Glute Bridge',   id: 'Single_Leg_Glute_Bridge'    },
];

// ─── Config ───────────────────────────────────────────────────────────────────
const MIN_EXERCISES = 100;

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function fetchFull(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        resolve(fetchFull(next));
        return;
      }
      const chunks = [];
      res.on('data',  c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end',   () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadDataset() {
  for (const url of CANDIDATE_URLS) {
    process.stdout.write(`  Trying ${url} ... `);
    try {
      const r = await fetchFull(url);
      if (r.status === 200) {
        console.log(`OK (${Math.round(r.body.length / 1024)} KB)`);
        return { url, body: r.body };
      }
      console.log(`HTTP ${r.status} — trying next`);
    } catch (e) {
      console.log(`error: ${e.message} — trying next`);
    }
  }
  throw new Error('All candidate URLs failed. Check your internet connection.');
}

// ─── Normalize ────────────────────────────────────────────────────────────────
function normalize(raw) {
  const primaryMuscles   = Array.isArray(raw.primaryMuscles)   ? raw.primaryMuscles   : [];
  const secondaryMuscles = Array.isArray(raw.secondaryMuscles) ? raw.secondaryMuscles : [];
  const instructions     = Array.isArray(raw.instructions)     ? raw.instructions     : [];
  const images           = Array.isArray(raw.images)
    ? raw.images.map(p => `${IMAGE_BASE}${encodeURIComponent(p).replace(/%2F/g, '/')}`)
    : [];

  return {
    id:               String(raw.id ?? ''),
    name:             String(raw.name ?? ''),
    bodyPart:         String(raw.category ?? primaryMuscles[0] ?? '').toLowerCase(),
    target:           String(primaryMuscles[0] ?? '').toLowerCase(),
    equipment:        String(raw.equipment ?? '').toLowerCase(),
    difficulty:       String(raw.level ?? '').toLowerCase(),
    instructions,
    secondaryMuscles,
    images,
  };
}

// ─── TS generators ────────────────────────────────────────────────────────────
const INTERFACE = `export interface Exercise {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  difficulty: string;
  instructions: string[];
  secondaryMuscles: string[];
  images: string[];
}`;

function generateMovesTs(moves) {
  const rows = moves.map(m => [
    `  {`,
    `    id:               ${JSON.stringify(m.id)},`,
    `    name:             ${JSON.stringify(m.name)},`,
    `    bodyPart:         ${JSON.stringify(m.bodyPart)},`,
    `    target:           ${JSON.stringify(m.target)},`,
    `    equipment:        ${JSON.stringify(m.equipment)},`,
    `    difficulty:       ${JSON.stringify(m.difficulty || 'beginner')},`,
    `    instructions:     ${JSON.stringify(m.instructions)},`,
    `    secondaryMuscles: ${JSON.stringify(m.secondaryMuscles)},`,
    `    images:           ${JSON.stringify(m.images)},`,
    `  },`,
  ].join('\n')).join('\n');

  return [
    `// Auto-generated by scripts/buildLibrary.js — do not edit by hand.`,
    `// Source: yuhonas/free-exercise-db (public domain)`,
    ``,
    INTERFACE,
    ``,
    `export const MOVES: Exercise[] = [`,
    rows,
    `];`,
    ``,
  ].join('\n');
}

function generateLibraryTs(library) {
  return [
    `// Auto-generated by scripts/buildLibrary.js — do not edit by hand.`,
    `// Source: yuhonas/free-exercise-db (public domain) — ${library.length} exercises`,
    `// Images are remote URLs, loaded lazily at runtime.`,
    ``,
    INTERFACE,
    ``,
    `export const LIBRARY: Exercise[] = ${JSON.stringify(library, null, 2)};`,
    ``,
  ].join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nFormPal — buildLibrary.js\n');
  console.log('Source: yuhonas/free-exercise-db (public domain, no API key)\n');

  // ── 1. Download ───────────────────────────────────────────────────────
  console.log('STEP 1 — Downloading exercise dataset...\n');
  const { url: sourceUrl, body } = await downloadDataset();

  let raw;
  try { raw = JSON.parse(body); }
  catch (e) {
    console.error(`\n✗  Failed to parse JSON from ${sourceUrl}: ${e.message}`);
    process.exit(1);
  }

  const rawList = Array.isArray(raw) ? raw
    : Array.isArray(raw.exercises) ? raw.exercises
    : null;

  if (!rawList) {
    console.error(`\n✗  Unexpected JSON shape: ${JSON.stringify(raw).slice(0, 200)}`);
    process.exit(1);
  }

  console.log(`\n  Downloaded ${rawList.length} exercises from:\n  ${sourceUrl}\n`);

  if (rawList.length < MIN_EXERCISES) {
    console.error(`\n✗  Only ${rawList.length} exercises — suspiciously small. NOT overwriting constants files.`);
    process.exit(1);
  }

  // ── 2. Normalize full library ─────────────────────────────────────────
  console.log('STEP 2 — Normalizing...');
  const library = rawList.map(normalize);
  console.log(`  ✓ ${library.length} exercises normalized\n`);

  // Build a lookup map for fast id access
  const byId = new Map(rawList.map(ex => [String(ex.id), ex]));

  // ── 3. Build curated MOVES from hardcoded ids ─────────────────────────
  console.log('STEP 3 — Building curated MOVES from hardcoded IDs...\n');

  const moves   = [];
  let   anyMiss = false;

  for (const { displayName, id } of CURATED) {
    const raw = byId.get(id);
    if (!raw) {
      console.error(`  ✗  ERROR: id "${id}" not found in dataset  (wanted for "${displayName}")`);
      anyMiss = true;
      continue;
    }
    const entry = normalize(raw);
    // Override name with our clean display name
    entry.name = displayName;
    moves.push(entry);
    console.log(`  ✓  "${displayName}"  →  id: ${id}  (level: ${entry.difficulty}, target: ${entry.target})`);
  }

  if (anyMiss) {
    console.error('\n✗  One or more IDs were not found. constants/moves.ts NOT overwritten.\n');
    console.error('   Fix the id(s) above in CURATED and re-run.\n');
    process.exit(1);
  }

  console.log(`\n  ✓ All ${moves.length} curated moves resolved\n`);

  // ── 4. Write constants/ ───────────────────────────────────────────────
  console.log('STEP 4 — Writing constants/moves.ts...');
  fs.writeFileSync(MOVES_TS, generateMovesTs(moves));
  console.log(`  ✓ constants/moves.ts  (${moves.length} moves)\n`);

  console.log('STEP 5 — Writing constants/exerciseLibrary.ts...');
  fs.writeFileSync(LIBRARY_TS, generateLibraryTs(library));
  const libKb = Math.round(fs.statSync(LIBRARY_TS).size / 1024);
  console.log(`  ✓ constants/exerciseLibrary.ts  (${library.length} exercises, ${libKb} KB)\n`);

  // ── 5. Summary ────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Exercises in library : ${library.length}`);
  console.log(`  Curated moves        : ${moves.length}`);
  console.log(`  Source URL           : ${sourceUrl}`);
  console.log('══════════════════════════════════════════════════════════\n');
  console.log('Done. No API key needed at runtime — images load from GitHub raw URLs.\n');
}

main().catch(err => {
  console.error('\n✗  Fatal:', err.message);
  process.exit(1);
});
