import Anthropic from 'npm:@anthropic-ai/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INTERVIEW_SYS = (problem: { title: string; description: string }) =>
  `You are "LeetAI", an AI interviewer modeled after Elon Musk's direct, first-principles interview style.
PERSONALITY:
- Speak exactly like Elon: blunt, fast-thinking, occasionally dry. Use "I mean,", "Look,", "So,", "Right?" naturally.
- First-principles obsessed — challenge assumptions, demand reasoning from fundamentals.
- Get impatient with vague answers. Short, punchy follow-ups. Never praise fluff.
- Dry humor is fine. Stay terse. One or two sentences MAX per reply.
RULES:
- NEVER name the problem or hint it's a known LeetCode question.
- NEVER give the full solution or write code. Ask ONE probing question at a time.
- Push hard on time/space complexity — Elon cares about efficiency at scale.
- If they say brute force: "That works. But that's not how you'd do it at scale. Think harder."
- If they hesitate: "I mean, what's the obvious structure here?"
- Probe edge cases bluntly: "What happens with an empty input? That's the first thing that should come to mind."
The technical problem: ${problem.description}`;

const REPORT_PROMPT = (problem: string, transcript: string) =>
  `You evaluated a coding interview for "${problem}".

Transcript:
${transcript}

Rate the candidate on 5 dimensions (1-5, halves ok). Return ONLY valid JSON, no markdown:
{
  "verdict": "Strong Hire|Lean Hire|Mixed|Lean No Hire|No Hire",
  "signal": <integer 0-100>,
  "summary": "<one punchy sentence, max 12 words>",
  "scores": [
    {"label": "Problem solving",    "score": <1-5>, "note": "<10 words max>"},
    {"label": "Code quality",       "score": <1-5>, "note": "<10 words max>"},
    {"label": "Communication",      "score": <1-5>, "note": "<10 words max>"},
    {"label": "Complexity analysis","score": <1-5>, "note": "<10 words max>"},
    {"label": "Edge cases",         "score": <1-5>, "note": "<10 words max>"}
  ],
  "coaching": "<one actionable sentence, max 18 words>"
}`;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
    if (!apiKey) return Response.json({ configured: false }, { headers: CORS });

    const { mode, messages, problem } = await req.json() as {
      mode: 'chat' | 'report';
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      problem: { title: string; description: string };
    };

    const client = new Anthropic({ apiKey });

    if (mode === 'report') {
      const transcript = messages
        .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
        .join('\n');

      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{ role: 'user', content: REPORT_PROMPT(problem.title, transcript) }],
      });

      const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}';
      const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      return Response.json(JSON.parse(cleaned), { headers: CORS });
    }

    // Chat mode: inject system as first user turn (Haiku doesn't use system param)
    const claudeMessages = [
      { role: 'user' as const, content: INTERVIEW_SYS(problem) },
      { role: 'assistant' as const, content: 'Understood. I\'ll run the interview.' },
      ...messages,
    ];

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: claudeMessages,
    });

    const reply = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return Response.json({ reply, configured: true }, { headers: CORS });

  } catch (e) {
    return Response.json({ error: String(e), configured: true }, { headers: CORS });
  }
});
