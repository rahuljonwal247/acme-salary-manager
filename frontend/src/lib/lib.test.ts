import { describe, expect, it } from 'vitest';
import { bucketLabel, formatDate, formatMoney, formatPercent, formatUsd, toDateInput } from './format';
import { first, toQueryString, withParams } from './query';

describe('query helpers', () => {
  it('toQueryString skips empty values', () => {
    expect(toQueryString({ a: 'x', b: '', c: undefined, d: null, e: 2 })).toBe('?a=x&e=2');
    expect(toQueryString({})).toBe('');
  });

  it('withParams merges changes and resets the page on filter change', () => {
    expect(withParams({ country: 'US', page: 4 }, { department: 'Sales' })).toBe('?country=US&department=Sales');
  });

  it('withParams keeps the page when the page is what changed', () => {
    expect(withParams(new URLSearchParams('country=US'), { page: 2 })).toBe('?country=US&page=2');
  });

  it('withParams removes a param set to empty', () => {
    expect(withParams({ country: 'US', jobTitle: 'Recruiter' }, { jobTitle: '' })).toBe('?country=US');
  });

  it('first() normalises Next.js search param values', () => {
    expect(first(['a', 'b'])).toBe('a');
    expect(first('x')).toBe('x');
    expect(first(undefined)).toBeUndefined();
  });
});

describe('formatting', () => {
  it('formats money in the currency of the country', () => {
    expect(formatMoney(120000, 'USD')).toBe('$120,000');
    expect(formatMoney(70000, 'EUR')).toBe('€70,000');
    expect(formatMoney(2500000, 'INR')).toBe('₹25,00,000');
  });

  it('supports compact notation and missing values', () => {
    expect(formatUsd(765_529_099, true)).toBe('$765.5M');
    expect(formatMoney(null, 'USD')).toBe('—');
  });

  it('formats calendar dates in UTC', () => {
    expect(formatDate('2021-03-15T00:00:00.000Z')).toBe('15 Mar 2021');
    expect(toDateInput('2021-03-15T00:00:00.000Z')).toBe('2021-03-15');
  });

  it('formats signed percentages', () => {
    expect(formatPercent(7.5)).toBe('+7.5%');
    expect(formatPercent(-5)).toBe('-5.0%');
    expect(formatPercent(null)).toBe('—');
  });

  it('labels histogram buckets', () => {
    expect(bucketLabel(20_000, 40_000)).toBe('$20K–40K');
    expect(bucketLabel(300_000, null)).toBe('$300K+');
  });
});
