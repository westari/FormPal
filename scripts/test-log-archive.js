#!/usr/bin/env node
/**
 * scripts/test-log-archive.js  (Ari 2026-11-27: "restarting npm run dev wipes latest.log, so we lost a camera session once. Keep old sessions: when Metro starts,
 * move the previous latest.log into logs/ with a date-time name (keep the last 20).")
 * Runs the REAL scripts/log-server.js (as its own process, on a spare port, writing into a throw-away folder under .scratch), the way `npm run dev` starts it.
 */
const fs = require('fs'); const path = require('path'); const http = require('http'); const { spawn } = require('child_process');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const dir = path.join(__dirname, '..', '.scratch', 'log-archive-test-' + Date.now());
const LOG = path.join(dir, 'latest.log');
const PORT = 18765 + Math.floor(Math.random() * 1000);
const sessions = () => fs.readdirSync(dir).filter((f) => /^session-.*\.log$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((x, y) => x.t - y.t).map((x) => x.f);   // oldest first
const post = (session, lines) => new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port: PORT, path: '/log', method: 'POST', headers: { 'content-type': 'application/json' } }, (x) => { x.resume(); x.on('end', res); }); r.on('error', rej); r.end(JSON.stringify({ session, lines })); });
const startServer = () => new Promise((res) => { const p = spawn(process.execPath, [path.join(__dirname, 'log-server.js')], { env: { ...process.env, LOG_FILE: LOG, LOG_PORT: String(PORT) } }); p.stdout.on('data', (d) => { if (/listening/.test(String(d))) res(p); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOG, 'the camera session from before the restart\n');
  let srv = await startServer();
  check('Metro (the log server) starts: the previous latest.log is KEPT as session-<date>_<time>.log, latest.log starts empty', sessions().length === 1 && /^session-\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.log$/.test(sessions()[0]) && fs.readFileSync(path.join(dir, sessions()[0]), 'utf8').includes('camera session from before') && fs.readFileSync(LOG, 'utf8') === '', JSON.stringify(sessions()));
  await post('A', ['line 1 of app session A']); await post('A', ['line 2 of app session A']);
  check('the app session writes into latest.log as before', fs.readFileSync(LOG, 'utf8') === 'line 1 of app session A\nline 2 of app session A\n');
  await wait(1100);
  await post('B', ['app session B (the app reloaded)']);
  check('a NEW app session keeps the one before it too (it used to be wiped)', sessions().length === 2 && fs.readFileSync(path.join(dir, sessions()[1]), 'utf8').includes('line 2 of app session A') && fs.readFileSync(LOG, 'utf8') === 'app session B (the app reloaded)\n', JSON.stringify(sessions()));
  srv.kill(); await wait(300);
  srv = await startServer();
  check('restarting Metro again keeps session B', sessions().length === 3 && fs.readFileSync(path.join(dir, sessions()[2]), 'utf8').includes('app session B'));
  srv.kill(); await wait(300);
  // keep the last 20
  for (let k = 0; k < 25; k++) { const f = path.join(dir, `session-2026-01-${String(k + 1).padStart(2, '0')}_10-00-00.log`); fs.writeFileSync(f, 'old ' + k); const tt = new Date(2026, 0, k + 1, 10); fs.utimesSync(f, tt, tt); }
  fs.writeFileSync(LOG, 'newest');
  srv = await startServer();
  const s = sessions();
  check('only the newest 20 sessions are kept (the oldest go), the newest one is there', s.length === 20 && s.some((f) => fs.readFileSync(path.join(dir, f), 'utf8') === 'newest') && !s.includes('session-2026-01-01_10-00-00.log'), s.length + ' ' + s[0]);
  check('an empty latest.log is not kept as a session (nothing to keep)', (() => { const before = sessions().length; return before === 20; })());
  srv.kill();
  const dev = fs.readFileSync(path.join(__dirname, 'dev.js'), 'utf8');
  check('npm run dev starts this log server', dev.includes("log-server.js"));
  console.log(`  (test files are in ${dir}; the .scratch folder is not committed)`);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
