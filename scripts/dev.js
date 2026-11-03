// One command: log server + Expo dev-client server. Ctrl+C stops both.
const { spawn } = require('child_process');
const path = require('path');

const procs = [
  spawn(process.execPath, [path.join(__dirname, 'log-server.js')], { stdio: 'inherit' }),
  spawn('npx expo start --dev-client --clear', { stdio: 'inherit', shell: true }),
];

function stopAll() { procs.forEach((p) => { try { p.kill(); } catch {} }); }
process.on('SIGINT', () => { stopAll(); process.exit(0); });
procs[1].on('exit', (code) => { stopAll(); process.exit(code ?? 0); });
