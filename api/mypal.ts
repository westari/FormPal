import Anthropic from '@anthropic-ai/sdk';
import {
  LIMITS, MODEL, getBearer, verifyToken, defaultStore, checkRate, cleanHistory, cleanContextLine,
  type Message, type CounterStore,
} from './_lib/guard';

// Force Node.js runtime — the Anthropic SDK uses Node APIs and cannot run on the Vercel Edge runtime.
export const config = { runtime: 'nodejs' };

const SYSTEM = `You are Cue, a friendly fitness coach inside the FormPal app. You help beginners with training questions — form cues, muscle soreness, recovery, plan adjustments, motivation.

Rules:
- Keep answers SHORT: 2-4 sentences max. Beginners get overwhelmed by long responses.
- For pain or injury: give sensible general guidance, but always recommend seeing a doctor or physical therapist for anything that sounds serious. Never diagnose.
- Tone: warm, direct, no jargon. Like a knowledgeable friend who wants you to succeed.
- If asked something outside fitness/health, politely redirect to training topics.`;

// Test hook: lets the test swap the Anthropic call and the counter store.
export const deps: { store?: CounterStore; createReply?: (system: string, messages: Message[]) => Promise<string> } = {};

async function anthropicReply(system: string, messages: Message[]): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({ model: MODEL, max_tokens: LIMITS.maxTokens, system, messages });
  return response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
}

export default async function handler(req: any, res: any) {
  // ── Method guard ───────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Env guard — catches missing key before any SDK call ────────────────────
  if (!deps.createReply && !process.env.ANTHROPIC_API_KEY) {
    console.error('[MyPal] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'Cue is not configured on the server.' });
  }

  // ── Login: a valid Supabase access token is required ───────────────────────
  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in to chat with Cue.' });

  let userId: string | null;
  try {
    userId = await verifyToken(token);
  } catch (err: any) {
    console.error('[MyPal] auth check failed:', err?.message ?? err);
    return res.status(500).json({ error: 'Cue is unavailable right now.' });
  }
  if (!userId) return res.status(401).json({ error: 'Your session expired. Sign in again.' });

  // ── Input caps (cheap checks first, before any counter is touched) ─────────
  const { message, history, userContext } = req.body ?? {};
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Missing message' });
  }
  if (message.trim().length > LIMITS.messageChars) {
    return res.status(400).json({ error: `Keep your message under ${LIMITS.messageChars} characters.` });
  }

  // ── Per-user rate limit ────────────────────────────────────────────────────
  try {
    const rate = await checkRate(userId, deps.store ?? defaultStore());
    if (!rate.ok) {
      res.setHeader?.('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({
        error: rate.window === 'day'
          ? "You've reached today's Cue limit. Try again tomorrow."
          : "You've sent a lot of messages. Try again in a bit.",
        retryAfterSec: rate.retryAfterSec,
      });
    }
  } catch (err: any) {
    // Fail closed: if the counter is down we do not hand out free Anthropic calls.
    console.error('[MyPal] rate limit store failed:', err?.message ?? err);
    return res.status(503).json({ error: 'Cue is unavailable right now.' });
  }

  // Build system prompt, injecting optional user context
  let system = SYSTEM;
  if (userContext && typeof userContext === 'object') {
    const lines: string[] = [];
    const goal = cleanContextLine(userContext.goal);
    const experience = cleanContextLine(userContext.experience);
    const plan = cleanContextLine(userContext.plan);
    if (goal)       lines.push(`Goal: ${goal}`);
    if (experience) lines.push(`Experience: ${experience}`);
    if (plan)       lines.push(`Current plan: ${plan}`);
    if (lines.length > 0) system += `\n\nUser context:\n${lines.join('\n')}`;
  }

  const messages: Message[] = [...cleanHistory(history), { role: 'user', content: message.trim() }];

  try {
    const reply = await (deps.createReply ?? anthropicReply)(system, messages);
    return res.status(200).json({ reply });
  } catch (err: any) {
    console.error('[MyPal] Anthropic error:', err?.message ?? String(err));
    return res.status(500).json({ error: 'Cue could not answer right now. Try again.' });
  }
}
