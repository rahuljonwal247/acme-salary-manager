import { describe, expect, it } from 'vitest';
import { COUNTRIES, isJobTitleInDepartment } from '../domain/reference';
import { formatEmployeeCode, generateEmployees, roundSalary } from './generator';

describe('generateEmployees', () => {
  const employees = generateEmployees({ count: 2_000, seed: 7 });

  it('generates the requested number of employees', () => {
    expect(employees).toHaveLength(2_000);
  });

  it('is deterministic for the same seed', () => {
    const again = generateEmployees({ count: 2_000, seed: 7 });
    expect(again).toEqual(employees);
  });

  it('produces different data for a different seed', () => {
    const other = generateEmployees({ count: 50, seed: 8 });
    expect(other.map((e) => e.email)).not.toEqual(employees.slice(0, 50).map((e) => e.email));
  });

  it('produces unique emails and employee codes', () => {
    expect(new Set(employees.map((e) => e.email)).size).toBe(employees.length);
    expect(new Set(employees.map((e) => e.employeeCode)).size).toBe(employees.length);
  });

  it('only uses valid department/job title combinations and known countries', () => {
    const codes = new Set(COUNTRIES.map((c) => c.code));
    for (const e of employees) {
      expect(isJobTitleInDepartment(e.jobTitle, e.department)).toBe(true);
      expect(codes.has(e.countryCode)).toBe(true);
    }
  });

  it('builds a consistent salary history ending at the current salary', () => {
    for (const e of employees) {
      const [first, ...rest] = e.salaryChanges;
      expect(first?.reason).toBe('HIRE');
      expect(first?.previousSalary).toBeNull();
      expect(first?.effectiveDate).toEqual(e.hireDate);

      let prev = first!;
      for (const change of rest) {
        expect(change.previousSalary).toBe(prev.newSalary);
        expect(change.effectiveDate.getTime()).toBeGreaterThan(prev.effectiveDate.getTime());
        prev = change;
      }
      expect(prev.newSalary).toBe(e.salary);
    }
  });

  it('spreads employees across every country', () => {
    const seen = new Set(employees.map((e) => e.countryCode));
    expect(seen.size).toBe(COUNTRIES.length);
  });
});

describe('roundSalary', () => {
  it('rounds strong currencies to the nearest 100', () => {
    expect(roundSalary(123_456, 1)).toBe(123_500);
  });

  it('rounds weak currencies to the nearest 10,000', () => {
    expect(roundSalary(2_345_678, 0.012)).toBe(2_350_000);
  });

  it('never returns zero', () => {
    expect(roundSalary(3, 1)).toBe(100);
  });
});

describe('formatEmployeeCode', () => {
  it('zero-pads to five digits', () => {
    expect(formatEmployeeCode(42)).toBe('EMP-00042');
  });
});
