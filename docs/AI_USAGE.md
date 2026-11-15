# How AI was used

The solution was built with **Claude Code** (an agentic coding assistant running in the terminal/IDE) as
a pair programmer. I set direction and made the product and architecture calls; the agent drafted code,
ran the tests and tools, and reported results. Everything was checked by running it — tests, typecheck,
lint, production build, the Docker stack, and screenshots of the pages.

## Workflow

1. **Requirements first.** I gave the agent the assessment brief and had it write the one-page
   [requirements](REQUIREMENTS.md) and [design notes](DESIGN.md) *before* any code, and committed them first.
2. **Stack decision made by me**: Node + TypeScript, Express, Prisma, PostgreSQL, Next.js, Tailwind.
3. **Build in vertical, testable slices**, each its own commit: schema → seed generator (+tests) → domain
   rules & services (+tests) → repositories & routes (+HTTP and integration tests) → UI → UI tests → deploy.
4. **Verify every slice by running it**, never on the agent's word: `vitest`, `tsc --noEmit`, `next build`,
   curl against the real API, headless-browser screenshots of each page, and `docker compose up`.

## Representative prompts

> "Here is the brief (pasted). Before writing code, write a one-page requirements doc: goal, persona,
> scope & features, what we deliberately leave out and why, and non-functional requirements."

> "Design the backend so business logic can be unit-tested without a database: services depend on
> repository interfaces; Prisma implementations sit behind them; tests use in-memory fakes."

> "Salary must never be edited in place. Every change needs an effective date and a reason, and the
> employee's current salary must always equal the latest history entry. Enforce it in a transaction."

> "Write a deterministic seed generator for 10,000 employees across 8 countries with realistic,
> currency-correct salaries and a consistent salary history. Same seed, same data — test that."

> "Do the aggregations in Postgres (percentile_cont), not in Node. Cover the SQL with integration tests
> on a separate schema so they never touch seeded data."

## Where the AI got it wrong — and how it was caught

The useful part of AI-assisted work is the feedback loop. Things the tests or tooling caught:

| Issue | How it was caught | Fix |
|---|---|---|
| An impossible date (`2023-02-30`) returned **500** instead of 400: zod still runs `.refine()` after a failed `.transform()`, so the refine called a Date method on a string. | Supertest case for invalid calendar dates | Guarded `superRefine` that ignores non-Date values. |
| Integration test migrations ran against the **default schema**, not the test schema (vitest `globalSetup` doesn't receive `test.env`). | Prisma log line printed `schema "public"` | Set `DATABASE_URL` on the main process in the integration config. |
| `/employees/new` was **prerendered at build time** and failed when the API wasn't reachable — would have broken deploys. | `next build` | `export const dynamic = 'force-dynamic'`. |
| Tailwind v4 can't `@apply` classes declared in `@layer components`. | Page returned 500 in dev | Converted primitives to `@utility`. |
| Windows PowerShell wrote a UTF-8 BOM into `package.json`. | Byte check after edit | Stripped BOM; used non-BOM writes after that. |

## What I kept for human judgement
* Scope: what's in v1 and — more importantly — what's out (auth, payroll, import, relocations).
* Data-model choices: currency belongs to the country, money as integers, denormalised current salary.
* Business rules: e.g. a pay *decrease* cannot be recorded as a promotion or annual review.
* What "done" means: deterministic tests, measured performance, a container that runs end to end.
