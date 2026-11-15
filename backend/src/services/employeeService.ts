import { assertValidCompensation, payBreakdown } from '../domain/compensation';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import { isJobTitleInDepartment } from '../domain/reference';
import { assertValidSalaryChange, packageOf, percentChange } from '../domain/salary';
import type {
  Actor,
  EmployeeDetail,
  EmployeeListQuery,
  EmployeeProfilePatch,
  EmployeeWithCountry,
  NewEmployeeInput,
  Page,
  SalaryChange,
  SalaryChangeInput,
} from '../domain/types';
import type { CountryRepository, EmployeeRepository } from '../repositories/types';

type Pay = ReturnType<typeof payBreakdown>;

export type EmployeeListItem = EmployeeWithCountry & Pay;

export type SalaryChangeView = SalaryChange & {
  gross: number;
  net: number;
  /** change in gross pay vs the previous entry */
  changePercent: number | null;
};

export type EmployeeView = Omit<EmployeeDetail, 'salaryChanges'> &
  Pay & {
    /** newest first — the order HR reads a timeline in */
    salaryChanges: SalaryChangeView[];
  };

function withPay<T extends EmployeeWithCountry>(e: T): T & Pay {
  return { ...e, ...payBreakdown(e, e.country.usdRate) };
}

function toView(e: EmployeeDetail): EmployeeView {
  const chronological = [...e.salaryChanges].sort(
    (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime() || a.id - b.id,
  );
  let previousGross: number | null = null;
  const history = chronological.map((c) => {
    const gross = c.newSalary + c.allowances + c.bonus;
    const view = { ...c, gross, net: gross - c.deductions, changePercent: percentChange(previousGross, gross) };
    previousGross = gross;
    return view;
  });
  return { ...withPay(e), salaryChanges: history.reverse() };
}

function assertDepartmentHasTitle(department: string, jobTitle: string): void {
  if (!isJobTitleInDepartment(jobTitle, department)) {
    throw new ValidationError(`"${jobTitle}" is not a job title in the ${department} department`);
  }
}

export class EmployeeService {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly countries: CountryRepository,
  ) {}

  async list(query: EmployeeListQuery): Promise<Page<EmployeeListItem>> {
    const { items, total } = await this.employees.list(query);
    return {
      items: items.map(withPay),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async get(id: number): Promise<EmployeeView> {
    return toView(await this.require(id));
  }

  async create(input: NewEmployeeInput, actor: Actor): Promise<EmployeeView> {
    const email = input.email.trim().toLowerCase();
    if (!(await this.countries.findByCode(input.countryCode))) {
      throw new ValidationError(`Unknown country "${input.countryCode}"`);
    }
    assertDepartmentHasTitle(input.department, input.jobTitle);
    assertValidCompensation({
      salary: input.salary,
      allowances: input.allowances,
      bonus: input.bonus,
      deductions: input.deductions,
    });
    if (await this.employees.emailExists(email)) {
      throw new ConflictError(`An employee with email ${email} already exists`);
    }
    const created = await this.employees.create({ ...input, email }, actor.id, {
      userId: actor.id,
      action: 'EMPLOYEE_CREATED',
      entityType: 'EMPLOYEE',
      entityId: null, // filled in by the repository once the id exists
      details: { email, countryCode: input.countryCode, jobTitle: input.jobTitle, salary: input.salary },
    });
    return toView(created);
  }

  async update(id: number, patch: EmployeeProfilePatch, actor: Actor): Promise<EmployeeView> {
    const existing = await this.require(id);
    const normalised = patch.email ? { ...patch, email: patch.email.trim().toLowerCase() } : patch;

    if (normalised.department !== undefined || normalised.jobTitle !== undefined) {
      assertDepartmentHasTitle(normalised.department ?? existing.department, normalised.jobTitle ?? existing.jobTitle);
    }
    if (normalised.email && normalised.email !== existing.email) {
      if (await this.employees.emailExists(normalised.email, id)) {
        throw new ConflictError(`An employee with email ${normalised.email} already exists`);
      }
    }
    if (normalised.hireDate) {
      const firstRaise = existing.salaryChanges
        .filter((c) => c.reason !== 'HIRE')
        .reduce<number>((min, c) => Math.min(min, c.effectiveDate.getTime()), Infinity);
      if (normalised.hireDate.getTime() > firstRaise) {
        throw new ValidationError('Hire date cannot be after the first recorded salary change');
      }
    }
    // Record only fields that actually change, with before/after values.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(normalised)) {
      const before = existing[k as keyof EmployeeProfilePatch];
      const same = before instanceof Date && v instanceof Date ? before.getTime() === v.getTime() : before === v;
      if (!same) changes[k] = { from: before, to: v };
    }
    const updated = await this.employees.update(id, normalised, {
      userId: actor.id,
      action: 'EMPLOYEE_UPDATED',
      entityType: 'EMPLOYEE',
      entityId: id,
      details: { changes },
    });
    return toView(updated);
  }

  /** Deactivation keeps the record and its history but removes the person from analytics. */
  async setActive(id: number, active: boolean, actor: Actor): Promise<EmployeeView> {
    const existing = await this.require(id);
    const status = active ? 'ACTIVE' : 'INACTIVE';
    if (existing.status === status) {
      throw new ValidationError(`Employee is already ${active ? 'active' : 'inactive'}`);
    }
    const updated = await this.employees.setStatus(id, status, {
      userId: actor.id,
      action: active ? 'EMPLOYEE_REACTIVATED' : 'EMPLOYEE_DEACTIVATED',
      entityType: 'EMPLOYEE',
      entityId: id,
    });
    return toView(updated);
  }

  async changeSalary(id: number, input: SalaryChangeInput, actor: Actor): Promise<EmployeeView> {
    const existing = await this.require(id);
    if (existing.status === 'INACTIVE') {
      throw new ValidationError('Reactivate the employee before changing their pay');
    }
    const current = {
      salary: existing.salary,
      allowances: existing.allowances,
      bonus: existing.bonus,
      deductions: existing.deductions,
    };
    assertValidSalaryChange(input, { current, hireDate: existing.hireDate, history: existing.salaryChanges });

    const updated = await this.employees.applySalaryChange(id, current, input, actor.id, {
      userId: actor.id,
      action: 'SALARY_CHANGED',
      entityType: 'EMPLOYEE',
      entityId: id,
      details: {
        reason: input.reason,
        effectiveDate: input.effectiveDate.toISOString().slice(0, 10),
        currency: existing.country.currency,
        from: current,
        to: packageOf(input),
      },
    });
    return toView(updated);
  }

  private async require(id: number): Promise<EmployeeDetail> {
    const employee = await this.employees.findById(id);
    if (!employee) throw new NotFoundError(`Employee ${id} not found`);
    return employee;
  }
}
