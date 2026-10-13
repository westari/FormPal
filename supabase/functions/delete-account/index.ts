// Supabase Edge Function — deletes the calling user's auth account (and,
// via the `on delete cascade` foreign keys in supabase_schema.sql, every row
// they own in every table). Deploy with:
//   supabase functions deploy delete-account
// Needs SUPABASE_SERVICE_ROLE_KEY available to the function (Supabase sets
// this automatically for Edge Functions in the project's own environment —
// no manual secret needed). The service role key must NEVER appear in the
// app itself, which is why this has to run server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
    }

    // Client bound to the CALLER's own token — used only to find out who's
    // asking, never to perform the deletion itself.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'not_signed_in' }), { status: 401 });
    }

    // Admin client (service role) — the only thing allowed to delete a user.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Storage objects aren't removed by the table cascades — delete them
    // first, same as lib/formpalSync.ts's local note explains.
    const { data: files } = await adminClient.storage.from('progress-photos').list(user.id);
    if (files && files.length > 0) {
      await adminClient.storage.from('progress-photos').remove(files.map(f => `${user.id}/${f.name}`));
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
