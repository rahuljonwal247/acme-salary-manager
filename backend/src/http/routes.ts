import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { AssistantService } from '../assistant/assistantService';
import { DEPARTMENTS, SALARY_CHANGE_REASONS } from '../domain/reference';
import type { AuditRepository, CountryRepository } from '../repositories/types';
import type { AuthService, UserService } from '../services/authService';
import type { EmployeeService } from '../services/employeeService';
import type { InsightsService } from '../services/insightsService';
import type { ReportService } from '../services/reportService';
import { actorOf, requireAuth, requireRole } from './auth';
import {
  askSchema,
  auditQuerySchema,
  benchmarkQuerySchema,
  breakdownQuerySchema,
  createEmployeeSchema,
  createUserSchema,
  employeeListQuerySchema,
  idParamSchema,
  insightFilterSchema,
  loginSchema,
  parse,
  reportQuerySchema,
  reportTypeSchema,
  salaryChangeSchema,
  topEarnersQuerySchema,
  updateEmployeeSchema,
  updateUserSchema,
} from './schemas';

export interface RouteDeps {
  auth: AuthService;
  users: UserService;
  employees: EmployeeService;
  insights: InsightsService;
  reports: ReportService;
  assistant: AssistantService;
  audit: AuditRepository;
  countries: CountryRepository;
}

export interface RouteOptions {
  /** max login attempts per IP per 15 minutes (0 disables, e.g. in tests) */
  loginRateLimit?: number;
}

/**
 * HTTP only: authenticate, authorise, validate input, delegate to a service, shape the response.
 * Express 5 forwards async errors to the error handler.
 *
 * Access matrix — HR_MANAGER: employees, salaries, insights, reports, assistant.
 *                 ADMIN: all of the above + users and the audit log.
 */
export function apiRouter(deps: RouteDeps, options: RouteOptions = {}): Router {
  const { auth, users, employees, insights, reports, assistant, audit, countries } = deps;
  const r = Router();
  const limit = options.loginRateLimit ?? 10;

  // ---- public
  r.post(
    '/auth/login',
    ...(limit > 0
      ? [
          rateLimit({
            windowMs: 15 * 60_000,
            limit,
            standardHeaders: 'draft-7',
            legacyHeaders: false,
            // Keyed by IP *and* email: the web app proxies logins from one server IP, so IP alone would
            // throttle everyone together; the email part still stops brute force against one account.
            keyGenerator: (req) =>
              `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.email ?? '').trim().toLowerCase()}`,
            message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in 15 minutes.' } },
          }),
        ]
      : []),
    async (req, res) => {
      const { email, password } = parse(loginSchema, req.body);
      res.json(await auth.login(email, password));
    },
  );

  // ---- everything below requires a signed-in, active user
  r.use(requireAuth(auth));
  const staff = requireRole('HR_MANAGER', 'ADMIN');
  const admin = requireRole('ADMIN');

  r.get('/auth/me', async (req, res) => {
    res.json(await users.me(actorOf(req).id));
  });

  r.get('/meta', async (_req, res) => {
    res.json({
      countries: await countries.list(),
      departments: DEPARTMENTS.map((d) => ({ name: d.name, jobTitles: d.jobTitles.map((j) => j.title) })),
      salaryChangeReasons: SALARY_CHANGE_REASONS.filter((x) => x !== 'HIRE'),
      assistantEngine: assistant.engine,
    });
  });

  // ---- employees & salaries
  r.get('/employees', staff, async (req, res) => {
    res.json(await employees.list(parse(employeeListQuerySchema, req.query)));
  });

  r.post('/employees', staff, async (req, res) => {
    res.status(201).json(await employees.create(parse(createEmployeeSchema, req.body), actorOf(req)));
  });

  r.get('/employees/:id', staff, async (req, res) => {
    res.json(await employees.get(parse(idParamSchema, req.params).id));
  });

  r.patch('/employees/:id', staff, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await employees.update(id, parse(updateEmployeeSchema, req.body), actorOf(req)));
  });

  r.post('/employees/:id/deactivate', staff, async (req, res) => {
    res.json(await employees.setActive(parse(idParamSchema, req.params).id, false, actorOf(req)));
  });

  r.post('/employees/:id/reactivate', staff, async (req, res) => {
    res.json(await employees.setActive(parse(idParamSchema, req.params).id, true, actorOf(req)));
  });

  r.post('/employees/:id/salary-changes', staff, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.status(201).json(await employees.changeSalary(id, parse(salaryChangeSchema, req.body), actorOf(req)));
  });

  r.get('/employees/:id/audit', staff, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await audit.list({ entityType: 'EMPLOYEE', entityId: id, page: 1, pageSize: 50 }));
  });

  // ---- insights
  r.get('/insights/summary', staff, async (req, res) => {
    res.json(await insights.summary(parse(insightFilterSchema, req.query)));
  });

  r.get('/insights/breakdown', staff, async (req, res) => {
    const { by, ...filter } = parse(breakdownQuerySchema, req.query);
    res.json(await insights.breakdown(by, filter));
  });

  r.get('/insights/distribution', staff, async (req, res) => {
    res.json(await insights.distribution(parse(insightFilterSchema, req.query)));
  });

  r.get('/insights/top-earners', staff, async (req, res) => {
    const { limit: n, ...filter } = parse(topEarnersQuerySchema, req.query);
    res.json(await insights.topEarners(filter, n));
  });

  r.get('/insights/benchmark', staff, async (req, res) => {
    const { country, jobTitle, salary } = parse(benchmarkQuerySchema, req.query);
    res.json(await insights.benchmark(country, jobTitle, salary));
  });

  // ---- AI assistant
  r.post('/assistant/ask', staff, async (req, res) => {
    res.json(await assistant.ask(parse(askSchema, req.body).question));
  });

  // ---- reports & exports
  r.get('/reports/:type', staff, async (req, res) => {
    const { type } = parse(reportTypeSchema, req.params);
    const { format, ...filter } = parse(reportQuerySchema, req.query);
    const file = await reports.export(type, format, filter);
    res
      .status(200)
      .set({
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      })
      .send(file.body);
  });

  // ---- administration
  r.get('/users', admin, async (_req, res) => {
    res.json(await users.list());
  });

  r.post('/users', admin, async (req, res) => {
    res.status(201).json(await users.create(parse(createUserSchema, req.body), actorOf(req)));
  });

  r.patch('/users/:id', admin, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await users.update(id, parse(updateUserSchema, req.body), actorOf(req)));
  });

  r.get('/audit-logs', admin, async (req, res) => {
    res.json(await audit.list(parse(auditQuerySchema, req.query)));
  });

  return r;
}
