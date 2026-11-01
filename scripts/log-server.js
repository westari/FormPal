// Dev log server. The app (DEV builds only, see lib/devLogger.ts) POSTs its
// console output here; every line is written to latest.log. A new app session
// (new session id) truncates the file, so it only ever holds the latest run.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.LOG_PORT || 8765);
const LOG_FILE = process.env.LOG_FILE || 'C:\Users\arize\gym app\logs\latest.log';

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

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
        currentSession = session;
        fs.writeFileSync(LOG_FILE, '');
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
  console.log(`[log-server] listening on :${PORT}, writing to ${LOG_FILE}`);
});
