import { assertValidCompensation, sameCompensation, type Compensation } from './compensation';
import { ValidationError } from './errors';
import type { SalaryChange, SalaryChangeInput } from './types';

/** Reasons that describe a pay *increase*; a base-pay cut must be a correction or market adjustment. */
const INCREASE_ONLY_REASONS = new Set(['PROMOTION', 'ANNUAL_REVIEW']);

export interface SalaryChangeContext {
  current: Compensation;
  hireDate: Date;
  /** existing history, any order */
  history: Pick<SalaryChange, 'effectiveDate'>[];
}

export function packageOf(input: SalaryChangeInput): Compensation {
  return { salary: input.newSalary, allowances: input.allowances, bonus: input.bonus, deductions: input.deductions };
}

/**
 * Business rules for recording a compensation change. Throws ValidationError with a readable message.
 *  1. The package must be valid (non-negative, base > 0, deductions ≤ gross).
 *  2. Something must actually change.
 *  3. A change cannot take effect before the employee was hired.
 *  4. No back-dating before the latest recorded change — the latest entry is always the current package.
 *  5. Promotions and annual reviews cannot cut base pay; use CORRECTION or MARKET_ADJUSTMENT.
 */
export function assertValidSalaryChange(input: SalaryChangeInput, ctx: SalaryChangeContext): void {
  const next = packageOf(input);
  assertValidCompensation(next);
  if (sameCompensation(next, ctx.current)) {
    throw new ValidationError('Nothing changed: the new package is the same as the current one');
  }
  if (input.effectiveDate.getTime() < ctx.hireDate.getTime()) {
    throw new ValidationError('Effective date cannot be before the hire date');
  }
  const latest = ctx.history.reduce<number>((max, h) => Math.max(max, h.effectiveDate.getTime()), 0);
  if (input.effectiveDate.getTime() < latest) {
    throw new ValidationError(
      `Effective date cannot be before the latest recorded change (${new Date(latest).toISOString().slice(0, 10)})`,
    );
  }
  if (input.newSalary < ctx.current.salary && INCREASE_ONLY_REASONS.has(input.reason)) {
    throw new ValidationError(
      `A salary decrease cannot be recorded as ${input.reason}; use CORRECTION or MARKET_ADJUSTMENT`,
    );
  }
}

/** Percentage change rounded to one decimal place; null when there is no previous value. */
export function percentChange(previous: number | null, next: number): number | null {
  if (previous === null || previous === 0) return null;
  return Math.round(((next - previous) / previous) * 1000) / 10;
}

/**
 * Compa-ratio: salary relative to the median for the same role & country (1.00 = at median).
 * A standard HR metric for "is this person paid fairly vs peers".
 */
export function compaRatio(salary: number, median: number | null): number | null {
  if (!median) return null;
  return Math.round((salary / median) * 100) / 100;
}

export function toUsd(amount: number, usdRate: number): number {
  return Math.round(amount * usdRate);
}
