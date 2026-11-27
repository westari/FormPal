// Dev log server. The app (DEV builds only, see lib/devLogger.ts) POSTs its
// console output here; every line is written to latest.log. A new app session
// (new session id) starts a fresh latest.log.
//
// (Ari 2026-11-27) KEEP OLD SESSIONS: restarting `npm run dev` used to wipe latest.log, and a camera session was lost once. Now, before latest.log is
// started fresh (when this server starts, and when a new app session begins), the previous latest.log is MOVED into the same logs folder as
// session-YYYY-MM-DD_HH-MM-SS.log (the time it was last written). Only the newest KEEP_SESSIONS of those are kept.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.LOG_PORT || 8765);
const LOG_FILE = process.env.LOG_FILE || 'C:/Users/arize/gym app/logs/latest.log';
const KEEP_SESSIONS = 20;

const pad = (n) => String(n).padStart(2, '0');
function stamp(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`; }

/** Moves the current latest.log (if it has anything in it) to logs/session-<time>.log, then keeps only the newest KEEP_SESSIONS of those. Returns the new name or null. */
function archiveLatest(logFile = LOG_FILE, keep = KEEP_SESSIONS) {
  const dir = path.dirname(logFile);
  fs.mkdirSync(dir, { recursive: true });
  let moved = null;
  try {
    const st = fs.statSync(logFile);
    if (st.size > 0) {
      let name = path.join(dir, `session-${stamp(st.mtime)}.log`);
      for (let k = 2; fs.existsSync(name); k++) name = path.join(dir, `session-${stamp(st.mtime)}-${k}.log`);
      fs.renameSync(logFile, name);
      moved = name;
    }
  } catch (e) { /* no latest.log yet */ }
  const old = fs.readdirSync(dir).filter((f) => /^session-.*\.log$/.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((x, y) => x.t - y.t || (x.f < y.f ? -1 : 1)).map((x) => x.f);   // oldest first
  for (const f of old.slice(0, Math.max(0, old.length - keep))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ } }
  fs.writeFileSync(logFile, '');
  return moved;
}

function start() {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const kept = archiveLatest();
  if (kept) console.log(`[log-server] kept the previous session as ${kept}`);
  let currentSession = null;
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/log') {
      res.writeHead(200); res.end('formpal log server');
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { session, lines } = JSON.parse(body);
        if (session !== currentSession) {
          // the first session after this server started writes into the latest.log just started fresh above; a LATER new session keeps the one before it
          if (currentSession !== null) { const k = archiveLatest(); if (k) console.log(`[log-server] new app session: kept the previous one as ${k}`); }
          currentSession = session;
        }
        if (Array.isArray(lines) && lines.length) {
          fs.appendFileSync(LOG_FILE, lines.join('\n') + '\n');
        }
        res.writeHead(204); res.end();
      } catch (e) {
        res.writeHead(400); res.end();
      }
    });
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[log-server] listening on :${PORT}, writing to ${LOG_FILE} (old sessions kept as session-*.log, newest ${KEEP_SESSIONS})`);
  });
}

if (require.main === module) start();
module.exports = { archiveLatest, stamp, KEEP_SESSIONS };
