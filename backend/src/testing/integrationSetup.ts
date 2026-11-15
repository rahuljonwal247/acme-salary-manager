import { execSync } from 'node:child_process';

/** Applies migrations to the integration-test schema once before the suite. */
export default function setup() {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env } });
}
