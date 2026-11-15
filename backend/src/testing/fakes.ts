/**
 * In-memory implementations of the repository ports, used by unit tests.
 * They mimic the contract (atomic create-with-history, salary change bookkeeping) without a database.
 */
import type {
  Country,
  EmployeeDetail,
  EmployeeListQuery,
  EmployeeProfilePatch,
  NewEmployeeInput,
  SalaryChangeInput,
} from '../domain/types';
import type {
  BenchmarkRow,
  BreakdownDimension,
  BreakdownRow,
  CountryRepository,
  DistributionRow,
  EmployeeRepository,
  InsightFilter,
  InsightsRepository,
  SummaryRow,
} from '../repositories/types';

export const TEST_COUNTRIES: Country[] = [
  { code: 'US', name: 'United States', currency: 'USD', usdRate: 1 },
  { code: 'IN', name: 'India', currency: 'INR', usdRate: 0.012 },
  { code: 'DE', name: 'Germany', currency: 'EUR', usdRate: 1.08 },
];

export class InMemoryCountryRepository implements CountryRepository {
  constructor(private readonly countries: Country[] = TEST_COUNTRIES) {}
  async list() {
    return [...this.countries];
  }
  async findByCode(code: string) {
    return this.countries.find((c) => c.code === code) ?? null;
  }
}

export class InMemoryEmployeeRepository implements EmployeeRepository {
  private rows: EmployeeDetail[] = [];
  private nextId = 1;
  private nextChangeId = 1;
  /** incremented on each write so tests can assert nothing was persisted */
  writes = 0;

  constructor(private readonly countries: Country[] = TEST_COUNTRIES) {}

  async list(query: EmployeeListQuery) {
    const s = query.search?.toLowerCase();
    let items = this.rows.filter(
      (e) =>
        (!query.country || e.countryCode === query.country) &&
        (!query.department || e.department === query.department) &&
        (!query.jobTitle || e.jobTitle === query.jobTitle) &&
        (!s || `${e.firstName} ${e.lastName} ${e.email} ${e.employeeCode}`.toLowerCase().includes(s)),
    );
    const dir = query.order === 'asc' ? 1 : -1;
    items = items.sort((a, b) => {
      switch (query.sort) {
        case 'salary':
          return (a.salary - b.salary) * dir;
        case 'hireDate':
          return (a.hireDate.getTime() - b.hireDate.getTime()) * dir;
        case 'employeeCode':
          return a.employeeCode.localeCompare(b.employeeCode) * dir;
        default:
          return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`) * dir;
      }
    });
    const start = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(start, start + query.pageSize).map(({ salaryChanges: _h, ...e }) => e),
      total: items.length,
    };
  }

  async findById(id: number) {
    const e = this.rows.find((r) => r.id === id);
    return e ? structuredClone(e) : null;
  }

  async emailExists(email: string, excludeId?: number) {
    return this.rows.some((r) => r.email === email && r.id !== excludeId);
  }

  async create(input: NewEmployeeInput) {
    this.writes++;
    const id = this.nextId++;
    const employee: EmployeeDetail = {
      ...input,
      id,
      employeeCode: `EMP-${String(id).padStart(5, '0')}`,
      country: this.country(input.countryCode),
      salaryChanges: [
        {
          id: this.nextChangeId++,
          employeeId: id,
          previousSalary: null,
          newSalary: input.salary,
          effectiveDate: input.hireDate,
          reason: 'HIRE',
          createdAt: new Date(0),
        },
      ],
    };
    this.rows.push(employee);
    return structuredClone(employee);
  }

  async update(id: number, patch: EmployeeProfilePatch) {
    this.writes++;
    const e = this.mustFind(id);
    Object.assign(e, patch);
    if (patch.hireDate) {
      const hire = e.salaryChanges.find((c) => c.reason === 'HIRE');
      if (hire) hire.effectiveDate = patch.hireDate;
    }
    return structuredClone(e);
  }

  async delete(id: number) {
    this.writes++;
    this.rows = this.rows.filter((r) => r.id !== id);
  }

  async applySalaryChange(id: number, previousSalary: number, change: SalaryChangeInput) {
    this.writes++;
    const e = this.mustFind(id);
    e.salary = change.newSalary;
    e.salaryChanges.push({
      id: this.nextChangeId++,
      employeeId: id,
      previousSalary,
      newSalary: change.newSalary,
      effectiveDate: change.effectiveDate,
      reason: change.reason,
      createdAt: new Date(0),
    });
    return structuredClone(e);
  }

  private mustFind(id: number) {
    const e = this.rows.find((r) => r.id === id);
    if (!e) throw new Error(`fake: employee ${id} missing`);
    return e;
  }

  private country(code: string) {
    const c = this.countries.find((x) => x.code === code);
    if (!c) throw new Error(`fake: country ${code} missing`);
    return c;
  }
}

/** Stub insights repository: returns canned rows and records the calls it received. */
export class StubInsightsRepository implements InsightsRepository {
  calls: { method: string; args: unknown[] }[] = [];
  summaryRow: SummaryRow = { headcount: 0, totalUsd: 0, avgUsd: null, medianUsd: null };
  breakdownRows: BreakdownRow[] = [];
  distributionRows: DistributionRow[] = [];
  benchmarkRow: BenchmarkRow = { count: 0, min: null, p25: null, median: null, p75: null, max: null };

  async summary(filter: InsightFilter) {
    this.calls.push({ method: 'summary', args: [filter] });
    return this.summaryRow;
  }
  async breakdown(by: BreakdownDimension, filter: InsightFilter) {
    this.calls.push({ method: 'breakdown', args: [by, filter] });
    return this.breakdownRows;
  }
  async distribution(filter: InsightFilter, bucketSizeUsd: number) {
    this.calls.push({ method: 'distribution', args: [filter, bucketSizeUsd] });
    return this.distributionRows;
  }
  async benchmark(countryCode: string, jobTitle: string) {
    this.calls.push({ method: 'benchmark', args: [countryCode, jobTitle] });
    return this.benchmarkRow;
  }
}

export function newEmployeeInput(overrides: Partial<NewEmployeeInput> = {}): NewEmployeeInput {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@acme.example',
    jobTitle: 'Software Engineer',
    department: 'Engineering',
    countryCode: 'US',
    hireDate: new Date('2022-01-10'),
    salary: 120_000,
    ...overrides,
  };
}
