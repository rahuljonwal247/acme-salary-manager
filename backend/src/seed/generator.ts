import { COUNTRIES, DEPARTMENTS, type CountrySeed, type SalaryChangeReason } from '../domain/reference';
import { createRng, pick, randomBetween, randomInt, weightedPick, type Rng } from '../lib/rng';

export interface SeedEmployee {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  hireDate: Date;
  salary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  salaryChanges: SeedSalaryChange[];
}

export interface SeedSalaryChange {
  previousSalary: number | null;
  newSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  effectiveDate: Date;
  reason: SalaryChangeReason;
}

/** Package composition as rates of base pay, so every history entry is internally consistent. */
interface PayRates {
  allowance: number;
  bonus: number;
  /** share of gross withheld (pension, benefits) */
  deduction: number;
}

function packageFor(base: number, rates: PayRates, usdRate: number) {
  const allowances = rates.allowance ? roundSalary(base * rates.allowance, usdRate) : 0;
  const bonus = rates.bonus ? roundSalary(base * rates.bonus, usdRate) : 0;
  const deductions = roundSalary((base + allowances + bonus) * rates.deduction, usdRate);
  return { allowances, bonus, deductions };
}

function payRatesFor(rng: Rng, department: string, jobTitle: string): PayRates {
  const isManager = /Manager|Lead|Staff|Partner/.test(jobTitle);
  const bonus =
    department === 'Sales'
      ? randomBetween(rng, 0.1, 0.3) // commission-heavy
      : isManager
        ? randomBetween(rng, 0.08, 0.18)
        : rng() < 0.4
          ? 0
          : randomBetween(rng, 0.03, 0.1);
  return {
    allowance: rng() < 0.2 ? 0 : randomBetween(rng, 0.03, 0.12),
    bonus,
    deduction: randomBetween(rng, 0.04, 0.1),
  };
}

export interface GenerateOptions {
  count: number;
  seed?: number;
  /** "today" for the generated data — fixed so output is reproducible */
  asOf?: Date;
}

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth',
  'Aarav', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Isha', 'Arjun', 'Kavya', 'Rahul', 'Sneha',
  'Lukas', 'Hannah', 'Felix', 'Lea', 'Jonas', 'Mia', 'Oliver', 'Amelia', 'Harry', 'Isla',
  'Lucas', 'Julia', 'Mateus', 'Beatriz', 'Wei', 'Mei', 'Jun', 'Hui', 'Liam', 'Chloe',
  'Noah', 'Emma', 'Ethan', 'Olivia', 'Ava', 'Sophia', 'Daniel', 'Grace', 'Samuel', 'Zoe',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor',
  'Sharma', 'Patel', 'Gupta', 'Iyer', 'Reddy', 'Nair', 'Singh', 'Kumar', 'Mehta', 'Rao',
  'Muller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Koch',
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Tan', 'Lim', 'Lee', 'Ng', 'Wong',
  'Martin', 'Thompson', 'White', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright',
];

const EARLIEST_HIRE = Date.UTC(2010, 0, 1);
const DAY_MS = 86_400_000;

/** Round to a "human" salary figure: nearest 100 local units (nearest 10,000 for weak currencies). */
export function roundSalary(amount: number, usdRate: number): number {
  const step = usdRate < 0.05 ? 10_000 : 100;
  return Math.max(step, Math.round(amount / step) * step);
}

function toDateOnly(ms: number): Date {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function generateHistory(
  rng: Rng,
  currentSalary: number,
  hireDate: Date,
  asOf: Date,
  country: CountrySeed,
  rates: PayRates,
): SeedSalaryChange[] {
  const years = Math.floor((asOf.getTime() - hireDate.getTime()) / (365 * DAY_MS));
  const raiseCount = Math.min(years, randomInt(rng, 0, 3));

  // Build backwards from the current salary so the latest entry always equals Employee.salary.
  const salaries = [currentSalary];
  const reasons: SalaryChangeReason[] = [];
  for (let i = 0; i < raiseCount; i++) {
    const promotion = rng() < 0.25;
    const factor = promotion ? randomBetween(rng, 1.1, 1.2) : randomBetween(rng, 1.02, 1.08);
    salaries.unshift(roundSalary((salaries[0] as number) / factor, country.usdRate));
    reasons.unshift(promotion ? 'PROMOTION' : 'ANNUAL_REVIEW');
  }

  // Spread raise dates evenly between hire date and asOf, strictly increasing.
  const span = asOf.getTime() - hireDate.getTime();
  const changes: SeedSalaryChange[] = [
    {
      previousSalary: null,
      newSalary: salaries[0] as number,
      ...packageFor(salaries[0] as number, rates, country.usdRate),
      effectiveDate: hireDate,
      reason: 'HIRE',
    },
  ];
  for (let i = 1; i <= raiseCount; i++) {
    const date = toDateOnly(hireDate.getTime() + (span * i) / (raiseCount + 1));
    changes.push({
      previousSalary: salaries[i - 1] as number,
      newSalary: salaries[i] as number,
      ...packageFor(salaries[i] as number, rates, country.usdRate),
      effectiveDate: date,
      reason: reasons[i - 1] as SalaryChangeReason,
    });
  }
  return changes;
}

/**
 * Deterministically generates realistic employees with salary history.
 * Pure function: same options => identical output.
 */
export function generateEmployees(options: GenerateOptions): SeedEmployee[] {
  const { count, seed = 42, asOf = new Date(Date.UTC(2026, 9, 1)) } = options;
  const rng = createRng(seed);
  const usedEmails = new Map<string, number>();
  const employees: SeedEmployee[] = [];

  for (let i = 1; i <= count; i++) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const country = weightedPick(rng, COUNTRIES);
    const dept = weightedPick(rng, DEPARTMENTS);
    const job = weightedPick(rng, dept.jobTitles);

    const hireDate = toDateOnly(randomBetween(rng, EARLIEST_HIRE, asOf.getTime() - 30 * DAY_MS));
    // +/- spread around the market midpoint gives realistic overlap inside a band
    const spread = randomBetween(rng, 0.82, 1.22);
    const salaryUsd = job.baseUsd * country.marketFactor * spread;
    const salary = roundSalary(salaryUsd / country.usdRate, country.usdRate);

    const base = `${firstName}.${lastName}`.toLowerCase();
    const n = (usedEmails.get(base) ?? 0) + 1;
    usedEmails.set(base, n);
    const email = `${base}${n > 1 ? n : ''}@acme.example`;

    const rates = payRatesFor(rng, dept.name, job.title);
    employees.push({
      employeeCode: formatEmployeeCode(i),
      firstName,
      lastName,
      email,
      jobTitle: job.title,
      department: dept.name,
      countryCode: country.code,
      hireDate,
      salary,
      ...packageFor(salary, rates, country.usdRate),
      salaryChanges: generateHistory(rng, salary, hireDate, asOf, country, rates),
    });
  }
  return employees;
}

export function formatEmployeeCode(n: number): string {
  return `EMP-${String(n).padStart(5, '0')}`;
}
