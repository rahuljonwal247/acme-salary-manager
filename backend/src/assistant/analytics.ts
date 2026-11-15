import { z } from 'zod';
import { DEPARTMENT_NAMES, JOB_TITLES } from '../domain/reference';
import type { Country } from '../domain/types';
import type { InsightFilter } from '../repositories/types';
import type { InsightsService } from '../services/insightsService';

/**
 * The catalogue of *vetted* analytics the assistant may run. Whoever plans the query (Claude or the
 * offline parser) can only pick one of these and fill in enumerated parameters; execution always goes
 * through the same SQL-backed InsightsService the dashboard uses. Numbers therefore always come from
 * the database — never from a language model.
 */

const department = z.enum(DEPARTMENT_NAMES as [string, ...string[]]);
const jobTitle = z.enum(JOB_TITLES as [string, ...string[]]);
const country = z.string().regex(/^[A-Z]{2}$/);

const filterSchema = z
  .object({
    country: country.optional(),
    department: department.optional(),
    jobTitle: jobTitle.optional(),
  })
  .strict();

export const METRICS = ['median', 'average', 'payroll', 'headcount', 'max', 'min'] as const;
export type Metric = (typeof METRICS)[number];

export const analyticsQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('summary'), filter: filterSchema.default({}) }),
  z.object({
    kind: z.literal('breakdown'),
    by: z.enum(['country', 'department', 'jobTitle']),
    metric: z.enum(METRICS).default('median'),
    order: z.enum(['desc', 'asc']).default('desc'),
    limit: z.number().int().min(1).max(30).optional(),
    filter: filterSchema.default({}),
  }),
  z.object({
    kind: z.literal('top_earners'),
    limit: z.number().int().min(1).max(50).default(10),
    filter: filterSchema.default({}),
  }),
  z.object({ kind: z.literal('benchmark'), country, jobTitle }),
  z.object({ kind: z.literal('distribution'), filter: filterSchema.default({}) }),
]);
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export interface ResultTable {
  columns: { key: string; label: string; format?: 'usd' | 'number' | 'local' }[];
  rows: Record<string, string | number | null>[];
}

export interface AnalyticsResult {
  query: AnalyticsQuery;
  title: string;
  /** a short factual sentence built only from the result numbers */
  summary: string;
  table: ResultTable;
  chart?: { labelKey: string; valueKey: string; valueLabel: string };
}

