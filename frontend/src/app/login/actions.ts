'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL, cookieOptions, safeNext, SESSION_COOKIE } from '@/lib/session';

export interface LoginState {
  error?: string;
  email?: string;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password', email };

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return { error: 'The server is unavailable. Try again shortly.', email };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return { error: body?.error?.message ?? 'Sign-in failed', email };

  (await cookies()).set(SESSION_COOKIE, body.token, cookieOptions);
  redirect(safeNext(String(form.get('next') ?? '')));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
