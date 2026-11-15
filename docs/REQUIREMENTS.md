# ACME Salary Management System — Requirements (v2, one page)

## 1. Objective
Replace ACME's spreadsheet-based salary management (10,000 employees, 8 countries) with a secure web
platform where HR can manage compensation, track every salary revision, and answer "how do we pay
people?" questions — including by asking in plain English.

## 2. Users & access
| Role | Can do |
|---|---|
| **HR Manager** | Employees, salaries, history, dashboard, AI assistant, reports & exports |
| **Administrator** | Everything HR can, plus manage users/roles/access and view the audit log |

## 3. Scope & features
| Area | Feature | Notes / reasoning |
|---|---|---|
| Employees | View, search, filter (country, department, designation, status), sort, paginate, create, update, **deactivate / reactivate** | Deactivate instead of delete: pay history is a record HR must keep. Inactive staff are excluded from analytics. |
| Salary | Base salary, allowances, bonus, deductions, currency (from country); **gross & net** computed | Gross = base + allowances + bonus. Net = gross − deductions. All annual, integer currency units — no floats. Statutory tax is out of scope, so "net" means after HR-entered deductions. |
| Revisions | Every change is a dated entry with a reason and the user who made it | No in-place edits; rules prevent back-dating and "promotions" that cut pay. |
| Dashboard | Headcount, average & median salary, total payroll; payroll expenditure and pay statistics by country / department / designation; salary distribution; highest-paid employees | Cross-country figures are normalised to USD at stored budget FX rates; local currency is shown where meaningful. |
| AI assistant | Natural-language questions → answers computed by **validated, parameterised analytics queries**, shown as text + table/chart | The model only chooses *which* vetted query to run; numbers always come from the database, never from the model. Works without an LLM key through a deterministic question parser. |
| Reports | Employee, salary-history, department and country reports; **CSV and Excel** | Filters apply to exports. CSV cells are protected against formula injection. |
| Security | Login (JWT in an httpOnly cookie), role-based access enforced by the API, **audit log** of employee & salary modifications, input validation everywhere | The browser never sees the token; the API is the single place permissions are checked. |
| Platform | Server-side pagination/filtering, indexed queries, migrations, deterministic 10k seed, unit + integration + E2E tests, Docker + Render deployment | |

## 4. Deliberately out of scope (and why)
| Excluded | Reasoning |
|---|---|
| Payroll disbursement, bank integrations, payslips | A different, heavily regulated system; this product is about compensation *data* and insight. |
| Tax filing / statutory, country-specific calculations | Rules differ per country and change yearly; net pay here uses HR-entered deductions only. |
| Employee self-service portal | Different persona and security model (employees seeing only their own data). |
| Attendance, leave, performance | Not needed to manage or analyse pay. |
| Multi-level approval workflows | Requires more roles; the audit log + revision history are the foundation for it. |
| Relocations (changing an employee's country) | Country fixes the pay currency, so a move is a compensation event needing its own flow; v1 blocks it rather than mixing currencies. |
| SSO / MFA, password reset by email | Would integrate the company IdP in production; v1 ships local accounts managed by an Administrator. |
| Live FX rates | Stored budget rates keep reports reproducible. |

## 5. Non-functional requirements
* **Scale:** ≥ 10,000 employees; list/insight endpoints < 300 ms via pagination, indexes and SQL-side aggregation.
* **Accuracy:** integer money, computed gross/net, transactional salary updates with optimistic concurrency.
* **Security:** hashed passwords (bcrypt), signed short-lived tokens, RBAC on every route, validation (zod), helmet, rate-limited login, no secrets in the repo.
* **Quality:** unit tests for rules and services (no DB), integration tests for SQL, browser E2E for user journeys; reproducible migrations and seeds.

## 6. Success criteria
Seed and manage 10k employees · CRUD + deactivation · history preserved and attributed · accurate dashboard ·
assistant answers supported questions from verified data · exports open in Excel · all tests pass ·
deployed at a public URL · docs, AI-usage notes and incremental commits in the repo.
