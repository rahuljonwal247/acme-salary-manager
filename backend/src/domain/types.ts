import type { SalaryChangeReason } from './reference';

export interface Country {
  code: string;
  name: string;
  currency: string;
  usdRate: number;
}

export interface Employee {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  hireDate: Date;
  salary: number;
}

export interface EmployeeWithCountry extends Employee {
  country: Country;
}

export interface SalaryChange {
  id: number;
  employeeId: number;
  previousSalary: number | null;
  newSalary: number;
  effectiveDate: Date;
  reason: SalaryChangeReason;
  createdAt: Date;
}

export interface EmployeeDetail extends EmployeeWithCountry {
  /** oldest first */
  salaryChanges: SalaryChange[];
}

export const EMPLOYEE_SORT_FIELDS = ['name', 'salary', 'hireDate', 'employeeCode'] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

export interface EmployeeFilter {
  search?: string;
  country?: string;
  department?: string;
  jobTitle?: string;
}

export interface EmployeeListQuery extends EmployeeFilter {
  sort: EmployeeSortField;
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface NewEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  hireDate: Date;
  salary: number;
}

/**
 * Profile fields editable via PATCH. Salary is excluded (changes go through salary-changes so they are
 * dated and explained). Country is excluded because it determines the pay currency: a relocation is a
 * salary event, not a profile edit (see docs/REQUIREMENTS.md).
 */
export type EmployeeProfilePatch = Partial<Omit<NewEmployeeInput, 'salary' | 'countryCode'>>;

export interface SalaryChangeInput {
  newSalary: number;
  effectiveDate: Date;
  reason: Exclude<SalaryChangeReason, 'HIRE'>;
}
