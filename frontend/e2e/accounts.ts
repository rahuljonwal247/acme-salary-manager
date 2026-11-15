/** Seeded dev accounts used by the E2E suite (override with env in other environments). */
export const HR = {
  email: process.env.E2E_HR_EMAIL ?? 'hr@acme.example',
  password: process.env.E2E_HR_PASSWORD ?? 'HrManager@123',
  state: 'e2e/.auth/hr.json',
};
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@acme.example',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@12345',
  state: 'e2e/.auth/admin.json',
};

