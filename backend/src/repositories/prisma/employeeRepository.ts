import { Prisma, type PrismaClient } from '@prisma/client';
import type { Compensation } from '../../domain/compensation';
import { ConflictError, NotFoundError } from '../../domain/errors';
import type {
  AuditEntry,
  EmployeeFilter,
  EmployeeListQuery,
  EmployeeProfilePatch,
  EmployeeSortField,
  EmployeeStatus,
  NewEmployeeInput,
  SalaryChangeInput,
} from '../../domain/types';
import { formatEmployeeCode } from '../../seed/generator';
import type { EmployeeRepository } from '../types';
import { toEmployee, toEmployeeDetail } from './mappers';

const detailInclude = {
  country: true,
  salaryChanges: {
    orderBy: [{ effectiveDate: 'asc' }, { id: 'asc' }],
    include: { changedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.EmployeeInclude;

type Tx = Prisma.TransactionClient;

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

export function whereFor(q: EmployeeFilter): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {
    countryCode: q.country,
    department: q.department,
    jobTitle: q.jobTitle,
    status: q.status === 'ALL' ? undefined : (q.status ?? 'ACTIVE'),
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
        ? [
            {
              AND: [
                { firstName: { startsWith: parts[0], mode: 'insensitive' as const } },
                { lastName: { startsWith: parts[1], mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
    ];
  }
  return where;
}

function rethrowKnown(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictError('An employee with this email already exists');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    throw new NotFoundError('Employee not found');
  }
  throw err;
}

export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
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

  async listAll(filter: EmployeeFilter) {
    const rows = await this.prisma.employee.findMany({
      where: whereFor(filter),
      include: { country: true },
      orderBy: { employeeCode: 'asc' },
    });
    return rows.map(toEmployee);
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

  async create(input: NewEmployeeInput, actorId: number | null, audit: AuditEntry) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Employee code is derived from the generated id, so insert with a placeholder then set it.
        const created = await tx.employee.create({
          data: {
            ...input,
            employeeCode: `TMP-${crypto.randomUUID()}`,
            salaryChanges: {
              create: {
                previousSalary: null,
                newSalary: input.salary,
                allowances: input.allowances,
                bonus: input.bonus,
                deductions: input.deductions,
                effectiveDate: input.hireDate,
                reason: 'HIRE',
                changedById: actorId,
              },
            },
          },
        });
        const employeeCode = formatEmployeeCode(created.id);
        await writeAudit(tx, { ...audit, entityId: created.id, details: { ...audit.details, employeeCode } });
        return tx.employee.update({ where: { id: created.id }, data: { employeeCode }, include: detailInclude });
      });
      return toEmployeeDetail(row);
    } catch (err) {
      rethrowKnown(err);
    }
  }

  async update(id: number, patch: EmployeeProfilePatch, audit: AuditEntry) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (patch.hireDate) {
          await tx.salaryChange.updateMany({
            where: { employeeId: id, reason: 'HIRE' },
            data: { effectiveDate: patch.hireDate },
          });
        }
        const updated = await tx.employee.update({ where: { id }, data: patch, include: detailInclude });
        await writeAudit(tx, audit);
        return updated;
      });
      return toEmployeeDetail(row);
    } catch (err) {
      rethrowKnown(err);
    }
  }

  async setStatus(id: number, status: EmployeeStatus, audit: AuditEntry) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.employee.update({
          where: { id },
          data: { status, deactivatedAt: status === 'INACTIVE' ? new Date() : null },
          include: detailInclude,
        });
        await writeAudit(tx, audit);
        return updated;
      });
      return toEmployeeDetail(row);
    } catch (err) {
      rethrowKnown(err);
    }
  }

  async applySalaryChange(
    id: number,
    expected: Compensation,
    change: SalaryChangeInput,
    actorId: number | null,
    audit: AuditEntry,
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      // Optimistic concurrency: only apply if nobody changed the package since we validated it.
      const { count } = await tx.employee.updateMany({
        where: { id, ...expected },
        data: {
          salary: change.newSalary,
          allowances: change.allowances,
          bonus: change.bonus,
          deductions: change.deductions,
        },
      });
      if (count === 0) {
        throw new ConflictError('Pay was changed by someone else — reload and try again');
      }
      await tx.salaryChange.create({
        data: { employeeId: id, previousSalary: expected.salary, changedById: actorId, ...change },
      });
      await writeAudit(tx, audit);
      return tx.employee.findUniqueOrThrow({ where: { id }, include: detailInclude });
    });
    return toEmployeeDetail(row);
  }
}
