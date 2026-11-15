import { formatDate, formatMoney, formatPercent, reasonLabel } from '@/lib/format';
import type { SalaryChange } from '@/lib/types';

export function SalaryHistory({ changes, currency }: { changes: SalaryChange[]; currency: string }) {
  return (
    <div className="card overflow-x-auto">
      <h2 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-900">Salary history</h2>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-2 text-left font-medium">Effective</th>
            <th scope="col" className="px-5 py-2 text-left font-medium">Reason</th>
            <th scope="col" className="px-5 py-2 text-right font-medium">Salary</th>
            <th scope="col" className="px-5 py-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {changes.map((c) => (
            <tr key={c.id}>
              <td className="px-5 py-2.5 whitespace-nowrap text-slate-700">{formatDate(c.effectiveDate)}</td>
              <td className="px-5 py-2.5 text-slate-700">{reasonLabel(c.reason)}</td>
              <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-900">
                {formatMoney(c.newSalary, currency)}
              </td>
              <td
                className={`px-5 py-2.5 text-right font-mono tabular-nums ${
                  c.changePercent === null ? 'text-slate-400' : c.changePercent >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {formatPercent(c.changePercent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
