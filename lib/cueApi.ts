import { MYPAL_API_URL } from '../constants/api';
import { supabase } from '../constants/supabase';

// Same numbers as the server (api/_lib/guard.ts LIMITS).
export const CUE_MESSAGE_MAX = 500;
export const CUE_HISTORY_MAX = 10;

export const CUE_MSG_OFFLINE = "Couldn't reach Cue. Check your connection and try again.";
export const CUE_MSG_SIGN_IN = 'Sign in to chat with Cue.';
export const CUE_MSG_LIMIT = "You've sent a lot of messages. Try again in a bit.";
export const CUE_MSG_LIMIT_DAY = "You've reached today's Cue limit. Try again tomorrow.";
export const CUE_MSG_TOO_LONG = `Keep your message under ${CUE_MESSAGE_MAX} characters.`;

type Turn = { role: 'user' | 'assistant'; content: string };

/** Sends one chat message with the user's Supabase token. Always resolves to text to show in the chat. */
export async function askCue(text: string, history: Turn[] = []): Promise<{ ok: boolean; text: string }> {
  if (text.trim().length > CUE_MESSAGE_MAX) return { ok: false, text: CUE_MSG_TOO_LONG };
  try {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, text: CUE_MSG_SIGN_IN };
    const send = (token: string) => fetch(MYPAL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: text, history: history.slice(-CUE_HISTORY_MAX) }),
    });
    let res = await send(session.access_token);
    if (res.status === 401) {
      // Token may just be stale: refresh once and retry before telling the user to sign in.
      const { data } = await supabase.auth.refreshSession();
      if (!data.session?.access_token) return { ok: false, text: CUE_MSG_SIGN_IN };
      res = await send(data.session.access_token);
    }
    if (res.status === 401) return { ok: false, text: CUE_MSG_SIGN_IN };
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, text: /today|tomorrow/i.test(String(body?.error)) ? CUE_MSG_LIMIT_DAY : CUE_MSG_LIMIT };
    }
    const data = await res.json();
    if (!res.ok || data.error || typeof data.reply !== 'string') throw new Error(data.error ?? 'Request failed');
    return { ok: true, text: data.reply };
  } catch {
    return { ok: false, text: CUE_MSG_OFFLINE };
  }
}
