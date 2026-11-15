import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';
import type { Benchmark, Employee, Meta } from '@/lib/types';
import { routerMock } from '../../vitest.setup';
import { BenchmarkCard, bandPercent } from './BenchmarkCard';
import { EmployeeForm, validateEmployee } from './EmployeeForm';
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
};

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
  salary: 80_000,
  salaryUsd: 86_400,
  country: meta.countries[1]!,
  salaryChanges: [
    { id: 2, previousSalary: 70_000, newSalary: 80_000, effectiveDate: '2022-04-01T00:00:00.000Z', reason: 'PROMOTION', changePercent: 14.3, createdAt: '' },
    { id: 1, previousSalary: null, newSalary: 70_000, effectiveDate: '2020-01-01T00:00:00.000Z', reason: 'HIRE', changePercent: null, createdAt: '' },
  ],
};

beforeEach(() => {
  routerMock.push.mockReset();
  routerMock.refresh.mockReset();
});

describe('validateEmployee', () => {
  it('requires country and salary only when creating', () => {
    const create = validateEmployee({}, false);
    const edit = validateEmployee({}, true);
    expect(create).toHaveProperty('countryCode');
    expect(create).toHaveProperty('salary');
    expect(edit).not.toHaveProperty('countryCode');
    expect(edit).not.toHaveProperty('salary');
  });

  it('rejects non-integer and non-positive salaries and bad emails', () => {
    const errors = validateEmployee({ email: 'nope', salary: '12.5' }, false);
    expect(errors.email).toEqual(['Invalid email address']);
    expect(errors.salary).toEqual(['Enter a whole number greater than zero']);
  });
});

describe('EmployeeForm', () => {
  it('limits job titles to the chosen department and shows the currency', async () => {
    const user = userEvent.setup();
    render(<EmployeeForm meta={meta} />);

    const title = screen.getByLabelText('Job title');
    expect(title).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Department'), 'Sales');
    expect(within(title).getAllByRole('option').map((o) => o.textContent)).toEqual(['Select job title…', 'Account Executive']);

    await user.selectOptions(screen.getByLabelText('Country'), 'DE');
    expect(screen.getByLabelText('Annual base salary (EUR)')).toBeInTheDocument();
  });

  it('shows client-side errors without calling the API', async () => {
    const spy = vi.spyOn(api, 'createEmployee');
    render(<EmployeeForm meta={meta} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('submits a valid employee and navigates to it', async () => {
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
    await user.type(screen.getByLabelText(/Annual base salary/), '210000');
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
    });
    expect(routerMock.push).toHaveBeenCalledWith('/employees/99');
  });

  it('surfaces API errors (e.g. duplicate email)', async () => {
    vi.spyOn(api, 'updateEmployee').mockRejectedValue(
      new ApiError('An employee with email ada@acme.example already exists', 409),
    );
    render(<EmployeeForm meta={meta} employee={employee} onDone={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });

  it('does not offer salary or country when editing', () => {
    render(<EmployeeForm meta={meta} employee={employee} onDone={() => {}} />);
    expect(screen.queryByLabelText('Country')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Annual base salary/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Ada');
  });
});

describe('SalaryChangeForm', () => {
  it('previewChange computes the percentage to one decimal', () => {
    expect(previewChange(80_000, 88_000)).toBe(10);
    expect(previewChange(80_000, 0)).toBeNull();
  });

  it('previews the change and submits it', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const spy = vi.spyOn(api, 'recordSalaryChange').mockResolvedValue(employee);
    render(<SalaryChangeForm employee={employee} reasons={meta.salaryChangeReasons} onDone={onDone} today="2025-01-01" />);

    await user.type(screen.getByLabelText('New annual salary (EUR)'), '86000');
    expect(screen.getByTestId('change-preview')).toHaveTextContent('+7.5%');

    await user.selectOptions(screen.getByLabelText('Reason'), 'ANNUAL_REVIEW');
    await user.click(screen.getByRole('button', { name: 'Record change' }));

    expect(spy).toHaveBeenCalledWith(7, { newSalary: 86_000, effectiveDate: '2025-01-01', reason: 'ANNUAL_REVIEW' });
    expect(onDone).toHaveBeenCalled();
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it('shows the business-rule error returned by the API', async () => {
    vi.spyOn(api, 'recordSalaryChange').mockRejectedValue(
      new ApiError('A salary decrease cannot be recorded as PROMOTION', 400),
    );
    render(<SalaryChangeForm employee={employee} reasons={meta.salaryChangeReasons} onDone={() => {}} />);
    await userEvent.type(screen.getByLabelText('New annual salary (EUR)'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Record change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('decrease cannot be recorded');
  });
});

describe('SalaryHistory', () => {
  it('renders each change with reason, amount and percentage', () => {
    render(<SalaryHistory changes={employee.salaryChanges} currency="EUR" />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(/1 Apr 2022.*Promotion.*€80,000.*\+14\.3%/);
    expect(rows[1]).toHaveTextContent(/Hired.*€70,000.*—/);
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
