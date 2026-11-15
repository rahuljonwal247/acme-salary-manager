import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { AnalyticsExecutor } from '../assistant/analytics';
import { AssistantService } from '../assistant/assistantService';
import { AuthService, UserService } from '../services/authService';
import { EmployeeService } from '../services/employeeService';
import { InsightsService } from '../services/insightsService';
import { ReportService } from '../services/reportService';
import {
  InMemoryAuditRepository,
  InMemoryCountryRepository,
  InMemoryEmployeeRepository,
  InMemoryUserRepository,
  StubInsightsRepository,
  StubSalaryHistoryRepository,
} from '../testing/fakes';

const SECRET = 'test-secret-that-is-long-enough-123456';

const validEmployee = {
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@acme.example',
  jobTitle: 'Software Engineer',
  department: 'Engineering',
  countryCode: 'us',
  hireDate: '2021-03-15',
  salary: 125_000,
  allowances: 5_000,
  bonus: 10_000,
  deductions: 9_000,
};

function buildApp(loginRateLimit = 0) {
  const audit = new InMemoryAuditRepository();
  const countries = new InMemoryCountryRepository();
  const users = new InMemoryUserRepository(audit);
  users.seed({ email: 'admin@acme.example', name: 'Avery Admin', role: 'ADMIN', password: 'AdminPass123' });
  users.seed({ email: 'hr@acme.example', name: 'Harper HR', role: 'HR_MANAGER', password: 'HrPass12345' });
  const employeesRepo = new InMemoryEmployeeRepository(audit);
  const insightsRepo = new StubInsightsRepository();
  const insights = new InsightsService(insightsRepo, countries);
  const app = createApp(
    {
      auth: new AuthService(users, SECRET),
      users: new UserService(users),
      employees: new EmployeeService(employeesRepo, countries),
      insights,
      reports: new ReportService(employeesRepo, new StubSalaryHistoryRepository(), insightsRepo),
      assistant: new AssistantService(new AnalyticsExecutor(insights, () => countries.list()), () => countries.list(), null, 'm'),
      audit,
      countries,
    },
    { loginRateLimit },
  );
  return { app, insightsRepo, audit };
}

async function tokenFor(app: ReturnType<typeof buildApp>['app'], email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return res.body.token as string;
}

