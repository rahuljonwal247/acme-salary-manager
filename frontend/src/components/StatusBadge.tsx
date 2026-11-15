import type { EmployeeStatus } from '@/lib/types';

/** Status shown as text + colour (never colour alone). */
export function StatusBadge({ status, className = '' }: { status: EmployeeStatus; className?: string }) {
  const active = status === 'ACTIVE';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-200 text-slate-700'
      } ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-600' : 'bg-slate-500'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