const usd = (n: number | null | undefined) =>
  n === null || n === undefined ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`;
const num = (n: number) => n.toLocaleString('en-US');

const METRIC_LABEL: Record<Metric, string> = {
  median: 'Median base salary (USD)',
  average: 'Average base salary (USD)',
  payroll: 'Payroll – gross pay (USD)',
  headcount: 'Headcount',
  max: 'Highest base salary (USD)',
  min: 'Lowest base salary (USD)',
};

function describeFilter(f: InsightFilter, countries: Country[]): string {
  const parts: string[] = [];
  if (f.jobTitle) parts.push(`${f.jobTitle}s`);
  if (f.department) parts.push(`in ${f.department}`);
  if (f.country) parts.push(`in ${countries.find((c) => c.code === f.country)?.name ?? f.country}`);
  return parts.length ? parts.join(' ') : 'across ACME';
}

export class AnalyticsExecutor {
  constructor(
    private readonly insights: InsightsService,
    private readonly countries: () => Promise<Country[]>,
  ) {}

  /** Validates (again) and runs a query. Throws on invalid input — callers report it as a tool error. */
  async run(raw: unknown): Promise<AnalyticsResult> {
    const query = analyticsQuerySchema.parse(raw);
    const countries = await this.countries();
    if ('filter' in query && query.filter.country && !countries.some((c) => c.code === query.filter.country)) {
      throw new Error(`Unknown country code ${query.filter.country}`);
    }

    switch (query.kind) {
      case 'summary': {
        const s = await this.insights.summary(query.filter);
        const scope = describeFilter(query.filter, countries);
        return {
          query,
          title: `Pay summary ${scope}`,
          summary:
            s.headcount === 0
              ? `There are no active employees ${scope}.`
              : `${num(s.headcount)} active employees ${scope}: median base salary ${usd(s.medianUsd)}, average ${usd(
                  s.averageUsd,
                )}, total annual payroll ${usd(s.totalPayrollUsd)} (gross, USD).`,
          table: {
            columns: [
              { key: 'metric', label: 'Metric' },
              { key: 'value', label: 'Value' },
            ],
            rows: [
              { metric: 'Headcount', value: num(s.headcount) },
              { metric: 'Median base salary', value: usd(s.medianUsd) },
              { metric: 'Average base salary', value: usd(s.averageUsd) },
              { metric: 'Average gross pay', value: usd(s.averageGrossUsd) },
              { metric: 'Total payroll (gross)', value: usd(s.totalPayrollUsd) },
            ],
          },
        };
      }

      case 'breakdown': {
        const rows = await this.insights.breakdown(query.by, query.filter);
        const value = (r: (typeof rows)[number]) =>
          ({
            median: r.medianUsd,
            average: r.avgUsd,
            payroll: r.totalGrossUsd,
            headcount: r.headcount,
            max: r.maxUsd,
            min: r.minUsd,
          })[query.metric];
        const sorted = [...rows].sort((a, b) => (query.order === 'desc' ? value(b) - value(a) : value(a) - value(b)));
        const limited = query.limit ? sorted.slice(0, query.limit) : sorted;
        const dim = { country: 'Country', department: 'Department', jobTitle: 'Job title' }[query.by];
        const top = limited[0];
        const fmt = (n: number) => (query.metric === 'headcount' ? num(n) : usd(n));
        return {
          query,
          title: `${METRIC_LABEL[query.metric]} by ${dim.toLowerCase()} ${describeFilter(query.filter, countries)}`,
          summary: top
            ? `${query.order === 'desc' ? 'Highest' : 'Lowest'} ${METRIC_LABEL[query.metric].toLowerCase()}: ${top.label} at ${fmt(
                value(top),
              )}${limited.length > 1 ? `; ${limited.length} groups shown` : ''}.`
            : 'No matching employees.',
          table: {
            columns: [
              { key: 'label', label: dim },
              { key: 'value', label: METRIC_LABEL[query.metric], format: query.metric === 'headcount' ? 'number' : 'usd' },
              { key: 'headcount', label: 'Headcount', format: 'number' },
            ],
            rows: limited.map((r) => ({ label: r.label, value: value(r), headcount: r.headcount })),
          },
          chart: { labelKey: 'label', valueKey: 'value', valueLabel: METRIC_LABEL[query.metric] },
        };
      }

      case 'top_earners': {
        const rows = await this.insights.topEarners(query.filter, query.limit);
        const scope = describeFilter(query.filter, countries);
        const first = rows[0];
        return {
          query,
          title: `Top ${rows.length} earners ${scope} (gross pay)`,
          summary: first
            ? `The highest-paid active employee ${scope} is ${first.name} (${first.jobTitle}, ${first.countryCode}) with gross pay of ${usd(
                first.grossUsd,
              )} a year.`
            : `No active employees ${scope}.`,
          table: {
            columns: [
              { key: 'name', label: 'Employee' },
              { key: 'jobTitle', label: 'Job title' },
              { key: 'department', label: 'Department' },
              { key: 'country', label: 'Country' },
              { key: 'grossLocal', label: 'Gross (local)', format: 'local' },
              { key: 'grossUsd', label: 'Gross (USD)', format: 'usd' },
            ],
            rows: rows.map((r) => ({
              id: r.id,
              name: r.name,
              jobTitle: r.jobTitle,
              department: r.department,
              country: r.countryCode,
              currency: r.currency,
              grossLocal: r.grossLocal,
              grossUsd: r.grossUsd,
            })),
          },
        };
      }

      case 'benchmark': {
        const b = await this.insights.benchmark(query.country, query.jobTitle);
        const where = countries.find((c) => c.code === query.country)?.name ?? query.country;
        const money = (n: number | null) => (n === null ? 'n/a' : `${b.currency} ${num(n)}`);
        return {
          query,
          title: `Pay band: ${query.jobTitle} in ${where}`,
          summary:
            b.count === 0
              ? `There are no active ${query.jobTitle}s in ${where}.`
              : `${b.count} ${query.jobTitle}s in ${where}: median base ${money(b.median)}, middle 50% between ${money(
                  b.p25,
                )} and ${money(b.p75)}, range ${money(b.min)}–${money(b.max)}.`,
          table: {
            columns: [
              { key: 'stat', label: 'Statistic' },
              { key: 'value', label: `Base salary (${b.currency})` },
            ],
            rows: (
              [
              ['Employees', num(b.count)],
              ['Minimum', money(b.min)],
              ['25th percentile', money(b.p25)],
              ['Median', money(b.median)],
              ['75th percentile', money(b.p75)],
              ['Maximum', money(b.max)],
              ] as [string, string][]
            ).map(([stat, value]) => ({ stat, value })),
          },
        };
      }

      case 'distribution': {
        const buckets = await this.insights.distribution(query.filter);
        const total = buckets.reduce((s, b) => s + b.count, 0);
        const peak = buckets.reduce((m, b) => (b.count > m.count ? b : m), buckets[0]!);
        const label = (b: { fromUsd: number; toUsd: number | null }) =>
          b.toUsd === null ? `$${b.fromUsd / 1000}K+` : `$${b.fromUsd / 1000}K–${b.toUsd / 1000}K`;
        return {
          query,
          title: `Salary distribution ${describeFilter(query.filter, countries)} (base, USD)`,
          summary: total
            ? `${num(total)} employees; the most common band is ${label(peak)} with ${num(peak.count)} people.`
            : 'No matching employees.',
          table: {
            columns: [
              { key: 'band', label: 'Band (USD)' },
              { key: 'count', label: 'Employees', format: 'number' },
            ],
            rows: buckets.map((b) => ({ band: label(b), count: b.count })),
          },
          chart: { labelKey: 'band', valueKey: 'count', valueLabel: 'Employees' },
        };
      }
    }
  }
}
