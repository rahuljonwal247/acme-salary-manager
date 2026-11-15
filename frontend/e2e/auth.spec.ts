import { expect, test } from '@playwright/test';
import { ADMIN, HR } from './accounts';

const appAlert = (page: import('@playwright/test').Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

test.describe('Authentication', () => {
  test('protected pages redirect to login and come back after sign-in', async ({ page }) => {
    await page.goto('/employees?country=DE');
    await expect(page).toHaveURL(/\/login\?next=%2Femployees%3Fcountry%3DDE/);
    await page.getByLabel('Work email').fill(HR.email);
    await page.getByLabel('Password').fill(HR.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/employees\?country=DE$/);
    await expect(page.getByTestId('current-user')).toHaveText('Harper HR');
  });

  test('wrong password shows a generic error and keeps the email', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(HR.email);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(appAlert(page)).toHaveText('Invalid email or password');
    await expect(page.getByLabel('Work email')).toHaveValue(HR.email);
  });

  test('the session cookie is httpOnly and the API is not reachable from the browser without it', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('current-user')).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === 'acme_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('acme_session');

    // a cross-site POST through the proxy is refused even though the cookie is attached
    const forged = await context.request.post('/bff/employees/1/deactivate', { headers: { Origin: 'https://evil.example' } });
    expect(forged.status()).toBe(403);
    expect((await context.request.get('/bff/employees/1')).ok()).toBe(true);
    expect((await (await context.request.get('/bff/employees/1')).json()).status).toBe('ACTIVE');
  });

  test('sign out ends the session', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(HR.email);
    await page.getByLabel('Password').fill(HR.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/employees');
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get('/bff/employees')).status()).toBe(401);
  });
});
