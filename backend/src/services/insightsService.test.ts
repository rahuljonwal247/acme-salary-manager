import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../domain/errors';
import type { BreakdownRow } from '../repositories/types';
import { InMemoryCountryRepository, StubInsightsRepository } from '../testing/fakes';
import { bandPosition, buildHistogram, InsightsService } from './insightsService';

const row = (key: string, medianUsd: number, extra: Partial<BreakdownRow> = {}): BreakdownRow => ({
  key,
  headcount: 10,
  minUsd: medianUsd - 10,
  maxUsd: medianUsd + 10,
  avgUsd: medianUsd,
  medianUsd,
  currency: null,
  minLocal: null,
  maxLocal: null,
  avgLocal: null,
  medianLocal: null,
  ...extra,
});

describe('buildHistogram', () => {
  it('fills missing buckets with zero and labels ranges', () => {
    const h = buildHistogram([{ bucket: 1, count: 4 }], 10, 30);
    expect(h).toEqual([
      { fromUsd: 0, toUsd: 10, count: 0 },
      { fromUsd: 10, toUsd: 20, count: 4 },
      { fromUsd: 20, toUsd: 30, count: 0 },
      { fromUsd: 30, toUsd: null, count: 0 },
    ]);
  });

  it('folds everything at or above the cap into the open-ended last bucket', () => {
    const h = buildHistogram(
      [
        { bucket: 3, count: 2 },
        { bucket: 7, count: 5 },
      ],
      10,
      30,
    );
    expect(h.at(-1)).toEqual({ fromUsd: 30, toUsd: null, count: 7 });
  });
});

describe('bandPosition', () => {
  const band = { count: 4, min: 50, p25: 80, median: 100, p75: 120, max: 150 };

  it.each([
    [70, 'BELOW_P25'],
    [80, 'P25_TO_MEDIAN'],
    [100, 'MEDIAN_TO_P75'],
    [120, 'MEDIAN_TO_P75'],
    [121, 'ABOVE_P75'],
  ] as const)('places %d as %s', (salary, expected) => {
    expect(bandPosition(salary, band)).toBe(expected);
  });

  it('returns null for an empty band', () => {
    expect(bandPosition(100, { count: 0, min: null, p25: null, median: null, p75: null, max: null })).toBeNull();
  });
});

describe('InsightsService', () => {
  let repo: StubInsightsRepository;
  let service: InsightsService;

  beforeEach(() => {
    repo = new StubInsightsRepository();
    service = new InsightsService(repo, new InMemoryCountryRepository());
  });

  it('maps the summary row and passes filters through', async () => {
    repo.summaryRow = { headcount: 3, totalUsd: 300, avgUsd: 100, medianUsd: 90 };
    const summary = await service.summary({ country: 'US' });
    expect(summary).toEqual({ headcount: 3, totalPayrollUsd: 300, averageUsd: 100, medianUsd: 90 });
    expect(repo.calls[0]).toEqual({ method: 'summary', args: [{ country: 'US' }] });
  });

  it('labels country breakdown rows with country names and sorts by median desc', async () => {
    repo.breakdownRows = [row('IN', 30_000), row('US', 120_000), row('XX', 50_000)];
    const result = await service.breakdown('country', {});
    expect(result.map((r) => r.label)).toEqual(['United States', 'XX', 'India']);
  });

  it('uses the raw key as label for other dimensions', async () => {
    repo.breakdownRows = [row('Sales', 80_000), row('Engineering', 140_000)];
    const result = await service.breakdown('department', { country: 'DE' });
    expect(result.map((r) => r.label)).toEqual(['Engineering', 'Sales']);
    expect(repo.calls[0]).toEqual({ method: 'breakdown', args: ['department', { country: 'DE' }] });
  });

  it('returns a continuous histogram', async () => {
    repo.distributionRows = [{ bucket: 2, count: 9 }];
    const buckets = await service.distribution({});
    expect(buckets[2]).toEqual({ fromUsd: 40_000, toUsd: 60_000, count: 9 });
    expect(buckets.at(-1)?.toUsd).toBeNull();
  });

  describe('benchmark', () => {
    beforeEach(() => {
      repo.benchmarkRow = { count: 20, min: 60_000, p25: 80_000, median: 100_000, p75: 120_000, max: 160_000 };
    });

    it('returns band statistics in the local currency', async () => {
      const b = await service.benchmark('DE', 'Software Engineer');
      expect(b).toMatchObject({ currency: 'EUR', median: 100_000, count: 20 });
      expect(b.comparison).toBeUndefined();
    });

    it('compares a salary against the band', async () => {
      const b = await service.benchmark('DE', 'Software Engineer', 125_000);
      expect(b.comparison).toEqual({ salary: 125_000, compaRatio: 1.25, position: 'ABOVE_P75' });
    });

    it('rejects an unknown country', async () => {
      await expect(service.benchmark('ZZ', 'Software Engineer')).rejects.toThrow(NotFoundError);
    });

    it('rejects an unknown job title', async () => {
      await expect(service.benchmark('US', 'Wizard')).rejects.toThrow(ValidationError);
    });
  });
});
