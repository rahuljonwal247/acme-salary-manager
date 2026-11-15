import type { Prisma } from '@prisma/client';
import type { Country, EmployeeDetail, EmployeeWithCountry, User, UserWithSecret } from '../../domain/types';

type PrismaCountry = Prisma.CountryGetPayload<object>;
type PrismaEmployeeWithCountry = Prisma.EmployeeGetPayload<{ include: { country: true } }>;
type PrismaEmployeeDetail = Prisma.EmployeeGetPayload<{
  include: { country: true; salaryChanges: { include: { changedBy: { select: { id: true; name: true } } } } };
}>;
type PrismaUser = Prisma.UserGetPayload<object>;

export function toCountry(c: PrismaCountry): Country {
  return { code: c.code, name: c.name, currency: c.currency, usdRate: c.usdRate.toNumber() };
}

export function toEmployee(e: PrismaEmployeeWithCountry): EmployeeWithCountry {
  return {
    id: e.id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    jobTitle: e.jobTitle,
    department: e.department,
    countryCode: e.countryCode,
    hireDate: e.hireDate,
    status: e.status,
    deactivatedAt: e.deactivatedAt,
    salary: e.salary,
    allowances: e.allowances,
    bonus: e.bonus,
    deductions: e.deductions,
    country: toCountry(e.country),
  };
}

export function toEmployeeDetail(e: PrismaEmployeeDetail): EmployeeDetail {
  return {
    ...toEmployee(e),
    salaryChanges: e.salaryChanges.map((c) => ({
      id: c.id,
      employeeId: c.employeeId,
      previousSalary: c.previousSalary,
      newSalary: c.newSalary,
      allowances: c.allowances,
      bonus: c.bonus,
      deductions: c.deductions,
      effectiveDate: c.effectiveDate,
      reason: c.reason,
      changedBy: c.changedBy,
      createdAt: c.createdAt,
    })),
  };
}

export function toUser(u: PrismaUser): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export function toUserWithSecret(u: PrismaUser): UserWithSecret {
  return { ...toUser(u), passwordHash: u.passwordHash };
}
