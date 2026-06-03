import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TEXT_LENGTH = 2000;

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

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) return Response.json({ configured: false }, { headers: CORS });

    // Set ELEVENLABS_VOICE_ID in Supabase secrets to pick your voice.
    // Find Elon-like voices in the ElevenLabs voice library and copy the ID.
    const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') ?? 'pNInz6obpgDQGcFmaJgB';

    const { text } = await req.json() as { text: string };
    if (!text?.trim()) return Response.json({ error: 'no text' }, { headers: CORS, status: 400 });
    if (text.length > MAX_TEXT_LENGTH) return Response.json({ error: 'text too long' }, { headers: CORS, status: 400 });

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.40,
          similarity_boost: 0.80,
          style: 0.25,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err }, { headers: CORS, status: 500 });
    }

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const audio = btoa(binary);

    return Response.json({ audio }, { headers: CORS });
  } catch (e) {
    return Response.json({ error: String(e) }, { headers: CORS, status: 500 });
  }
});
