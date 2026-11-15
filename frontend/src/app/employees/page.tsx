import Link from 'next/link';
import { EmployeeTable } from '@/components/EmployeeTable';
import { FilterBar } from '@/components/FilterBar';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { first } from '@/lib/query';

export const metadata = { title: 'Employees · ACME Salary Manager' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const department = first(sp.department);
  const params = {
    search: first(sp.search),
    country: first(sp.country),
    department,
    jobTitle: first(sp.jobTitle),
    sort: first(sp.sort) ?? 'name',
    order: first(sp.order) === 'desc' ? 'desc' : 'asc',
    page: first(sp.page),
    pageSize: 25,
  } as const;

  const [meta, page] = await Promise.all([api.meta(), api.listEmployees(params)]);

  // Job title options narrow to the selected department.
  const titles = meta.departments
    .filter((d) => !department || d.name === department)
    .flatMap((d) => d.jobTitles)
    .sort();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500">Search, filter and manage employee salaries.</p>
        </div>
        <Link href="/employees/new" className="btn-primary">
          + Add employee
        </Link>
      </div>

      <div className="card p-4">
        <FilterBar
          search={{ placeholder: 'Name, email or employee code…' }}
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
              clears: ['jobTitle'],
            },
            {
              name: 'jobTitle',
              label: 'Job title',
              allLabel: 'All job titles',
              options: titles.map((t) => ({ value: t, label: t })),
            },
          ]}
        />
      </div>

      <EmployeeTable employees={page.items} params={params} sort={params.sort} order={params.order} />
      <Pagination
        basePath="/employees"
        params={params}
        page={page.page}
        totalPages={page.totalPages}
        total={page.total}
        pageSize={page.pageSize}
      />
    </div>
  );
}
