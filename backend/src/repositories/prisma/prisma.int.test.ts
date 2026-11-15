import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '../../domain/errors';
import { PrismaEmployeeRepository } from './employeeRepository';
import { PrismaInsightsRepository } from './insightsRepository';

const prisma = new PrismaClient();
const employees = new PrismaEmployeeRepository(prisma);
const insights = new PrismaInsightsRepository(prisma);

const base = {
  firstName: 'A',
  lastName: 'B',
  jobTitle: 'Software Engineer',
  department: 'Engineering',
  hireDate: new Date('2022-01-01'),
};

/** Small hand-computable fixture: US 100k/200k/300k USD, IN 5,000,000 INR (= 60k USD at 0.012). */
async function seedFixture() {
  await employees.create({ ...base, email: 'us1@x.io', countryCode: 'US', salary: 100_000 });
  await employees.create({ ...base, email: 'us2@x.io', countryCode: 'US', salary: 200_000 });
  await employees.create({ ...base, email: 'us3@x.io', countryCode: 'US', salary: 300_000, department: 'Sales', jobTitle: 'Sales Manager' });
  await employees.create({ ...base, email: 'in1@x.io', countryCode: 'IN', salary: 5_000_000 });
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE salary_changes, employees, countries RESTART IDENTITY CASCADE');
  await prisma.country.createMany({
    data: [
      { code: 'US', name: 'United States', currency: 'USD', usdRate: 1 },
      { code: 'IN', name: 'India', currency: 'INR', usdRate: 0.012 },
    ],
  });
  await seedFixture();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PrismaInsightsRepository', () => {
  it('summarises payroll in USD across currencies', async () => {
    expect(await insights.summary({})).toEqual({
      headcount: 4,
      totalUsd: 660_000,
      avgUsd: 165_000,
      medianUsd: 150_000,
    });
  });

  it('applies filters', async () => {
    expect((await insights.summary({ country: 'US', department: 'Engineering' })).headcount).toBe(2);
  });

  it('returns local-currency stats only for single-currency groups', async () => {
    const byCountry = await insights.breakdown('country', {});
    const india = byCountry.find((r) => r.key === 'IN');
    expect(india).toMatchObject({ currency: 'INR', medianLocal: 5_000_000, medianUsd: 60_000 });

    const byDept = await insights.breakdown('department', {});
    const eng = byDept.find((r) => r.key === 'Engineering');
    expect(eng).toMatchObject({ headcount: 3, currency: null, medianLocal: null, minUsd: 60_000, maxUsd: 200_000 });
  });

  it('buckets salaries by USD', async () => {
    const rows = await insights.distribution({}, 100_000);
    expect(rows).toEqual([
      { bucket: 0, count: 1 },
      { bucket: 1, count: 1 },
      { bucket: 2, count: 1 },
      { bucket: 3, count: 1 },
    ]);
  });

  it('computes band percentiles in local currency', async () => {
    const b = await insights.benchmark('US', 'Software Engineer');
    expect(b).toEqual({ count: 2, min: 100_000, p25: 125_000, median: 150_000, p75: 175_000, max: 200_000 });
  });
});

describe('PrismaEmployeeRepository', () => {
  it('assigns an employee code from the id and records the HIRE change', async () => {
    const e = await employees.findById(1);
    expect(e?.employeeCode).toBe('EMP-00001');
    expect(e?.salaryChanges).toMatchObject([{ reason: 'HIRE', newSalary: 100_000, previousSalary: null }]);
  });

  it('applies a salary change atomically', async () => {
    const updated = await employees.applySalaryChange(1, 100_000, {
      newSalary: 110_000,
      effectiveDate: new Date('2023-01-01'),
      reason: 'ANNUAL_REVIEW',
    });
    expect(updated.salary).toBe(110_000);
    expect(updated.salaryChanges.map((c) => c.newSalary)).toEqual([100_000, 110_000]);
  });

  it('rejects a salary change based on a stale salary (optimistic concurrency)', async () => {
    await expect(
      employees.applySalaryChange(1, 999, { newSalary: 1, effectiveDate: new Date('2023-01-01'), reason: 'CORRECTION' }),
    ).rejects.toThrow(ConflictError);
    expect((await employees.findById(1))?.salaryChanges).toHaveLength(1);
  });

  it('searches, filters and paginates', async () => {
    const res = await employees.list({ search: 'US', country: 'US', sort: 'salary', order: 'desc', page: 1, pageSize: 2 });
    expect(res.total).toBe(3);
    expect(res.items.map((e) => e.salary)).toEqual([300_000, 200_000]);
  });

  it('maps a unique email violation to ConflictError', async () => {
    await expect(
      employees.create({ ...base, email: 'us1@x.io', countryCode: 'US', salary: 1 }),
    ).rejects.toThrow(ConflictError);
  });
});
