import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import { isJobTitleInDepartment } from '../domain/reference';
import { assertValidSalaryChange, percentChange, toUsd } from '../domain/salary';
import type {
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

export type EmployeeListItem = EmployeeWithCountry & { salaryUsd: number };

export type SalaryChangeView = SalaryChange & { changePercent: number | null };

export type EmployeeView = Omit<EmployeeDetail, 'salaryChanges'> & {
  salaryUsd: number;
  /** newest first — the order HR reads a timeline in */
  salaryChanges: SalaryChangeView[];
};

function toListItem(e: EmployeeWithCountry): EmployeeListItem {
  return { ...e, salaryUsd: toUsd(e.salary, e.country.usdRate) };
}

function toView(e: EmployeeDetail): EmployeeView {
  const history = [...e.salaryChanges]
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime() || b.id - a.id)
    .map((c) => ({ ...c, changePercent: percentChange(c.previousSalary, c.newSalary) }));
  return { ...e, salaryUsd: toUsd(e.salary, e.country.usdRate), salaryChanges: history };
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
      items: items.map(toListItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async get(id: number): Promise<EmployeeView> {
    return toView(await this.require(id));
  }

  async create(input: NewEmployeeInput): Promise<EmployeeView> {
    const email = input.email.trim().toLowerCase();
    if (!(await this.countries.findByCode(input.countryCode))) {
      throw new ValidationError(`Unknown country "${input.countryCode}"`);
    }
    assertDepartmentHasTitle(input.department, input.jobTitle);
    if (await this.employees.emailExists(email)) {
      throw new ConflictError(`An employee with email ${email} already exists`);
    }
    return toView(await this.employees.create({ ...input, email }));
  }

  async update(id: number, patch: EmployeeProfilePatch): Promise<EmployeeView> {
    const existing = await this.require(id);
    const normalised = patch.email ? { ...patch, email: patch.email.trim().toLowerCase() } : patch;

    if (normalised.department !== undefined || normalised.jobTitle !== undefined) {
      assertDepartmentHasTitle(
        normalised.department ?? existing.department,
        normalised.jobTitle ?? existing.jobTitle,
      );
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
    return toView(await this.employees.update(id, normalised));
  }

  async delete(id: number): Promise<void> {
    await this.require(id);
    await this.employees.delete(id);
  }

  async changeSalary(id: number, input: SalaryChangeInput): Promise<EmployeeView> {
    const existing = await this.require(id);
    assertValidSalaryChange(input, {
      currentSalary: existing.salary,
      hireDate: existing.hireDate,
      history: existing.salaryChanges,
    });
    return toView(await this.employees.applySalaryChange(id, existing.salary, input));
  }

  private async require(id: number): Promise<EmployeeDetail> {
    const employee = await this.employees.findById(id);
    if (!employee) throw new NotFoundError(`Employee ${id} not found`);
    return employee;
  }
}
