// api/users.js — CourseReady User Registry
// Tracks who logged in and their quiz activity.
//
// GET  /api/users          → list all users (admin only, checks ADMIN_SECRET header)
// POST /api/users          → upsert a user record (called from dashboard on every login)
//
// Required Vercel env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY   ← use the service role key (bypasses RLS)
//   ADMIN_SECRET           ← a secret string you choose, passed as x-admin-secret header

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET        = process.env.ADMIN_SECRET;

// ── Supabase REST helper ──
async function supabase(path, method = 'GET', body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        method === 'POST' ? 'resolution=merge-duplicates,return=representation' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Session helper (same logic as _session.js) ──
function parseSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)cr_user=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  } catch { return null; }
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.' });
  }

  // ─────────────────────────────────────────────
  // GET /api/users — Admin: list all users
  // Requires header: x-admin-secret: <ADMIN_SECRET>
  // ─────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const users = await supabase(
        '/cr_users?select=*&order=last_login.desc'
      );
      return res.status(200).json(users);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─────────────────────────────────────────────
  // POST /api/users — Upsert logged-in user record
  // Called from dashboard.html on every page load.
  // Body: { questionsAnswered, quizzesDone, avgScore, quizHistory }
  // The user identity comes from the session cookie.
  // ─────────────────────────────────────────────
  if (req.method === 'POST') {
    const session = parseSession(req);
    if (!session) return res.status(401).json({ error: 'Not logged in' });

    let body = {};
    try { body = await req.json(); } catch { /* body is optional */ }

    const record = {
      google_id:          session.id,
      name:               session.name    || 'Student',
      email:              session.email,
      picture:            session.picture || '',
      xp:                 session.xp      || 0,
      level:              session.level   || 1,
      streak:             session.streak  || 0,
      badges:             session.badges  || [],
      quizzes_done:       body.quizzesDone        || 0,
      questions_answered: body.questionsAnswered   || 0,
      avg_score:          body.avgScore            || 0,
      quiz_history:       body.quizHistory         || [],
      last_login:         new Date().toISOString(),
    };

    try {
      // ON CONFLICT (email) → update everything except first_seen
      const result = await supabase('/cr_users', 'POST', record);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}