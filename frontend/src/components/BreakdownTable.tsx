import { formatMoney, formatNumber, formatUsd } from '@/lib/format';
import type { BreakdownItem } from '@/lib/types';

/** The table view of the breakdown chart: every value, readable without the chart. */
export function BreakdownTable({ rows, dimensionLabel }: { rows: BreakdownItem[]; dimensionLabel: string }) {
  const showLocal = rows.some((r) => r.currency && r.currency !== 'USD');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-medium">{dimensionLabel}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Headcount</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Min</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Median</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Average</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Max</th>
            {showLocal && <th scope="col" className="px-4 py-2 text-right font-medium">Median (local)</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="px-4 py-2 text-left font-sans font-normal text-slate-900">{r.label}</th>
              <td className="px-4 py-2 text-right text-slate-700">{formatNumber(r.headcount)}</td>
              <td className="px-4 py-2 text-right text-slate-700">{formatUsd(r.minUsd)}</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatUsd(r.medianUsd)}</td>
              <td className="px-4 py-2 text-right text-slate-700">{formatUsd(r.avgUsd)}</td>
              <td className="px-4 py-2 text-right text-slate-700">{formatUsd(r.maxUsd)}</td>
              {showLocal && (
                <td className="px-4 py-2 text-right text-slate-700">
                  {r.currency ? formatMoney(r.medianLocal, r.currency) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
