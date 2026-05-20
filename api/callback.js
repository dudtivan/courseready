// api/callback.js — Google OAuth 2.0 Callback Handler
// Replaces auth_callback.php
// Route: GET /api/callback?code=...
// Set in Vercel env vars:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI  (must match what's in Google Cloud Console, e.g. https://yourapp.vercel.app/api/callback)

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI;

export default async function handler(req, res) {
  const { code, error } = req.query;

  // ── STEP 1: Google returned an error (user cancelled, etc.) ──
  if (error) {
    return res.redirect(302, '/login.html?error=cancelled');
  }

  // ── STEP 2: No code present ──
  if (!code) {
    return res.redirect(302, '/login.html?error=invalid');
  }

  // ── STEP 3: Exchange code for access token ──
  let tokenData;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  GOOGLE_REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });
    tokenData = await tokenRes.json();
  } catch {
    return res.redirect(302, '/login.html?error=token');
  }

  if (!tokenData?.access_token) {
    return res.redirect(302, '/login.html?error=token');
  }

  // ── STEP 4: Fetch user profile from Google ──
  let userData;
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    userData = await userRes.json();
  } catch {
    return res.redirect(302, '/login.html?error=profile');
  }

  if (!userData?.email) {
    return res.redirect(302, '/login.html?error=profile');
  }

  // ── STEP 5: Build session payload ──
  // PHP used $_SESSION; on Vercel serverless we use a signed cookie instead.
  // The cookie holds a JSON payload (base64-encoded).
  // For production, sign this with a secret (see note below).
  const sessionPayload = {
    id:      userData.id,
    name:    userData.name    ?? 'Student',
    email:   userData.email,
    picture: userData.picture ?? '',
    // Gamification defaults (real values should come from your DB)
    xp:      0,
    level:   1,
    streak:  0,
    badges:  [],
  };

  // Base64-encode the session (for production, use JWT + a secret instead)
  const cookieValue = Buffer.from(JSON.stringify(sessionPayload)).toString('base64');

  // ── STEP 6: Set session cookie and redirect ──
  // HttpOnly: JS can't read it (XSS protection)
  // Secure: HTTPS only
  // SameSite=Lax: CSRF protection
  // Max-Age: 7 days
  res.setHeader(
    'Set-Cookie',
    `cr_user=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
  );

  // ── STEP 7: Redirect to quiz ──
  return res.redirect(302, '/quiz.html');
}

/*
 * ─────────────────────────────────────────────
 * HOW TO READ THE SESSION ON OTHER PAGES
 * ─────────────────────────────────────────────
 * In any other API route (e.g. api/quiz.js):
 *
 *   import { parseSession } from './_session.js';
 *   const user = parseSession(req);
 *   if (!user) return res.redirect(302, '/login.html');
 *
 * ─────────────────────────────────────────────
 * PRODUCTION UPGRADE: JWT signing
 * ─────────────────────────────────────────────
 * Replace the base64 cookie with a signed JWT:
 *   npm install jose
 *   const { SignJWT } = await import('jose');
 *   const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
 *   const token = await new SignJWT(sessionPayload)
 *     .setProtectedHeader({ alg: 'HS256' })
 *     .setExpirationTime('7d')
 *     .sign(secret);
 * Then verify it in _session.js with jwtVerify().
 * ─────────────────────────────────────────────
 */