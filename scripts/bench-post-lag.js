#!/usr/bin/env node
/** Times the CPU-only parts of the post-workout path in node (real app code), for 20 / 100 / 400 logged sessions. */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const sessionLog = require('../lib/sessionLog.ts');
const MTM = require('../components/MuscleTierMap.tsx');
const data = require('../lib/muscleRanksData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
const pre = require('../lib/recapPrefetch.ts');
const DAY = 86400000, NOW = Date.now();
const ids = ['shoulderPress', 'squat', 'curl', 'lunge', 'romanianDeadlift'];
const t = (label, fn, n = 20) => { const s = process.hrtime.bigint(); let r; for (let i = 0; i < n; i++) r = fn(); const ms = Number(process.hrtime.bigint() - s) / 1e6 / n; console.log(`  ${label.padEnd(46)} ${ms.toFixed(2)} ms`); return r; };
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'assets', 'images', 'muscle-icons', 'shoulders-bronze.png')).toString('base64');
const emblem = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'assets', 'ranks', 'bronze.png')).toString('base64');
for (const n of [20, 100, 400]) {
  const all = Array.from({ length: n }, (_, i) => ({ ts: NOW - (n - i) * DAY / 2, exerciseId: ids[i % ids.length], displayName: ids[i % ids.length], reps: 20, goodReps: 17, pct: 85, formChecked: true }));
  console.log(`--- ${n} logged sessions ---`);
  const tiersAfter = t('computeMuscleTiers(all)', () => sessionLog.computeMuscleTiers(all));
  const prior = all.slice(0, -1);
  const tiersBefore = t('computeMuscleTiers(prior)', () => sessionLog.computeMuscleTiers(prior));
  const sa = t('computeOverallStanding x2', () => { MTM.computeOverallStanding(tiersAfter); return MTM.computeOverallStanding(tiersBefore); });
  const payload = t('buildMuscleRanksPayload (incl. body map data URI)', () => data.buildMuscleRanksPayload({ entries: all.slice(-2), tiersBefore, tiersAfter, standingBefore: sa, standingAfter: sa, labels: MTM.MUSCLE_LABELS, note: 'x', iconFor: () => icon, emblem }));
  const js = t('athltSetDataJs(payload)  (JSON + icons + emblem)', () => athltSetDataJs(payload));
  console.log(`  payload string size                               ${(js.length / 1024).toFixed(0)} KB (body map ${(payload.bodyMap.length / 1024).toFixed(0)} KB, icons+emblem ${((icon.length * 2 + emblem.length) / 1024).toFixed(0)} KB)`);
  t('groupIntoWorkouts(all)', () => sessionLog.groupIntoWorkouts(all));
  t('JSON.parse(all) (what getAllSessions does)', () => JSON.parse(JSON.stringify(all)));
}
console.log('--- recap card data ---');
t('recapPageData', () => pre.recapPageData({ totalReps: 20, totalGoodReps: 17, moves: 1, pct: 85, hasFormData: true, durationSec: 80, hasVideo: true }));
