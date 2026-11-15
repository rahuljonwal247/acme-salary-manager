import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, createApi, parseResponse, type Requester } from './api-core';
import { API_URL, SESSION_COOKIE } from './session';
import type { User } from './types';

/**
 * Server transport for Server Components: reads the session cookie and calls the API directly.
 * An expired/invalid session redirects to the login page.
 */
const serverRequest: Requester = async (path, init = {}) => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    });
  } catch {
    throw new ApiError('Cannot reach the API server', 0);
  }
  if (res.status === 401) redirect('/login?expired=1');
  return parseResponse(res);
};

export const serverApi = createApi(serverRequest);

/** Current user, or null when not signed in (never redirects — used by the layout). */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? ((await res.json()) as User) : null;
  } catch {
    return null;
  }
}

/** For admin-only pages. */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/');
  return user;
}
