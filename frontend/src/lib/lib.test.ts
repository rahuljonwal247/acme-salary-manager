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

import { describeAudit } from './audit';
import { safeNext } from './session';

describe('safeNext (post-login redirect)', () => {
  it('allows same-site paths only', () => {
    expect(safeNext('/employees?x=1')).toBe('/employees?x=1');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });
});

describe('describeAudit', () => {
  const base = { id: 1, userId: 2, userName: 'Harper', entityType: 'EMPLOYEE' as const, entityId: 7, createdAt: '' };
  it('summarises a pay change by field', () => {
    expect(
      describeAudit({
        ...base,
        action: 'SALARY_CHANGED',
        details: {
          reason: 'ANNUAL_REVIEW',
          effectiveDate: '2025-04-01',
          currency: 'EUR',
          from: { salary: 80000, allowances: 0, bonus: 0, deductions: 0 },
          to: { salary: 88000, allowances: 0, bonus: 5000, deductions: 0 },
        },
      }),
    ).toBe('Pay change (annual review, effective 2025-04-01): base EUR 80,000 → EUR 88,000; bonus EUR 0 → EUR 5,000');
  });
  it('lists changed profile fields and user updates', () => {
    expect(describeAudit({ ...base, action: 'EMPLOYEE_UPDATED', details: { changes: { jobTitle: {}, hireDate: {} } } })).toBe(
      'Updated job title, hire date',
    );
    expect(describeAudit({ ...base, entityType: 'USER', action: 'USER_UPDATED', details: { isActive: false, passwordReset: true } })).toBe(
      'Updated user: disabled account, reset password',
    );
  });
});

import { isSameOrigin } from './origin';

describe('isSameOrigin (CSRF check in the /bff proxy)', () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it('compares Origin with the host the browser used, not the server bind address', () => {
    // regression: inside Docker the server URL is 0.0.0.0:3000 while the browser uses localhost:3000
    expect(isSameOrigin('http://localhost:3000', h({ host: 'localhost:3000' }))).toBe(true);
    expect(isSameOrigin('https://salaries.acme.example', h({ host: 'internal:3000', 'x-forwarded-host': 'salaries.acme.example' }))).toBe(true);
  });
  it('rejects other sites and malformed origins', () => {
    expect(isSameOrigin('https://evil.example', h({ host: 'localhost:3000' }))).toBe(false);
    expect(isSameOrigin('http://localhost:3001', h({ host: 'localhost:3000' }))).toBe(false);
    expect(isSameOrigin('not a url', h({ host: 'localhost:3000' }))).toBe(false);
    expect(isSameOrigin('http://localhost:3000', h({}))).toBe(false);
  });
  it('allows requests without an Origin header', () => {
    expect(isSameOrigin(null, h({ host: 'localhost:3000' }))).toBe(true);
  });
});
