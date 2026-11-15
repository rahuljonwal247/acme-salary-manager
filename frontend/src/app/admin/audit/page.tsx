import Link from 'next/link';
import { FilterBar } from '@/components/FilterBar';
import { Pagination } from '@/components/Pagination';
import { describeAudit } from '@/lib/audit';
import { first } from '@/lib/query';
import { requireAdmin, serverApi as api } from '@/lib/server-api';

export const metadata = { title: 'Audit log · ACME Salary Manager' };

const ACTIONS = [
  'SALARY_CHANGED',
  'EMPLOYEE_CREATED',
  'EMPLOYEE_UPDATED',
  'EMPLOYEE_DEACTIVATED',
  'EMPLOYEE_REACTIVATED',
  'USER_CREATED',
  'USER_UPDATED',
  'LOGIN',
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const params = { action: first(sp.action), entityType: first(sp.entityType), page: first(sp.page), pageSize: 50 };
  const log = await api.auditLogs(params);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-500">Append-only record of every change to employees, pay and user accounts.</p>
      </div>
      <div className="card p-4">
        <FilterBar
          selects={[
            {
              name: 'action',
              label: 'Action',
              allLabel: 'All actions',
              options: ACTIONS.map((a) => ({ value: a, label: a.replace(/_/g, ' ').toLowerCase() })),
            },
            {
              name: 'entityType',
              label: 'Record type',
              allLabel: 'All records',
              options: [
                { value: 'EMPLOYEE', label: 'Employees' },
                { value: 'USER', label: 'Users' },
              ],
            },
          ]}
        />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium">When</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Who</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Record</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">What</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {log.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No audit entries match.
                </td>
              </tr>
            )}
            {log.items.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                  {new Date(e.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-900">{e.userName ?? 'System'}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {e.entityType === 'EMPLOYEE' && e.entityId ? (
                    <Link href={`/employees/${e.entityId}`} className="text-blue-700 hover:underline">
                      Employee #{e.entityId}
                    </Link>
                  ) : (
                    <span className="text-slate-700">
                      {e.entityType === 'USER' ? 'User' : 'Employee'} #{e.entityId}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-800">{describeAudit(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/admin/audit" params={params} page={log.page} totalPages={log.totalPages} total={log.total} pageSize={log.pageSize} />
    </div>
  );
}
