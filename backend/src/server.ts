import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { AnalyticsExecutor } from './assistant/analytics';
import { AssistantService, createAnthropicClient } from './assistant/assistantService';
import { loadConfig } from './config';
import { PrismaCountryRepository } from './repositories/prisma/countryRepository';
import { PrismaEmployeeRepository } from './repositories/prisma/employeeRepository';
import { PrismaInsightsRepository } from './repositories/prisma/insightsRepository';
import {
  PrismaAuditRepository,
  PrismaSalaryHistoryRepository,
  PrismaUserRepository,
} from './repositories/prisma/userRepository';
import { AuthService, UserService } from './services/authService';
import { EmployeeService } from './services/employeeService';
import { InsightsService } from './services/insightsService';
import { ReportService } from './services/reportService';

// Composition root: the only place that knows about concrete implementations.
const config = loadConfig();
const prisma = new PrismaClient();

const countries = new PrismaCountryRepository(prisma);
const employeeRepo = new PrismaEmployeeRepository(prisma);
const insightsRepo = new PrismaInsightsRepository(prisma);
const userRepo = new PrismaUserRepository(prisma);
const insights = new InsightsService(insightsRepo, countries);

const app = createApp(
  {
    auth: new AuthService(userRepo, config.jwtSecret, config.jwtTtl),
    users: new UserService(userRepo),
    employees: new EmployeeService(employeeRepo, countries),
    insights,
    reports: new ReportService(employeeRepo, new PrismaSalaryHistoryRepository(prisma), insightsRepo),
    assistant: new AssistantService(
      new AnalyticsExecutor(insights, () => countries.list()),
      () => countries.list(),
      createAnthropicClient(config.anthropicApiKey),
      config.assistantModel,
    ),
    audit: new PrismaAuditRepository(prisma),
    countries,
  },
  { corsOrigins: config.corsOrigins, logRequests: process.env.NODE_ENV !== 'test' },
);

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  console.log(`AI assistant engine: ${config.anthropicApiKey ? `Claude (${config.assistantModel})` : 'rules (no ANTHROPIC_API_KEY)'}`);
});

const shutdown = () => {
  server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
