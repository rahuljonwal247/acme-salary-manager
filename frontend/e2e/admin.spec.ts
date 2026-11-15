import { expect, test, type Page } from '@playwright/test';

const appAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

test.describe('Administrator', () => {
  test('sees admin navigation', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Audit log' })).toBeVisible();
  });

  test('creates a user, who can sign in; disabling them locks them out', async ({ page, browser }) => {
    const stamp = Date.now();
    const email = `new.hr.${stamp}@acme.example`;
    await page.goto('/admin/users');

    // weak password rejected by the API
    await page.getByRole('button', { name: '+ New user' }).click();
    const form = page.getByRole('form', { name: 'New user' });
    await form.getByLabel('Full name').fill('New HR');
    await form.getByLabel('Email').fill(email);
    await form.getByLabel('Initial password').fill('weak');
    await form.getByRole('button', { name: 'Create user' }).click();
    await expect(appAlert(page)).toContainText('at least 10 characters');

    await form.getByLabel('Initial password').fill('Welcome12345');
    await form.getByRole('button', { name: 'Create user' }).click();
    const row = page.locator('tr', { hasText: email });
    await expect(row).toContainText('Active');

    // the new user can sign in
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const other = await ctx.newPage();
    await other.goto('/login');
    await other.getByLabel('Work email').fill(email);
    await other.getByLabel('Password').fill('Welcome12345');
    await other.getByRole('button', { name: 'Sign in' }).click();
    await expect(other.getByTestId('current-user')).toHaveText('New HR');

    // disable → their very next request is rejected
    await row.getByRole('button', { name: 'Disable' }).click();
    await expect(row).toContainText('Disabled');
    expect((await other.request.get('/bff/employees')).status()).toBe(401);
    await ctx.close();
  });

  test('cannot remove their own admin role', async ({ page }) => {
    await page.goto('/admin/users');
    const me = page.locator('tr', { hasText: '(you)' });
    await expect(me.getByLabel(/Role for/)).toBeDisabled();
    await expect(me.getByRole('button', { name: 'Disable' })).toHaveCount(0);
  });

  test('audit log lists salary changes with who/what and filters by action', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    await page.getByLabel('Action').selectOption('SALARY_CHANGED');
    await expect(page).toHaveURL(/action=SALARY_CHANGED/);
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toContainText('Pay change');
    await expect(rows.first()).toContainText('Harper HR');
    for (const t of await rows.allInnerTexts()) expect(t).toContain('Pay change');
  });

  test('admin can also use HR features', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('tbody tr')).toHaveCount(25);
  });
});
