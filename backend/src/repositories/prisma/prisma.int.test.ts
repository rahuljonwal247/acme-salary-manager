import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '../../domain/errors';
import type { AuditEntry } from '../../domain/types';
import { PrismaEmployeeRepository } from './employeeRepository';
import { PrismaInsightsRepository } from './insightsRepository';
import { PrismaAuditRepository, PrismaSalaryHistoryRepository, PrismaUserRepository } from './userRepository';

const prisma = new PrismaClient();
const employees = new PrismaEmployeeRepository(prisma);
const insights = new PrismaInsightsRepository(prisma);
const users = new PrismaUserRepository(prisma);
const audit = new PrismaAuditRepository(prisma);
const history = new PrismaSalaryHistoryRepository(prisma);

const base = {
  firstName: 'A',
  lastName: 'B',
  jobTitle: 'Software Engineer',
  department: 'Engineering',
  hireDate: new Date('2022-01-01'),
  allowances: 0,
  bonus: 0,
  deductions: 0,
};
const created = (): AuditEntry => ({ userId: null, action: 'EMPLOYEE_CREATED', entityType: 'EMPLOYEE', entityId: null });
const pkg = (salary: number) => ({ salary, allowances: 0, bonus: 0, deductions: 0 });

/**
 * Hand-computable fixture (active employees):
 *   US 100k, 200k (+ 20k bonus), 300k (Sales Manager);  IN 5,000,000 INR = 60k USD at 0.012
 * plus one INACTIVE US employee at 1,000,000 that must never appear in analytics.
 */
async function seedFixture() {
  await employees.create({ ...base, email: 'us1@x.io', countryCode: 'US', salary: 100_000 }, null, created());
  await employees.create({ ...base, email: 'us2@x.io', countryCode: 'US', salary: 200_000, bonus: 20_000 }, null, created());
  await employees.create(
    { ...base, email: 'us3@x.io', countryCode: 'US', salary: 300_000, department: 'Sales', jobTitle: 'Sales Manager' },
    null,
    created(),
  );
  await employees.create({ ...base, email: 'in1@x.io', countryCode: 'IN', salary: 5_000_000 }, null, created());
  const gone = await employees.create({ ...base, email: 'gone@x.io', countryCode: 'US', salary: 1_000_000 }, null, created());
  await employees.setStatus(gone.id, 'INACTIVE', { userId: null, action: 'EMPLOYEE_DEACTIVATED', entityType: 'EMPLOYEE', entityId: gone.id });
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, salary_changes, employees, users, countries RESTART IDENTITY CASCADE',
  );
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
  it('summarises active employees only; payroll uses gross pay in USD', async () => {
    expect(await insights.summary({})).toEqual({
      headcount: 4,
      totalGrossUsd: 680_000, // 100k + 220k + 300k + 60k
      avgUsd: 165_000,
      medianUsd: 150_000,
      avgGrossUsd: 170_000,
    });
  });

  it('applies filters including job title', async () => {
    expect((await insights.summary({ country: 'US', department: 'Engineering' })).headcount).toBe(2);
    expect((await insights.summary({ jobTitle: 'Sales Manager' })).headcount).toBe(1);
  });

  it('returns local-currency stats only for single-currency groups, plus payroll', async () => {
    const byCountry = await insights.breakdown('country', {});
    expect(byCountry.find((r) => r.key === 'IN')).toMatchObject({ currency: 'INR', medianLocal: 5_000_000, medianUsd: 60_000 });
    expect(byCountry.find((r) => r.key === 'US')).toMatchObject({ headcount: 3, totalGrossUsd: 620_000, maxUsd: 300_000 });

    const eng = (await insights.breakdown('department', {})).find((r) => r.key === 'Engineering');
    expect(eng).toMatchObject({ headcount: 3, currency: null, medianLocal: null, minUsd: 60_000, maxUsd: 200_000 });
  });

  it('buckets salaries by USD', async () => {
    expect(await insights.distribution({}, 100_000)).toEqual([
      { bucket: 0, count: 1 },
      { bucket: 1, count: 1 },
      { bucket: 2, count: 1 },
      { bucket: 3, count: 1 },
    ]);
  });

  it('computes band percentiles in local currency', async () => {
    expect(await insights.benchmark('US', 'Software Engineer')).toEqual({
      count: 2,
      min: 100_000,
      p25: 125_000,
      median: 150_000,
      p75: 175_000,
      max: 200_000,
    });
  });

  it('ranks top earners by gross pay in USD', async () => {
    const top = await insights.topEarners({}, 2);
    expect(top.map((t) => [t.employeeCode, t.grossUsd])).toEqual([
      ['EMP-00003', 300_000],
      ['EMP-00002', 220_000],
    ]);
    expect(top[1]).toMatchObject({ grossLocal: 220_000, currency: 'USD' });
  });
});

