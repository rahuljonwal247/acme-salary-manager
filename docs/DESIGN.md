# Design notes

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js App Router<br/>Tailwind UI]
  end
  subgraph "Next.js server"
    RSC[Server Components<br/>fetch data per request]
  end
  subgraph "API (Express + TypeScript)"
    R[Routes<br/>zod validation] --> S[Services<br/>business rules]
    S --> REPO[Repositories<br/>Prisma + raw SQL aggregates]
  end
  DB[(PostgreSQL)]
  UI -- "mutations (fetch)" --> R
  RSC -- "reads (fetch)" --> R
  REPO --> DB
```

* **Two deployables** — `backend/` (REST API) and `frontend/` (Next.js). The API is the single owner of
  business rules; the UI never talks to the DB. This keeps the API reusable (e.g. a future Excel importer
  or BI tool) and lets each side be tested and scaled independently.
* **Backend layering**
  * `routes/` — HTTP only: parse + validate input with zod, call a service, map errors to status codes.
  * `services/` — business logic (salary change rules, USD conversion, shaping insight results). Depends
    on repository **interfaces**, so unit tests inject in-memory fakes: fast, deterministic, no DB.
  * `repositories/` — Prisma for CRUD; `$queryRaw` for aggregates where Postgres does the heavy lifting.
* **Frontend** — list/detail/insight pages are Server Components that read filters from the URL
  (`?country=DE&page=2`) — shareable links and working back button for free. Forms are small Client
  Components that call the API and `router.refresh()`.

## Data model

```mermaid
erDiagram
  Employee ||--o{ SalaryChange : has
  Country  ||--o{ Employee : "works in"
  Country {
    string code PK "ISO-3166 alpha-2"
    string name
    string currency "ISO-4217"
    decimal usdRate "1 unit local = usdRate USD"
  }
  Employee {
    int id PK
    string employeeCode UK
    string firstName
    string lastName
    string email UK
    string jobTitle
    string department
    string countryCode FK
    date hireDate
    int salary "current annual base, local currency"
  }
  SalaryChange {
    int id PK
    int employeeId FK
    int previousSalary "null for first entry"
    int newSalary
    date effectiveDate
    string reason "HIRE | PROMOTION | ANNUAL_REVIEW | MARKET_ADJUSTMENT | CORRECTION"
    datetime createdAt
  }
```

Key decisions
* **Current salary is denormalised onto `Employee`.** Every insight query aggregates *current* pay; reading
  it from the latest history row would need a window function per query. The service updates
  `Employee.salary` and inserts a `SalaryChange` **in one transaction**, so they cannot drift.
* **Currency belongs to the country**, not the employee row — prevents "German employee paid in INR" bugs
  and makes conversion a simple join.
* **Integers for money.** Annual base salaries are whole currency units; no floating point is persisted.
  USD figures are computed at query time and rounded for display only.
* **Indexes:** `(countryCode)`, `(department)`, `(jobTitle)`, `(countryCode, jobTitle)`, `(lastName, firstName)`
  and `(salaryChange.employeeId, effectiveDate)` — matching the filters and benchmarks the UI exposes.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/employees?search=&country=&department=&jobTitle=&sort=&order=&page=&pageSize=` | paginated, max pageSize 100 |
| GET | `/api/employees/:id` | includes salary history + country |
| POST | `/api/employees` | creates employee **and** an initial `HIRE` salary change |
| PATCH | `/api/employees/:id` | profile fields only — salary is changed via the endpoint below |
| DELETE | `/api/employees/:id` | cascades history |
| POST | `/api/employees/:id/salary-changes` | `{ newSalary, effectiveDate, reason }` |
| GET | `/api/meta` | countries, departments, job titles (for filter dropdowns) |
| GET | `/api/insights/summary?country=&department=` | headcount, payroll USD, avg/median USD |
| GET | `/api/insights/breakdown?by=country\|department\|jobTitle&country=&department=` | per-group stats |
| GET | `/api/insights/distribution?country=&department=` | USD histogram buckets |
| GET | `/api/insights/benchmark?country=&jobTitle=` | min/p25/median/p75/max in local currency |

Salary is intentionally **not** editable through `PATCH`: forcing changes through a dedicated endpoint
guarantees every change has a date and a reason.

## Trade-offs

| Decision | Alternative | Why this way |
|---|---|---|
| Separate Express API + Next.js | Next.js API routes only | Role asks for Express; a clean API boundary is easier to test and reuse. Cost: two deployables + CORS. |
| SQL aggregation (`percentile_cont`) | Load rows into Node and compute | 10k rows is small today, but aggregation in the DB scales and avoids shipping data over the wire. Cost: aggregate SQL is covered by integration tests rather than unit tests. |
| Offset pagination | Keyset/cursor pagination | Users jump to "page 37" and sort by many columns; offset on 10k rows is cheap. Keyset would matter at 1M+. |
| Static FX table | Live FX API | Reproducible reports, no external dependency. Rates editable in DB. |
| Strings for department / job title | Lookup tables | Fewer joins and simpler forms; values validated against an allow-list in the API. Would normalise when HR needs to rename titles in bulk. |
| No auth | Basic auth / SSO | Out of scope (see requirements); top of the production-hardening list. |

## Frontend choices
* **Tailwind CSS + a handful of in-repo primitives** (`card`, `btn-*`, `input`, `Field`) instead of a heavy
  component library: the UI needs tables, forms, selects and charts — not worth 300 kB of widgets. Primitives
  live in `globals.css` as Tailwind `@utility` classes so styling stays consistent.
* **Recharts** for the two charts. Both are single-series (one hue, no legend), bars ≤ 24 px with rounded data
  ends, per-bar hover tooltips, and every chart has a table view with the exact numbers.
* **No client data-fetching library.** Reads happen in Server Components; mutations call the API and
  `router.refresh()` re-renders the server tree. Fewer moving parts, no cache invalidation bugs.

## Testing strategy
| Layer | Tool | What it proves | Speed |
|---|---|---|---|
| Domain + services | Vitest, in-memory fake repos | business rules (salary change rules, compa-ratio, histogram shaping, validation of dept/title, email uniqueness) | ~50 ms |
| HTTP | Supertest on the real Express app wired with fakes | validation, status codes, error format, PATCH can't change salary | ~250 ms |
| Seed generator | Vitest | determinism, uniqueness, history consistency for 2,000 generated employees | ~300 ms |
| Repositories (SQL) | Vitest against Postgres in an isolated `integration_test` schema | percentile/aggregate SQL, cross-currency USD maths, optimistic concurrency, unique violations | ~1 s |
| Frontend | Vitest + Testing Library (jsdom, TZ pinned) | formatting, URL helpers, forms (dept-scoped titles, client validation, API error display), band placement | ~2 s |

Unit suites need no database and no network, so they are deterministic and run on every save.
Backend unit coverage: **98.7 % lines** (Prisma adapters are covered by the integration suite instead).

## Performance considerations
* All list and insight queries are bounded: pagination (max 100 rows) or `GROUP BY` results (≤ ~50 groups).
* Filter columns are indexed; search uses `ILIKE` on a handful of columns — fine at 10k rows
  (sequential scan on 10k rows is ~ms). At 1M rows we'd add a `pg_trgm` GIN index.
* Seed inserts with `createMany` in batches of 1,000 rows: 10k employees + ~25k history rows in seconds.
* Server Components fetch on the server, so the browser receives HTML, not JSON + a waterfall of requests.
* Salary changes use **optimistic concurrency** (`UPDATE … WHERE salary = <value we validated>`), so two HR
  users editing the same person can't silently overwrite each other.

**Measured** (10,000 employees, ~23,600 history rows, local Docker Postgres, avg of 5 requests):

| Endpoint | Avg |
|---|---|
| `GET /employees?pageSize=100&sort=salary` | 17 ms |
| `GET /employees?search=sharma&country=IN` | 19 ms |
| `GET /employees?page=399` (deep offset) | 22 ms |
| `GET /insights/summary` | 13 ms |
| `GET /insights/breakdown?by=jobTitle` | 30 ms |
| `GET /insights/distribution` | 12 ms |
| `GET /insights/benchmark` | 8 ms |
| Seeding 10k employees + history | ~4 s |
