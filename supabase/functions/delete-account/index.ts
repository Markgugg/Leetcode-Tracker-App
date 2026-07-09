// Permanently deletes the authenticated user's account (App Store Guideline 5.1.1(v)).
// Auth user deletion cascades through profiles → solves/streaks/group_members/etc.
// via the ON DELETE CASCADE chain in migration 0001. Avatar files are removed
// best-effort. Deploy: supabase functions deploy delete-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Auth: require valid user JWT ─────────────────────────────────────────
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS });

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Best-effort: clear avatar storage before the row cascade removes the pointer.
    try {
      const { data: files } = await admin.storage.from('avatars').list(user.id);
      if (files?.length) {
        await admin.storage.from('avatars').remove(files.map(f => `${user.id}/${f.name}`));
      }
    } catch {
      // Storage cleanup failure must not block account deletion.
    }

    // If the user is the last member of a group, the group would be orphaned —
    // reuse the leave_group RPC semantics by deleting empty groups afterwards.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      return Response.json({ error: delErr.message }, { status: 500, headers: CORS });
    }

    // Remove any groups left with zero members.
    await admin.rpc('cleanup_empty_groups').then(() => {}, () => {});

    return Response.json({ ok: true }, { headers: CORS });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS });
  }
});
