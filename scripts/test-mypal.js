// Tests for api/mypal.ts: auth, rate limit, caps, Anthropic request shape. No network, no real keys.
// Run: node scripts/test-mypal.js
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

require.extensions['.ts'] = (m, file) => {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  m._compile(out, file);
};

process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon';
delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;

const handlerMod = require(path.join(__dirname, '..', 'api', 'mypal.ts'));
const guard = require(path.join(__dirname, '..', 'api', '_lib', 'guard.ts'));
const handler = handlerMod.default;

let failed = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) failed++; };

// Fake Supabase: token "good-<id>" is user <id>; anything else is 401; "boom" is a 500 from Supabase.
let anthropicBodies = [];
let supabaseCalls = 0;
global.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://proj.supabase.co/auth/v1/user')) {
    supabaseCalls++;
    const t = (init.headers.Authorization || '').replace('Bearer ', '');
    if (t === 'boom') return new Response('x', { status: 500 });
    if (t.startsWith('good-')) return new Response(JSON.stringify({ id: t.slice(5) }), { status: 200 });
    return new Response(JSON.stringify({ msg: 'bad jwt' }), { status: 401 });
  }
  if (url.startsWith('https://api.anthropic.com')) {
    anthropicBodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', content: [{ type: 'text', text: 'Brace your core.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('unexpected fetch ' + url);
};

function call(opts = {}) {
  const req = { method: opts.method ?? 'POST', headers: opts.headers ?? {}, body: opts.body };
  const out = { code: 0, body: null, headers: {} };
  const res = { setHeader: (k, v) => { out.headers[k] = v; }, status: (c) => { out.code = c; return res; }, json: (b) => { out.body = b; return out; } };
  return handler(req, res).then(() => out);
}
const authed = (user, body) => ({ headers: { authorization: `Bearer good-${user}` }, body });

