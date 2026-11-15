import type { BandPosition, SalaryChangeReason } from './types';

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/** Currency-aware money formatting, e.g. formatMoney(2500000, 'INR') -> "₹25,00,000". */
export function formatMoney(amount: number | null | undefined, currency: string, opts: { compact?: boolean } = {}): string {
  if (amount === null || amount === undefined) return '—';
  const key = `${currency}:${opts.compact ? 'c' : 'f'}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: opts.compact ? 1 : 0,
      notation: opts.compact ? 'compact' : 'standard',
    });
    moneyFormatters.set(key, fmt);
  }
  return fmt.format(amount);
}

export const formatUsd = (amount: number | null | undefined, compact = false) =>
  formatMoney(amount, 'USD', { compact });

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** ISO date/datetime -> "15 Mar 2021" (always UTC, dates are calendar dates). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

/** ISO -> "YYYY-MM-DD" for <input type="date">. */
export function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export function formatPercent(p: number | null): string {
  if (p === null) return '—';
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
}

const REASON_LABELS: Record<SalaryChangeReason, string> = {
  HIRE: 'Hired',
  PROMOTION: 'Promotion',
  ANNUAL_REVIEW: 'Annual review',
  MARKET_ADJUSTMENT: 'Market adjustment',
  CORRECTION: 'Correction',
};

export const reasonLabel = (r: SalaryChangeReason) => REASON_LABELS[r];

const POSITION_LABELS: Record<BandPosition, string> = {
  BELOW_P25: 'Bottom quartile',
  P25_TO_MEDIAN: 'Below median',
  MEDIAN_TO_P75: 'Above median',
  ABOVE_P75: 'Top quartile',
};

export const positionLabel = (p: BandPosition) => POSITION_LABELS[p];

/** Histogram bucket label: "$20K–40K" or "$300K+". */
export function bucketLabel(fromUsd: number, toUsd: number | null): string {
  const k = (n: number) => `${Math.round(n / 1000)}K`;
  return toUsd === null ? `$${k(fromUsd)}+` : `$${k(fromUsd)}–${k(toUsd)}`;
}
