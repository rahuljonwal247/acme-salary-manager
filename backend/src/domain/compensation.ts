import { ValidationError } from './errors';

/**
 * Annual compensation package in whole units of the employee's local currency.
 * Integers only — money is never stored or computed as floating point.
 */
export interface Compensation {
  /** base salary */
  salary: number;
  allowances: number;
  bonus: number;
  deductions: number;
}

/** Gross pay = base + allowances + bonus (cost of the package before deductions). */
export function grossPay(c: Compensation): number {
  return c.salary + c.allowances + c.bonus;
}

/** Net pay = gross − deductions. Statutory tax is out of scope (see REQUIREMENTS.md). */
export function netPay(c: Compensation): number {
  return grossPay(c) - c.deductions;
}

export function sameCompensation(a: Compensation, b: Compensation): boolean {
  return a.salary === b.salary && a.allowances === b.allowances && a.bonus === b.bonus && a.deductions === b.deductions;
}

/** Cross-field rules that a schema cannot express. */
export function assertValidCompensation(c: Compensation): void {
  for (const [field, value] of Object.entries(c)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ValidationError(`${field} must be a whole, non-negative amount`);
    }
  }
  if (c.salary <= 0) throw new ValidationError('Base salary must be greater than zero');
  if (c.deductions > grossPay(c)) throw new ValidationError('Deductions cannot exceed gross pay');
}

/** Gross, net and their USD equivalents for display. */
export function payBreakdown(c: Compensation, usdRate: number) {
  const gross = grossPay(c);
  const net = gross - c.deductions;
  return {
    gross,
    net,
    salaryUsd: Math.round(c.salary * usdRate),
    grossUsd: Math.round(gross * usdRate),
    netUsd: Math.round(net * usdRate),
  };
}
