import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return Response.json({ hints: null, configured: false }, { headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { weakTopics, totalSolved, easy, medium, hard } = await req.json() as {
      weakTopics: Array<{ label: string; pct: number }>;
      totalSolved: number;
      easy: number;
      medium: number;
      hard: number;
    };
    // Always use the authenticated user's ID — ignore any userId in the body
    const userId = user.id;

    // Refuse to generate or serve cached tips based on empty data
    if (!totalSolved || totalSolved === 0) {
      return Response.json({ hints: null, configured: true, error: 'no_data' }, { headers: CORS });
    }

    // Check cache
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('ai_hints, ai_hints_refreshed_at')
        .eq('id', userId)
        .maybeSingle();

      const refreshedAt = profile?.ai_hints_refreshed_at
        ? new Date(profile.ai_hints_refreshed_at).getTime()
        : 0;

      const withinTTL = Date.now() - refreshedAt < CACHE_TTL_MS;
      // Bust cache if first hint looks like it was generated for a zero-solve user
      const cachedHints: string[] | null = profile?.ai_hints ?? null;
      const staleZeroCache = cachedHints?.some(h =>
        /\b0\b.*solv|no solves|haven.t solved|zero/i.test(h)
      ) ?? false;

      if (cachedHints && withinTTL && !staleZeroCache) {
        return Response.json({ hints: cachedHints, configured: true, cached: true, refreshed_at: profile!.ai_hints_refreshed_at }, { headers: CORS });
      }
    }

    const weakList = weakTopics
      .slice(0, 4)
      .map(t => `${t.label} (${Math.round(t.pct * 100)}% coverage)`)
      .join(', ');

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `CS Twitter grind coach. Brutally honest, zero fluff. Stats: ${totalSolved} solved (${easy}E/${medium}M/${hard}H). Weakest: ${weakList}. Give 3 tips. Rules: each tip under 12 words, roast their weak spots, use "cooked" "skill issue" "grind" "bro" "mid" naturally, actually helpful, no em dashes no parens. Raw JSON only: ["tip1","tip2","tip3"]`,
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]';
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    let hints: string[];
    try {
      hints = JSON.parse(cleaned);
      if (!Array.isArray(hints) || hints.length === 0) throw new Error();
    } catch {
      hints = [cleaned];
    }
    hints = hints.slice(0, 3);

    // Save to cache
    if (userId) {
      await supabase
        .from('profiles')
        .update({ ai_hints: hints, ai_hints_refreshed_at: new Date().toISOString() })
        .eq('id', userId);
    }

    const now = new Date().toISOString();
    return Response.json({ hints, configured: true, cached: false, refreshed_at: now }, { headers: CORS });
  } catch (e) {
    return Response.json({ hints: null, error: String(e), configured: true }, { headers: CORS });
  }
});
