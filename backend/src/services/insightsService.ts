import { NotFoundError, ValidationError } from '../domain/errors';
import { JOB_TITLES } from '../domain/reference';
import { compaRatio } from '../domain/salary';
import type {
  BenchmarkRow,
  BreakdownDimension,
  BreakdownRow,
  CountryRepository,
  InsightFilter,
  InsightsRepository,
  TopEarnerRow,
} from '../repositories/types';

export const DISTRIBUTION_BUCKET_USD = 20_000;
/** Everything at or above this is grouped into a single open-ended bucket. */
export const DISTRIBUTION_CAP_USD = 300_000;

export interface Summary {
  headcount: number;
  /** annual gross pay (base + allowances + bonus) in USD */
  totalPayrollUsd: number;
  /** base salary */
  averageUsd: number | null;
  medianUsd: number | null;
  averageGrossUsd: number | null;
}

export const MAX_TOP_EARNERS = 50;

export interface BreakdownItem extends BreakdownRow {
  label: string;
}

export interface DistributionBucket {
  fromUsd: number;
  /** null for the open-ended top bucket */
  toUsd: number | null;
  count: number;
}

export type BandPosition = 'BELOW_P25' | 'P25_TO_MEDIAN' | 'MEDIAN_TO_P75' | 'ABOVE_P75';

export interface Benchmark extends BenchmarkRow {
  countryCode: string;
  jobTitle: string;
  currency: string;
  /** present only when a salary to compare was supplied */
  comparison?: { salary: number; compaRatio: number | null; position: BandPosition | null };
}

/** Pure: turns sparse SQL buckets into a continuous histogram with an open-ended top bucket. */
export function buildHistogram(
  rows: { bucket: number; count: number }[],
  bucketSize = DISTRIBUTION_BUCKET_USD,
  cap = DISTRIBUTION_CAP_USD,
): DistributionBucket[] {
  const capIndex = Math.floor(cap / bucketSize);
  const counts = new Array<number>(capIndex + 1).fill(0);
  for (const r of rows) {
    const idx = Math.min(Math.max(r.bucket, 0), capIndex);
    counts[idx] = (counts[idx] ?? 0) + r.count;
  }
  return counts.map((count, i) => ({
    fromUsd: i * bucketSize,
    toUsd: i === capIndex ? null : (i + 1) * bucketSize,
    count,
  }));
}

/** Pure: where a salary sits inside a pay band. */
export function bandPosition(salary: number, b: BenchmarkRow): BandPosition | null {
  if (b.p25 === null || b.median === null || b.p75 === null) return null;
  if (salary < b.p25) return 'BELOW_P25';
  if (salary < b.median) return 'P25_TO_MEDIAN';
  if (salary <= b.p75) return 'MEDIAN_TO_P75';
  return 'ABOVE_P75';
}

export class InsightsService {
  constructor(
    private readonly insights: InsightsRepository,
    private readonly countries: CountryRepository,
  ) {}

  async summary(filter: InsightFilter): Promise<Summary> {
    const row = await this.insights.summary(filter);
    return {
      headcount: row.headcount,
      totalPayrollUsd: row.totalGrossUsd,
      averageUsd: row.avgUsd,
      medianUsd: row.medianUsd,
      averageGrossUsd: row.avgGrossUsd,
    };
  }

  /** Highest-paid active employees by gross pay, compared in USD. */
  async topEarners(filter: InsightFilter, limit = 10): Promise<TopEarnerRow[]> {
    return this.insights.topEarners(filter, Math.min(Math.max(1, limit), MAX_TOP_EARNERS));
  }

  /** Per-group pay statistics, highest median first. */
  async breakdown(by: BreakdownDimension, filter: InsightFilter): Promise<BreakdownItem[]> {
    const [rows, countries] = await Promise.all([
      this.insights.breakdown(by, filter),
      by === 'country' ? this.countries.list() : Promise.resolve([]),
    ]);
    const countryNames = new Map(countries.map((c) => [c.code, c.name]));
    return rows
      .map((r) => ({ ...r, label: by === 'country' ? (countryNames.get(r.key) ?? r.key) : r.key }))
      .sort((a, b) => b.medianUsd - a.medianUsd || a.label.localeCompare(b.label));
  }

  async distribution(filter: InsightFilter): Promise<DistributionBucket[]> {
    const rows = await this.insights.distribution(filter, DISTRIBUTION_BUCKET_USD);
    return buildHistogram(rows);
  }

  async benchmark(countryCode: string, jobTitle: string, salary?: number): Promise<Benchmark> {
    const country = await this.countries.findByCode(countryCode);
    if (!country) throw new NotFoundError(`Unknown country "${countryCode}"`);
    if (!JOB_TITLES.includes(jobTitle)) throw new ValidationError(`Unknown job title "${jobTitle}"`);

    const row = await this.insights.benchmark(countryCode, jobTitle);
    const result: Benchmark = { ...row, countryCode, jobTitle, currency: country.currency };
    if (salary !== undefined) {
      result.comparison = {
        salary,
        compaRatio: compaRatio(salary, row.median),
        position: bandPosition(salary, row),
      };
    }
    return result;
  }
}
