/**
 * Organisation reference data: the departments ACME has and the job titles allowed in each.
 * Kept in code (not the DB) because it changes rarely and is needed for validation.
 * `baseUsd` is the US market midpoint used only by the seed generator.
 */
export interface JobTitleDef {
  title: string;
  baseUsd: number;
  /** relative headcount weight inside the department (seed only) */
  weight: number;
}

export interface DepartmentDef {
  name: string;
  weight: number;
  jobTitles: JobTitleDef[];
}

export const DEPARTMENTS: readonly DepartmentDef[] = [
  {
    name: 'Engineering',
    weight: 35,
    jobTitles: [
      { title: 'Software Engineer', baseUsd: 120_000, weight: 40 },
      { title: 'Senior Software Engineer', baseUsd: 160_000, weight: 25 },
      { title: 'Staff Engineer', baseUsd: 205_000, weight: 6 },
      { title: 'Engineering Manager', baseUsd: 190_000, weight: 7 },
      { title: 'QA Engineer', baseUsd: 95_000, weight: 12 },
      { title: 'DevOps Engineer', baseUsd: 130_000, weight: 10 },
    ],
  },
  {
    name: 'Product',
    weight: 8,
    jobTitles: [
      { title: 'Product Manager', baseUsd: 140_000, weight: 45 },
      { title: 'Senior Product Manager', baseUsd: 170_000, weight: 20 },
      { title: 'Product Designer', baseUsd: 115_000, weight: 35 },
    ],
  },
  {
    name: 'Sales',
    weight: 15,
    jobTitles: [
      { title: 'Sales Representative', baseUsd: 70_000, weight: 50 },
      { title: 'Account Executive', baseUsd: 100_000, weight: 35 },
      { title: 'Sales Manager', baseUsd: 135_000, weight: 15 },
    ],
  },
  {
    name: 'Marketing',
    weight: 8,
    jobTitles: [
      { title: 'Marketing Specialist', baseUsd: 75_000, weight: 50 },
      { title: 'Content Strategist', baseUsd: 80_000, weight: 30 },
      { title: 'Marketing Manager', baseUsd: 120_000, weight: 20 },
    ],
  },
  {
    name: 'Finance',
    weight: 6,
    jobTitles: [
      { title: 'Accountant', baseUsd: 75_000, weight: 40 },
      { title: 'Financial Analyst', baseUsd: 85_000, weight: 40 },
      { title: 'Finance Manager', baseUsd: 130_000, weight: 20 },
    ],
  },
  {
    name: 'Human Resources',
    weight: 6,
    jobTitles: [
      { title: 'HR Generalist', baseUsd: 70_000, weight: 40 },
      { title: 'Recruiter', baseUsd: 75_000, weight: 40 },
      { title: 'HR Business Partner', baseUsd: 110_000, weight: 20 },
    ],
  },
  {
    name: 'Operations',
    weight: 10,
    jobTitles: [
      { title: 'Operations Analyst', baseUsd: 72_000, weight: 70 },
      { title: 'Operations Manager', baseUsd: 115_000, weight: 30 },
    ],
  },
  {
    name: 'Customer Support',
    weight: 12,
    jobTitles: [
      { title: 'Support Specialist', baseUsd: 55_000, weight: 80 },
      { title: 'Support Team Lead', baseUsd: 75_000, weight: 20 },
    ],
  },
];

export const DEPARTMENT_NAMES: readonly string[] = DEPARTMENTS.map((d) => d.name);

export const JOB_TITLES: readonly string[] = DEPARTMENTS.flatMap((d) => d.jobTitles.map((j) => j.title));

export function isJobTitleInDepartment(jobTitle: string, department: string): boolean {
  const dept = DEPARTMENTS.find((d) => d.name === department);
  return !!dept && dept.jobTitles.some((j) => j.title === jobTitle);
}

export const SALARY_CHANGE_REASONS = [
  'HIRE',
  'PROMOTION',
  'ANNUAL_REVIEW',
  'MARKET_ADJUSTMENT',
  'CORRECTION',
] as const;
export type SalaryChangeReason = (typeof SALARY_CHANGE_REASONS)[number];

/** Countries seeded into the DB. At runtime the `countries` table is the source of truth. */
export interface CountrySeed {
  code: string;
  name: string;
  currency: string;
  /** USD value of one unit of local currency (budget rate) */
  usdRate: number;
  /** pay level relative to the US market, in USD terms (seed only) */
  marketFactor: number;
  /** relative headcount weight (seed only) */
  weight: number;
}

export const COUNTRIES: readonly CountrySeed[] = [
  { code: 'US', name: 'United States', currency: 'USD', usdRate: 1, marketFactor: 1, weight: 30 },
  { code: 'IN', name: 'India', currency: 'INR', usdRate: 0.012, marketFactor: 0.28, weight: 22 },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', usdRate: 1.27, marketFactor: 0.75, weight: 12 },
  { code: 'DE', name: 'Germany', currency: 'EUR', usdRate: 1.08, marketFactor: 0.8, weight: 10 },
  { code: 'CA', name: 'Canada', currency: 'CAD', usdRate: 0.73, marketFactor: 0.8, weight: 8 },
  { code: 'AU', name: 'Australia', currency: 'AUD', usdRate: 0.66, marketFactor: 0.82, weight: 6 },
  { code: 'SG', name: 'Singapore', currency: 'SGD', usdRate: 0.74, marketFactor: 0.78, weight: 6 },
  { code: 'BR', name: 'Brazil', currency: 'BRL', usdRate: 0.18, marketFactor: 0.32, weight: 6 },
];
