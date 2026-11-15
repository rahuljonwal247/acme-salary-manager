# ACME Salary Manager

A secure web platform for ACME's HR team to manage compensation for **10,000 employees across 8 countries**
and to answer "how do we pay people?" questions, including in plain English. It replaces a set of spreadsheets.

| | |
|---|---|
| **Backend** | Node 20 · TypeScript · Express 5 · Prisma 6 · PostgreSQL 16 · zod · JWT/bcrypt · exceljs · Anthropic SDK |
| **Frontend** | Next.js 15 (App Router, Server Components, server actions) · React 19 · Tailwind CSS 4 · Recharts |
| **Tests** | 155 backend unit/HTTP + 12 Postgres integration + 41 frontend unit + 29 Playwright end-to-end |

📄 **Start here:** [Requirements](docs/REQUIREMENTS.md) · [Design, security & trade-offs](docs/DESIGN.md) ·
[How AI was used](docs/AI_USAGE.md) · [Demo script](docs/DEMO_SCRIPT.md)

## Features

| | |
|---|---|
| **Sign-in & roles** | HR Managers handle employees, pay, the dashboard, reports and the assistant. Administrators can do all of that and also manage users and roles and view the audit log. The session lives in an httpOnly cookie, and disabling an account takes effect immediately. |
| **Employees** | Server-side search, filters (country, department, designation, status), sorting and pagination over 10k people. Create, edit, **deactivate and reactivate** them. |
| **Compensation** | Base salary, allowances, bonus and deductions in the local currency, with **gross and net** computed live. Every change is dated, has a reason and records who made it; the rules block back-dating and "promotions" that cut pay. |
| **Dashboard** | Headcount, total payroll (gross, USD), and average and median salary. A median ↔ payroll breakdown by country, department or title, a salary distribution, and the highest-paid employees. |
| **AI assistant** | Ask questions like *"Which department has the highest average salary?"* and get an answer plus the verified result table and chart. Claude only picks among vetted database queries, so every number comes from SQL. It works offline with a built-in query parser when no API key is set. |
| **Reports** | Employee, salary-history, department and country reports in **CSV or Excel**, filtered, with formula-injection protection. |
| **Audit** | Every change to employees, pay and users is written in the same transaction as the change. The audit log page is admin-only, and each employee page shows its own activity trail. |

## Run it locally

Prerequisites: Node 20+ and Docker.

**Everything in containers (simplest):**
```bash
docker compose --profile app up --build      # http://localhost:3000
```
On first start the API migrates the database and seeds the users and 10,000 employees (deterministically).

**Or run the processes for development:**
```bash
docker compose up -d db                      # Postgres on :5434

cd backend && cp .env.example .env && npm install
npx prisma migrate deploy && npm run db:seed && npm run dev      # API on :4000

cd ../frontend && npm install
echo API_URL=http://localhost:4000 > .env.local && npm run dev  # web on :3000
```

### Sign in (local seed accounts)

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@acme.example` | `Admin@12345` |
| HR Manager | `hr@acme.example` | `HrManager@123` |

These defaults exist **only for local development**. Any shared environment sets `SEED_ADMIN_PASSWORD`
and `SEED_HR_PASSWORD` (the Render blueprint generates both), and the seed never overwrites an existing account.

### Enable the Claude-powered assistant (optional)
Set `ANTHROPIC_API_KEY` for the API, for example `ANTHROPIC_API_KEY=sk-ant-... docker compose --profile app up`.
Without a key the assistant uses the offline query engine, and the UI shows which engine answered.

## Tests

```bash
cd backend
npm test                   # 155 unit + HTTP tests, ~4s, no database
npm run test:integration   # 12 tests against Postgres (isolated schema)

cd ../frontend
npm test                   # 41 component/unit tests
npm run test:e2e           # 29 browser tests against the running stack (Edge/Chrome)
```
CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs typecheck, lint, all suites, the production
build, and the E2E suite against the Docker stack.

## Deploy

[render.yaml](render.yaml) is a Render Blueprint that creates Postgres, the API and the web app, with a
generated `JWT_SECRET` and generated seed passwords (shown in the Render dashboard). The API's start command
migrates the database, seeds it if empty, and starts the server.

| Variable | Service | Purpose |
|---|---|---|
| `DATABASE_URL` | api | Postgres connection string |
| `JWT_SECRET` | api | ≥ 32 random chars; **required in production** |
| `ANTHROPIC_API_KEY` | api | optional; enables the Claude assistant (`ASSISTANT_MODEL`, default `claude-opus-5-5`) |
| `SEED_ADMIN_PASSWORD`, `SEED_HR_PASSWORD` | api | initial account passwords |
| `CORS_ORIGINS` | api | allowed browser origins (the web app proxies, so normally just the web URL) |
| `API_URL` | web | where the web server reaches the API (server-side only) |
| `COOKIE_SECURE=false` | web | only for plain-HTTP demos on a LAN |
| `SEED_RESET_PASSWORDS=true` | api | **one-time account recovery**: on the next start, sets the seed accounts' passwords to the `SEED_*_PASSWORD` values. Remove it afterwards. |

## Repository layout

```
backend/
  prisma/              schema, migrations, seed (users + 10k employees)
  src/domain/          reference data, pay maths & rules (pure)
  src/services/        employees, insights, auth/users, reports
  src/assistant/       vetted analytics catalogue, Claude tool loop, offline parser
  src/repositories/    ports + Prisma adapters (SQL aggregates, audit-in-transaction)
  src/http/            auth middleware, zod schemas, routes, error mapping
frontend/
  src/app/             dashboard, employees, assistant, reports, admin, login, /bff proxy
  src/components/      tables, filters, forms, charts, assistant, admin
  src/lib/             API clients (browser/server), formatting, session helpers
  e2e/                 Playwright suites per role
docs/                  requirements, design, AI usage, demo script
```
