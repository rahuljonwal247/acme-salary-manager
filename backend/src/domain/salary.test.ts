import { describe, expect, it } from 'vitest';
import { assertValidCompensation, grossPay, netPay, payBreakdown, sameCompensation } from './compensation';
import { ValidationError } from './errors';
import { assertValidSalaryChange, compaRatio, percentChange, toUsd } from './salary';
import type { SalaryChangeInput } from './types';

const current = { salary: 100_000, allowances: 5_000, bonus: 10_000, deductions: 8_000 };
const ctx = {
  current,
  hireDate: new Date('2020-01-01'),
  history: [{ effectiveDate: new Date('2020-01-01') }, { effectiveDate: new Date('2023-04-01') }],
};
const change = (o: Partial<SalaryChangeInput>): SalaryChangeInput => ({
  newSalary: 110_000,
  allowances: 5_000,
  bonus: 10_000,
  deductions: 8_000,
  effectiveDate: new Date('2024-04-01'),
  reason: 'ANNUAL_REVIEW',
  ...o,
});

describe('compensation maths', () => {
  it('gross = base + allowances + bonus; net = gross − deductions', () => {
    expect(grossPay(current)).toBe(115_000);
    expect(netPay(current)).toBe(107_000);
  });

  it('payBreakdown converts each figure to USD and rounds', () => {
    expect(payBreakdown({ salary: 70_000, allowances: 0, bonus: 0, deductions: 7_000 }, 1.08)).toEqual({
      gross: 70_000,
      net: 63_000,
      salaryUsd: 75_600,
      grossUsd: 75_600,
      netUsd: 68_040,
    });
  });

  it('compares packages field by field', () => {
    expect(sameCompensation(current, { ...current })).toBe(true);
    expect(sameCompensation(current, { ...current, bonus: 1 })).toBe(false);
  });

  it.each([
    [{ ...current, salary: 0 }, /greater than zero/],
    [{ ...current, bonus: -1 }, /non-negative/],
    [{ ...current, allowances: 1.5 }, /whole/],
    [{ ...current, deductions: 115_001 }, /cannot exceed gross/],
  ])('rejects an invalid package %#', (pkg, msg) => {
    expect(() => assertValidCompensation(pkg)).toThrow(msg);
  });

  it('accepts deductions equal to gross', () => {
    expect(() => assertValidCompensation({ ...current, deductions: 115_000 })).not.toThrow();
  });
});

describe('assertValidSalaryChange', () => {
  it('accepts a dated raise after the latest change', () => {
    expect(() => assertValidSalaryChange(change({}), ctx)).not.toThrow();
  });

  it('accepts a bonus-only change', () => {
    expect(() => assertValidSalaryChange(change({ newSalary: 100_000, bonus: 20_000 }), ctx)).not.toThrow();
  });

  it('accepts a change effective on the same day as the latest change', () => {
    expect(() => assertValidSalaryChange(change({ effectiveDate: new Date('2023-04-01') }), ctx)).not.toThrow();
  });

  it('rejects a change that changes nothing', () => {
    expect(() => assertValidSalaryChange(change({ newSalary: 100_000 }), ctx)).toThrow(/Nothing changed/);
  });

  it('rejects an effective date before the hire date', () => {
    expect(() =>
      assertValidSalaryChange(change({ effectiveDate: new Date('2019-12-31') }), { ...ctx, history: [] }),
    ).toThrow(/before the hire date/);
  });

  it('rejects back-dating before the latest recorded change', () => {
    expect(() => assertValidSalaryChange(change({ effectiveDate: new Date('2022-01-01') }), ctx)).toThrow(
      /latest recorded change \(2023-04-01\)/,
    );
  });

  it('rejects an invalid package', () => {
    expect(() => assertValidSalaryChange(change({ deductions: 999_999 }), ctx)).toThrow(/cannot exceed gross/);
  });

  it.each(['PROMOTION', 'ANNUAL_REVIEW'] as const)('rejects a base-pay cut recorded as %s', (reason) => {
    expect(() => assertValidSalaryChange(change({ newSalary: 90_000, reason }), ctx)).toThrow(ValidationError);
  });

  it.each(['CORRECTION', 'MARKET_ADJUSTMENT'] as const)('allows a base-pay cut recorded as %s', (reason) => {
    expect(() => assertValidSalaryChange(change({ newSalary: 90_000, reason }), ctx)).not.toThrow();
  });
});

describe('percentChange', () => {
  it('returns the change to one decimal place', () => {
    expect(percentChange(100_000, 107_500)).toBe(7.5);
    expect(percentChange(90_000, 100_000)).toBe(11.1);
    expect(percentChange(100_000, 95_000)).toBe(-5);
  });

  it('returns null when there is no previous value', () => {
    expect(percentChange(null, 100_000)).toBeNull();
    expect(percentChange(0, 100_000)).toBeNull();
  });
});

describe('compaRatio', () => {
  it('compares salary to the band median', () => {
    expect(compaRatio(110_000, 100_000)).toBe(1.1);
    expect(compaRatio(87_654, 100_000)).toBe(0.88);
  });

  it('returns null when there is no median', () => {
    expect(compaRatio(100_000, null)).toBeNull();
  });
});

describe('toUsd', () => {
  it('converts with the budget rate and rounds to whole dollars', () => {
    expect(toUsd(2_500_000, 0.012)).toBe(30_000);
    expect(toUsd(70_000, 1.08)).toBe(75_600);
  });
});
