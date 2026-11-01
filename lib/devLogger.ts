// DEV-only: forwards every console call to scripts/log-server.js over Wi-Fi
// (same host Metro is served from). Does nothing in production builds.
import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

const PORT = 8765;
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

function metroHost(): string | null {
  const hostUri = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri;
  if (hostUri) return hostUri.split(':')[0];
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  const m = scriptURL?.match(/^https?:\/\/([^:/]+)/);
  return m ? m[1] : null;
}

function fmt(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || a.message;
  try { return JSON.stringify(a); } catch { return String(a); }
}

export function installDevLogger() {
  if (!__DEV__) return;
  const host = metroHost();
  if (!host) return;
  const url = `http://${host}:${PORT}/log`;
  const session = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let buf: string[] = [];
  let sending = false;

  const flush = async () => {
    if (sending || !buf.length) return;
    sending = true;
    const lines = buf; buf = [];
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, lines }),
      });
    } catch {
      // server not running: drop silently, never recurse into console
    } finally {
      sending = false;
    }
  };
  setInterval(flush, 300);

  for (const level of LEVELS) {
    const orig = (console as any)[level]?.bind(console);
    (console as any)[level] = (...args: unknown[]) => {
      orig?.(...args);
      const t = new Date().toISOString().slice(11, 23);
      buf.push(`${t} [${level}] ${args.map(fmt).join(' ')}`);
      if (buf.length > 2000) buf.splice(0, buf.length - 2000);
    };
  }
  buf.push(`${new Date().toISOString()} [session] start`);
}