describe('HTTP API', () => {
  let app: ReturnType<typeof buildApp>['app'];
  let insightsRepo: StubInsightsRepository;
  let audit: InMemoryAuditRepository;
  let hr: string;
  let admin: string;

  beforeEach(async () => {
    ({ app, insightsRepo, audit } = buildApp());
    hr = await tokenFor(app, 'hr@acme.example', 'HrPass12345');
    admin = await tokenFor(app, 'admin@acme.example', 'AdminPass123');
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('GET /health is public', async () => {
    await request(app).get('/health').expect(200, { status: 'ok' });
  });

  describe('authentication & authorisation', () => {
    it('login returns a token and the user, never the hash', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'hr@acme.example', password: 'HrPass12345' })
        .expect(200);
      expect(res.body.user).toMatchObject({ email: 'hr@acme.example', role: 'HR_MANAGER' });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('wrong credentials → 401 with a generic message', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'hr@acme.example', password: 'x' }).expect(401);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('every data route requires a token', async () => {
      for (const path of ['/api/meta', '/api/employees', '/api/insights/summary', '/api/reports/employees', '/api/users']) {
        await request(app).get(path).expect(401);
      }
      await request(app).get('/api/employees').set({ Authorization: 'Bearer garbage' }).expect(401);
    });

    it('HR managers cannot manage users or read the audit log (403); admins can', async () => {
      await request(app).get('/api/users').set(as(hr)).expect(403);
      await request(app).get('/api/audit-logs').set(as(hr)).expect(403);
      await request(app).get('/api/users').set(as(admin)).expect(200);
      await request(app).get('/api/audit-logs').set(as(admin)).expect(200);
    });

    it('GET /api/auth/me returns the signed-in user', async () => {
      const res = await request(app).get('/api/auth/me').set(as(admin)).expect(200);
      expect(res.body).toMatchObject({ email: 'admin@acme.example', role: 'ADMIN' });
    });

    it('rate-limits repeated failed logins for an account', async () => {
      const { app: limited } = buildApp(3);
      for (let i = 0; i < 3; i++) {
        await request(limited).post('/api/auth/login').send({ email: 'hr@acme.example', password: 'bad' }).expect(401);
      }
      await request(limited).post('/api/auth/login').send({ email: 'hr@acme.example', password: 'bad' }).expect(429);
      // a different account from the same IP is not blocked
      await request(limited).post('/api/auth/login').send({ email: 'admin@acme.example', password: 'AdminPass123' }).expect(200);
    });
  });

  it('GET /api/meta returns countries, departments, reasons and assistant engine', async () => {
    const res = await request(app).get('/api/meta').set(as(hr)).expect(200);
    expect(res.body.countries).toHaveLength(3);
    expect(res.body.salaryChangeReasons).not.toContain('HIRE');
    expect(res.body.assistantEngine).toBe('rules');
  });

  describe('employees', () => {
    it('creates an employee (201) with gross/net, attributed to the caller', async () => {
      const res = await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(201);
      expect(res.body).toMatchObject({ id: 1, countryCode: 'US', gross: 140_000, net: 131_000 });
      expect(res.body.salaryChanges[0].changedBy.id).toBe(2);
    });

    it('components default to 0 when omitted', async () => {
      const { allowances: _a, bonus: _b, deductions: _d, ...minimal } = validEmployee;
      const res = await request(app).post('/api/employees').set(as(hr)).send(minimal).expect(201);
      expect(res.body).toMatchObject({ allowances: 0, bonus: 0, deductions: 0, gross: 125_000 });
    });

    it('returns 400 with field errors for invalid input', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set(as(hr))
        .send({ ...validEmployee, email: 'nope', salary: -5, bonus: 1.5 })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(['email', 'salary', 'bonus']));
    });

    it('rejects an impossible calendar date', async () => {
      const res = await request(app).post('/api/employees').set(as(hr)).send({ ...validEmployee, hireDate: '2023-02-30' }).expect(400);
      expect(res.body.error.message).toBe('Invalid calendar date');
    });

    it('returns 409 for a duplicate email', async () => {
      await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(201);
      await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(409);
    });

    it('lists with defaults and validates query params', async () => {
      await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(201);
      const res = await request(app).get('/api/employees?country=&search=grace').set(as(hr)).expect(200);
      expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 25 });
      await request(app).get('/api/employees?pageSize=1000').set(as(hr)).expect(400);
      await request(app).get('/api/employees?sort=password').set(as(hr)).expect(400);
      await request(app).get('/api/employees?status=DELETED').set(as(hr)).expect(400);
    });

    it('404 for an unknown employee and 400 for a bad id', async () => {
      await request(app).get('/api/employees/123').set(as(hr)).expect(404);
      await request(app).get('/api/employees/abc').set(as(hr)).expect(400);
    });

    it('PATCH refuses pay edits so every change goes through salary-changes', async () => {
      await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(201);
      const res = await request(app).patch('/api/employees/1').set(as(hr)).send({ bonus: 1 }).expect(400);
      expect(res.body.error.message).toMatch(/record a salary change/);
    });

    it('records a salary change with the full package', async () => {
      await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(201);
      const res = await request(app)
        .post('/api/employees/1/salary-changes')
        .set(as(hr))
        .send({ newSalary: 137_500, allowances: 5_000, bonus: 11_500, deductions: 9_000, effectiveDate: '2024-01-01', reason: 'ANNUAL_REVIEW' })
        .expect(201);
      expect(res.body).toMatchObject({ salary: 137_500, gross: 154_000 });
      expect(res.body.salaryChanges[0].changePercent).toBe(10);
    });

    it('does not accept HIRE as a manual salary change reason', async () => {
      await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(201);
      await request(app)
        .post('/api/employees/1/salary-changes')
        .set(as(hr))
        .send({ newSalary: 130_000, effectiveDate: '2024-01-01', reason: 'HIRE' })
        .expect(400);
    });

    it('deactivates and reactivates instead of deleting', async () => {
      await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(201);
      expect((await request(app).post('/api/employees/1/deactivate').set(as(hr)).expect(200)).body.status).toBe('INACTIVE');
      await request(app).get('/api/employees/1').set(as(hr)).expect(200); // still retrievable
      expect((await request(app).get('/api/employees').set(as(hr))).body.total).toBe(0);
      expect((await request(app).post('/api/employees/1/reactivate').set(as(hr)).expect(200)).body.status).toBe('ACTIVE');
      await request(app).delete('/api/employees/1').set(as(hr)).expect(404); // no hard delete route
    });

    it('exposes the employee audit trail', async () => {
      await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(201);
      await request(app).patch('/api/employees/1').set(as(hr)).send({ jobTitle: 'Staff Engineer' }).expect(200);
      const res = await request(app).get('/api/employees/1/audit').set(as(hr)).expect(200);
      expect(res.body.items.map((e: { action: string }) => e.action)).toEqual(['EMPLOYEE_UPDATED', 'EMPLOYEE_CREATED']);
    });
  });

  describe('insights', () => {
    it('passes validated filters to the summary', async () => {
      await request(app).get('/api/insights/summary?country=de&department=Sales').set(as(hr)).expect(200);
      expect(insightsRepo.calls[0]?.args[0]).toEqual({ country: 'DE', department: 'Sales' });
    });

    it('requires a valid breakdown dimension', async () => {
      await request(app).get('/api/insights/breakdown?by=jobTitle').set(as(hr)).expect(200);
      await request(app).get('/api/insights/breakdown?by=salary').set(as(hr)).expect(400);
    });

    it('top earners validates the limit', async () => {
      await request(app).get('/api/insights/top-earners?limit=5&country=IN').set(as(hr)).expect(200);
      expect(insightsRepo.calls.at(-1)?.args).toEqual([{ country: 'IN' }, 5]);
      await request(app).get('/api/insights/top-earners?limit=500').set(as(hr)).expect(400);
    });

    it('benchmark requires country and job title', async () => {
      await request(app).get('/api/insights/benchmark?country=US').set(as(hr)).expect(400);
      await request(app).get('/api/insights/benchmark?country=US&jobTitle=Recruiter&salary=70000').set(as(hr)).expect(200);
    });
  });

  describe('assistant', () => {
    it('answers a question with verified results', async () => {
      const res = await request(app).post('/api/assistant/ask').set(as(hr)).send({ question: 'Show payroll by country' }).expect(200);
      expect(res.body).toMatchObject({ engine: 'rules' });
      expect(res.body.results[0].query).toMatchObject({ kind: 'breakdown', by: 'country', metric: 'payroll' });
    });

    it('validates the question', async () => {
      await request(app).post('/api/assistant/ask').set(as(hr)).send({ question: '' }).expect(400);
      await request(app).post('/api/assistant/ask').set(as(hr)).send({ question: 'x'.repeat(501) }).expect(400);
    });
  });

  describe('reports', () => {
    it('downloads CSV and Excel files', async () => {
      await request(app).post('/api/employees').set(as(hr)).send(validEmployee).expect(201);
      const csv = await request(app).get('/api/reports/employees?format=csv').set(as(hr)).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toMatch(/attachment; filename="acme-employees-\d{4}-\d{2}-\d{2}\.csv"/);
      expect(csv.text).toContain('Grace,Hopper');

      const xlsx = await request(app).get('/api/reports/departments?format=xlsx').set(as(hr)).buffer(true).expect(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    });

    it('rejects unknown report types and formats', async () => {
      await request(app).get('/api/reports/passwords').set(as(hr)).expect(400);
      await request(app).get('/api/reports/employees?format=pdf').set(as(hr)).expect(400);
    });
  });

  describe('user administration', () => {
    it('admin creates and disables a user; the disabled user is locked out at once', async () => {
      const created = await request(app)
        .post('/api/users')
        .set(as(admin))
        .send({ email: 'new@acme.example', name: 'New HR', role: 'HR_MANAGER', password: 'Welcome12345' })
        .expect(201);
      const token = await tokenFor(app, 'new@acme.example', 'Welcome12345');
      await request(app).get('/api/employees').set(as(token)).expect(200);

      await request(app).patch(`/api/users/${created.body.id}`).set(as(admin)).send({ isActive: false }).expect(200);
      await request(app).get('/api/employees').set(as(token)).expect(401);
      expect(audit.entries.map((e) => e.action)).toEqual(expect.arrayContaining(['USER_CREATED', 'USER_UPDATED']));
    });

    it('rejects weak passwords and self-lockout', async () => {
      await request(app)
        .post('/api/users')
        .set(as(admin))
        .send({ email: 'w@acme.example', name: 'W', role: 'HR_MANAGER', password: 'weak' })
        .expect(400);
      await request(app).patch('/api/users/1').set(as(admin)).send({ role: 'HR_MANAGER' }).expect(400);
    });
  });

  it('returns JSON 404 for unknown routes and 400 for malformed JSON', async () => {
    await request(app).get('/api/nope').set(as(hr)).expect(404);
    await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json').expect(400);
  });
});

describe('config', () => {
  beforeAll(() => undefined);
  it('refuses to start in production without a strong JWT secret', async () => {
    const { loadConfig } = await import('../config');
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }).isProduction).toBe(true);
    expect(loadConfig({}).assistantModel).toBe('claude-opus-5-5');
  });
});
