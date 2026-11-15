// Mirrors the API's response shapes (dates arrive as ISO strings over JSON).

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
}

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
  salary: number;
  salaryUsd: number;
  country: Country;
}

export interface SalaryChange {
  id: number;
  previousSalary: number | null;
  newSalary: number;
  effectiveDate: string;
  reason: SalaryChangeReason;
  changePercent: number | null;
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
