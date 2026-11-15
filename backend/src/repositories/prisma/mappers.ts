import type { Prisma } from '@prisma/client';
import type { Country, EmployeeDetail, EmployeeWithCountry } from '../../domain/types';

type PrismaCountry = Prisma.CountryGetPayload<object>;
type PrismaEmployeeWithCountry = Prisma.EmployeeGetPayload<{ include: { country: true } }>;
type PrismaEmployeeDetail = Prisma.EmployeeGetPayload<{ include: { country: true; salaryChanges: true } }>;

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
    salary: e.salary,
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
      effectiveDate: c.effectiveDate,
      reason: c.reason,
      createdAt: c.createdAt,
    })),
  };
}
