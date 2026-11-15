import { formatMoney, positionLabel } from '@/lib/format';
import type { Benchmark } from '@/lib/types';

/** Position of `value` within [min, max] as a 0–100 percentage, clamped. */
export function bandPercent(value: number, min: number, max: number): number {
  if (max <= min) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/**
 * "Where does this person sit vs peers with the same title in the same country?"
 * Shows the min–max range, the interquartile band (p25–p75), median tick and the employee marker.
 */
export function BenchmarkCard({ benchmark }: { benchmark: Benchmark }) {
  const { min, max, p25, p75, median, count, currency, comparison } = benchmark;

  if (count < 2 || min === null || max === null || p25 === null || p75 === null || median === null) {
    return (
      <div className="card p-5 text-sm text-slate-500">
        Not enough peers with this title in this country to benchmark.
      </div>
    );
  }

  const pos = (v: number) => `${bandPercent(v, min, max)}%`;
  const salary = comparison?.salary;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900">Pay vs peers</h2>
          <p className="text-xs text-slate-500">
            {count} {benchmark.jobTitle}s in this country
          </p>
        </div>
        {comparison?.compaRatio !== null && comparison?.compaRatio !== undefined && (
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{comparison.compaRatio.toFixed(2)}</div>
            <div className="text-xs text-slate-500" title="Salary ÷ median salary for this role and country">
              compa-ratio
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-8 mb-2 h-3" role="img" aria-label={`Pay band from ${formatMoney(min, currency)} to ${formatMoney(max, currency)}, median ${formatMoney(median, currency)}`}>
        <div className="absolute inset-y-1 right-0 left-0 rounded-full bg-slate-100" />
        <div
          className="absolute inset-y-0 rounded-full bg-blue-200"
          style={{ left: pos(p25), width: `calc(${pos(p75)} - ${pos(p25)})` }}
        />
        <div className="absolute -inset-y-1 w-0.5 bg-slate-500" style={{ left: pos(median) }} />
        {salary !== undefined && (
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
            style={{ left: pos(salary) }}
            data-testid="salary-marker"
          />
        )}
      </div>

      <dl className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
        {[
          ['Min', min],
          ['P25', p25],
          ['Median', median],
          ['P75', p75],
          ['Max', max],
        ].map(([label, v]) => (
          <div key={label as string}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-mono tabular-nums text-slate-900">{formatMoney(v as number, currency, { compact: true })}</dd>
          </div>
        ))}
      </dl>

      {comparison?.position && (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <strong>{positionLabel(comparison.position)}</strong> of the band for this role.
        </p>
      )}
    </div>
  );
}
