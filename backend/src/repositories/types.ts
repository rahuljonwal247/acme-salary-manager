import type { Compensation } from '../domain/compensation';
import type {
  AuditEntry,
  AuditLogRecord,
  Country,
  EmployeeDetail,
  EmployeeFilter,
  EmployeeListQuery,
  EmployeeProfilePatch,
  EmployeeStatus,
  EmployeeWithCountry,
  NewEmployeeInput,
  Page,
  Role,
  SalaryChangeInput,
  User,
  UserWithSecret,
} from '../domain/types';

/**
 * Persistence ports. Services depend only on these interfaces, so unit tests use in-memory fakes
 * and the Prisma implementations can be swapped without touching business logic.
 * Every mutation takes the AuditEntry to write in the same transaction as the change.
 */
export interface EmployeeRepository {
  list(query: EmployeeListQuery): Promise<{ items: EmployeeWithCountry[]; total: number }>;
  /** unpaginated, for exports (bounded by org size) */
  listAll(filter: EmployeeFilter): Promise<EmployeeWithCountry[]>;
  findById(id: number): Promise<EmployeeDetail | null>;
  emailExists(email: string, excludeId?: number): Promise<boolean>;
  /** Creates the employee and its initial HIRE salary change atomically. */
  create(input: NewEmployeeInput, actorId: number | null, audit: AuditEntry): Promise<EmployeeDetail>;
  update(id: number, patch: EmployeeProfilePatch, audit: AuditEntry): Promise<EmployeeDetail>;
  setStatus(id: number, status: EmployeeStatus, audit: AuditEntry): Promise<EmployeeDetail>;
  /**
   * Inserts the change and updates the current package atomically — only if the package still equals
   * `expected` (optimistic concurrency); otherwise throws ConflictError.
   */
  applySalaryChange(
    id: number,
    expected: Compensation,
    change: SalaryChangeInput,
    actorId: number | null,
    audit: AuditEntry,
  ): Promise<EmployeeDetail>;
}

export interface SalaryHistoryExportRow {
  employeeCode: string;
  employeeName: string;
  countryCode: string;
  currency: string;
  effectiveDate: Date;
  reason: string;
  previousSalary: number | null;
  newSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  changedBy: string | null;
}

export interface SalaryHistoryRepository {
  listForExport(filter: InsightFilter & { from?: Date; to?: Date }): Promise<SalaryHistoryExportRow[]>;
}

export interface CountryRepository {
  list(): Promise<Country[]>;
  findByCode(code: string): Promise<Country | null>;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserWithSecret | null>;
  findById(id: number): Promise<User | null>;
  list(): Promise<User[]>;
  create(input: { email: string; name: string; role: Role; passwordHash: string }, audit: AuditEntry): Promise<User>;
  update(
    id: number,
    patch: Partial<{ name: string; role: Role; isActive: boolean; passwordHash: string }>,
    audit: AuditEntry,
  ): Promise<User>;
  recordLogin(id: number): Promise<void>;
  count(): Promise<number>;
}

export interface AuditLogQuery {
  entityType?: 'EMPLOYEE' | 'USER';
  entityId?: number;
  action?: string;
  page: number;
  pageSize: number;
}

export interface AuditRepository {
  record(entry: AuditEntry): Promise<void>;
  list(query: AuditLogQuery): Promise<Page<AuditLogRecord>>;
}

/** Analytics always cover ACTIVE employees only. */
export type InsightFilter = Pick<EmployeeFilter, 'country' | 'department' | 'jobTitle'>;

export interface SummaryRow {
  headcount: number;
  /** total annual gross pay in USD — the payroll cost */
  totalGrossUsd: number;
  avgUsd: number | null;
  medianUsd: number | null;
  avgGrossUsd: number | null;
}

export const BREAKDOWN_DIMENSIONS = ['country', 'department', 'jobTitle'] as const;
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export interface BreakdownRow {
  key: string;
  headcount: number;
  minUsd: number;
  maxUsd: number;
  avgUsd: number;
  medianUsd: number;
  /** payroll expenditure: sum of gross pay in USD */
  totalGrossUsd: number;
  /** set only when every employee in the group is paid in the same currency */
  currency: string | null;
  minLocal: number | null;
  maxLocal: number | null;
  avgLocal: number | null;
  medianLocal: number | null;
}

export interface DistributionRow {
  /** zero-based bucket index: bucket i covers [i*size, (i+1)*size) USD */
  bucket: number;
  count: number;
}

export interface BenchmarkRow {
  count: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
}

export interface TopEarnerRow {
  id: number;
  employeeCode: string;
  name: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  currency: string;
  grossLocal: number;
  grossUsd: number;
}

export interface InsightsRepository {
  summary(filter: InsightFilter): Promise<SummaryRow>;
  breakdown(by: BreakdownDimension, filter: InsightFilter): Promise<BreakdownRow[]>;
  distribution(filter: InsightFilter, bucketSizeUsd: number): Promise<DistributionRow[]>;
  benchmark(countryCode: string, jobTitle: string): Promise<BenchmarkRow>;
  topEarners(filter: InsightFilter, limit: number): Promise<TopEarnerRow[]>;
}
