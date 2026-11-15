'use client';

import { useState } from 'react';
import { reportUrl } from '@/lib/api';
import { toQueryString } from '@/lib/query';
import type { Meta } from '@/lib/types';
import { Field } from './Field';

export const REPORTS = [
  { type: 'employees', title: 'Employee report', description: 'Every employee with base, allowances, bonus, gross, deductions and net pay.' },
  { type: 'salary-history', title: 'Salary history', description: 'Every pay change with effective date, reason and who made it. Supports a date range.' },
  { type: 'departments', title: 'Department report', description: 'Headcount, payroll and salary statistics per department (USD).' },
  { type: 'countries', title: 'Country report', description: 'Headcount, payroll and salary statistics per country, with local-currency medians.' },
] as const;

/** Builds the query string for a report download from the current filter values. */
export function reportQuery(type: string, format: 'csv' | 'xlsx', f: Record<string, string>): string {
  const scoped: Record<string, string> = { format, country: f.country ?? '', department: f.department ?? '' };
  if (type === 'employees') scoped.status = f.status ?? '';
  if (type === 'salary-history') Object.assign(scoped, { from: f.from ?? '', to: f.to ?? '' });
  return toQueryString(scoped);
}

export function ReportsPanel({ meta }: { meta: Meta }) {
  const [f, setF] = useState<Record<string, string>>({ country: '', department: '', status: '', from: '', to: '' });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field id="r-country" label="Country">
          <select id="r-country" className="input" value={f.country} onChange={set('country')}>
            <option value="">All countries</option>
            {meta.countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="r-department" label="Department">
          <select id="r-department" className="input" value={f.department} onChange={set('department')}>
            <option value="">All departments</option>
            {meta.departments.map((d) => (
              <option key={d.name}>{d.name}</option>
            ))}
          </select>
        </Field>
        <Field id="r-status" label="Employee status" hint="Employee report only">
          <select id="r-status" className="input" value={f.status} onChange={set('status')}>
            <option value="">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All</option>
          </select>
        </Field>
        <Field id="r-from" label="Changes from" hint="Salary history only">
          <input id="r-from" type="date" className="input" value={f.from} onChange={set('from')} />
        </Field>
        <Field id="r-to" label="Changes to">
          <input id="r-to" type="date" className="input" value={f.to} onChange={set('to')} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <section key={r.type} className="card flex flex-col justify-between gap-4 p-5" aria-label={r.title}>
            <div>
              <h2 className="font-semibold text-slate-900">{r.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </div>
            <div className="flex gap-2">
              <a className="btn-secondary" href={reportUrl(r.type, reportQuery(r.type, 'csv', f))} download>
                Download CSV
              </a>
              <a className="btn-primary" href={reportUrl(r.type, reportQuery(r.type, 'xlsx', f))} download>
                Download Excel
              </a>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
