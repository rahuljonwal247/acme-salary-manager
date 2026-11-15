# ACME Salary Manager — Requirements (one page)

## Goal
Replace the spreadsheets ACME's HR team uses to manage salaries for ~10,000 employees across multiple
countries with a web application where an **HR Manager** can (1) keep salary data correct and current,
and (2) answer "how do we pay people?" questions in seconds instead of hours of pivot tables.

**Success looks like:** the HR manager can find any employee in < 2 clicks, change a salary with an
audit trail, and answer questions such as *"What is the median salary of a Senior Engineer in Germany?"*,
*"Which department has the widest pay range?"* or *"How does our pay compare across countries in USD?"*
without exporting anything.

## Persona
**HR Manager** — power user of Excel, not a developer. Works with many countries and currencies.
Needs speed, correctness and confidence that a change is recorded. Single trusted user role for v1.

## In scope (v1)
| # | Feature | Why it matters |
|---|---------|----------------|
| 1 | **Employee directory** — server-side paginated table with search (name / email / employee code), filters (country, department, job title) and sorting (name, salary, hire date). | 10k rows cannot be loaded or scanned by eye; this replaces Ctrl+F in Excel. |
| 2 | **Employee CRUD** — create, view, edit, delete (with confirmation). Validation on every field. | Core data maintenance. Server-side validation prevents the bad data spreadsheets accumulate. |
| 3 | **Salary changes with history** — salary updates are recorded as dated entries with a reason (e.g. promotion, annual review, correction). The employee page shows the timeline. | Spreadsheets overwrite values; HR needs to know *when* and *why* pay changed. |
| 4 | **Multi-currency** — salaries stored in local currency (derived from country); all cross-country aggregates also shown in **USD** using a stored FX-rate table. | Comparing INR to USD raw numbers is meaningless; local currency is the source of truth for payroll. |
| 5 | **Insights dashboard** — org summary (headcount, total annual payroll in USD, median/average), breakdowns by country, department and job title (headcount, min, max, average, median), and a salary-distribution histogram. Filterable by country/department. | This is the "answer questions about how the org pays people" requirement. Median is shown alongside average because pay data is skewed. |
| 6 | **Job-title benchmark** — for a chosen country + job title: min / p25 / median / p75 / max. Shown on the employee page so HR can see where a person sits in their band. | The most common real question when approving a raise or an offer. |
| 7 | **Seed script** — deterministic generator for 10,000 realistic employees across 8 countries. | Required; deterministic so demos and tests are reproducible. |

## Deliberately out of scope (and why)
| Left out | Reasoning |
|----------|-----------|
| **Authentication / RBAC** | Single-persona brief; real SSO (Okta/Azure AD) would be integrated rather than built. Called out as the #1 item before real production use because salary data is sensitive. |
| **Payroll processing** (tax, deductions, payslips, bonuses, equity) | Different domain with country-specific legal rules; the brief is *salary management & insight*, not running payroll. Base annual salary only. |
| **Excel import/export** | Valuable for migration, but the seed script proves the data path; an importer needs a mapping/validation UX that deserves its own iteration. First item for v2. |
| **Live FX rates** | Rates stored in a table (easy to update). Live feeds add an external dependency and make reports non-reproducible; finance usually fixes a budget rate anyway. |
| **Approval workflows** for salary changes | Requires multiple roles (manager, finance). Out of scope with a single persona; the history table is the foundation for it. |
| **Org chart / reporting lines, performance reviews** | Not needed to answer pay questions in v1. |
| **Soft delete / full audit log of every field** | Salary changes (the sensitive part) are historised; other fields are plain updates. Kept simple deliberately. |

## Non-functional requirements
* **Performance:** list and insight endpoints respond in < 300 ms on 10k employees — achieved through
  server-side pagination, DB indexes on filter columns, and SQL-side aggregation (`percentile_cont`), never by
  loading all rows into Node.
* **Correctness:** money stored as integers (whole currency units for annual salary) — no floats in storage.
  Input validated at the API boundary (zod) with clear error messages surfaced in the UI.
* **Quality:** layered backend (routes → services → repositories) so business logic is unit-tested with fast,
  deterministic tests and no database.
* **Usability:** URL-driven filters (shareable, back-button friendly), currency-aware formatting everywhere.
