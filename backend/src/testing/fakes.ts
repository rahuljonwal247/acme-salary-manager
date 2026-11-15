/**
 * In-memory implementations of the repository ports, used by unit tests.
 * They mimic the contract (atomic create-with-history, audit-with-change, optimistic concurrency)
 * without a database.
 */
import bcrypt from 'bcryptjs';
import { sameCompensation, type Compensation } from '../domain/compensation';
import { ConflictError } from '../domain/errors';
import type {
  Actor,
  AuditEntry,
  AuditLogRecord,
  Country,
  EmployeeDetail,
  EmployeeFilter,
  EmployeeListQuery,
  EmployeeProfilePatch,
  EmployeeStatus,
  NewEmployeeInput,
  Role,
  SalaryChangeInput,
  User,
  UserWithSecret,
} from '../domain/types';
import type {
  AuditLogQuery,
  AuditRepository,
  BenchmarkRow,
  BreakdownDimension,
  BreakdownRow,
  CountryRepository,
  DistributionRow,
  EmployeeRepository,
  InsightFilter,
  InsightsRepository,
  SalaryHistoryExportRow,
  SalaryHistoryRepository,
  SummaryRow,
  TopEarnerRow,
  UserRepository,
} from '../repositories/types';

export const TEST_COUNTRIES: Country[] = [
  { code: 'US', name: 'United States', currency: 'USD', usdRate: 1 },
  { code: 'IN', name: 'India', currency: 'INR', usdRate: 0.012 },
  { code: 'DE', name: 'Germany', currency: 'EUR', usdRate: 1.08 },
];

export const HR_ACTOR: Actor = { id: 2, name: 'Harper HR', role: 'HR_MANAGER' };
export const ADMIN_ACTOR: Actor = { id: 1, name: 'Avery Admin', role: 'ADMIN' };

export class InMemoryCountryRepository implements CountryRepository {
  constructor(private readonly countries: Country[] = TEST_COUNTRIES) {}
  async list() {
    return [...this.countries];
  }
  async findByCode(code: string) {
    return this.countries.find((c) => c.code === code) ?? null;
  }
}

/** Shared audit sink so tests can assert on what was recorded. */
export class InMemoryAuditRepository implements AuditRepository {
  entries: AuditLogRecord[] = [];
  private nextId = 1;
  async record(entry: AuditEntry) {
    this.entries.push({ ...entry, id: this.nextId++, userName: null, createdAt: new Date(0) });
  }
  async list(query: AuditLogQuery) {
    const items = this.entries
      .filter(
        (e) =>
          (!query.entityType || e.entityType === query.entityType) &&
          (query.entityId === undefined || e.entityId === query.entityId) &&
          (!query.action || e.action === query.action),
      )
      .reverse();
    const start = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(start, start + query.pageSize),
      total: items.length,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(items.length / query.pageSize)),
    };
  }
}

function matches(e: EmployeeDetail, q: EmployeeFilter): boolean {
  const s = q.search?.toLowerCase();
  const status = q.status ?? 'ACTIVE';
  return (
    (status === 'ALL' || e.status === status) &&
    (!q.country || e.countryCode === q.country) &&
    (!q.department || e.department === q.department) &&
    (!q.jobTitle || e.jobTitle === q.jobTitle) &&
    (!s || `${e.firstName} ${e.lastName} ${e.email} ${e.employeeCode}`.toLowerCase().includes(s))
  );
}

export class InMemoryEmployeeRepository implements EmployeeRepository {
  private rows: EmployeeDetail[] = [];
  private nextId = 1;
  private nextChangeId = 1;
  /** incremented on each write so tests can assert nothing was persisted */
  writes = 0;

  constructor(
    readonly audit: InMemoryAuditRepository = new InMemoryAuditRepository(),
    private readonly countries: Country[] = TEST_COUNTRIES,
  ) {}

