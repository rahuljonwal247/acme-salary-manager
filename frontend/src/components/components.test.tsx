import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';
import type { AssistantAnswer, Benchmark, Employee, Meta } from '@/lib/types';
import { routerMock } from '../../vitest.setup';
import { AssistantChat } from './assistant/AssistantChat';
import { formatCell } from './assistant/ResultView';
import { BenchmarkCard, bandPercent } from './BenchmarkCard';
import { computePay, validateCompensation } from './CompensationFields';
import { EmployeeActions } from './EmployeeActions';
import { EmployeeForm, validateEmployee } from './EmployeeForm';
import { PayBreakdown } from './PayBreakdown';
import { reportQuery } from './ReportsPanel';
import { previewChange, SalaryChangeForm } from './SalaryChangeForm';
import { SalaryHistory } from './SalaryHistory';

const meta: Meta = {
  countries: [
    { code: 'US', name: 'United States', currency: 'USD', usdRate: 1 },
    { code: 'DE', name: 'Germany', currency: 'EUR', usdRate: 1.08 },
  ],
  departments: [
    { name: 'Engineering', jobTitles: ['Software Engineer', 'Staff Engineer'] },
    { name: 'Sales', jobTitles: ['Account Executive'] },
  ],
  salaryChangeReasons: ['PROMOTION', 'ANNUAL_REVIEW', 'MARKET_ADJUSTMENT', 'CORRECTION'],
  assistantEngine: 'rules',
};

const change = (o: Partial<Employee['salaryChanges'][number]>): Employee['salaryChanges'][number] => ({
  id: 1,
  previousSalary: null,
  newSalary: 70_000,
  allowances: 0,
  bonus: 0,
  deductions: 0,
  gross: 70_000,
  net: 70_000,
  effectiveDate: '2020-01-01T00:00:00.000Z',
  reason: 'HIRE',
  changePercent: null,
  changedBy: null,
  createdAt: '',
  ...o,
});

const employee: Employee = {
  id: 7,
  employeeCode: 'EMP-00007',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@acme.example',
  jobTitle: 'Software Engineer',
  department: 'Engineering',
  countryCode: 'DE',
  hireDate: '2020-01-01T00:00:00.000Z',
  status: 'ACTIVE',
  deactivatedAt: null,
  salary: 80_000,
  allowances: 4_000,
  bonus: 6_000,
  deductions: 9_000,
  gross: 90_000,
  net: 81_000,
  salaryUsd: 86_400,
  grossUsd: 97_200,
  netUsd: 87_480,
  country: meta.countries[1]!,
  salaryChanges: [
    change({ id: 2, previousSalary: 70_000, newSalary: 80_000, allowances: 4_000, bonus: 6_000, deductions: 9_000, gross: 90_000, net: 81_000, effectiveDate: '2022-04-01T00:00:00.000Z', reason: 'PROMOTION', changePercent: 28.6, changedBy: { id: 2, name: 'Harper HR' } }),
    change({}),
  ],
};

beforeEach(() => {
  routerMock.push.mockReset();
  routerMock.refresh.mockReset();
});

describe('compensation helpers', () => {
  it('computes gross and net from form strings', () => {
    expect(computePay({ salary: '80000', allowances: '4000', bonus: '6000', deductions: '9000' })).toEqual({ gross: 90_000, net: 81_000 });
    expect(computePay({ salary: '', allowances: '0', bonus: '0', deductions: '0' })).toBeNull();
    expect(computePay({ salary: '1.5', allowances: '0', bonus: '0', deductions: '0' })).toBeNull();
  });

  it('validates amounts and deductions ≤ gross', () => {
    expect(validateCompensation({ salary: '0', allowances: '-1', bonus: '0', deductions: '0' })).toMatchObject({
      salary: [expect.stringMatching(/greater than zero/)],
      allowances: [expect.stringMatching(/0 or more/)],
    });
    expect(validateCompensation({ salary: '100', allowances: '0', bonus: '0', deductions: '101' })).toEqual({
      deductions: ['Deductions cannot exceed gross pay'],
    });
    expect(validateCompensation({ salary: '100', allowances: '0', bonus: '0', deductions: '100' })).toEqual({});
  });
});

