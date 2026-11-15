import { Router } from 'express';
import { DEPARTMENTS, SALARY_CHANGE_REASONS } from '../domain/reference';
import type { CountryRepository } from '../repositories/types';
import type { EmployeeService } from '../services/employeeService';
import type { InsightsService } from '../services/insightsService';
import {
  benchmarkQuerySchema,
  breakdownQuerySchema,
  createEmployeeSchema,
  employeeListQuerySchema,
  idParamSchema,
  insightFilterSchema,
  parse,
  salaryChangeSchema,
  updateEmployeeSchema,
} from './schemas';

export interface RouteDeps {
  employees: EmployeeService;
  insights: InsightsService;
  countries: CountryRepository;
}

/** HTTP only: validate input, delegate to a service, shape the response. Express 5 forwards async errors. */
export function apiRouter({ employees, insights, countries }: RouteDeps): Router {
  const r = Router();

  r.get('/meta', async (_req, res) => {
    res.json({
      countries: await countries.list(),
      departments: DEPARTMENTS.map((d) => ({ name: d.name, jobTitles: d.jobTitles.map((j) => j.title) })),
      salaryChangeReasons: SALARY_CHANGE_REASONS.filter((r) => r !== 'HIRE'),
    });
  });

  r.get('/employees', async (req, res) => {
    res.json(await employees.list(parse(employeeListQuerySchema, req.query)));
  });

  r.post('/employees', async (req, res) => {
    res.status(201).json(await employees.create(parse(createEmployeeSchema, req.body)));
  });

  r.get('/employees/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await employees.get(id));
  });

  r.patch('/employees/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await employees.update(id, parse(updateEmployeeSchema, req.body)));
  });

  r.delete('/employees/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    await employees.delete(id);
    res.status(204).end();
  });

  r.post('/employees/:id/salary-changes', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.status(201).json(await employees.changeSalary(id, parse(salaryChangeSchema, req.body)));
  });

  r.get('/insights/summary', async (req, res) => {
    res.json(await insights.summary(parse(insightFilterSchema, req.query)));
  });

  r.get('/insights/breakdown', async (req, res) => {
    const { by, ...filter } = parse(breakdownQuerySchema, req.query);
    res.json(await insights.breakdown(by, filter));
  });

  r.get('/insights/distribution', async (req, res) => {
    res.json(await insights.distribution(parse(insightFilterSchema, req.query)));
  });

  r.get('/insights/benchmark', async (req, res) => {
    const { country, jobTitle, salary } = parse(benchmarkQuerySchema, req.query);
    res.json(await insights.benchmark(country, jobTitle, salary));
  });

  return r;
}
