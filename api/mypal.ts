import Anthropic from '@anthropic-ai/sdk';

// Force Node.js runtime — the Anthropic SDK uses Node APIs and cannot run on the Vercel Edge runtime.
export const config = { runtime: 'nodejs' };

const SYSTEM = `You are MyPal, a friendly fitness coach inside the FormPal app. You help beginners with training questions — form cues, muscle soreness, recovery, plan adjustments, motivation.

Rules:
- Keep answers SHORT: 2-4 sentences max. Beginners get overwhelmed by long responses.
- For pain or injury: give sensible general guidance, but always recommend seeing a doctor or physical therapist for anything that sounds serious. Never diagnose.
- Tone: warm, direct, no jargon. Like a knowledgeable friend who wants you to succeed.
- If asked something outside fitness/health, politely redirect to training topics.`;

type Message = { role: 'user' | 'assistant'; content: string };

export default async function handler(req: any, res: any) {
  // ── Env guard — catches missing key before any SDK call ────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[MyPal] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'API key not configured on server. Set ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.' });
  }

  // ── Method guard ───────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Client created inside handler so a missing key returns a clean error ───
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { message, history, userContext } = req.body ?? {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Missing message' });
  }

  // Build system prompt, injecting optional user context
  let system = SYSTEM;
  if (userContext) {
    const lines: string[] = [];
    if (userContext.goal)       lines.push(`Goal: ${userContext.goal}`);
    if (userContext.experience) lines.push(`Experience: ${userContext.experience}`);
    if (userContext.plan)       lines.push(`Current plan: ${userContext.plan}`);
    if (lines.length > 0) system += `\n\nUser context:\n${lines.join('\n')}`;
  }

  // Sanitise history — cap at last 20 messages to limit cost
  const safeHistory: Message[] = Array.isArray(history)
    ? (history as any[])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20)
    : [];

  const messages: Message[] = [...safeHistory, { role: 'user', content: message.trim() }];

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system,
      messages,
    });

    const reply = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    return res.status(200).json({ reply });
  } catch (err: any) {
    // Expose the real error message so we can diagnose — tighten this up after confirming it works
    const msg = err?.message ?? String(err);
    console.error('[MyPal] Anthropic error:', msg);
    return res.status(500).json({ error: `MyPal error: ${msg}` });
  }
}
