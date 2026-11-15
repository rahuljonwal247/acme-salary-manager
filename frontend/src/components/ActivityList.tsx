import { describeAudit } from '@/lib/audit';
import type { AuditEntry } from '@/lib/types';

/** Who did what to this record, newest first (from the append-only audit log). */
export function ActivityList({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="card">
      <h2 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-900">Activity</h2>
      {entries.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">No changes recorded through the app yet (imported record).</p>
      ) : (
        <ol className="divide-y divide-slate-100 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-5 py-2.5">
              <span className="text-slate-800">{describeAudit(e)}</span>
              <span className="text-xs whitespace-nowrap text-slate-500">
                {e.userName ?? 'System'} · {new Date(e.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