describe('PrismaEmployeeRepository', () => {
  it('assigns an employee code from the id, records HIRE and writes the audit entry in the same transaction', async () => {
    const e = await employees.findById(1);
    expect(e?.employeeCode).toBe('EMP-00001');
    expect(e?.salaryChanges).toMatchObject([{ reason: 'HIRE', newSalary: 100_000, previousSalary: null }]);
    const log = await audit.list({ entityType: 'EMPLOYEE', entityId: 1, page: 1, pageSize: 10 });
    expect(log.items).toMatchObject([{ action: 'EMPLOYEE_CREATED', details: { employeeCode: 'EMP-00001' } }]);
  });

  it('applies a package change atomically and attributes it to the user', async () => {
    const u = await users.create(
      { email: 'hr@x.io', name: 'Harper', role: 'HR_MANAGER', passwordHash: 'x' },
      { userId: null, action: 'USER_CREATED', entityType: 'USER', entityId: null },
    );
    const updated = await employees.applySalaryChange(
      1,
      pkg(100_000),
      { newSalary: 110_000, allowances: 2_000, bonus: 0, deductions: 1_000, effectiveDate: new Date('2023-01-01'), reason: 'ANNUAL_REVIEW' },
      u.id,
      { userId: u.id, action: 'SALARY_CHANGED', entityType: 'EMPLOYEE', entityId: 1 },
    );
    expect(updated).toMatchObject({ salary: 110_000, allowances: 2_000, deductions: 1_000 });
    expect(updated.salaryChanges.at(-1)).toMatchObject({ previousSalary: 100_000, changedBy: { id: u.id, name: 'Harper' } });
    expect((await audit.list({ action: 'SALARY_CHANGED', page: 1, pageSize: 5 })).items[0]?.userName).toBe('Harper');
  });

  it('rejects a change based on a stale package and writes nothing (incl. audit)', async () => {
    const before = (await audit.list({ page: 1, pageSize: 100 })).total;
    await expect(
      employees.applySalaryChange(
        1,
        pkg(999),
        { newSalary: 1, allowances: 0, bonus: 0, deductions: 0, effectiveDate: new Date('2023-01-01'), reason: 'CORRECTION' },
        null,
        { userId: null, action: 'SALARY_CHANGED', entityType: 'EMPLOYEE', entityId: 1 },
      ),
    ).rejects.toThrow(ConflictError);
    expect((await employees.findById(1))?.salaryChanges).toHaveLength(1);
    expect((await audit.list({ page: 1, pageSize: 100 })).total).toBe(before);
  });

  it('searches, filters, paginates and hides inactive employees by default', async () => {
    const res = await employees.list({ search: 'US', country: 'US', sort: 'salary', order: 'desc', page: 1, pageSize: 2 });
    expect(res.total).toBe(3);
    expect(res.items.map((e) => e.salary)).toEqual([300_000, 200_000]);
    const all = await employees.list({ country: 'US', status: 'ALL', sort: 'salary', order: 'desc', page: 1, pageSize: 1 });
    expect(all).toMatchObject({ total: 4, items: [{ salary: 1_000_000, status: 'INACTIVE' }] });
  });

  it('maps a unique email violation to ConflictError', async () => {
    await expect(employees.create({ ...base, email: 'us1@x.io', countryCode: 'US', salary: 1 }, null, created())).rejects.toThrow(
      ConflictError,
    );
  });

  it('exports salary history with employee details', async () => {
    const rows = await history.listForExport({ country: 'IN' });
    expect(rows).toMatchObject([{ employeeCode: 'EMP-00004', currency: 'INR', reason: 'HIRE', changedBy: null }]);
  });
});
