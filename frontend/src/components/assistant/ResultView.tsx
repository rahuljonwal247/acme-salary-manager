'use client';

import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatNumber, formatUsd } from '@/lib/format';
import type { AssistantResult } from '@/lib/types';

type Row = Record<string, string | number | null>;
type Column = AssistantResult['table']['columns'][number];

export function formatCell(value: string | number | null, format: Column['format'], row: Row): string {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return value;
  if (format === 'usd') return formatUsd(value);
  if (format === 'local' && typeof row.currency === 'string') return formatMoney(value, row.currency);
  return formatNumber(value);
}

/** One verified analytics result: table (always) + single-series bar chart when meaningful. */
export function ResultView({ result }: { result: AssistantResult }) {
  const { table, chart } = result;
  const valueCol = table.columns.find((c) => c.key === chart?.valueKey);
  const chartRows = chart ? table.rows.filter((r) => typeof r[chart.valueKey] === 'number').slice(0, 25) : [];
  const fmt = (v: number) => (valueCol?.format === 'usd' ? formatUsd(v, true) : formatNumber(v));

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium tracking-wide text-slate-600 uppercase">
        {result.title}
      </div>
      {chart && chartRows.length > 1 && (
        <div style={{ height: Math.max(160, chartRows.length * 26 + 40) }} className="p-3" role="img" aria-label={`${chart.valueLabel}; values in the table below`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
              <CartesianGrid horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={chart.labelKey} width={150} tick={{ fill: '#334155', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: unknown) => [fmt(Number(v)), chart.valueLabel]}
                cursor={{ fill: '#f1f5f9' }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar
                dataKey={chart.valueKey}
                fill="var(--color-series)"
                barSize={16}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                label={{ position: 'right', fill: '#334155', fontSize: 10, formatter: (v: unknown) => fmt(Number(v)) }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              {table.columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-2 font-medium ${c.format ? 'text-right' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.rows.map((row, i) => (
              <tr key={i}>
                {table.columns.map((c, j) => (
                  <td
                    key={c.key}
                    className={`px-4 py-1.5 whitespace-nowrap ${c.format ? 'text-right font-mono tabular-nums' : ''} ${j === 0 ? 'text-slate-900' : 'text-slate-700'}`}
                  >
                    {j === 0 && typeof row.id === 'number' ? (
                      <Link href={`/employees/${row.id}`} className="hover:text-blue-700">
                        {formatCell(row[c.key] ?? null, c.format, row)}
                      </Link>
                    ) : (
                      formatCell(row[c.key] ?? null, c.format, row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
