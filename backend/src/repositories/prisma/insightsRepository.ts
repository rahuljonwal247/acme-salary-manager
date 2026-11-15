import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  BenchmarkRow,
  BreakdownDimension,
  BreakdownRow,
  DistributionRow,
  InsightFilter,
  InsightsRepository,
  SummaryRow,
} from '../types';

/**
 * Aggregations run inside Postgres (percentile_cont, GROUP BY) so we never pull 10k rows into Node.
 * All user input goes through Prisma.sql parameter binding; the only raw fragment is the GROUP BY
 * column, which comes from a fixed allow-list below.
 */
const GROUP_COLUMNS: Record<BreakdownDimension, Prisma.Sql> = {
  country: Prisma.raw('e.country_code'),
  department: Prisma.raw('e.department'),
  jobTitle: Prisma.raw('e.job_title'),
};

const USD = Prisma.sql`(e.salary * c.usd_rate)`;
const FROM = Prisma.sql`FROM employees e JOIN countries c ON c.code = e.country_code`;

function where(filter: InsightFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (filter.country) conditions.push(Prisma.sql`e.country_code = ${filter.country}`);
  if (filter.department) conditions.push(Prisma.sql`e.department = ${filter.department}`);
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

const round = (n: number | null): number | null => (n === null ? null : Math.round(n));

export class PrismaInsightsRepository implements InsightsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async summary(filter: InsightFilter): Promise<SummaryRow> {
    const [row] = await this.prisma.$queryRaw<
      { headcount: number; total: number | null; avg: number | null; median: number | null }[]
    >`
      SELECT count(*)::int AS headcount,
             sum(${USD})::float8 AS total,
             avg(${USD})::float8 AS avg,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ${USD})::float8 AS median
      ${FROM} ${where(filter)}`;
    return {
      headcount: row?.headcount ?? 0,
      totalUsd: round(row?.total ?? 0) ?? 0,
      avgUsd: round(row?.avg ?? null),
      medianUsd: round(row?.median ?? null),
    };
  }

  async breakdown(by: BreakdownDimension, filter: InsightFilter): Promise<BreakdownRow[]> {
    const col = GROUP_COLUMNS[by];
    const rows = await this.prisma.$queryRaw<
      {
        key: string;
        headcount: number;
        min_usd: number;
        max_usd: number;
        avg_usd: number;
        median_usd: number;
        currency: string | null;
        min_local: number;
        max_local: number;
        avg_local: number;
        median_local: number;
      }[]
    >`
      SELECT ${col} AS key,
             count(*)::int AS headcount,
             min(${USD})::float8 AS min_usd,
             max(${USD})::float8 AS max_usd,
             avg(${USD})::float8 AS avg_usd,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ${USD})::float8 AS median_usd,
             CASE WHEN count(DISTINCT c.currency) = 1 THEN min(c.currency) END AS currency,
             min(e.salary)::float8 AS min_local,
             max(e.salary)::float8 AS max_local,
             avg(e.salary)::float8 AS avg_local,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY e.salary)::float8 AS median_local
      ${FROM} ${where(filter)}
      GROUP BY ${col}`;

    return rows.map((r) => {
      // Local-currency stats only make sense when the whole group shares one currency.
      const local = r.currency !== null;
      return {
        key: r.key,
        headcount: r.headcount,
        minUsd: Math.round(r.min_usd),
        maxUsd: Math.round(r.max_usd),
        avgUsd: Math.round(r.avg_usd),
        medianUsd: Math.round(r.median_usd),
        currency: r.currency,
        minLocal: local ? Math.round(r.min_local) : null,
        maxLocal: local ? Math.round(r.max_local) : null,
        avgLocal: local ? Math.round(r.avg_local) : null,
        medianLocal: local ? Math.round(r.median_local) : null,
      };
    });
  }

  async distribution(filter: InsightFilter, bucketSizeUsd: number): Promise<DistributionRow[]> {
    return this.prisma.$queryRaw<DistributionRow[]>`
      SELECT floor(${USD} / ${bucketSizeUsd})::int AS bucket, count(*)::int AS count
      ${FROM} ${where(filter)}
      GROUP BY 1 ORDER BY 1`;
  }

  async benchmark(countryCode: string, jobTitle: string): Promise<BenchmarkRow> {
    const [row] = await this.prisma.$queryRaw<
      { count: number; min: number | null; p25: number | null; median: number | null; p75: number | null; max: number | null }[]
    >`
      SELECT count(*)::int AS count,
             min(salary)::float8 AS min,
             percentile_cont(0.25) WITHIN GROUP (ORDER BY salary)::float8 AS p25,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY salary)::float8 AS median,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY salary)::float8 AS p75,
             max(salary)::float8 AS max
      FROM employees
      WHERE country_code = ${countryCode} AND job_title = ${jobTitle}`;
    return {
      count: row?.count ?? 0,
      min: round(row?.min ?? null),
      p25: round(row?.p25 ?? null),
      median: round(row?.median ?? null),
      p75: round(row?.p75 ?? null),
      max: round(row?.max ?? null),
    };
  }
}
