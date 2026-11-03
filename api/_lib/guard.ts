// Shared guards for api/mypal.ts: Supabase token check, per-user rate limit, input caps.
// Lives in api/_lib so Vercel does not deploy it as its own function.

export const LIMITS = {
  perHour: 20,
  perDay: 100,
  messageChars: 500,
  historyMessages: 10,
  historyChars: 1500, // one assistant reply at max_tokens 300 is about 1200 chars
  contextChars: 200,
  maxTokens: 300,
};

export const MODEL = 'claude-haiku-4-5-20251001';

export type Message = { role: 'user' | 'assistant'; content: string };

export function getBearer(req: any): string | null {
  const h = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (typeof h !== 'string') return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

// Asks Supabase who owns the token. Returns the user id, null for a bad/expired token,
// and throws if the server itself is not configured or Supabase is unreachable.
export async function verifyToken(token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not set on the server');
  const r = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error(`Supabase auth check failed (${r.status})`);
  const u: any = await r.json();
  return typeof u?.id === 'string' && u.id ? u.id : null;
}

// ── Rate limit ───────────────────────────────────────────────────────────────
export interface CounterStore {
  /** Increment `key` (creating it with a ttl in seconds) and return the new count. */
  incr(key: string, ttlSec: number): Promise<number>;
}

export class MemoryStore implements CounterStore {
  private m = new Map<string, { n: number; exp: number }>();
  async incr(key: string, ttlSec: number) {
    const now = Date.now();
    if (this.m.size > 5000) for (const [k, v] of this.m) if (v.exp <= now) this.m.delete(k);
    const cur = this.m.get(key);
    if (!cur || cur.exp <= now) { this.m.set(key, { n: 1, exp: now + ttlSec * 1000 }); return 1; }
    cur.n += 1;
    return cur.n;
  }
}

// Upstash / Vercel KV over its REST API (no extra package). One pipeline round trip.
export class UpstashStore implements CounterStore {
  constructor(private url: string, private token: string, private fetchImpl: typeof fetch = fetch) {}
  async incr(key: string, ttlSec: number) {
    const r = await this.fetchImpl(`${this.url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(ttlSec), 'NX']]),
    });
    if (!r.ok) throw new Error(`KV error ${r.status}`);
    const out: any[] = await r.json();
    const n = Number(out?.[0]?.result);
    if (!Number.isFinite(n)) throw new Error('KV bad response');
    return n;
  }
}

const memory = new MemoryStore();

export function defaultStore(): CounterStore {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashStore(url, token);
  return memory; // local dev / not configured yet: per server instance only
}

export type RateResult = { ok: true } | { ok: false; retryAfterSec: number; window: 'hour' | 'day' };

export async function checkRate(userId: string, store: CounterStore, now = Date.now()): Promise<RateResult> {
  const hourBucket = Math.floor(now / 3_600_000);
  const dayBucket = Math.floor(now / 86_400_000);
  const hourLeft = Math.max(1, Math.ceil(((hourBucket + 1) * 3_600_000 - now) / 1000));
  const dayLeft = Math.max(1, Math.ceil(((dayBucket + 1) * 86_400_000 - now) / 1000));
  const h = await store.incr(`mypal:h:${userId}:${hourBucket}`, 3600 + 60);
  const d = await store.incr(`mypal:d:${userId}:${dayBucket}`, 86_400 + 60);
  if (d > LIMITS.perDay) return { ok: false, retryAfterSec: dayLeft, window: 'day' };
  if (h > LIMITS.perHour) return { ok: false, retryAfterSec: hourLeft, window: 'hour' };
  return { ok: true };
}

// ── Input caps ───────────────────────────────────────────────────────────────
export function cleanHistory(history: unknown): Message[] {
  if (!Array.isArray(history)) return [];
  const ok = (history as any[])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role as Message['role'], content: String(m.content).slice(0, LIMITS.historyChars) }))
    .slice(-LIMITS.historyMessages);
  // The API needs the conversation to start with a user turn.
  while (ok.length && ok[0].role !== 'user') ok.shift();
  return ok;
}

export function cleanContextLine(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, LIMITS.contextChars) : null;
}
