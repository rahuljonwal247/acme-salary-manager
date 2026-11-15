import { formatMoney, formatUsd } from '@/lib/format';
import type { Employee } from '@/lib/types';

/** Current annual package: base + allowances + bonus = gross; gross − deductions = net. */
export function PayBreakdown({ employee }: { employee: Employee }) {
  const c = employee.country.currency;
  const rows: [string, number, 'plus' | 'minus' | 'total'][] = [
    ['Base salary', employee.salary, 'plus'],
    ['Allowances', employee.allowances, 'plus'],
    ['Bonus', employee.bonus, 'plus'],
    ['Gross pay', employee.gross, 'total'],
    ['Deductions', employee.deductions, 'minus'],
    ['Net pay', employee.net, 'total'],
  ];
  return (
    <div className="card p-5">
      <h2 className="mb-3 font-semibold text-slate-900">Annual compensation</h2>
      <dl className="space-y-1.5 text-sm" data-testid="pay-breakdown">
        {rows.map(([label, value, kind]) => (
          <div
            key={label}
            className={`flex justify-between gap-4 ${kind === 'total' ? 'border-t border-slate-200 pt-1.5 font-semibold text-slate-900' : 'text-slate-700'}`}
          >
            <dt>{label}</dt>
            <dd className="font-mono tabular-nums">
              {kind === 'minus' && value > 0 ? '−' : ''}
              {formatMoney(value, c)}
            </dd>
          </div>
        ))}
      </dl>
      {c !== 'USD' && (
        <p className="mt-3 text-xs text-slate-500">
          ≈ {formatUsd(employee.grossUsd)} gross · {formatUsd(employee.netUsd)} net at budget FX rates
        </p>
      )}
    </div>
  );
}
