import { z } from 'zod';
import { ValidationError } from '../domain/errors';
import { DEPARTMENT_NAMES, JOB_TITLES, SALARY_CHANGE_REASONS } from '../domain/reference';
import { EMPLOYEE_SORT_FIELDS, ROLES } from '../domain/types';
import { BREAKDOWN_DIMENSIONS } from '../repositories/types';
import { REPORT_FORMATS, REPORT_TYPES } from '../services/reportService';

/** Turns "" (empty form field / query param) into undefined so optional filters behave. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

const department = z.enum(DEPARTMENT_NAMES as [string, ...string[]], {
  errorMap: () => ({ message: 'Unknown department' }),
});
const jobTitle = z.enum(JOB_TITLES as [string, ...string[]], {
  errorMap: () => ({ message: 'Unknown job title' }),
});
const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Country must be a 2-letter ISO code');

/** "YYYY-MM-DD" -> Date at UTC midnight; rejects impossible dates like 2024-02-31. */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .transform((s, ctx) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid calendar date' });
      return z.NEVER;
    }
    return d;
  });

const MAX_AMOUNT = 2_000_000_000; // fits Postgres int4

/** Annual amount in whole units of local currency. */
const amount = (label: string, { positive = false } = {}) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(positive ? 1 : 0, positive ? `${label} must be greater than zero` : `${label} cannot be negative`)
    .max(MAX_AMOUNT, `${label} is unrealistically large`);

const salary = amount('Salary', { positive: true });
const components = {
  allowances: amount('Allowances').default(0),
  bonus: amount('Bonus').default(0),
  deductions: amount('Deductions').default(0),
};

const name = z.string().trim().min(1, 'Required').max(100);
const email = z.string().trim().email('Invalid email address').max(200);

// Zod still runs refinements after a failed transform, so guard against a non-Date value.
const hireDate = dateOnly.superRefine((d, ctx) => {
  if (!(d instanceof Date)) return;
  if (d.getUTCFullYear() < 1950) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Hire date is too far in the past' });
  } else if (d.getTime() > Date.now() + 365 * 86_400_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Hire date cannot be more than a year in the future' });
  }
});

const filterFields = {
  search: optional(z.string().trim().max(100)),
  country: optional(countryCode),
  department: optional(department),
  jobTitle: optional(jobTitle),
  status: optional(z.enum(['ACTIVE', 'INACTIVE', 'ALL'])).transform((v) => v ?? 'ACTIVE'),
};

export const employeeListQuerySchema = z.object({
  ...filterFields,
  sort: optional(z.enum(EMPLOYEE_SORT_FIELDS)).transform((v) => v ?? 'name'),
  order: optional(z.enum(['asc', 'desc'])).transform((v) => v ?? 'asc'),
  page: optional(z.coerce.number().int().min(1)).transform((v) => v ?? 1),
  pageSize: optional(z.coerce.number().int().min(1).max(100)).transform((v) => v ?? 25),
});

export const createEmployeeSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  jobTitle,
  department,
  countryCode,
  hireDate,
  salary,
  ...components,
});

export const updateEmployeeSchema = z
  .object({ firstName: name, lastName: name, email, jobTitle, department, hireDate })
  .partial()
  .strict('Pay and country cannot be edited here — record a salary change instead')
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');

export const salaryChangeSchema = z.object({
  newSalary: salary,
  ...components,
  effectiveDate: dateOnly,
  // HIRE is recorded automatically on creation and cannot be submitted.
  reason: z.enum(['PROMOTION', 'ANNUAL_REVIEW', 'MARKET_ADJUSTMENT', 'CORRECTION'], {
    errorMap: () => ({ message: `Reason must be one of ${SALARY_CHANGE_REASONS.filter((r) => r !== 'HIRE').join(', ')}` }),
  }),
});

export const insightFilterSchema = z.object({
  country: optional(countryCode),
  department: optional(department),
  jobTitle: optional(jobTitle),
});

export const breakdownQuerySchema = insightFilterSchema.extend({ by: z.enum(BREAKDOWN_DIMENSIONS) });

export const topEarnersQuerySchema = insightFilterSchema.extend({
  limit: optional(z.coerce.number().int().min(1).max(50)).transform((v) => v ?? 10),
});

export const benchmarkQuerySchema = z.object({
  country: countryCode,
  jobTitle,
  salary: optional(z.coerce.number().int().positive()),
});

export const reportQuerySchema = z.object({
  ...filterFields,
  format: optional(z.enum(REPORT_FORMATS)).transform((v) => v ?? 'csv'),
  from: optional(dateOnly),
  to: optional(dateOnly),
});
export const reportTypeSchema = z.object({ type: z.enum(REPORT_TYPES) });

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').max(200),
  password: z.string().min(1, 'Password is required').max(200),
});

export const createUserSchema = z.object({
  email,
  name,
  role: z.enum(ROLES),
  password: z.string().max(200),
});

export const updateUserSchema = z
  .object({ name, role: z.enum(ROLES), isActive: z.boolean(), password: z.string().max(200) })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');

export const auditQuerySchema = z.object({
  entityType: optional(z.enum(['EMPLOYEE', 'USER'])),
  entityId: optional(z.coerce.number().int().positive()),
  action: optional(z.string().max(50)),
  page: optional(z.coerce.number().int().min(1)).transform((v) => v ?? 1),
  pageSize: optional(z.coerce.number().int().min(1).max(100)).transform((v) => v ?? 50),
});

export const askSchema = z.object({
  question: z.string().trim().min(3, 'Ask a question about salaries').max(500, 'Question is too long'),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive('Invalid id') });

/** Parses input or throws a ValidationError whose details map field -> messages. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const flat = result.error.flatten();
    const first = flat.formErrors[0] ?? Object.values(flat.fieldErrors).flat()[0] ?? 'Invalid request';
    throw new ValidationError(String(first), { fieldErrors: flat.fieldErrors, formErrors: flat.formErrors });
  }
  return result.data;
}
