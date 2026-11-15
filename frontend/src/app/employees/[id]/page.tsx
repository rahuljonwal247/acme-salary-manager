import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityList } from '@/components/ActivityList';
import { BenchmarkCard } from '@/components/BenchmarkCard';
import { EmployeeActions } from '@/components/EmployeeActions';
import { PayBreakdown } from '@/components/PayBreakdown';
import { SalaryHistory } from '@/components/SalaryHistory';
import { StatusBadge } from '@/components/StatusBadge';
import { ApiError } from '@/lib/api-core';
import { formatDate, formatMoney, formatUsd } from '@/lib/format';
import { serverApi as api } from '@/lib/server-api';

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  let employee;
  try {
    employee = await api.getEmployee(numericId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const [meta, benchmark, activity] = await Promise.all([
    api.meta(),
    api.benchmark(employee.countryCode, employee.jobTitle, employee.salary),
    api.employeeAudit(employee.id),
  ]);
  const currency = employee.country.currency;

  return (
    <div className="space-y-6">
      <Link href="/employees" className="text-sm text-slate-500 hover:text-slate-900">
        ← All employees
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-slate-900">
            {employee.firstName} {employee.lastName}
            <StatusBadge status={employee.status} />
          </h1>
          <p className="text-sm text-slate-500">
            {employee.jobTitle} · {employee.department} · {employee.country.name}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums text-slate-900">{formatMoney(employee.gross, currency)}</div>
          <div className="text-sm text-slate-500">
            gross per year{currency !== 'USD' && <> · ≈ {formatUsd(employee.grossUsd)}</>}
          </div>
        </div>
      </div>

      {employee.status === 'INACTIVE' && (
        <p role="status" className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          Deactivated{employee.deactivatedAt ? ` on ${formatDate(employee.deactivatedAt)}` : ''}. Excluded from analytics;
          reactivate to change pay.
        </p>
      )}

      <EmployeeActions employee={employee} meta={meta} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SalaryHistory changes={employee.salaryChanges} currency={currency} />
          <ActivityList entries={activity.items} />
        </div>
        <div className="min-w-0 space-y-6">
          <PayBreakdown employee={employee} />
          <BenchmarkCard benchmark={benchmark} />
          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
            <dl className="space-y-2 text-sm">
              {[
                ['Employee code', employee.employeeCode],
                ['Email', employee.email],
                ['Hire date', formatDate(employee.hireDate)],
                ['Pay currency', currency],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">{k}</dt>
                  <dd className="min-w-0 truncate text-right text-slate-900" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
