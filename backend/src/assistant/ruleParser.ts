import { DEPARTMENT_NAMES, JOB_TITLES } from '../domain/reference';
import type { Country } from '../domain/types';
import type { AnalyticsQuery, Metric } from './analytics';

/**
 * Deterministic natural-language → AnalyticsQuery parser. Used when no LLM is configured (or the LLM
 * call fails), and handy as a fast path. It recognises the common question shapes HR asks; anything it
 * can't map returns null so the caller can explain what is supported instead of guessing.
 */

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US',
  'u.s.': 'US',
  us: 'US',
  america: 'US',
  'united states': 'US',
  uk: 'GB',
  'u.k.': 'GB',
  britain: 'GB',
  england: 'GB',
  'united kingdom': 'GB',
  india: 'IN',
  germany: 'DE',
  canada: 'CA',
  australia: 'AU',
  singapore: 'SG',
  brazil: 'BR',
};

const DEPARTMENT_ALIASES: Record<string, string> = {
  hr: 'Human Resources',
  'human resources': 'Human Resources',
  engineering: 'Engineering',
  engineers: 'Engineering',
  sales: 'Sales',
  marketing: 'Marketing',
  finance: 'Finance',
  product: 'Product',
  operations: 'Operations',
  ops: 'Operations',
  support: 'Customer Support',
  'customer support': 'Customer Support',
};

const has = (text: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));

function findCountry(text: string, countries: Country[]): string | undefined {
  const lower = text.toLowerCase();
  for (const c of countries) if (lower.includes(c.name.toLowerCase())) return c.code;
  // longest alias first so "united states" wins over "us"
  for (const alias of Object.keys(COUNTRY_ALIASES).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^a-z])${alias.replace(/\./g, '\\.')}($|[^a-z])`, 'i');
    // "us" is also a pronoun — only accept it in upper case
    if (alias === 'us' ? /\bUS\b/.test(text) : re.test(lower)) return COUNTRY_ALIASES[alias];
  }
  return undefined;
}

function findJobTitle(text: string): string | undefined {
  const lower = text.toLowerCase();
  // longest first: "Senior Software Engineer" before "Software Engineer"
  return [...JOB_TITLES]
    .sort((a, b) => b.length - a.length)
    .find((t) => lower.includes(t.toLowerCase()) || lower.includes(`${t.toLowerCase()}s`));
}

function findDepartment(text: string, jobTitle: string | undefined): string | undefined {
  const lower = text.toLowerCase();
  const exact = DEPARTMENT_NAMES.find((d) => lower.includes(d.toLowerCase()));
  if (exact) return exact;
  if (jobTitle) return undefined; // "software engineers" names a title, not the department
  for (const alias of Object.keys(DEPARTMENT_ALIASES).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(lower)) return DEPARTMENT_ALIASES[alias];
  }
  return undefined;
}

function findLimit(text: string): number | undefined {
  const m = text.match(/\b(?:top|highest|best|first|lowest|bottom)\s+(\d{1,2})\b/i) ?? text.match(/\b(\d{1,2})\s+(?:highest|top|best)/i);
  return m ? Math.min(50, Number(m[1])) : undefined;
}

function findMetric(text: string): Metric {
  if (has(text, 'payroll', 'spend', 'spending', 'expenditure', 'cost', 'costs', 'total')) return 'payroll';
  if (has(text, 'headcount', 'how many', 'number of', 'count')) return 'headcount';
  if (has(text, 'average', 'avg', 'mean')) return 'average';
  if (has(text, 'maximum', 'max')) return 'max';
  if (has(text, 'minimum', 'min')) return 'min';
  return 'median';
}

function findDimension(text: string): 'country' | 'department' | 'jobTitle' | undefined {
  if (/\b(by|per|each|across|between|which)\s+(countr|location|region|nation)/i.test(text) || has(text, 'countries')) return 'country';
  if (/\b(by|per|each|across|between|which)\s+(department|team|function)/i.test(text) || has(text, 'departments')) return 'department';
  if (/\b(by|per|each|across|between|which)\s+(job|title|role|designation|position)/i.test(text) || has(text, 'roles', 'designations', 'job titles')) return 'jobTitle';
  return undefined;
}

export function parseQuestion(question: string, countries: Country[]): AnalyticsQuery | null {
  const text = question.trim();
  if (!text) return null;

  const jobTitle = findJobTitle(text);
  const country = findCountry(text, countries);
  const department = findDepartment(text, jobTitle);
  const by = findDimension(text);
  const filter = {
    ...(country && by !== 'country' ? { country } : {}),
    ...(department && by !== 'department' ? { department } : {}),
    ...(jobTitle && by !== 'jobTitle' ? { jobTitle } : {}),
  };

  // 1. Highest-paid people
  if (/(highest|top|best)[\s-]*(paid|earn)|top\s+\d*\s*earners|who (earns|makes|is paid) the most|highest salar/i.test(text) && !by) {
    return { kind: 'top_earners', limit: findLimit(text) ?? 10, filter };
  }

  // 2. Pay band / benchmark for a role in a country
  if (jobTitle && country && (has(text, 'band', 'range', 'benchmark', 'percentile', 'p25', 'p75', 'spread') || !by)) {
    if (has(text, 'band', 'range', 'benchmark', 'percentile', 'p25', 'p75', 'spread')) {
      return { kind: 'benchmark', country, jobTitle };
    }
  }

  // 3. Distribution
  if (has(text, 'distribution', 'histogram', 'spread of', 'brackets', 'bands')) {
    return { kind: 'distribution', filter };
  }

  // 4. Comparisons / rankings across a dimension
  const ranking = /\b(highest|lowest|most|least|best|worst|rank|ranking|compare|comparison|which)\b/i.test(text);
  if (by || (ranking && !jobTitle && !country && !department)) {
    const dimension = by ?? 'department';
    const lowest = /\b(lowest|least|cheapest|smallest|worst)\b/i.test(text);
    return {
      kind: 'breakdown',
      by: dimension,
      metric: findMetric(text),
      order: lowest ? 'asc' : 'desc',
      ...(findLimit(text) ? { limit: findLimit(text) } : {}),
      filter,
    };
  }

  // 5. A plain question about a scope ("average salary in Germany", "payroll for Sales")
  if (
    has(text, 'salary', 'salaries', 'pay', 'paid', 'payroll', 'earn', 'earns', 'make', 'compensation', 'headcount', 'employees', 'people', 'staff', 'how many', 'average', 'median', 'total')
  ) {
    return { kind: 'summary', filter: { ...(country ? { country } : {}), ...(department ? { department } : {}), ...(jobTitle ? { jobTitle } : {}) } };
  }

  return null;
}

export const SUPPORTED_QUESTIONS = [
  'What is the median salary of a Software Engineer in Germany?',
  'Which department has the highest average salary?',
  'Show payroll by country',
  'Who are the top 5 highest paid employees in India?',
  'What is the pay band for Recruiters in the US?',
  'How many employees are in Sales?',
  'Show the salary distribution in Engineering',
];
