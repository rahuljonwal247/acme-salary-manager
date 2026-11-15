'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bucketLabel, formatNumber } from '@/lib/format';
import type { DistributionBucket } from '@/lib/types';

interface Row extends DistributionBucket {
  label: string;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-slate-900">{row.label} USD</div>
      <div className="text-slate-600">{formatNumber(row.count)} employees</div>
    </div>
  );
}

/** Histogram of annual base salary converted to USD. */
export function DistributionChart({ buckets }: { buckets: DistributionBucket[] }) {
  const rows: Row[] = buckets.map((b) => ({ ...b, label: bucketLabel(b.fromUsd, b.toUsd) }));
  return (
    <div className="h-64" role="img" aria-label="Number of employees per USD salary band">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#64748b', fontSize: 10 }}
            interval={1}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatNumber(v)}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="count" fill="var(--color-series)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
