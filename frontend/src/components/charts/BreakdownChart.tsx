'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber, formatUsd } from '@/lib/format';
import type { BreakdownItem } from '@/lib/types';

const SERIES = 'var(--color-series)';

interface TooltipProps {
  active?: boolean;
  payload?: { payload: BreakdownItem }[];
}

function ChartTooltip({ active, payload }: TooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-slate-900">{row.label}</div>
      <div className="text-slate-600">
        Median base <span className="font-mono text-slate-900">{formatUsd(row.medianUsd)}</span>
      </div>
      <div className="text-slate-600">
        Payroll <span className="font-mono text-slate-900">{formatUsd(row.totalGrossUsd, true)}</span>
      </div>
      <div className="text-slate-600">
        Average <span className="font-mono text-slate-900">{formatUsd(row.avgUsd)}</span>
      </div>
      <div className="text-slate-600">
        Range{' '}
        <span className="font-mono text-slate-900">
          {formatUsd(row.minUsd, true)}–{formatUsd(row.maxUsd, true)}
        </span>
      </div>
      <div className="text-slate-600">{formatNumber(row.headcount)} employees</div>
    </div>
  );
}

export type BreakdownMetric = 'medianUsd' | 'totalGrossUsd';

/** Single-series horizontal bars: one USD metric per group, sorted high → low by that metric. */
export function BreakdownChart({ rows, metric = 'medianUsd' }: { rows: BreakdownItem[]; metric?: BreakdownMetric }) {
  const height = Math.max(160, rows.length * 30 + 40);
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric]);
  const what = metric === 'medianUsd' ? 'Median base salary' : 'Payroll (gross)';
  return (
    <div style={{ height }} role="img" aria-label={`${what} in USD by group; see table below for values`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatUsd(v, true)}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={170}
            tick={{ fill: '#334155', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
          <Bar
            dataKey={metric}
            fill={SERIES}
            barSize={18}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            label={{
              position: 'right',
              fill: '#334155',
              fontSize: 11,
              formatter: (v: unknown) => formatUsd(Number(v), true),
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