describe('validateEmployee', () => {
  it('requires country and pay only when creating', () => {
    const pay = { salary: '', allowances: '0', bonus: '0', deductions: '0' };
    expect(validateEmployee({}, false, pay)).toHaveProperty('countryCode');
    expect(validateEmployee({}, false, pay)).toHaveProperty('salary');
    expect(validateEmployee({}, true)).not.toHaveProperty('countryCode');
  });

  it('rejects bad emails', () => {
    expect(validateEmployee({ email: 'nope' }, true).email).toEqual(['Invalid email address']);
  });
});

describe('EmployeeForm', () => {
  it('limits job titles to the chosen department and shows the currency with a live gross/net preview', async () => {
    const user = userEvent.setup();
    render(<EmployeeForm meta={meta} />);

    const title = screen.getByLabelText('Job title');
    expect(title).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Department'), 'Sales');
    expect(within(title).getAllByRole('option').map((o) => o.textContent)).toEqual(['Select job title…', 'Account Executive']);

    await user.selectOptions(screen.getByLabelText('Country'), 'DE');
    await user.type(screen.getByLabelText('Base salary (EUR)'), '60000');
    await user.clear(screen.getByLabelText('Bonus'));
    await user.type(screen.getByLabelText('Bonus'), '5000');
    await user.clear(screen.getByLabelText('Deductions'));
    await user.type(screen.getByLabelText('Deductions'), '3000');
    expect(screen.getByTestId('pay-preview')).toHaveTextContent('Gross €65,000 · Net €62,000');
  });

  it('shows client-side errors without calling the API', async () => {
    const spy = vi.spyOn(api, 'createEmployee');
    render(<EmployeeForm meta={meta} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('submits a valid employee with its package and navigates to it', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, 'createEmployee').mockResolvedValue({ ...employee, id: 99 });
    render(<EmployeeForm meta={meta} />);

    await user.type(screen.getByLabelText('First name'), 'Grace');
    await user.type(screen.getByLabelText('Last name'), 'Hopper');
    await user.type(screen.getByLabelText('Work email'), 'grace@acme.example');
    await user.type(screen.getByLabelText('Hire date'), '2024-05-01');
    await user.selectOptions(screen.getByLabelText('Department'), 'Engineering');
    await user.selectOptions(screen.getByLabelText('Job title'), 'Staff Engineer');
    await user.selectOptions(screen.getByLabelText('Country'), 'US');
    await user.type(screen.getByLabelText(/Base salary/), '210000');
    await user.clear(screen.getByLabelText('Allowances'));
    await user.type(screen.getByLabelText('Allowances'), '12000');
    await user.click(screen.getByRole('button', { name: 'Create employee' }));

    expect(spy).toHaveBeenCalledWith({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@acme.example',
      department: 'Engineering',
      jobTitle: 'Staff Engineer',
      hireDate: '2024-05-01',
      countryCode: 'US',
      salary: 210_000,
      allowances: 12_000,
      bonus: 0,
      deductions: 0,
    });
    expect(routerMock.push).toHaveBeenCalledWith('/employees/99');
  });

  it('surfaces API errors (e.g. duplicate email)', async () => {
    vi.spyOn(api, 'updateEmployee').mockRejectedValue(new ApiError('An employee with email ada@acme.example already exists', 409));
    render(<EmployeeForm meta={meta} employee={employee} onDone={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });

  it('does not offer pay or country when editing', () => {
    render(<EmployeeForm meta={meta} employee={employee} onDone={() => {}} />);
    expect(screen.queryByLabelText('Country')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Base salary/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Ada');
  });
});

describe('SalaryChangeForm', () => {
  it('previewChange computes the percentage to one decimal', () => {
    expect(previewChange(80_000, 88_000)).toBe(10);
    expect(previewChange(80_000, 0)).toBeNull();
  });

  it('is pre-filled with the current package, previews the gross change and submits it', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const spy = vi.spyOn(api, 'recordSalaryChange').mockResolvedValue(employee);
    render(<SalaryChangeForm employee={employee} reasons={meta.salaryChangeReasons} onDone={onDone} today="2025-01-01" />);

    const base = screen.getByLabelText('New base salary (EUR)');
    expect(base).toHaveValue(80_000);
    expect(screen.getByLabelText('Bonus')).toHaveValue(6_000);
    await user.clear(base);
    await user.type(base, '89000');
    expect(screen.getByTestId('change-preview')).toHaveTextContent('+10.0%');

    await user.selectOptions(screen.getByLabelText('Reason'), 'ANNUAL_REVIEW');
    await user.click(screen.getByRole('button', { name: 'Record change' }));

    expect(spy).toHaveBeenCalledWith(7, {
      newSalary: 89_000,
      allowances: 4_000,
      bonus: 6_000,
      deductions: 9_000,
      effectiveDate: '2025-01-01',
      reason: 'ANNUAL_REVIEW',
    });
    expect(onDone).toHaveBeenCalled();
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it('blocks deductions above gross before calling the API', async () => {
    const spy = vi.spyOn(api, 'recordSalaryChange');
    render(<SalaryChangeForm employee={employee} reasons={meta.salaryChangeReasons} onDone={() => {}} />);
    await userEvent.clear(screen.getByLabelText('Deductions'));
    await userEvent.type(screen.getByLabelText('Deductions'), '999999');
    await userEvent.click(screen.getByRole('button', { name: 'Record change' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Deductions cannot exceed gross pay');
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows the business-rule error returned by the API', async () => {
    vi.spyOn(api, 'recordSalaryChange').mockRejectedValue(new ApiError('A salary decrease cannot be recorded as PROMOTION', 400));
    render(<SalaryChangeForm employee={employee} reasons={meta.salaryChangeReasons} onDone={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Record change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('decrease cannot be recorded');
  });
});

describe('EmployeeActions', () => {
  it('asks for confirmation, then deactivates', async () => {
    const spy = vi.spyOn(api, 'setEmployeeActive').mockResolvedValue({ ...employee, status: 'INACTIVE' });
    render(<EmployeeActions employee={employee} meta={meta} />);
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('record and salary history are kept');
    await userEvent.click(screen.getByRole('button', { name: 'Yes, deactivate' }));
    expect(spy).toHaveBeenCalledWith(7, false);
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it('offers reactivation (and no pay change) for an inactive employee', async () => {
    const spy = vi.spyOn(api, 'setEmployeeActive').mockResolvedValue(employee);
    render(<EmployeeActions employee={{ ...employee, status: 'INACTIVE' }} meta={meta} />);
    expect(screen.queryByRole('button', { name: 'Record salary change' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    expect(spy).toHaveBeenCalledWith(7, true);
  });
});

describe('SalaryHistory and PayBreakdown', () => {
  it('renders each change with base, gross, percentage and author', () => {
    render(<SalaryHistory changes={employee.salaryChanges} currency="EUR" />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(/1 Apr 2022.*Promotion.*€80,000.*€90,000.*\+28\.6%.*Harper HR/);
    expect(rows[1]).toHaveTextContent(/Hired.*€70,000.*—.*Import/);
  });

  it('shows base + allowances + bonus = gross, minus deductions = net', () => {
    render(<PayBreakdown employee={employee} />);
    expect(screen.getByTestId('pay-breakdown')).toHaveTextContent(
      /Base salary€80,000Allowances€4,000Bonus€6,000Gross pay€90,000Deductions−€9,000Net pay€81,000/,
    );
    expect(screen.getByText(/≈ \$97,200 gross/)).toBeInTheDocument();
  });
});

describe('BenchmarkCard', () => {
  const benchmark: Benchmark = {
    countryCode: 'DE',
    jobTitle: 'Software Engineer',
    currency: 'EUR',
    count: 40,
    min: 60_000,
    p25: 70_000,
    median: 80_000,
    p75: 90_000,
    max: 100_000,
    comparison: { salary: 95_000, compaRatio: 1.19, position: 'ABOVE_P75' },
  };

  it('bandPercent clamps to the range', () => {
    expect(bandPercent(80, 60, 100)).toBe(50);
    expect(bandPercent(10, 60, 100)).toBe(0);
    expect(bandPercent(5, 5, 5)).toBe(50);
  });

  it('shows compa-ratio, position and places the marker', () => {
    render(<BenchmarkCard benchmark={benchmark} />);
    expect(screen.getByText('1.19')).toBeInTheDocument();
    expect(screen.getByText('Top quartile')).toBeInTheDocument();
    expect(screen.getByTestId('salary-marker')).toHaveStyle({ left: '87.5%' });
  });

  it('explains when there are too few peers', () => {
    render(<BenchmarkCard benchmark={{ ...benchmark, count: 1 }} />);
    expect(screen.getByText(/Not enough peers/)).toBeInTheDocument();
  });
});

describe('Reports', () => {
  it('scopes report query strings to the filters each report supports', () => {
    const f = { country: 'IN', department: '', status: 'ALL', from: '2024-01-01', to: '' };
    expect(reportQuery('employees', 'csv', f)).toBe('?format=csv&country=IN&status=ALL');
    expect(reportQuery('salary-history', 'xlsx', f)).toBe('?format=xlsx&country=IN&from=2024-01-01');
    expect(reportQuery('countries', 'csv', f)).toBe('?format=csv&country=IN');
  });
});

describe('AI assistant', () => {
  const answer: AssistantAnswer = {
    engine: 'rules',
    answer: 'Highest median: Engineering at $140,000.',
    results: [
      {
        title: 'Median by department',
        summary: '',
        table: {
          columns: [
            { key: 'label', label: 'Department' },
            { key: 'value', label: 'Median (USD)', format: 'usd' },
          ],
          rows: [
            { label: 'Engineering', value: 140_000 },
            { label: 'Sales', value: 80_000 },
          ],
        },
      },
    ],
  };

  it('formats result cells by column type', () => {
    expect(formatCell(140000, 'usd', {})).toBe('$140,000');
    expect(formatCell(2500000, 'local', { currency: 'INR' })).toBe('₹25,00,000');
    expect(formatCell(null, 'usd', {})).toBe('—');
    expect(formatCell('Sales', undefined, {})).toBe('Sales');
  });

  it('sends an example question and renders the verified answer table', async () => {
    const spy = vi.spyOn(api, 'ask').mockResolvedValue(answer);
    render(<AssistantChat />);
    await userEvent.click(screen.getByRole('button', { name: 'Which department has the highest average salary?' }));
    expect(spy).toHaveBeenCalledWith('Which department has the highest average salary?');
    const card = await screen.findByTestId('assistant-answer');
    expect(card).toHaveTextContent('Highest median: Engineering at $140,000.');
    expect(within(card).getAllByRole('row')[1]).toHaveTextContent('Engineering$140,000');
  });

  it('shows errors inline and keeps the input usable', async () => {
    vi.spyOn(api, 'ask').mockRejectedValue(new ApiError('Question is too long', 400));
    render(<AssistantChat />);
    await userEvent.type(screen.getByLabelText('Ask a question'), 'something long');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Question is too long');
    expect(screen.getByLabelText('Ask a question')).toHaveValue('');
  });
});

import { FilterBar } from './FilterBar';

describe('FilterBar', () => {
  it('keeps earlier choices when filters change in quick succession (before navigation commits)', async () => {
    routerMock.replace.mockReset();
    render(
      <FilterBar
        selects={[
          { name: 'country', label: 'Country', allLabel: 'All', options: [{ value: 'DE', label: 'Germany' }] },
          { name: 'department', label: 'Department', allLabel: 'All', options: [{ value: 'Sales', label: 'Sales' }], clears: ['jobTitle'] },
        ]}
      />,
    );
    // useSearchParams() is mocked to stay empty, like a navigation that hasn't committed yet
    await userEvent.selectOptions(screen.getByLabelText('Country'), 'DE');
    await userEvent.selectOptions(screen.getByLabelText('Department'), 'Sales');
    expect(routerMock.replace).toHaveBeenLastCalledWith('/?country=DE&department=Sales');
    expect(screen.getByLabelText('Country')).toHaveValue('DE');
  });
});
