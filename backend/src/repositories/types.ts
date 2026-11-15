import type {
  Country,
  EmployeeDetail,
  EmployeeFilter,
  EmployeeListQuery,
  EmployeeProfilePatch,
  EmployeeWithCountry,
  NewEmployeeInput,
  SalaryChangeInput,
} from '../domain/types';

/**
 * Persistence ports. Services depend only on these interfaces, so unit tests use in-memory fakes
 * and the Prisma implementations can be swapped without touching business logic.
 */
export interface EmployeeRepository {
  list(query: EmployeeListQuery): Promise<{ items: EmployeeWithCountry[]; total: number }>;
  findById(id: number): Promise<EmployeeDetail | null>;
  emailExists(email: string, excludeId?: number): Promise<boolean>;
  /** Creates the employee and its initial HIRE salary change atomically. */
  create(input: NewEmployeeInput): Promise<EmployeeDetail>;
  update(id: number, patch: EmployeeProfilePatch): Promise<EmployeeDetail>;
  delete(id: number): Promise<void>;
  /** Inserts the change and updates the employee's current salary atomically. */
  applySalaryChange(id: number, previousSalary: number, change: SalaryChangeInput): Promise<EmployeeDetail>;
}

export interface CountryRepository {
  list(): Promise<Country[]>;
  findByCode(code: string): Promise<Country | null>;
}

export type InsightFilter = Pick<EmployeeFilter, 'country' | 'department'>;

export interface SummaryRow {
  headcount: number;
  totalUsd: number;
  avgUsd: number | null;
  medianUsd: number | null;
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

export interface InsightsRepository {
  summary(filter: InsightFilter): Promise<SummaryRow>;
  breakdown(by: BreakdownDimension, filter: InsightFilter): Promise<BreakdownRow[]>;
  distribution(filter: InsightFilter, bucketSizeUsd: number): Promise<DistributionRow[]>;
  benchmark(countryCode: string, jobTitle: string): Promise<BenchmarkRow>;
}
