/** Shared between server code (actions, route handlers, middleware). */
export const SESSION_COOKIE = 'acme_session';
export const SESSION_MAX_AGE = 8 * 60 * 60; // matches the API's JWT lifetime

/** Internal API origin, used only on the server. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  // Secure in production; COOKIE_SECURE=false allows plain-http demos (e.g. a LAN docker run).
  secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
  path: '/',
  maxAge: SESSION_MAX_AGE,
};

/** Only allow same-site relative redirects after login (no open redirects). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
