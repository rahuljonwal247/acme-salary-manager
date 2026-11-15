import { ValidationError } from './errors';
import type { SalaryChange, SalaryChangeInput } from './types';

/** Reasons that describe a pay *increase*; a decrease must be a correction or market adjustment. */
const INCREASE_ONLY_REASONS = new Set(['PROMOTION', 'ANNUAL_REVIEW']);

export interface SalaryChangeContext {
  currentSalary: number;
  hireDate: Date;
  /** existing history, any order */
  history: Pick<SalaryChange, 'effectiveDate'>[];
}

/**
 * Business rules for recording a salary change. Throws ValidationError with a human readable message.
 * Rules:
 *  1. The new salary must differ from the current one (otherwise nothing changed).
 *  2. A change cannot take effect before the employee was hired.
 *  3. A change cannot be back-dated before the latest recorded change — the latest entry must
 *     always represent the current salary (no silent re-ordering of history).
 *  4. Promotions and annual reviews must increase pay; decreases need CORRECTION or MARKET_ADJUSTMENT.
 */
export function assertValidSalaryChange(input: SalaryChangeInput, ctx: SalaryChangeContext): void {
  if (input.newSalary === ctx.currentSalary) {
    throw new ValidationError('New salary is the same as the current salary');
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
  if (input.newSalary < ctx.currentSalary && INCREASE_ONLY_REASONS.has(input.reason)) {
    throw new ValidationError(
      `A salary decrease cannot be recorded as ${input.reason}; use CORRECTION or MARKET_ADJUSTMENT`,
    );
  }
}

/** Percentage change rounded to one decimal place; null when there is no previous salary. */
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
