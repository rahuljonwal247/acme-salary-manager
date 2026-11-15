import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { isSameOrigin } from '@/lib/origin';
import { API_URL, SESSION_COOKIE } from '@/lib/session';

/**
 * Backend-for-frontend proxy: browser → /bff/* → API /api/*.
 * Keeps the JWT in an httpOnly cookie (invisible to JS / XSS) and the API off the public CORS path.
 */
async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // CSRF defence in depth (on top of SameSite=Lax): mutating requests must come from this site.
  if (req.method !== 'GET' && !isSameOrigin(req.headers.get('origin'), req.headers)) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Cross-site request blocked' } }, { status: 403 });
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Please sign in' } }, { status: 401 });
  }

  const { path } = await params;
  const target = `${API_URL}/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const contentType = req.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: { code: 'UNAVAILABLE', message: 'API unavailable' } }, { status: 502 });
  }

  const out = new Headers();
  for (const h of ['content-type', 'content-disposition', 'cache-control', 'retry-after']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
