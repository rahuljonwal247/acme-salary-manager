import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BenchmarkCard } from '@/components/BenchmarkCard';
import { EmployeeActions } from '@/components/EmployeeActions';
import { SalaryHistory } from '@/components/SalaryHistory';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatMoney, formatUsd } from '@/lib/format';

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
  const [meta, benchmark] = await Promise.all([
    api.meta(),
    api.benchmark(employee.countryCode, employee.jobTitle, employee.salary),
  ]);
  const currency = employee.country.currency;

  return (
    <div className="space-y-6">
      <Link href="/employees" className="text-sm text-slate-500 hover:text-slate-900">
        ← All employees
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="text-sm text-slate-500">
            {employee.jobTitle} · {employee.department} · {employee.country.name}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums text-slate-900">{formatMoney(employee.salary, currency)}</div>
          <div className="text-sm text-slate-500">
            annual base{currency !== 'USD' && <> · ≈ {formatUsd(employee.salaryUsd)}</>}
          </div>
        </div>
      </div>

      <EmployeeActions employee={employee} meta={meta} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SalaryHistory changes={employee.salaryChanges} currency={currency} />
        </div>
        <div className="space-y-6">
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
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="truncate text-right text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
