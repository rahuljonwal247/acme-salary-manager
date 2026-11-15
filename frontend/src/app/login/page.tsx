import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in · ACME Salary Manager' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' ? sp.next : '/';
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="card p-6">
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mb-5 text-sm text-slate-500">ACME salary management — authorised HR staff only.</p>
        {sp.expired && (
          <p role="status" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Your session ended. Please sign in again.
          </p>
        )}
        <LoginForm next={next} />
      </div>
    </div>
  );
}
