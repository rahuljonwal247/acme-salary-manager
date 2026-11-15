import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors';
import { assertValidSalaryChange, compaRatio, percentChange, toUsd } from './salary';

const ctx = {
  currentSalary: 100_000,
  hireDate: new Date('2020-01-01'),
  history: [{ effectiveDate: new Date('2020-01-01') }, { effectiveDate: new Date('2023-04-01') }],
};

describe('assertValidSalaryChange', () => {
  it('accepts a dated raise after the latest change', () => {
    expect(() =>
      assertValidSalaryChange({ newSalary: 110_000, effectiveDate: new Date('2024-04-01'), reason: 'ANNUAL_REVIEW' }, ctx),
    ).not.toThrow();
  });

  it('accepts a change effective on the same day as the latest change', () => {
    expect(() =>
      assertValidSalaryChange({ newSalary: 105_000, effectiveDate: new Date('2023-04-01'), reason: 'CORRECTION' }, ctx),
    ).not.toThrow();
  });

  it('rejects a change that does not change the salary', () => {
    expect(() =>
      assertValidSalaryChange({ newSalary: 100_000, effectiveDate: new Date('2024-01-01'), reason: 'ANNUAL_REVIEW' }, ctx),
    ).toThrow(/same as the current salary/);
  });

  it('rejects an effective date before the hire date', () => {
    expect(() =>
      assertValidSalaryChange(
        { newSalary: 110_000, effectiveDate: new Date('2019-12-31'), reason: 'CORRECTION' },
        { ...ctx, history: [] },
      ),
    ).toThrow(/before the hire date/);
  });

  it('rejects back-dating before the latest recorded change', () => {
    expect(() =>
      assertValidSalaryChange({ newSalary: 110_000, effectiveDate: new Date('2022-01-01'), reason: 'PROMOTION' }, ctx),
    ).toThrow(/latest recorded change \(2023-04-01\)/);
  });

  it.each(['PROMOTION', 'ANNUAL_REVIEW'] as const)('rejects a decrease recorded as %s', (reason) => {
    expect(() =>
      assertValidSalaryChange({ newSalary: 90_000, effectiveDate: new Date('2024-01-01'), reason }, ctx),
    ).toThrow(ValidationError);
  });

  it.each(['CORRECTION', 'MARKET_ADJUSTMENT'] as const)('allows a decrease recorded as %s', (reason) => {
    expect(() =>
      assertValidSalaryChange({ newSalary: 90_000, effectiveDate: new Date('2024-01-01'), reason }, ctx),
    ).not.toThrow();
  });
});

describe('percentChange', () => {
  it('returns the change to one decimal place', () => {
    expect(percentChange(100_000, 107_500)).toBe(7.5);
    expect(percentChange(90_000, 100_000)).toBe(11.1);
    expect(percentChange(100_000, 95_000)).toBe(-5);
  });

  it('returns null when there is no previous salary', () => {
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
