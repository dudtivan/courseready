// api/quiz.js — Groq API proxy for CourseReady
// POST /api/quiz
// Body (quiz):       { course: string, numQuestions: number }
// Body (motivation): { motivation: true, prompt: string }

export const config = { runtime: 'edge' };

const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
].filter(Boolean);

async function callGroq(payload) {
  for (const apiKey of GROQ_API_KEYS) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 429 || res.status === 503) {
      continue;
    }

    return res;
  }

  return new Response(
    JSON.stringify({ error: 'All Groq API keys are rate limited. Try again later.' }),
    { status: 429 }
  );
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  if (GROQ_API_KEYS.length === 0) {
    return new Response(JSON.stringify({ error: 'No GROQ API keys configured' }), { status: 500 });
  }

  // ── Motivation mode ──
  if (body.motivation) {
    const groqRes = await callGroq({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: body.prompt }],
      temperature: 0.9,
      max_tokens: 200,
      stream: true,
    });

    if (groqRes.status === 429) return groqRes;

    return new Response(groqRes.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  // ── Quiz generation mode ──
  const { course, numQuestions = 10 } = body;
  if (!course) return new Response(JSON.stringify({ error: 'Missing course' }), { status: 400 });

  const prompt = `You are a Philippine college readiness assessment AI. Generate exactly ${numQuestions} multiple choice questions for an incoming ${course} student in the Philippines. Questions must be based on the CHED curriculum, PRC board exam topics, and DepEd K-12 prerequisites for ${course}.

RULES:
- Each question must be relevant to ${course} prerequisites or first-year college subjects
- 4 choices per question labeled A, B, C, D
- Only ONE correct answer per question
- Vary difficulty: 30% easy, 50% medium, 20% hard
- Make questions specific and educational, not trivial

Respond ONLY with a valid JSON array. No explanation, no markdown, no code fences. Just raw JSON:
[
  {
    "q": "Question text here?",
    "choices": ["A. option one", "B. option two", "C. option three", "D. option four"],
    "answer": "A",
    "subject": "Subject/Topic name"
  }
]

Generate ${numQuestions} questions for ${course} now:`;

  const groqRes = await callGroq({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 4000,
    stream: true,
  });

  if (groqRes.status === 429) return groqRes;

  if (!groqRes.ok) {
    const err = await groqRes.text();
    return new Response(JSON.stringify({ error: `Groq error: ${err}` }), { status: 500 });
  }

  return new Response(groqRes.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}