  async list(query: EmployeeListQuery) {
    const dir = query.order === 'asc' ? 1 : -1;
    const items = this.rows.filter((e) => matches(e, query)).sort((a, b) => {
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

  async listAll(filter: EmployeeFilter) {
    return this.rows.filter((e) => matches(e, filter)).map(({ salaryChanges: _h, ...e }) => structuredClone(e));
  }

  async findById(id: number) {
    const e = this.rows.find((r) => r.id === id);
    return e ? structuredClone(e) : null;
  }

  async emailExists(email: string, excludeId?: number) {
    return this.rows.some((r) => r.email === email && r.id !== excludeId);
  }

  async create(input: NewEmployeeInput, actorId: number | null, audit: AuditEntry) {
    this.writes++;
    const id = this.nextId++;
    const employee: EmployeeDetail = {
      ...input,
      id,
      employeeCode: `EMP-${String(id).padStart(5, '0')}`,
      status: 'ACTIVE',
      deactivatedAt: null,
      country: this.country(input.countryCode),
      salaryChanges: [
        {
          id: this.nextChangeId++,
          employeeId: id,
          previousSalary: null,
          newSalary: input.salary,
          allowances: input.allowances,
          bonus: input.bonus,
          deductions: input.deductions,
          effectiveDate: input.hireDate,
          reason: 'HIRE',
          changedBy: actorId ? { id: actorId, name: `user-${actorId}` } : null,
          createdAt: new Date(0),
        },
      ],
    };
    this.rows.push(employee);
    await this.audit.record({ ...audit, entityId: id });
    return structuredClone(employee);
  }

  async update(id: number, patch: EmployeeProfilePatch, audit: AuditEntry) {
    this.writes++;
    const e = this.mustFind(id);
    Object.assign(e, patch);
    if (patch.hireDate) {
      const hire = e.salaryChanges.find((c) => c.reason === 'HIRE');
      if (hire) hire.effectiveDate = patch.hireDate;
    }
    await this.audit.record(audit);
    return structuredClone(e);
  }

  async setStatus(id: number, status: EmployeeStatus, audit: AuditEntry) {
    this.writes++;
    const e = this.mustFind(id);
    e.status = status;
    e.deactivatedAt = status === 'INACTIVE' ? new Date(0) : null;
    await this.audit.record(audit);
    return structuredClone(e);
  }

  async applySalaryChange(id: number, expected: Compensation, change: SalaryChangeInput, actorId: number | null, audit: AuditEntry) {
    const e = this.mustFind(id);
    if (!sameCompensation(e, expected)) throw new ConflictError('Pay was changed by someone else');
    this.writes++;
    Object.assign(e, { salary: change.newSalary, allowances: change.allowances, bonus: change.bonus, deductions: change.deductions });
    e.salaryChanges.push({
      id: this.nextChangeId++,
      employeeId: id,
      previousSalary: expected.salary,
      newSalary: change.newSalary,
      allowances: change.allowances,
      bonus: change.bonus,
      deductions: change.deductions,
      effectiveDate: change.effectiveDate,
      reason: change.reason,
      changedBy: actorId ? { id: actorId, name: `user-${actorId}` } : null,
      createdAt: new Date(0),
    });
    await this.audit.record(audit);
    return structuredClone(e);
  }

  /** test helper: simulate a concurrent edit */
  tamper(id: number, salary: number) {
    this.mustFind(id).salary = salary;
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

export class InMemoryUserRepository implements UserRepository {
  private rows: UserWithSecret[] = [];
  private nextId = 1;
  logins: number[] = [];

  constructor(readonly audit: InMemoryAuditRepository = new InMemoryAuditRepository()) {}

  /** test helper: adds a user with a real bcrypt hash (low cost to stay fast) */
  seed(u: { email: string; name: string; role: Role; password: string; isActive?: boolean }): User {
    const row: UserWithSecret = {
      id: this.nextId++,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive ?? true,
      lastLoginAt: null,
      createdAt: new Date(0),
      passwordHash: bcrypt.hashSync(u.password, 4),
    };
    this.rows.push(row);
    const { passwordHash: _h, ...user } = row;
    return user;
  }

  async findByEmail(email: string) {
    const u = this.rows.find((r) => r.email === email);
    return u ? { ...u } : null;
  }
  async findById(id: number) {
    const u = this.rows.find((r) => r.id === id);
    if (!u) return null;
    const { passwordHash: _h, ...user } = u;
    return user;
  }
  async list() {
    return this.rows.map(({ passwordHash: _h, ...u }) => u);
  }
  async create(input: { email: string; name: string; role: Role; passwordHash: string }, audit: AuditEntry) {
    const row: UserWithSecret = { ...input, id: this.nextId++, isActive: true, lastLoginAt: null, createdAt: new Date(0) };
    this.rows.push(row);
    await this.audit.record({ ...audit, entityId: row.id });
    const { passwordHash: _h, ...user } = row;
    return user;
  }
  async update(id: number, patch: Partial<{ name: string; role: Role; isActive: boolean; passwordHash: string }>, audit: AuditEntry) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error('fake: user missing');
    Object.assign(row, patch);
    await this.audit.record(audit);
    const { passwordHash: _h, ...user } = row;
    return user;
  }
  async recordLogin(id: number) {
    this.logins.push(id);
  }
  async count() {
    return this.rows.length;
  }
  hashOf(id: number) {
    return this.rows.find((r) => r.id === id)?.passwordHash;
  }
}

export class StubSalaryHistoryRepository implements SalaryHistoryRepository {
  rows: SalaryHistoryExportRow[] = [];
  lastFilter: unknown;
  async listForExport(filter: InsightFilter & { from?: Date; to?: Date }) {
    this.lastFilter = filter;
    return this.rows;
  }
}

/** Stub insights repository: returns canned rows and records the calls it received. */
export class StubInsightsRepository implements InsightsRepository {
  calls: { method: string; args: unknown[] }[] = [];
  summaryRow: SummaryRow = { headcount: 0, totalGrossUsd: 0, avgUsd: null, medianUsd: null, avgGrossUsd: null };
  breakdownRows: BreakdownRow[] = [];
  distributionRows: DistributionRow[] = [];
  benchmarkRow: BenchmarkRow = { count: 0, min: null, p25: null, median: null, p75: null, max: null };
  topEarnerRows: TopEarnerRow[] = [];

  async summary(filter: InsightFilter) {
    this.calls.push({ method: 'summary', args: [filter] });
    return this.summaryRow;
  }
  async breakdown(by: BreakdownDimension, filter: InsightFilter) {
    this.calls.push({ method: 'breakdown', args: [by, filter] });
    return this.breakdownRows.map((r) => ({ ...r }));
  }
  async distribution(filter: InsightFilter, bucketSizeUsd: number) {
    this.calls.push({ method: 'distribution', args: [filter, bucketSizeUsd] });
    return this.distributionRows;
  }
  async benchmark(countryCode: string, jobTitle: string) {
    this.calls.push({ method: 'benchmark', args: [countryCode, jobTitle] });
    return this.benchmarkRow;
  }
  async topEarners(filter: InsightFilter, limit: number) {
    this.calls.push({ method: 'topEarners', args: [filter, limit] });
    return this.topEarnerRows.slice(0, limit);
  }
}

export function breakdownRow(key: string, medianUsd: number, extra: Partial<BreakdownRow> = {}): BreakdownRow {
  return {
    key,
    headcount: 10,
    minUsd: medianUsd - 10,
    maxUsd: medianUsd + 10,
    avgUsd: medianUsd,
    medianUsd,
    totalGrossUsd: medianUsd * 10,
    currency: null,
    minLocal: null,
    maxLocal: null,
    avgLocal: null,
    medianLocal: null,
    ...extra,
  };
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
    allowances: 0,
    bonus: 0,
    deductions: 0,
    ...overrides,
  };
}

/** A salary change that only moves base pay (other components 0). */
export function raise(newSalary: number, effectiveDate: string, reason: SalaryChangeInput['reason'], extra: Partial<SalaryChangeInput> = {}): SalaryChangeInput {
  return { newSalary, allowances: 0, bonus: 0, deductions: 0, effectiveDate: new Date(effectiveDate), reason, ...extra };
}
