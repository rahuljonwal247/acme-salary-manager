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

test.describe('Insights dashboard', () => {
  test('shows KPIs, breakdown chart + table and histogram', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'How ACME pays people' })).toBeVisible();

    const headcount = page.locator('.card', { hasText: 'Headcount' }).locator('.text-3xl');
    expect(parseMoney(await headcount.innerText())).toBeGreaterThanOrEqual(10_000);
    await expect(page.getByText('Annual payroll')).toBeVisible();
    await expect(page.getByText('Median salary', { exact: true })).toBeVisible();

    // breakdown by country: 8 rows in the table view, bars drawn in the chart
    await expect(page.getByRole('heading', { name: 'Median salary by country (USD)' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(8);
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Salary distribution (USD)' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('hovering a bar shows a tooltip', async ({ page }) => {
    await page.goto('/');
    await page.locator('.recharts-bar-rectangle').first().hover();
    await expect(page.locator('.recharts-tooltip-wrapper').first()).toContainText('employees');
  });

  test('group-by tabs switch dimension via the URL', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Department' }).click();
    await expect(page).toHaveURL(/by=department/);
    await expect(page.getByRole('heading', { name: 'Median salary by department (USD)' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(8);

    await page.getByRole('link', { name: 'Job title' }).click();
    await expect(page).toHaveURL(/by=jobTitle/);
    await expect(page.locator('tbody tr')).toHaveCount(25);
  });

  test('country filter narrows data and shows local currency', async ({ page }) => {
    await page.goto('/?by=department');
    await page.getByLabel('Country').selectOption('IN');
    await expect(page).toHaveURL(/country=IN/);
    await expect(page.getByText(/India · annual base salary/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Median (local)' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toContainText('₹');

    const headcount = page.locator('.card', { hasText: 'Headcount' }).locator('.text-3xl');
    expect(parseMoney(await headcount.innerText())).toBeLessThan(10_000);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/country=/);
  });
});

test.describe('Employee directory', () => {
  test('lists 25 employees per page with pagination', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/employees');
    await expect(page.locator('tbody tr')).toHaveCount(25);
    await expect(page.getByText(/Showing 1–25 of 10,\d{3}/)).toBeVisible();

    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/Showing 26–50/)).toBeVisible();
    await page.getByRole('link', { name: 'Previous' }).click();
    await expect(page.getByText(/Showing 1–25/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('search is debounced into the URL and filters results', async ({ page }) => {
    await page.goto('/employees');
    await page.getByLabel('Search').fill('sharma');
    await expect(page).toHaveURL(/search=sharma/);
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toContainText(/sharma/i);
    for (const text of await rows.allInnerTexts()) expect(text.toLowerCase()).toContain('sharma');
  });

  test('search by employee code finds exactly one person', async ({ page }) => {
    await page.goto('/employees?search=EMP-00042');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('EMP-00042');
  });

  test('filters by country and department; department clears job title', async ({ page }) => {
    await page.goto('/employees');
    await page.getByLabel('Country').selectOption('DE');
    await expect(page).toHaveURL(/country=DE/);
    await page.getByLabel('Department').selectOption('Sales');
    await expect(page).toHaveURL(/department=Sales/);

    // job title list is narrowed to Sales titles
    const titles = await page.getByLabel('Job title').locator('option').allInnerTexts();
    expect(titles).toEqual(['All job titles', 'Account Executive', 'Sales Manager', 'Sales Representative']);
    await page.getByLabel('Job title').selectOption('Sales Manager');
    await expect(page).toHaveURL(/jobTitle=Sales\+Manager/);
    for (const t of await page.locator('tbody tr').allInnerTexts()) {
      expect(t).toContain('Germany');
      expect(t).toContain('Sales Manager');
    }

    await page.getByLabel('Department').selectOption('Engineering');
    await expect(page).not.toHaveURL(/jobTitle=/);
  });

  test('sorts by salary descending', async ({ page }) => {
    await page.goto('/employees?country=US');
    await page.getByRole('link', { name: /Salary/ }).click(); // asc
    await expect(page).toHaveURL(/sort=salary&order=asc/);
    await page.getByRole('link', { name: /Salary/ }).click(); // desc
    await expect(page).toHaveURL(/order=desc/);
    const salaries = (await page.locator('tbody tr td:nth-child(5)').allInnerTexts()).map(parseMoney);
    expect(salaries).toEqual([...salaries].sort((a, b) => b - a));
  });

  test('shows an empty state when nothing matches', async ({ page }) => {
    await page.goto('/employees?search=zzzz-no-such-person');
    await expect(page.getByText('No employees match these filters.')).toBeVisible();
  });
});

test.describe('Employee lifecycle', () => {
  const stamp = Date.now();
  const email = `e2e.${stamp}@acme.example`;

  test('create → salary changes → edit → delete', async ({ page }) => {
    const errors = trackErrors(page);

    // ---- create: client validation first
    await page.goto('/employees');
    await page.getByRole('link', { name: '+ Add employee' }).click();
    await expect(page).toHaveURL(/\/employees\/new/);
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page.getByText('Required').first()).toBeVisible();

    await page.getByLabel('First name').fill('Eve');
    await page.getByLabel('Last name').fill(`Tester${stamp}`);
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Hire date').fill('2024-01-15');
    await expect(page.getByLabel('Job title')).toBeDisabled();
    await page.getByLabel('Department').selectOption('Engineering');
    await page.getByLabel('Job title').selectOption('Software Engineer');
    await page.getByLabel('Country').selectOption('DE');
    await expect(page.getByLabel('Annual base salary (EUR)')).toBeVisible();
    await page.getByLabel('Annual base salary (EUR)').fill('80000');
    await page.getByRole('button', { name: 'Create employee' }).click();

    // ---- lands on detail page with HIRE entry and benchmark
    await expect(page).toHaveURL(/\/employees\/\d+$/);
    const employeeUrl = page.url();
    await expect(page.getByRole('heading', { name: `Eve Tester${stamp}` })).toBeVisible();
    await expect(page.getByText('€80,000').first()).toBeVisible();
    await expect(page.getByText('≈ $86,400')).toBeVisible();
    const history = page.locator('table', { has: page.getByRole('columnheader', { name: 'Reason' }) });
    await expect(history.locator('tbody tr')).toHaveCount(1);
    await expect(history).toContainText('Hired');
    await expect(page.getByText('Pay vs peers')).toBeVisible();
    await expect(page.getByText('compa-ratio')).toBeVisible();

    // ---- salary change rule: a decrease cannot be a promotion
    await page.getByRole('button', { name: 'Record salary change' }).click();
    await page.getByLabel('New annual salary (EUR)').fill('70000');
    await expect(page.getByTestId('change-preview')).toHaveText('-12.5%');
    await page.getByLabel('Reason').selectOption('PROMOTION');
    await page.getByRole('button', { name: 'Record change' }).click();
    await expect(appAlert(page)).toContainText('decrease cannot be recorded as PROMOTION');

    // ---- rule: cannot be before hire date
    await page.getByLabel('New annual salary (EUR)').fill('90000');
    await page.getByLabel('Effective date').fill('2023-06-01');
    await page.getByRole('button', { name: 'Record change' }).click();
    await expect(appAlert(page)).toContainText('before the hire date');

    // ---- valid raise
    await page.getByLabel('Effective date').fill('2025-04-01');
    await page.getByLabel('Reason').selectOption('ANNUAL_REVIEW');
    await expect(page.getByTestId('change-preview')).toHaveText('+12.5%');
    await page.getByRole('button', { name: 'Record change' }).click();
    await expect(history.locator('tbody tr')).toHaveCount(2);
    await expect(history.locator('tbody tr').first()).toContainText('Annual review');
    await expect(history.locator('tbody tr').first()).toContainText('+12.5%');
    await expect(page.locator('.text-3xl', { hasText: '€90,000' })).toBeVisible();

    // ---- rule: no back-dating before the latest change
    await page.getByRole('button', { name: 'Record salary change' }).click();
    await page.getByLabel('New annual salary (EUR)').fill('95000');
    await page.getByLabel('Effective date').fill('2024-06-01');
    await page.getByRole('button', { name: 'Record change' }).click();
    await expect(appAlert(page)).toContainText('latest recorded change');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // ---- edit profile: no salary/country fields; title follows department
    await page.getByRole('button', { name: 'Edit profile' }).click();
    const editPanel = page.getByRole('region', { name: 'Edit profile' });
    await expect(editPanel.getByLabel('Country')).toHaveCount(0);
    await expect(editPanel.getByLabel(/Annual base salary/)).toHaveCount(0);
    await editPanel.getByLabel('Job title').selectOption('Staff Engineer');
    await editPanel.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/Staff Engineer · Engineering · Germany/)).toBeVisible();

    // ---- duplicate email is rejected on create
    await page.goto('/employees/new');
    await page.getByLabel('First name').fill('Dup');
    await page.getByLabel('Last name').fill('Licate');
    await page.getByLabel('Work email').fill(email.toUpperCase());
    await page.getByLabel('Hire date').fill('2024-01-15');
    await page.getByLabel('Department').selectOption('Sales');
    await page.getByLabel('Job title').selectOption('Account Executive');
    await page.getByLabel('Country').selectOption('US');
    await page.getByLabel(/Annual base salary/).fill('90000');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(appAlert(page)).toContainText('already exists');

    // ---- new employee is findable in the directory
    await page.goto(`/employees?search=Tester${stamp}`);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Staff Engineer');
    await expect(page.locator('tbody tr')).toContainText('€90,000');

    // ---- delete with confirmation
    await page.goto(employeeUrl);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('cannot be undone');
    await page.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page).toHaveURL(/\/employees$/);
    await page.goto(`/employees?search=Tester${stamp}`);
    await expect(page.getByText('No employees match these filters.')).toBeVisible();

    await page.goto(employeeUrl);
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();

    // API 4xx responses are surfaced as console errors by the browser; ignore those, keep real JS errors.
    expect(errors.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
  });
});

test.describe('Navigation, errors and layout', () => {
  test('top navigation switches between pages', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Employees' }).click();
    await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Employees' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Insights' }).click();
    await expect(page.getByRole('heading', { name: 'How ACME pays people' })).toBeVisible();
  });

  test('clicking a name opens the employee and back link returns', async ({ page }) => {
    await page.goto('/employees');
    const first = page.locator('tbody tr a').first();
    const name = await first.innerText();
    await first.click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('link', { name: '← All employees' }).click();
    await expect(page).toHaveURL(/\/employees$/);
  });

  test('unknown or invalid employee ids show Not found', async ({ page }) => {
    await page.goto('/employees/99999999');
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await page.goto('/employees/abc');
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });

  for (const path of ['/', '/employees', '/employees/1', '/employees/new']) {
    test(`no horizontal page scroll on a phone: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