(async () => {
  let r;

  // ── auth ──
  r = await call({ body: { message: 'hi' } });
  ok('no Authorization header -> 401', r.code === 401, JSON.stringify(r.body));
  r = await call({ headers: { authorization: 'Basic abc' }, body: { message: 'hi' } });
  ok('non-Bearer header -> 401', r.code === 401);
  r = await call({ headers: { authorization: 'Bearer forged' }, body: { message: 'hi' } });
  ok('invalid/forged token -> 401', r.code === 401, JSON.stringify(r.body));
  r = await call({ headers: { authorization: 'Bearer boom' }, body: { message: 'hi' } });
  ok('Supabase outage -> 500 with generic text (no internals)', r.code === 500 && !/supabase|500/i.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  r = await call({ method: 'GET', headers: { authorization: 'Bearer good-a' } });
  ok('GET -> 405', r.code === 405);
  ok('Anthropic was never called for any rejected request', anthropicBodies.length === 0);

  // ── caps ──
  r = await call(authed('caps', { message: '   ' }));
  ok('empty message -> 400', r.code === 400);
  r = await call(authed('caps', { message: 'x'.repeat(501) }));
  ok('501 char message -> 400', r.code === 400, JSON.stringify(r.body));
  ok('still no Anthropic call', anthropicBodies.length === 0);

  // ── happy path + request shape ──
  const longHist = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'h' + i + 'y'.repeat(3000) }));
  r = await call(authed('shape', { message: 'x'.repeat(500), history: longHist, userContext: { goal: 'g'.repeat(1000), plan: 5 } }));
  ok('valid request (500 chars exactly) -> 200 + reply', r.code === 200 && r.body.reply === 'Brace your core.', JSON.stringify(r.body));
  const b = anthropicBodies[0];
  ok('max_tokens is 300', b.max_tokens === 300, String(b.max_tokens));
  ok('model is claude-haiku-4-5', /haiku-4-5/.test(b.model), b.model);
  ok('history capped: at most 10 prior + the new message', b.messages.length <= 11 && b.messages[b.messages.length - 1].content.length === 500, 'sent ' + b.messages.length);
  ok('each history turn truncated to 1500 chars', b.messages.slice(0, -1).every(m => m.content.length <= 1500));
  ok('conversation starts with a user turn', b.messages[0].role === 'user');
  ok('userContext field truncated to 200, non-string ignored', /Goal: g{200}\n?/.test(b.system) && !/g{201}/.test(b.system) && !/Current plan/.test(b.system));

  // ── rate limit: 20 per hour per user ──
  anthropicBodies = [];
  const codes = [];
  for (let i = 0; i < 22; i++) codes.push((await call(authed('hourly', { message: 'hi' }))).code);
  ok('first 20 allowed, 21st+ are 429', codes.slice(0, 20).every(c => c === 200) && codes[20] === 429 && codes[21] === 429, codes.join(','));
  ok('Anthropic called exactly 20 times for that user', anthropicBodies.length === 20, String(anthropicBodies.length));
  r = await call(authed('hourly', { message: 'hi' }));
  ok('429 has Retry-After header and friendly text', Number(r.headers['Retry-After']) > 0 && /try again/i.test(r.body.error), JSON.stringify(r.headers) + ' ' + r.body.error);
  r = await call(authed('someone-else', { message: 'hi' }));
  ok('a different user is not affected', r.code === 200);

  // ── rate limit: 100 per day (pure function, simulated clock) ──
  const store = new guard.MemoryStore();
  const t0 = Date.UTC(2026, 10, 3, 0, 0, 0);
  let res2 = [];
  for (let i = 0; i < 101; i++) res2.push(await guard.checkRate('d', store, t0 + Math.floor(i / 20) * 3_600_000 + i)); // 20 per hour bucket, 5 hours
  ok('daily cap: 100 pass across hours, 101st blocked as "day"', res2.slice(0, 100).every(x => x.ok) && !res2[100].ok && res2[100].window === 'day', JSON.stringify(res2[100]));
  const next = await guard.checkRate('d', store, t0 + 86_400_000 + 5);
  ok('counters reset on the next day', next.ok === true);

  // ── Upstash / KV store ──
  const kvCalls = [];
  const kv = new guard.UpstashStore('https://kv.example', 'tok', async (u, init) => {
    kvCalls.push({ u, init });
    return new Response(JSON.stringify([{ result: 7 }, { result: 1 }]), { status: 200 });
  });
  const n = await kv.incr('k', 3660);
  const sent = JSON.parse(kvCalls[0].init.body);
  ok('Upstash: pipeline INCR + EXPIRE NX with bearer token, returns count', n === 7 && sent[0][0] === 'INCR' && sent[1][0] === 'EXPIRE' && sent[1][3] === 'NX' && kvCalls[0].init.headers.Authorization === 'Bearer tok', JSON.stringify(sent));
  process.env.KV_REST_API_URL = 'https://kv.example'; process.env.KV_REST_API_TOKEN = 'tok';
  ok('defaultStore uses Upstash when KV env set', guard.defaultStore() instanceof guard.UpstashStore);
  delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  ok('defaultStore falls back to memory when not set', guard.defaultStore() instanceof guard.MemoryStore);

  // KV down -> fail closed, no Anthropic call
  anthropicBodies = [];
  handlerMod.deps.store = { incr: async () => { throw new Error('KV error 500 secret-detail'); } };
  r = await call(authed('kvdown', { message: 'hi' }));
  ok('KV outage fails closed (503), no Anthropic call, no internals leaked', r.code === 503 && anthropicBodies.length === 0 && !/secret-detail/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  handlerMod.deps.store = undefined;

  // Anthropic error does not leak its message
  const realFetch = global.fetch;
  global.fetch = async (u, i) => String(u).startsWith('https://api.anthropic.com') ? new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'sk-ant-LEAK' } }), { status: 500 }) : realFetch(u, i);
  r = await call(authed('err', { message: 'hi' }));
  ok('Anthropic failure -> 500 without leaking the upstream message', r.code === 500 && !/LEAK|sk-ant/.test(JSON.stringify(r.body)), JSON.stringify(r.body));

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
