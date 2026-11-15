# ACME Salary Manager

A web app for ACME's HR manager to manage salaries for **10,000 employees across 8 countries** and answer
"how do we pay people?" questions, replacing a set of spreadsheets.

| | |
|---|---|
| **Backend** | Node 20 · TypeScript · Express 5 · Prisma 6 · PostgreSQL 16 · zod |
| **Frontend** | Next.js 15 (App Router, Server Components) · React 19 · Tailwind CSS 4 · Recharts |
| **Tests** | Vitest · Supertest · Testing Library: 81 backend unit + 10 integration + 24 frontend |

📄 **Start here:** [Requirements](docs/REQUIREMENTS.md) · [Design & trade-offs](docs/DESIGN.md) · [How AI was used](docs/AI_USAGE.md)

## What the HR manager can do

* **Find anyone fast**: a directory with search (name, email, code), filters by country, department and job
  title, and sorting. Filters live in the URL, so a view can be shared.
* **Maintain records**: add, edit and delete employees, with validation on both client and server.
* **Change pay safely**: every salary change has an effective date and a reason, and the history is kept.
  Rules block mistakes such as back-dating or recording a pay cut as a "promotion".
* **See pay in context**: each employee page shows where they sit in the pay band for their role and country
  (min / P25 / median / P75 / max, compa-ratio).
* **Understand the org**: headcount, payroll, median and average pay, a breakdown by country, department or
  job title, and a salary histogram. Everything is normalised to USD, with local currency shown where it applies.

## Run it locally

Prerequisites: Node 20+, Docker.

```bash
# 1. Database
docker compose up -d db

# 2. API  (http://localhost:4000)
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed          # 10,000 employees in ~4s (deterministic)
npm run dev

# 3. Web  (http://localhost:3000), in a second terminal
cd frontend
echo NEXT_PUBLIC_API_URL=http://localhost:4000 > .env.local
npm install
npm run dev
```

**Or everything in containers:** `docker compose --profile app up --build`. This migrates the database, seeds it
if it's empty, and serves the web app on http://localhost:3000.

## Tests

```bash
cd backend
npm test                  # unit + HTTP tests (no DB), ~1s
npm run test:coverage     # 98.7% line coverage
npm run test:integration  # Prisma/SQL tests against Postgres (isolated schema)

cd ../frontend
npm test                  # component + util tests, ~2s
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs typecheck, lint, all test suites and the
production build.

## Deploy

[render.yaml](render.yaml) is a Render Blueprint that creates Postgres, the API and the web app. The API's
start command runs migrations, seeds 10k employees on an empty database, and then starts the server. Any
Docker host also works with the two Dockerfiles.

| Variable | Service | Purpose |
|---|---|---|
| `DATABASE_URL` | api | Postgres connection string |
| `CORS_ORIGINS` | api | comma-separated allowed web origins |
| `NEXT_PUBLIC_API_URL` | web (build time) | public API URL used by the browser |
| `API_URL` | web (optional) | internal API URL for server-side fetches |

## Repository layout

```
backend/
  prisma/            schema, migrations, seed script
  src/domain/        reference data, business rules (pure)
  src/services/      use cases: EmployeeService, InsightsService
  src/repositories/  ports (interfaces) + Prisma adapters (incl. SQL aggregates)
  src/http/          zod schemas, routes, error mapping
  src/seed/          deterministic 10k-employee generator
frontend/
  src/app/           pages: / (insights), /employees, /employees/[id], /employees/new
  src/components/    table, filters, forms, benchmark band, charts
  src/lib/           API client, formatting, URL helpers
docs/                requirements, design, AI usage
```
