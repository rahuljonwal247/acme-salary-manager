import { Prisma, type PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../domain/errors';
import type {
  EmployeeListQuery,
  EmployeeProfilePatch,
  EmployeeSortField,
  NewEmployeeInput,
  SalaryChangeInput,
} from '../../domain/types';
import { formatEmployeeCode } from '../../seed/generator';
import type { EmployeeRepository } from '../types';
import { toEmployee, toEmployeeDetail } from './mappers';

const detailInclude = {
  country: true,
  salaryChanges: { orderBy: [{ effectiveDate: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.EmployeeInclude;

function orderBy(sort: EmployeeSortField, order: 'asc' | 'desc'): Prisma.EmployeeOrderByWithRelationInput[] {
  // `id` as final tie-breaker keeps pagination stable when sort values repeat.
  switch (sort) {
    case 'salary':
      return [{ salary: order }, { id: 'asc' }];
    case 'hireDate':
      return [{ hireDate: order }, { id: 'asc' }];
    case 'employeeCode':
      return [{ employeeCode: order }];
    case 'name':
      return [{ lastName: order }, { firstName: order }, { id: 'asc' }];
  }
}

function whereFor(q: EmployeeListQuery): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {
    countryCode: q.country,
    department: q.department,
    jobTitle: q.jobTitle,
  };
  const term = q.search?.trim();
  if (term) {
    const contains = { contains: term, mode: 'insensitive' as const };
    const parts = term.split(/\s+/);
    where.OR = [
      { firstName: contains },
      { lastName: contains },
      { email: contains },
      { employeeCode: contains },
      // "ada lovelace" -> first name + last name
      ...(parts.length === 2
        ? [{ AND: [{ firstName: { startsWith: parts[0], mode: 'insensitive' as const } }, { lastName: { startsWith: parts[1], mode: 'insensitive' as const } }] }]
        : []),
    ];
  }
  return where;
}

function rethrowUniqueViolation(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictError('An employee with this email already exists');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    throw new NotFoundError('Employee not found');
  }
  throw err;
}

export class PrismaEmployeeRepository implements EmployeeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: EmployeeListQuery) {
    const where = whereFor(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include: { country: true },
        orderBy: orderBy(query.sort, query.order),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items: rows.map(toEmployee), total };
  }

  async findById(id: number) {
    const row = await this.prisma.employee.findUnique({ where: { id }, include: detailInclude });
    return row ? toEmployeeDetail(row) : null;
  }

  async emailExists(email: string, excludeId?: number) {
    const count = await this.prisma.employee.count({
      where: { email: { equals: email, mode: 'insensitive' }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    return count > 0;
  }

  async create(input: NewEmployeeInput) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Employee code is derived from the generated id, so insert with a placeholder then set it.
        const created = await tx.employee.create({
          data: {
            ...input,
            employeeCode: `TMP-${crypto.randomUUID()}`,
            salaryChanges: {
              create: { previousSalary: null, newSalary: input.salary, effectiveDate: input.hireDate, reason: 'HIRE' },
            },
          },
        });
        return tx.employee.update({
          where: { id: created.id },
          data: { employeeCode: formatEmployeeCode(created.id) },
          include: detailInclude,
        });
      });
      return toEmployeeDetail(row);
    } catch (err) {
      rethrowUniqueViolation(err);
    }
  }

  async update(id: number, patch: EmployeeProfilePatch) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (patch.hireDate) {
          await tx.salaryChange.updateMany({
            where: { employeeId: id, reason: 'HIRE' },
            data: { effectiveDate: patch.hireDate },
          });
        }
        return tx.employee.update({ where: { id }, data: patch, include: detailInclude });
      });
      return toEmployeeDetail(row);
    } catch (err) {
      rethrowUniqueViolation(err);
    }
  }

  async delete(id: number) {
    try {
      await this.prisma.employee.delete({ where: { id } });
    } catch (err) {
      rethrowUniqueViolation(err);
    }
  }

  async applySalaryChange(id: number, previousSalary: number, change: SalaryChangeInput) {
    const row = await this.prisma.$transaction(async (tx) => {
      // Optimistic concurrency: only apply if nobody changed the salary since we validated.
      const { count } = await tx.employee.updateMany({
        where: { id, salary: previousSalary },
        data: { salary: change.newSalary },
      });
      if (count === 0) {
        throw new ConflictError('Salary was changed by someone else — reload and try again');
      }
      await tx.salaryChange.create({
        data: { employeeId: id, previousSalary, ...change },
      });
      return tx.employee.findUniqueOrThrow({ where: { id }, include: detailInclude });
    });
    return toEmployeeDetail(row);
  }
}
