/**
 * True when a request's Origin matches the host the browser actually addressed.
 *
 * Compare against the Host / X-Forwarded-Host header — NOT the server's own URL: inside a container or
 * behind a proxy the server sees itself as e.g. 0.0.0.0:3000 while the browser used localhost:3000 or a
 * public domain. (Comparing with req.nextUrl.origin blocked every save in the production container.)
 * A missing Origin (same-origin GETs, some older clients) is allowed; SameSite=Lax cookies still apply.
 */
export function isSameOrigin(origin: string | null, headers: Headers): boolean {
  if (!origin) return true;
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host.split(',')[0]!.trim();
  } catch {
    return false;
  }
}
