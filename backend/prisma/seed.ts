/**
 * Seeds reference countries + 10,000 employees with salary history.
 * Idempotent: wipes employee data and re-inserts the same deterministic dataset.
 *
 *   npm run db:seed                 # 10,000 employees
 *   SEED_COUNT=500 npm run db:seed  # smaller dataset
 *   npm run db:seed -- --if-empty   # only seed a fresh database (used on deploy)
 */
import { PrismaClient } from '@prisma/client';
import { COUNTRIES } from '../src/domain/reference';
import { generateEmployees } from '../src/seed/generator';

const BATCH_SIZE = 1_000;

async function main() {
  const prisma = new PrismaClient();
  const count = Number(process.env.SEED_COUNT ?? 10_000);
  const started = Date.now();

  try {
    if (process.argv.includes('--if-empty') && (await prisma.employee.count()) > 0) {
      console.log('Database already has employees; skipping seed (--if-empty).');
      return;
    }

    for (const c of COUNTRIES) {
      await prisma.country.upsert({
        where: { code: c.code },
        update: { name: c.name, currency: c.currency, usdRate: c.usdRate },
        create: { code: c.code, name: c.name, currency: c.currency, usdRate: c.usdRate },
      });
    }

    // RESTART IDENTITY keeps ids aligned with EMP-xxxxx codes for a clean demo dataset.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE salary_changes, employees RESTART IDENTITY CASCADE');

    const employees = generateEmployees({ count });

    for (let offset = 0; offset < employees.length; offset += BATCH_SIZE) {
      const batch = employees.slice(offset, offset + BATCH_SIZE);
      const created = await prisma.employee.createManyAndReturn({
        data: batch.map(({ salaryChanges: _history, ...e }) => e),
        select: { id: true, employeeCode: true },
      });
      const idByCode = new Map(created.map((c) => [c.employeeCode, c.id]));

      await prisma.salaryChange.createMany({
        data: batch.flatMap((e) =>
          e.salaryChanges.map((sc) => ({ ...sc, employeeId: idByCode.get(e.employeeCode)! })),
        ),
      });
      process.stdout.write(`\r  inserted ${Math.min(offset + BATCH_SIZE, employees.length)}/${count}`);
    }

    const history = await prisma.salaryChange.count();
    console.log(`\nSeeded ${count} employees and ${history} salary changes in ${Date.now() - started} ms`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
