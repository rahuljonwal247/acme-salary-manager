import { Prisma, type PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../domain/errors';
import type { AuditEntry, AuditLogRecord, Role } from '../../domain/types';
import type { AuditLogQuery, AuditRepository, InsightFilter, SalaryHistoryRepository, UserRepository } from '../types';
import { writeAudit } from './employeeRepository';
import { toUser, toUserWithSecret } from './mappers';

function rethrowKnown(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictError('A user with this email already exists');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    throw new NotFoundError('User not found');
  }
  throw err;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string) {
    const u = await this.prisma.user.findUnique({ where: { email } });
    return u ? toUserWithSecret(u) : null;
  }

  async findById(id: number) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    return u ? toUser(u) : null;
  }

  async list() {
    return (await this.prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] })).map(toUser);
  }

  async create(input: { email: string; name: string; role: Role; passwordHash: string }, audit: AuditEntry) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({ data: input });
        await writeAudit(tx, { ...audit, entityId: u.id });
        return toUser(u);
      });
    } catch (err) {
      rethrowKnown(err);
    }
  }

  async update(
    id: number,
    patch: Partial<{ name: string; role: Role; isActive: boolean; passwordHash: string }>,
    audit: AuditEntry,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.update({ where: { id }, data: patch });
        await writeAudit(tx, audit);
        return toUser(u);
      });
    } catch (err) {
      rethrowKnown(err);
    }
  }

  async recordLogin(id: number) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
      await writeAudit(tx, { userId: id, action: 'LOGIN', entityType: 'USER', entityId: id });
    });
  }

  count() {
    return this.prisma.user.count();
  }
}

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: AuditEntry) {
    await this.prisma.$transaction((tx) => writeAudit(tx, entry));
  }

  async list(query: AuditLogQuery) {
    const where: Prisma.AuditLogWhereInput = {
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const items: AuditLogRecord[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user?.name ?? null,
      action: r.action as AuditLogRecord['action'],
      entityType: r.entityType as AuditLogRecord['entityType'],
      entityId: r.entityId,
      details: (r.details ?? undefined) as Record<string, unknown> | undefined,
      createdAt: r.createdAt,
    }));
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
}

export class PrismaSalaryHistoryRepository implements SalaryHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForExport(filter: InsightFilter & { from?: Date; to?: Date }) {
    const rows = await this.prisma.salaryChange.findMany({
      where: {
        effectiveDate: { gte: filter.from, lte: filter.to },
        employee: { countryCode: filter.country, department: filter.department, jobTitle: filter.jobTitle },
      },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true, countryCode: true, country: { select: { currency: true } } } },
        changedBy: { select: { name: true } },
      },
      orderBy: [{ employee: { employeeCode: 'asc' } }, { effectiveDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ({
      employeeCode: r.employee.employeeCode,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      countryCode: r.employee.countryCode,
      currency: r.employee.country.currency,
      effectiveDate: r.effectiveDate,
      reason: r.reason,
      previousSalary: r.previousSalary,
      newSalary: r.newSalary,
      allowances: r.allowances,
      bonus: r.bonus,
      deductions: r.deductions,
      changedBy: r.changedBy?.name ?? null,
    }));
  }
}
