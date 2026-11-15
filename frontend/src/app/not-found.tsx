import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Not found</h1>
      <p className="mt-1 text-sm text-slate-500">That employee or page doesn&apos;t exist.</p>
      <Link href="/employees" className="btn-secondary mt-4">
        Back to employees
      </Link>
    </div>
  );
}
