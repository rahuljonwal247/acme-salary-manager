import { expect, test, type Page } from '@playwright/test';

/** Fails the test if the page logs any console error or throws. */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Our own alerts (excludes Next.js's hidden route announcer, which also has role=alert). */
const appAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const parseMoney = (s: string) => Number(s.replace(/[^\d.-]/g, ''));
const kpi = (page: Page, label: string) =>
  page.locator('.card', { has: page.getByText(label, { exact: true }) }).locator('.text-3xl');

test.describe('Dashboard (HR manager)', () => {
  test('KPIs, breakdown chart + table, distribution and top earners', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'How ACME pays people' })).toBeVisible();
    expect(parseMoney(await kpi(page, 'Employees').innerText())).toBeGreaterThanOrEqual(9_000);
    await expect(kpi(page, 'Total payroll')).toContainText('$');
    await expect(page.getByRole('heading', { name: 'Median salary by country (USD)' })).toBeVisible();
    await expect(page.locator('section').first().locator('tbody tr')).toHaveCount(8);
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Salary distribution (USD)' })).toBeVisible();
    const top = page.getByRole('heading', { name: 'Highest-paid employees' }).locator('xpath=ancestor::section');
    await expect(top.locator('tbody tr')).toHaveCount(10);
    expect(errors).toEqual([]);
  });

  test('payroll metric and group-by tabs drive the URL', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Payroll' }).click();
    await expect(page).toHaveURL(/metric=payroll/);
    await expect(page.getByRole('heading', { name: 'Payroll by country (USD)' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Group by' }).getByRole('link', { name: 'Department' }).click();
    await expect(page).toHaveURL(/by=department/);
    await expect(page).toHaveURL(/metric=payroll/);
    await expect(page.getByRole('heading', { name: 'Payroll by department (USD)' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Group by' }).getByRole('link', { name: 'Job title' }).click();
    await expect(page.locator('section').first().locator('tbody tr')).toHaveCount(25);
  });

  test('country filter narrows data and shows local currency', async ({ page }) => {
    await page.goto('/?by=department');
    await page.getByLabel('Country').selectOption('IN');
    await expect(page).toHaveURL(/country=IN/);
    await expect(page.getByText(/India · active employees/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Median (local)' })).toBeVisible();
    expect(parseMoney(await kpi(page, 'Employees').innerText())).toBeLessThan(5_000);
    await page.locator('.recharts-bar-rectangle').first().hover();
    await expect(page.locator('.recharts-tooltip-wrapper').first()).toContainText('employees');
  });
});

test.describe('Employee directory', () => {
  test('lists 25 per page with pagination and gross pay', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('tbody tr')).toHaveCount(25);
    await expect(page.getByRole('columnheader', { name: 'Gross pay' })).toBeVisible();
    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/Showing 26–50/)).toBeVisible();
  });

  test('debounced search, filters, and department clears job title', async ({ page }) => {
    await page.goto('/employees');
    await page.getByLabel('Search').fill('sharma');
    await expect(page).toHaveURL(/search=sharma/);
    for (const t of await page.locator('tbody tr').allInnerTexts()) expect(t.toLowerCase()).toContain('sharma');

    await page.goto('/employees');
    await page.getByLabel('Country').selectOption('DE');
    await page.getByLabel('Department').selectOption('Sales');
    await page.getByLabel('Job title').selectOption('Sales Manager');
    await expect(page).toHaveURL(/jobTitle=Sales\+Manager/);
    for (const t of await page.locator('tbody tr').allInnerTexts()) {
      expect(t).toContain('Germany');
      expect(t).toContain('Sales Manager');
    }
    await page.getByLabel('Department').selectOption('Engineering');
    await expect(page).not.toHaveURL(/jobTitle=/);
  });

  test('sorts by base salary descending', async ({ page }) => {
    await page.goto('/employees?country=US');
    await page.getByRole('link', { name: /Base salary/ }).click();
    await expect(page).toHaveURL(/order=asc/);
    await page.getByRole('link', { name: /Base salary/ }).click();
    await expect(page).toHaveURL(/order=desc/);
    const salaries = (await page.locator('tbody tr td:nth-child(5)').allInnerTexts()).map(parseMoney);
    expect(salaries).toEqual([...salaries].sort((a, b) => b - a));
  });
});

test.describe('Employee lifecycle', () => {
  const stamp = Date.now();
  const email = `e2e.${stamp}@acme.example`;

  test('create → pay changes & rules → edit → audit trail → deactivate → reactivate', async ({ page }) => {
    const errors = trackErrors(page);

    // ---- create with a full package
    await page.goto('/employees/new');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page.getByText('Required').first()).toBeVisible();

    await page.getByLabel('First name').fill('Eve');
    await page.getByLabel('Last name').fill(`Tester${stamp}`);
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Hire date').fill('2024-01-15');
    await page.getByLabel('Department').selectOption('Engineering');
    await page.getByLabel('Job title').selectOption('Software Engineer');
    await page.getByLabel('Country').selectOption('DE');
    await page.getByLabel('Base salary (EUR)').fill('80000');
    await page.getByLabel('Allowances').fill('4000');
    await page.getByLabel('Bonus').fill('6000');
    await page.getByLabel('Deductions').fill('9000');
    await expect(page.getByTestId('pay-preview')).toHaveText('Gross €90,000 · Net €81,000');
    await page.getByRole('button', { name: 'Create employee' }).click();

    await expect(page).toHaveURL(/\/employees\/\d+$/);
    const employeeUrl = page.url();
    await expect(page.getByRole('heading', { name: new RegExp(`Eve Tester${stamp}`) })).toBeVisible();
    await expect(page.getByTestId('pay-breakdown')).toContainText('Gross pay€90,000');
    await expect(page.getByTestId('pay-breakdown')).toContainText('Net pay€81,000');
    const history = page.locator('table', { has: page.getByRole('columnheader', { name: 'Reason' }) });
    await expect(history.locator('tbody tr')).toHaveCount(1);
    await expect(history.locator('tbody tr').first()).toContainText('Harper HR');

    // ---- rule: base cut cannot be a promotion
    await page.getByRole('button', { name: 'Record salary change' }).click();
    await expect(page.getByLabel('New base salary (EUR)')).toHaveValue('80000');
    await page.getByLabel('New base salary (EUR)').fill('70000');
    await page.getByLabel('Reason').selectOption('PROMOTION');
    await page.getByRole('button', { name: 'Record change' }).click();
    await expect(appAlert(page)).toContainText('decrease cannot be recorded as PROMOTION');

    // ---- rule: not before hire date
    await page.getByLabel('New base salary (EUR)').fill('88000');
    await page.getByLabel('Effective date').fill('2023-06-01');
    await page.getByRole('button', { name: 'Record change' }).click();
    await expect(appAlert(page)).toContainText('before the hire date');

    // ---- valid raise + bonus change
    await page.getByLabel('Effective date').fill('2025-04-01');
    await page.getByLabel('Bonus').fill('11000');
    await page.getByLabel('Reason').selectOption('ANNUAL_REVIEW');
    await expect(page.getByTestId('change-preview')).toHaveText('+14.4%'); // 90,000 → 103,000
    await page.getByRole('button', { name: 'Record change' }).click();
    await expect(history.locator('tbody tr')).toHaveCount(2);
    await expect(history.locator('tbody tr').first()).toContainText('Annual review');
    await expect(history.locator('tbody tr').first()).toContainText('€103,000');
    await expect(page.getByTestId('pay-breakdown')).toContainText('Net pay€94,000');

    // ---- edit profile
    await page.getByRole('button', { name: 'Edit profile' }).click();
    const editPanel = page.getByRole('region', { name: 'Edit profile' });
    await expect(editPanel.getByLabel(/Base salary/)).toHaveCount(0);
    await editPanel.getByLabel('Job title').selectOption('Staff Engineer');
    await editPanel.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/Staff Engineer · Engineering · Germany/)).toBeVisible();

    // ---- audit trail on the record
    const activity = page.locator('.card', { has: page.getByRole('heading', { name: 'Activity' }) });
    await expect(activity).toContainText('Updated job title');
    await expect(activity).toContainText('Pay change (annual review, effective 2025-04-01): base EUR 80,000 → EUR 88,000; bonus EUR 6,000 → EUR 11,000');
    await expect(activity).toContainText('Created employee');
    await expect(activity).toContainText('Harper HR');

    // ---- duplicate email rejected
    await page.goto('/employees/new');
    await page.getByLabel('First name').fill('Dup');
    await page.getByLabel('Last name').fill('Licate');
    await page.getByLabel('Work email').fill(email.toUpperCase());
    await page.getByLabel('Hire date').fill('2024-01-15');
    await page.getByLabel('Department').selectOption('Sales');
    await page.getByLabel('Job title').selectOption('Account Executive');
    await page.getByLabel('Country').selectOption('US');
    await page.getByLabel(/Base salary/).fill('90000');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(appAlert(page)).toContainText('already exists');

    // ---- deactivate: kept, but hidden from the active directory
    await page.goto(employeeUrl);
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('salary history are kept');
    await page.getByRole('button', { name: 'Yes, deactivate' }).click();
    await expect(page.getByText(/^Deactivated on/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record salary change' })).toHaveCount(0);

    await page.goto(`/employees?search=Tester${stamp}`);
    await expect(page.getByText('No employees match these filters.')).toBeVisible();
    await page.goto(`/employees?search=Tester${stamp}&status=INACTIVE`);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Inactive');

    // ---- reactivate
    await page.goto(employeeUrl);
    await page.getByRole('button', { name: 'Reactivate' }).click();
    await expect(page.getByRole('button', { name: 'Record salary change' })).toBeVisible();

    expect(errors.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
  });
});

test.describe('AI assistant', () => {
  test('answers an example question with a verified table and chart', async ({ page }) => {
    await page.goto('/assistant');
    await expect(page.getByTestId('engine')).toBeVisible();
    await page.getByRole('button', { name: 'Which department has the highest average salary?' }).click();
    const answer = page.getByTestId('assistant-answer');
    await expect(answer).toContainText('Engineering');
    await expect(answer.locator('tbody tr')).toHaveCount(8);
    await expect(answer.locator('.recharts-bar-rectangle').first()).toBeVisible();
  });

  test('answers a typed question and explains unsupported ones', async ({ page }) => {
    await page.goto('/assistant');
    await page.getByLabel('Ask a question').fill('Who are the top 3 highest paid employees in India?');
    await page.getByRole('button', { name: 'Ask' }).click();
    const first = page.getByTestId('assistant-answer').first();
    await expect(first.locator('tbody tr')).toHaveCount(3);
    await expect(first).toContainText('IN');

    await page.getByLabel('Ask a question').fill('What is the weather like today?');
    await page.getByRole('button', { name: 'Ask' }).click();
    await expect(page.getByTestId('assistant-answer').nth(1)).toContainText(/couldn't|can only|not able|unable/i);
  });
});

test.describe('Reports', () => {
  test('downloads CSV and Excel files', async ({ page }) => {
    await page.goto('/reports');
    await page.getByLabel('Country', { exact: true }).selectOption('SG');

    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('region', { name: 'Employee report' }).getByRole('link', { name: 'Download CSV' }).click(),
    ]);
    expect(csv.suggestedFilename()).toMatch(/^acme-employees-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await (await csv.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
    const lines = text.trim().split(/\r?\n/);
    expect(lines[0]).toContain('Gross pay');
    expect(lines.length).toBeGreaterThan(100);
    expect(lines.slice(1).every((l) => l.includes('Singapore'))).toBe(true);

    const [xlsx] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('region', { name: 'Department report' }).getByRole('link', { name: 'Download Excel' }).click(),
    ]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});

test.describe('Access control (HR manager)', () => {
  test('HR does not see admin navigation and cannot open admin pages', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' })).toHaveCount(0);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.get('/bff/users')).status()).toBe(403);
  });
});

test.describe('Navigation, errors and layout', () => {
  test('unknown or invalid employee ids show Not found', async ({ page }) => {
    await page.goto('/employees/99999999');
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await page.goto('/employees/abc');
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });

  for (const path of ['/', '/employees', '/employees/1', '/employees/new', '/assistant', '/reports']) {
    test(`no horizontal page scroll on a phone: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
