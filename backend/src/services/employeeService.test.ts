import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import type { EmployeeListQuery } from '../domain/types';
import {
  HR_ACTOR,
  InMemoryCountryRepository,
  InMemoryEmployeeRepository,
  newEmployeeInput,
  raise,
} from '../testing/fakes';
import { EmployeeService } from './employeeService';

const listQuery = (overrides: Partial<EmployeeListQuery> = {}): EmployeeListQuery => ({
  sort: 'name',
  order: 'asc',
  page: 1,
  pageSize: 2,
  ...overrides,
});

describe('EmployeeService', () => {
  let repo: InMemoryEmployeeRepository;
  let service: EmployeeService;

  beforeEach(() => {
    repo = new InMemoryEmployeeRepository();
    service = new EmployeeService(repo, new InMemoryCountryRepository());
  });

  describe('create', () => {
    it('creates an employee with a HIRE entry, gross/net and USD values', async () => {
      const created = await service.create(
        newEmployeeInput({ countryCode: 'IN', salary: 2_500_000, allowances: 200_000, bonus: 300_000, deductions: 250_000 }),
        HR_ACTOR,
      );

      expect(created).toMatchObject({
        employeeCode: 'EMP-00001',
        status: 'ACTIVE',
        gross: 3_000_000,
        net: 2_750_000,
        salaryUsd: 30_000,
        grossUsd: 36_000,
        netUsd: 33_000,
      });
      expect(created.salaryChanges).toHaveLength(1);
      expect(created.salaryChanges[0]).toMatchObject({
        reason: 'HIRE',
        previousSalary: null,
        newSalary: 2_500_000,
        gross: 3_000_000,
        changePercent: null,
        changedBy: { id: HR_ACTOR.id },
      });
    });

    it('records who created the employee in the audit log', async () => {
      const created = await service.create(newEmployeeInput(), HR_ACTOR);
      expect(repo.audit.entries).toEqual([
        expect.objectContaining({ action: 'EMPLOYEE_CREATED', entityId: created.id, userId: HR_ACTOR.id }),
      ]);
    });

    it('normalises email to lower case', async () => {
      const created = await service.create(newEmployeeInput({ email: '  Ada@ACME.example ' }), HR_ACTOR);
      expect(created.email).toBe('ada@acme.example');
    });

    it('rejects an unknown country without writing', async () => {
      await expect(service.create(newEmployeeInput({ countryCode: 'ZZ' }), HR_ACTOR)).rejects.toThrow(ValidationError);
      expect(repo.writes).toBe(0);
    });

    it('rejects a job title that does not belong to the department', async () => {
      await expect(
        service.create(newEmployeeInput({ department: 'Sales', jobTitle: 'Software Engineer' }), HR_ACTOR),
      ).rejects.toThrow(/not a job title in the Sales department/);
    });

    it('rejects deductions larger than gross pay', async () => {
      await expect(service.create(newEmployeeInput({ salary: 100, deductions: 101 }), HR_ACTOR)).rejects.toThrow(
        /cannot exceed gross/,
      );
    });

    it('rejects a duplicate email (case-insensitive)', async () => {
      await service.create(newEmployeeInput(), HR_ACTOR);
      await expect(service.create(newEmployeeInput({ email: 'ADA@acme.example' }), HR_ACTOR)).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await service.create(newEmployeeInput({ email: 'a@x.io', lastName: 'Adams', salary: 90_000 }), HR_ACTOR);
      await service.create(newEmployeeInput({ email: 'b@x.io', lastName: 'Brown', salary: 150_000 }), HR_ACTOR);
      await service.create(
        newEmployeeInput({ email: 'c@x.io', lastName: 'Clark', countryCode: 'DE', salary: 80_000, bonus: 8_000 }),
        HR_ACTOR,
      );
    });

    it('returns a page with pagination metadata', async () => {
      const page = await service.list(listQuery());
      expect(page.items.map((e) => e.lastName)).toEqual(['Adams', 'Brown']);
      expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
    });

    it('adds gross pay and USD values to each row', async () => {
      const page = await service.list(listQuery({ country: 'DE' }));
      expect(page.items[0]).toMatchObject({ gross: 88_000, salaryUsd: 86_400, grossUsd: 95_040 });
    });

    it('hides inactive employees unless asked', async () => {
      await service.setActive(1, false, HR_ACTOR);
      expect((await service.list(listQuery())).total).toBe(2);
      expect((await service.list(listQuery({ status: 'INACTIVE' }))).items.map((e) => e.lastName)).toEqual(['Adams']);
      expect((await service.list(listQuery({ status: 'ALL' }))).total).toBe(3);
    });

    it('reports one page when there are no results', async () => {
      const page = await service.list(listQuery({ search: 'nobody' }));
      expect(page).toMatchObject({ total: 0, totalPages: 1, items: [] });
    });
  });

  describe('get', () => {
    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.get(999)).rejects.toThrow(NotFoundError);
    });

    it('returns history newest first with gross-pay percent change', async () => {
      const { id } = await service.create(newEmployeeInput({ salary: 100_000 }), HR_ACTOR);
      await service.changeSalary(id, raise(100_000, '2023-01-01', 'ANNUAL_REVIEW', { bonus: 10_000 }), HR_ACTOR);

      const view = await service.get(id);
      expect(view.salaryChanges.map((c) => [c.reason, c.gross, c.changePercent])).toEqual([
        ['ANNUAL_REVIEW', 110_000, 10],
        ['HIRE', 100_000, null],
      ]);
    });
  });

  describe('update', () => {
    it('updates profile fields and audits only what changed', async () => {
      const { id } = await service.create(newEmployeeInput(), HR_ACTOR);
      const updated = await service.update(id, { jobTitle: 'Staff Engineer', firstName: 'Ada' }, HR_ACTOR);
      expect(updated.jobTitle).toBe('Staff Engineer');
      expect(repo.audit.entries.at(-1)).toMatchObject({
        action: 'EMPLOYEE_UPDATED',
        details: { changes: { jobTitle: { from: 'Software Engineer', to: 'Staff Engineer' } } },
      });
    });

    it('validates the department/title combination against the existing record', async () => {
      const { id } = await service.create(newEmployeeInput(), HR_ACTOR);
      await expect(service.update(id, { department: 'Finance' }, HR_ACTOR)).rejects.toThrow(ValidationError);
    });

    it('rejects an email already used by another employee', async () => {
      await service.create(newEmployeeInput({ email: 'taken@acme.example' }), HR_ACTOR);
      const { id } = await service.create(newEmployeeInput({ email: 'mine@acme.example' }), HR_ACTOR);
      await expect(service.update(id, { email: 'Taken@acme.example' }, HR_ACTOR)).rejects.toThrow(ConflictError);
    });

    it('rejects moving the hire date after the first raise', async () => {
      const { id } = await service.create(newEmployeeInput({ hireDate: new Date('2020-01-01') }), HR_ACTOR);
      await service.changeSalary(id, raise(130_000, '2021-01-01', 'PROMOTION'), HR_ACTOR);
      await expect(service.update(id, { hireDate: new Date('2021-06-01') }, HR_ACTOR)).rejects.toThrow(
        /after the first recorded/,
      );
    });

    it('moves the HIRE entry with the hire date', async () => {
      const { id } = await service.create(newEmployeeInput({ hireDate: new Date('2020-01-01') }), HR_ACTOR);
      const updated = await service.update(id, { hireDate: new Date('2019-06-01') }, HR_ACTOR);
      expect(updated.salaryChanges[0]?.effectiveDate).toEqual(new Date('2019-06-01'));
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.update(42, { firstName: 'X' }, HR_ACTOR)).rejects.toThrow(NotFoundError);
    });
  });

  describe('deactivate / reactivate', () => {
    it('deactivates, audits, and can reactivate', async () => {
      const { id } = await service.create(newEmployeeInput(), HR_ACTOR);
      expect((await service.setActive(id, false, HR_ACTOR)).status).toBe('INACTIVE');
      expect((await service.setActive(id, true, HR_ACTOR)).status).toBe('ACTIVE');
      expect(repo.audit.entries.map((e) => e.action)).toEqual([
        'EMPLOYEE_CREATED',
        'EMPLOYEE_DEACTIVATED',
        'EMPLOYEE_REACTIVATED',
      ]);
    });

    it('rejects a no-op status change', async () => {
      const { id } = await service.create(newEmployeeInput(), HR_ACTOR);
      await expect(service.setActive(id, true, HR_ACTOR)).rejects.toThrow(/already active/);
    });

    it('blocks pay changes for inactive employees', async () => {
      const { id } = await service.create(newEmployeeInput(), HR_ACTOR);
      await service.setActive(id, false, HR_ACTOR);
      await expect(service.changeSalary(id, raise(130_000, '2024-01-01', 'PROMOTION'), HR_ACTOR)).rejects.toThrow(
        /Reactivate/,
      );
    });
  });

  describe('changeSalary', () => {
    it('updates the whole package, appends attributed history and audits before/after', async () => {
      const { id } = await service.create(newEmployeeInput({ salary: 100_000 }), HR_ACTOR);
      const updated = await service.changeSalary(
        id,
        raise(120_000, '2024-03-01', 'PROMOTION', { allowances: 6_000, deductions: 9_000 }),
        HR_ACTOR,
      );

      expect(updated).toMatchObject({ salary: 120_000, allowances: 6_000, deductions: 9_000, gross: 126_000, net: 117_000 });
      expect(updated.salaryChanges[0]).toMatchObject({
        previousSalary: 100_000,
        newSalary: 120_000,
        changePercent: 26,
        changedBy: { id: HR_ACTOR.id },
      });
      expect(repo.audit.entries.at(-1)).toMatchObject({
        action: 'SALARY_CHANGED',
        entityId: id,
        details: {
          reason: 'PROMOTION',
          currency: 'USD',
          from: { salary: 100_000, allowances: 0, bonus: 0, deductions: 0 },
          to: { salary: 120_000, allowances: 6_000, bonus: 0, deductions: 9_000 },
        },
      });
    });

    it('enforces domain rules and persists nothing on failure', async () => {
      const { id } = await service.create(newEmployeeInput({ salary: 100_000 }), HR_ACTOR);
      const writesBefore = repo.writes;
      await expect(service.changeSalary(id, raise(90_000, '2024-03-01', 'PROMOTION'), HR_ACTOR)).rejects.toThrow(
        ValidationError,
      );
      expect(repo.writes).toBe(writesBefore);
    });

    it('surfaces a concurrent edit as a conflict', async () => {
      const { id } = await service.create(newEmployeeInput({ salary: 100_000 }), HR_ACTOR);
      const original = repo.findById.bind(repo);
      repo.findById = async (x) => {
        const snapshot = await original(x);
        repo.tamper(id, 101_000); // someone else saves between our read and write
        return snapshot;
      };
      await expect(service.changeSalary(id, raise(110_000, '2024-03-01', 'ANNUAL_REVIEW'), HR_ACTOR)).rejects.toThrow(
        ConflictError,
      );
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.changeSalary(5, raise(1, '2024-01-01', 'CORRECTION'), HR_ACTOR)).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
