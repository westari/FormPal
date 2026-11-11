#!/usr/bin/env node
/**
 * scripts/test-workout-remove.js
 * The real log code (lib/sessionLog.ts removeWorkoutSessions) on a made-up storage: ONE workout's entries go, the others stay,
 * and the "typed in" flag survives being read back.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module');
const store = new Map();
const AS = { getItem: async (k) => (store.has(k) ? store.get(k) : null), setItem: async (k, v) => { store.set(k, v); } };
const prev = Module._load;
Module._load = function (r) { if (r === '@react-native-async-storage/async-storage') return { default: AS, ...AS }; return prev.apply(this, arguments); };
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  const sl = require('../lib/sessionLog.ts');
  // the log itself, on a fake storage
  const e = (ts, id, manual) => ({ ts, exerciseId: id, displayName: id, reps: 5, goodReps: manual ? 0 : 5, pct: manual ? 0 : 90, formChecked: !manual, ...(manual ? { manual: true } : {}) });
  store.set(sl.SESSION_LOG_KEY, JSON.stringify([e(1000, 'squat'), e(1000, 'lunge'), e(5000, 'curl', true), e(9000, 'row')]));
  const n = await sl.removeWorkoutSessions(1000);
  const left = JSON.parse(store.get(sl.SESSION_LOG_KEY));
  check('taking out a camera workout drops all its exercises and only those', n === 2 && left.length === 2 && left.every(x => x.ts !== 1000), JSON.stringify(left.map(x => x.ts)));
  const n2 = await sl.removeWorkoutSessions(5000);
  check('a hand-logged workout goes the same way', n2 === 1 && JSON.parse(store.get(sl.SESSION_LOG_KEY)).map(x => x.ts).join() === '9000');
  check('the log keeps the "typed in" flag when read back (so Logged tiles stay right)', (await (async () => { store.set(sl.SESSION_LOG_KEY, JSON.stringify([e(5000, 'curl', true)])); return (await sl.getAllSessions())[0].manual === true; })()));
  console.log(failed ? failed + ' FAILED' : 'all passed'); process.exit(failed ? 1 : 0);
})();
