import type { Compensation } from './compensation';
import type { SalaryChangeReason } from './reference';

export const ROLES = ['ADMIN', 'HR_MANAGER'] as const;
export type Role = (typeof ROLES)[number];

/** The authenticated user performing an action — recorded on history and audit entries. */
export interface Actor {
  id: number;
  name: string;
  role: Role;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface UserWithSecret extends User {
  passwordHash: string;
}

export interface Country {
  code: string;
  name: string;
  currency: string;
  usdRate: number;
}

export const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface Employee extends Compensation {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  hireDate: Date;
  status: EmployeeStatus;
  deactivatedAt: Date | null;
}

export interface EmployeeWithCountry extends Employee {
  country: Country;
}

export interface SalaryChange {
  id: number;
  employeeId: number;
  previousSalary: number | null;
  newSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  effectiveDate: Date;
  reason: SalaryChangeReason;
  changedBy: { id: number; name: string } | null;
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
  /** defaults to ACTIVE; ALL includes deactivated employees */
  status?: EmployeeStatus | 'ALL';
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

export interface NewEmployeeInput extends Compensation {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  hireDate: Date;
}

/**
 * Profile fields editable via PATCH. Pay is excluded (changes go through salary-changes so they are
 * dated, explained and attributed). Country is excluded because it determines the pay currency: a
 * relocation is a compensation event, not a profile edit (see docs/REQUIREMENTS.md).
 */
export type EmployeeProfilePatch = Partial<
  Pick<NewEmployeeInput, 'firstName' | 'lastName' | 'email' | 'jobTitle' | 'department' | 'hireDate'>
>;

export interface SalaryChangeInput {
  newSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  effectiveDate: Date;
  reason: Exclude<SalaryChangeReason, 'HIRE'>;
}

export const AUDIT_ACTIONS = [
  'LOGIN',
  'EMPLOYEE_CREATED',
  'EMPLOYEE_UPDATED',
  'EMPLOYEE_DEACTIVATED',
  'EMPLOYEE_REACTIVATED',
  'SALARY_CHANGED',
  'USER_CREATED',
  'USER_UPDATED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** What a mutation records in the audit log; written in the same transaction as the change. */
export interface AuditEntry {
  userId: number | null;
  action: AuditAction;
  entityType: 'EMPLOYEE' | 'USER';
  entityId: number | null;
  details?: Record<string, unknown>;
}

export interface AuditLogRecord extends AuditEntry {
  id: number;
  userName: string | null;
  createdAt: Date;
}
