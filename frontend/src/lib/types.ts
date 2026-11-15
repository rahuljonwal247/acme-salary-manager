// Mirrors the API's response shapes (dates arrive as ISO strings over JSON).

export type Role = 'ADMIN' | 'HR_MANAGER';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Country {
  code: string;
  name: string;
  currency: string;
  usdRate: number;
}

export interface Department {
  name: string;
  jobTitles: string[];
}

export type SalaryChangeReason = 'HIRE' | 'PROMOTION' | 'ANNUAL_REVIEW' | 'MARKET_ADJUSTMENT' | 'CORRECTION';

export interface Meta {
  countries: Country[];
  departments: Department[];
  salaryChangeReasons: Exclude<SalaryChangeReason, 'HIRE'>[];
  assistantEngine: 'claude' | 'rules';
}

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';

export interface EmployeeListItem {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  hireDate: string;
  status: EmployeeStatus;
  deactivatedAt: string | null;
  salary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  gross: number;
  net: number;
  salaryUsd: number;
  grossUsd: number;
  netUsd: number;
  country: Country;
}

export interface SalaryChange {
  id: number;
  previousSalary: number | null;
  newSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  gross: number;
  net: number;
  effectiveDate: string;
  reason: SalaryChangeReason;
  changePercent: number | null;
  changedBy: { id: number; name: string } | null;
  createdAt: string;
}

export interface Employee extends EmployeeListItem {
  salaryChanges: SalaryChange[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Summary {
  headcount: number;
  totalPayrollUsd: number;
  averageUsd: number | null;
  medianUsd: number | null;
  averageGrossUsd: number | null;
}

export type BreakdownDimension = 'country' | 'department' | 'jobTitle';

export interface BreakdownItem {
  key: string;
  label: string;
  headcount: number;
  minUsd: number;
  maxUsd: number;
  avgUsd: number;
  medianUsd: number;
  totalGrossUsd: number;
  currency: string | null;
  minLocal: number | null;
  maxLocal: number | null;
  avgLocal: number | null;
  medianLocal: number | null;
}

export interface DistributionBucket {
  fromUsd: number;
  toUsd: number | null;
  count: number;
}

export interface TopEarner {
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

export type BandPosition = 'BELOW_P25' | 'P25_TO_MEDIAN' | 'MEDIAN_TO_P75' | 'ABOVE_P75';

export interface Benchmark {
  countryCode: string;
  jobTitle: string;
  currency: string;
  count: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
  comparison?: { salary: number; compaRatio: number | null; position: BandPosition | null };
}

export interface AuditEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  entityType: 'EMPLOYEE' | 'USER';
  entityId: number | null;
  details?: Record<string, unknown>;
  createdAt: string;
}

export type AuditPage = Page<AuditEntry>;

export interface AssistantResult {
  title: string;
  summary: string;
  table: {
    columns: { key: string; label: string; format?: 'usd' | 'number' | 'local' }[];
    rows: Record<string, string | number | null>[];
  };
  chart?: { labelKey: string; valueKey: string; valueLabel: string };
}

export interface AssistantAnswer {
  answer: string;
  results: AssistantResult[];
  engine: 'claude' | 'rules';
  suggestions?: string[];
}
