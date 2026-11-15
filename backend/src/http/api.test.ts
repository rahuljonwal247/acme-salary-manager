import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { EmployeeService } from '../services/employeeService';
import { InsightsService } from '../services/insightsService';
import { InMemoryCountryRepository, InMemoryEmployeeRepository, StubInsightsRepository } from '../testing/fakes';

const validEmployee = {
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@acme.example',
  jobTitle: 'Software Engineer',
  department: 'Engineering',
  countryCode: 'us',
  hireDate: '2021-03-15',
  salary: 125_000,
};

function buildApp() {
  const countries = new InMemoryCountryRepository();
  const insightsRepo = new StubInsightsRepository();
  const app = createApp({
    employees: new EmployeeService(new InMemoryEmployeeRepository(), countries),
    insights: new InsightsService(insightsRepo, countries),
    countries,
  });
  return { app, insightsRepo };
}

describe('HTTP API', () => {
  let app: ReturnType<typeof buildApp>['app'];
  let insightsRepo: StubInsightsRepository;

  beforeEach(() => {
    ({ app, insightsRepo } = buildApp());
  });

  it('GET /health', async () => {
    await request(app).get('/health').expect(200, { status: 'ok' });
  });

  it('GET /api/meta returns countries, departments with titles and editable reasons', async () => {
    const res = await request(app).get('/api/meta').expect(200);
    expect(res.body.countries).toHaveLength(3);
    expect(res.body.departments[0]).toMatchObject({ name: 'Engineering' });
    expect(res.body.salaryChangeReasons).not.toContain('HIRE');
  });

  describe('employees', () => {
    it('creates an employee (201) and normalises the country code', async () => {
      const res = await request(app).post('/api/employees').send(validEmployee).expect(201);
      expect(res.body).toMatchObject({ id: 1, countryCode: 'US', hireDate: '2021-03-15T00:00:00.000Z' });
    });

    it('returns 400 with field errors for invalid input', async () => {
      const res = await request(app)
        .post('/api/employees')
        .send({ ...validEmployee, email: 'nope', salary: -5 })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.fieldErrors).toHaveProperty('email');
      expect(res.body.error.details.fieldErrors).toHaveProperty('salary');
    });

    it('rejects an impossible calendar date', async () => {
      const res = await request(app)
        .post('/api/employees')
        .send({ ...validEmployee, hireDate: '2023-02-30' })
        .expect(400);
      expect(res.body.error.message).toBe('Invalid calendar date');
    });

    it('returns 409 for a duplicate email', async () => {
      await request(app).post('/api/employees').send(validEmployee).expect(201);
      await request(app).post('/api/employees').send(validEmployee).expect(409);
    });

    it('lists with defaults and validates query params', async () => {
      await request(app).post('/api/employees').send(validEmployee).expect(201);
      const res = await request(app).get('/api/employees?country=&search=grace').expect(200);
      expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 25 });

      await request(app).get('/api/employees?pageSize=1000').expect(400);
      await request(app).get('/api/employees?sort=password').expect(400);
    });

    it('returns 404 for an unknown employee and 400 for a bad id', async () => {
      await request(app).get('/api/employees/123').expect(404);
      await request(app).get('/api/employees/abc').expect(400);
    });

    it('PATCH refuses salary edits so every change goes through salary-changes', async () => {
      await request(app).post('/api/employees').send(validEmployee).expect(201);
      const res = await request(app).patch('/api/employees/1').send({ salary: 1 }).expect(400);
      expect(res.body.error.message).toMatch(/record a salary change/);
    });

    it('PATCH updates profile fields', async () => {
      await request(app).post('/api/employees').send(validEmployee).expect(201);
      const res = await request(app).patch('/api/employees/1').send({ jobTitle: 'Staff Engineer' }).expect(200);
      expect(res.body.jobTitle).toBe('Staff Engineer');
    });

    it('records a salary change', async () => {
      await request(app).post('/api/employees').send(validEmployee).expect(201);
      const res = await request(app)
        .post('/api/employees/1/salary-changes')
        .send({ newSalary: 137_500, effectiveDate: '2024-01-01', reason: 'ANNUAL_REVIEW' })
        .expect(201);
      expect(res.body.salary).toBe(137_500);
      expect(res.body.salaryChanges[0].changePercent).toBe(10);
    });

    it('does not accept HIRE as a manual salary change reason', async () => {
      await request(app).post('/api/employees').send(validEmployee).expect(201);
      await request(app)
        .post('/api/employees/1/salary-changes')
        .send({ newSalary: 130_000, effectiveDate: '2024-01-01', reason: 'HIRE' })
        .expect(400);
    });

    it('deletes an employee (204)', async () => {
      await request(app).post('/api/employees').send(validEmployee).expect(201);
      await request(app).delete('/api/employees/1').expect(204);
      await request(app).get('/api/employees/1').expect(404);
    });
  });

  describe('insights', () => {
    it('passes validated filters to the summary', async () => {
      await request(app).get('/api/insights/summary?country=de&department=Sales').expect(200);
      expect(insightsRepo.calls[0]?.args[0]).toEqual({ country: 'DE', department: 'Sales' });
    });

    it('requires a valid breakdown dimension', async () => {
      await request(app).get('/api/insights/breakdown?by=jobTitle').expect(200);
      await request(app).get('/api/insights/breakdown?by=salary').expect(400);
    });

    it('returns a histogram', async () => {
      const res = await request(app).get('/api/insights/distribution').expect(200);
      expect(res.body.length).toBeGreaterThan(1);
    });

    it('benchmark requires country and job title', async () => {
      await request(app).get('/api/insights/benchmark?country=US').expect(400);
      await request(app).get('/api/insights/benchmark?country=US&jobTitle=Recruiter&salary=70000').expect(200);
    });
  });

  it('returns JSON 404 for unknown routes and 400 for malformed JSON', async () => {
    await request(app).get('/api/nope').expect(404);
    await request(app)
      .post('/api/employees')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);
  });
});
