import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import type { EmployeeListQuery } from '../domain/types';
import { InMemoryCountryRepository, InMemoryEmployeeRepository, newEmployeeInput } from '../testing/fakes';
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
    it('creates an employee with an initial HIRE salary entry and USD value', async () => {
      const created = await service.create(newEmployeeInput({ countryCode: 'IN', salary: 2_500_000 }));

      expect(created.employeeCode).toBe('EMP-00001');
      expect(created.salaryUsd).toBe(30_000);
      expect(created.salaryChanges).toHaveLength(1);
      expect(created.salaryChanges[0]).toMatchObject({
        reason: 'HIRE',
        previousSalary: null,
        newSalary: 2_500_000,
        changePercent: null,
      });
    });

    it('normalises email to lower case', async () => {
      const created = await service.create(newEmployeeInput({ email: '  Ada@ACME.example ' }));
      expect(created.email).toBe('ada@acme.example');
    });

    it('rejects an unknown country', async () => {
      await expect(service.create(newEmployeeInput({ countryCode: 'ZZ' }))).rejects.toThrow(ValidationError);
      expect(repo.writes).toBe(0);
    });

    it('rejects a job title that does not belong to the department', async () => {
      await expect(
        service.create(newEmployeeInput({ department: 'Sales', jobTitle: 'Software Engineer' })),
      ).rejects.toThrow(/not a job title in the Sales department/);
    });

    it('rejects a duplicate email (case-insensitive)', async () => {
      await service.create(newEmployeeInput());
      await expect(service.create(newEmployeeInput({ email: 'ADA@acme.example' }))).rejects.toThrow(ConflictError);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await service.create(newEmployeeInput({ email: 'a@x.io', lastName: 'Adams', salary: 90_000 }));
      await service.create(newEmployeeInput({ email: 'b@x.io', lastName: 'Brown', salary: 150_000 }));
      await service.create(newEmployeeInput({ email: 'c@x.io', lastName: 'Clark', countryCode: 'DE', salary: 80_000 }));
    });

    it('returns a page with pagination metadata', async () => {
      const page = await service.list(listQuery());
      expect(page.items.map((e) => e.lastName)).toEqual(['Adams', 'Brown']);
      expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
    });

    it('adds the USD salary to each row', async () => {
      const page = await service.list(listQuery({ country: 'DE' }));
      expect(page.items[0]?.salaryUsd).toBe(86_400);
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

    it('returns salary history newest first with percent change', async () => {
      const { id } = await service.create(newEmployeeInput({ salary: 100_000 }));
      await service.changeSalary(id, { newSalary: 110_000, effectiveDate: new Date('2023-01-01'), reason: 'ANNUAL_REVIEW' });

      const view = await service.get(id);
      expect(view.salaryChanges.map((c) => [c.reason, c.changePercent])).toEqual([
        ['ANNUAL_REVIEW', 10],
        ['HIRE', null],
      ]);
    });
  });

  describe('update', () => {
    it('updates profile fields', async () => {
      const { id } = await service.create(newEmployeeInput());
      const updated = await service.update(id, { jobTitle: 'Staff Engineer' });
      expect(updated.jobTitle).toBe('Staff Engineer');
    });

    it('validates the department/title combination against the existing record', async () => {
      const { id } = await service.create(newEmployeeInput());
      await expect(service.update(id, { department: 'Finance' })).rejects.toThrow(ValidationError);
    });

    it('rejects an email already used by another employee', async () => {
      await service.create(newEmployeeInput({ email: 'taken@acme.example' }));
      const { id } = await service.create(newEmployeeInput({ email: 'mine@acme.example' }));
      await expect(service.update(id, { email: 'Taken@acme.example' })).rejects.toThrow(ConflictError);
    });

    it('allows keeping the same email', async () => {
      const { id } = await service.create(newEmployeeInput());
      await expect(service.update(id, { email: 'ada@acme.example', firstName: 'Augusta' })).resolves.toMatchObject({
        firstName: 'Augusta',
      });
    });

    it('rejects moving the hire date after the first raise', async () => {
      const { id } = await service.create(newEmployeeInput({ hireDate: new Date('2020-01-01') }));
      await service.changeSalary(id, { newSalary: 130_000, effectiveDate: new Date('2021-01-01'), reason: 'PROMOTION' });
      await expect(service.update(id, { hireDate: new Date('2021-06-01') })).rejects.toThrow(/after the first recorded/);
    });

    it('moves the HIRE entry with the hire date', async () => {
      const { id } = await service.create(newEmployeeInput({ hireDate: new Date('2020-01-01') }));
      const updated = await service.update(id, { hireDate: new Date('2019-06-01') });
      expect(updated.salaryChanges[0]?.effectiveDate).toEqual(new Date('2019-06-01'));
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.update(42, { firstName: 'X' })).rejects.toThrow(NotFoundError);
    });
  });

  describe('changeSalary', () => {
    it('updates the current salary and appends history', async () => {
      const { id } = await service.create(newEmployeeInput({ salary: 100_000 }));
      const updated = await service.changeSalary(id, {
        newSalary: 120_000,
        effectiveDate: new Date('2024-03-01'),
        reason: 'PROMOTION',
      });

      expect(updated.salary).toBe(120_000);
      expect(updated.salaryChanges[0]).toMatchObject({ previousSalary: 100_000, newSalary: 120_000, changePercent: 20 });
    });

    it('enforces domain rules and persists nothing on failure', async () => {
      const { id } = await service.create(newEmployeeInput({ salary: 100_000 }));
      const writesBefore = repo.writes;
      await expect(
        service.changeSalary(id, { newSalary: 90_000, effectiveDate: new Date('2024-03-01'), reason: 'PROMOTION' }),
      ).rejects.toThrow(ValidationError);
      expect(repo.writes).toBe(writesBefore);
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(
        service.changeSalary(5, { newSalary: 1, effectiveDate: new Date(), reason: 'CORRECTION' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('removes the employee', async () => {
      const { id } = await service.create(newEmployeeInput());
      await service.delete(id);
      await expect(service.get(id)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.delete(7)).rejects.toThrow(NotFoundError);
    });
  });
});
