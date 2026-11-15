import Link from 'next/link';
import { BreakdownTable } from '@/components/BreakdownTable';
import { BreakdownChart } from '@/components/charts/BreakdownChart';
import { DistributionChart } from '@/components/charts/DistributionChart';
import { FilterBar } from '@/components/FilterBar';
import { api } from '@/lib/api';
import { formatNumber, formatUsd } from '@/lib/format';
import { first, withParams } from '@/lib/query';
import type { BreakdownDimension } from '@/lib/types';

const DIMENSIONS: { value: BreakdownDimension; label: string }[] = [
  { value: 'country', label: 'Country' },
  { value: 'department', label: 'Department' },
  { value: 'jobTitle', label: 'Job title' },
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filter = { country: first(sp.country), department: first(sp.department) };
  const requested = first(sp.by);
  const by: BreakdownDimension = DIMENSIONS.some((d) => d.value === requested)
    ? (requested as BreakdownDimension)
    : 'country';
  const dimLabel = DIMENSIONS.find((d) => d.value === by)!.label;

  const [meta, summary, breakdown, distribution] = await Promise.all([
    api.meta(),
    api.summary(filter),
    api.breakdown(by, filter),
    api.distribution(filter),
  ]);

  const scope = [
    filter.country && meta.countries.find((c) => c.code === filter.country)?.name,
    filter.department,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">How ACME pays people</h1>
        <p className="text-sm text-slate-500">
          {scope || 'Whole organisation'} · annual base salary, converted to USD at budget FX rates for comparison
        </p>
      </div>

      <div className="card p-4">
        <FilterBar
          selects={[
            {
              name: 'country',
              label: 'Country',
              allLabel: 'All countries',
              options: meta.countries.map((c) => ({ value: c.code, label: c.name })),
            },
            {
              name: 'department',
              label: 'Department',
              allLabel: 'All departments',
              options: meta.departments.map((d) => ({ value: d.name, label: d.name })),
            },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Headcount" value={formatNumber(summary.headcount)} />
        <Kpi label="Annual payroll" value={formatUsd(summary.totalPayrollUsd, true)} hint="base salary, USD" />
        <Kpi label="Median salary" value={formatUsd(summary.medianUsd)} hint="half earn more, half less" />
        <Kpi label="Average salary" value={formatUsd(summary.averageUsd)} hint="pulled up by high earners" />
      </div>

      {summary.headcount === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">No employees match these filters.</div>
      ) : (
        <>
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <h2 className="font-semibold text-slate-900">Median salary by {dimLabel.toLowerCase()} (USD)</h2>
              <nav className="flex gap-1 rounded-lg bg-slate-100 p-1" aria-label="Group by">
                {DIMENSIONS.map((d) => (
                  <Link
                    key={d.value}
                    href={`/${withParams({ ...filter, by }, { by: d.value })}`}
                    aria-current={d.value === by ? 'true' : undefined}
                    className={`rounded-md px-3 py-1 text-sm ${
                      d.value === by ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {d.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="p-5">
              <BreakdownChart rows={breakdown} />
            </div>
            <div className="border-t border-slate-200">
              <BreakdownTable rows={breakdown} dimensionLabel={dimLabel} />
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold text-slate-900">Salary distribution (USD)</h2>
            <p className="mb-4 text-xs text-slate-500">Employees per $20K band of annual base salary</p>
            <DistributionChart buckets={distribution} />
          </section>
        </>
      )}
    </div>
  );
}
