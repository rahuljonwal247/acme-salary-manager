import { expect, test as setup } from '@playwright/test';
import { ADMIN, HR } from './accounts';

/**
 * Signs in once per role through the real login form and saves the session cookie, so the other specs
 * start authenticated. Credentials are the seeded dev accounts (override with env in other environments).
 */
for (const who of [HR, ADMIN]) {
  setup(`sign in as ${who.email}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(who.email);
    await page.getByLabel('Password').fill(who.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'How ACME pays people' })).toBeVisible();
    await page.context().storageState({ path: who.state });
  });
}
