'use client';

import { useActionState } from 'react';
import { Field } from '@/components/Field';
import { login, type LoginState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </div>
      )}
      <input type="hidden" name="next" value={next} />
      <Field id="email" label="Work email">
        <input id="email" name="email" type="email" autoComplete="username" required className="input" defaultValue={state.email} />
      </Field>
      <Field id="password" label="Password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </Field>
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
