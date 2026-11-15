import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { PrismaCountryRepository } from './repositories/prisma/countryRepository';
import { PrismaEmployeeRepository } from './repositories/prisma/employeeRepository';
import { PrismaInsightsRepository } from './repositories/prisma/insightsRepository';
import { EmployeeService } from './services/employeeService';
import { InsightsService } from './services/insightsService';

// Composition root: the only place that knows about concrete implementations.
const prisma = new PrismaClient();
const countries = new PrismaCountryRepository(prisma);

const app = createApp(
  {
    employees: new EmployeeService(new PrismaEmployeeRepository(prisma), countries),
    insights: new InsightsService(new PrismaInsightsRepository(prisma), countries),
    countries,
  },
  {
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
    logRequests: process.env.NODE_ENV !== 'test',
  },
);

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => console.log(`API listening on http://localhost:${port}`));

const shutdown = () => {
  server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
