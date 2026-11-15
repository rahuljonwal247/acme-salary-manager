import Link from 'next/link';
import { formatMoney, formatUsd } from '@/lib/format';
import type { TopEarner } from '@/lib/types';

export function TopEarners({ rows }: { rows: TopEarner[] }) {
  return (
    <section className="card overflow-x-auto">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="font-semibold text-slate-900">Highest-paid employees</h2>
        <p className="text-xs text-slate-500">By annual gross pay, compared in USD</p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-2 text-left font-medium">#</th>
            <th scope="col" className="px-5 py-2 text-left font-medium">Employee</th>
            <th scope="col" className="px-5 py-2 text-left font-medium">Role</th>
            <th scope="col" className="px-5 py-2 text-right font-medium">Gross (local)</th>
            <th scope="col" className="px-5 py-2 text-right font-medium">Gross (USD)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="px-5 py-2 text-slate-500 tabular-nums">{i + 1}</td>
              <td className="px-5 py-2 whitespace-nowrap">
                <Link href={`/employees/${r.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                  {r.name}
                </Link>
                <span className="ml-2 text-xs text-slate-500">{r.countryCode}</span>
              </td>
              <td className="px-5 py-2 text-slate-700">
                {r.jobTitle} <span className="text-xs text-slate-500">· {r.department}</span>
              </td>
              <td className="px-5 py-2 text-right font-mono tabular-nums whitespace-nowrap text-slate-700">
                {formatMoney(r.grossLocal, r.currency)}
              </td>
              <td className="px-5 py-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold text-slate-900">
                {formatUsd(r.grossUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
