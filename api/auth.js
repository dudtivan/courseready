// api/auth.js — CourseReady Auth Serverless Function
// Handles two actions:
//   GET /api/auth?action=url      → returns the Google OAuth redirect URL
//   GET /api/auth?action=logout   → clears the session cookie

const GOOGLE_CLIENT_ID    = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // e.g. https://yourapp.vercel.app/api/callback

export default function handler(req, res) {
  const { action } = req.query;

  if (action === 'url') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
      return res.status(500).json({ error: 'OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI in Vercel env vars.' });
    }

    const params = new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      redirect_uri:  GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope:         'openid email profile',
      access_type:   'offline',
      prompt:        'select_account',
    });

    return res.status(200).json({
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  }

  if (action === 'logout') {
    // Clear the session cookie
    res.setHeader('Set-Cookie', 'cr_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return res.redirect(302, '/');
  }

  return res.status(400).json({ error: 'Unknown action. Use ?action=url or ?action=logout' });
}