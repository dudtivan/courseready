// api/_session.js — Shared session helper
// Import this in any API route that needs to check if the user is logged in.
//
// Usage:
//   import { parseSession } from './_session.js';
//   const user = parseSession(req);
//   if (!user) return res.redirect(302, '/login.html');
//   console.log(user.name, user.email);

/**
 * Parses the cr_user cookie and returns the session payload,
 * or null if missing / invalid.
 * @param {import('http').IncomingMessage} req
 * @returns {object|null}
 */
export function parseSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)cr_user=([^;]+)/);
  if (!match) return null;

  try {
    const json = Buffer.from(match[1], 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}