import Link from 'next/link';
import { formatDate, formatMoney, formatUsd } from '@/lib/format';
import { withParams, type Params } from '@/lib/query';
import type { EmployeeListItem } from '@/lib/types';

interface Props {
  employees: EmployeeListItem[];
  params: Params;
  sort: string;
  order: 'asc' | 'desc';
}

function SortHeader({ field, label, params, sort, order, align = 'left' }: {
  field: string;
  label: string;
  params: Params;
  sort: string;
  order: 'asc' | 'desc';
  align?: 'left' | 'right';
}) {
  const active = sort === field;
  const nextOrder = active && order === 'asc' ? 'desc' : 'asc';
  return (
    <th
      scope="col"
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <Link href={`/employees${withParams(params, { sort: field, order: nextOrder })}`} className="hover:text-slate-900">
        {label}
        <span className="ml-1 text-slate-400">{active ? (order === 'asc' ? '▲' : '▼') : ''}</span>
      </Link>
    </th>
  );
}

export function EmployeeTable({ employees, params, sort, order }: Props) {
  if (employees.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500">
        No employees match these filters.
      </div>
    );
  }
  const h = { params, sort, order };
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <SortHeader field="name" label="Name" {...h} />
            <th scope="col" className="px-4 py-3 text-left font-medium">Role</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Country</th>
            <SortHeader field="hireDate" label="Hired" {...h} />
            <SortHeader field="salary" label="Salary" align="right" {...h} />
            <th scope="col" className="px-4 py-3 text-right font-medium">≈ USD</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {employees.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/employees/${e.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                  {e.firstName} {e.lastName}
                </Link>
                <div className="text-xs text-slate-500">
                  {e.employeeCode} · {e.email}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="text-slate-900">{e.jobTitle}</div>
                <div className="text-xs text-slate-500">{e.department}</div>
              </td>
              <td className="px-4 py-3 text-slate-700">{e.country.name}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatDate(e.hireDate)}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-900">
                {formatMoney(e.salary, e.country.currency)}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-500">
                {formatUsd(e.salaryUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
