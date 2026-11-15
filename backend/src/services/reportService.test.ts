import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  breakdownRow,
  HR_ACTOR,
  InMemoryCountryRepository,
  InMemoryEmployeeRepository,
  newEmployeeInput,
  StubInsightsRepository,
  StubSalaryHistoryRepository,
} from '../testing/fakes';
import { EmployeeService } from './employeeService';
import { neutraliseFormula, ReportService, toCsv, toXlsx, type Table } from './reportService';

const table: Table = {
  title: 'T',
  columns: [
    { key: 'name', header: 'Name' },
    { key: 'amount', header: 'Amount', numeric: true },
  ],
  rows: [
    { name: 'Plain', amount: 1000 },
    { name: 'Comma, "quoted"', amount: -5 },
    { name: '=HYPERLINK("http://evil")', amount: null },
  ],
};

describe('CSV / Excel formatting', () => {
  it('neutralises spreadsheet formulas in text cells', () => {
    expect(neutraliseFormula('=1+1')).toBe("'=1+1");
    expect(neutraliseFormula('+44 20')).toBe("'+44 20");
    expect(neutraliseFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(neutraliseFormula('Alice')).toBe('Alice');
  });

  it('writes RFC 4180 CSV with a BOM, quoting and formula protection; numbers stay numeric', () => {
    const csv = toCsv(table).toString('utf8');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Name,Amount',
      'Plain,1000',
      '"Comma, ""quoted""",-5',
      `"'=HYPERLINK(""http://evil"")",`,
      '',
    ]);
  });

  it('writes an .xlsx workbook that round-trips', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await toXlsx(table)) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).values).toEqual([undefined, 'Name', 'Amount']);
    expect(ws.getRow(2).values).toEqual([undefined, 'Plain', 1000]);
    expect(ws.getCell('A4').value).toBe(`'=HYPERLINK("http://evil")`);
  });
});

describe('ReportService', () => {
  let employees: InMemoryEmployeeRepository;
  let insights: StubInsightsRepository;
  let history: StubSalaryHistoryRepository;
  let reports: ReportService;

  beforeEach(async () => {
    employees = new InMemoryEmployeeRepository();
    insights = new StubInsightsRepository();
    history = new StubSalaryHistoryRepository();
    reports = new ReportService(employees, history, insights);
    const svc = new EmployeeService(employees, new InMemoryCountryRepository());
    await svc.create(newEmployeeInput({ email: 'a@x.io', salary: 100_000, allowances: 5_000, bonus: 10_000, deductions: 8_000 }), HR_ACTOR);
    await svc.create(newEmployeeInput({ email: 'b@x.io', countryCode: 'DE', salary: 70_000 }), HR_ACTOR);
  });

  it('employee report includes gross/net and respects filters', async () => {
    const t = await reports.build('employees', { country: 'US' });
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ code: 'EMP-00001', salary: 100_000, gross: 115_000, net: 107_000, grossUsd: 115_000 });
  });

  it('salary-history report passes the date range and labels seeded rows', async () => {
    history.rows = [
      {
        employeeCode: 'EMP-00001',
        employeeName: 'Ada Lovelace',
        countryCode: 'US',
        currency: 'USD',
        effectiveDate: new Date('2024-01-01'),
        reason: 'HIRE',
        previousSalary: null,
        newSalary: 100,
        allowances: 10,
        bonus: 5,
        deductions: 1,
        changedBy: null,
      },
    ];
    const t = await reports.build('salary-history', { from: new Date('2024-01-01'), department: 'Sales' });
    expect(history.lastFilter).toMatchObject({ from: new Date('2024-01-01'), department: 'Sales' });
    expect(t.rows[0]).toMatchObject({ gross: 115, changedBy: 'system (seed)', effectiveDate: '2024-01-01' });
  });

  it('department report is sorted by payroll', async () => {
    insights.breakdownRows = [breakdownRow('Sales', 80_000, { totalGrossUsd: 1 }), breakdownRow('Engineering', 150_000, { totalGrossUsd: 9 })];
    const t = await reports.build('departments', {});
    expect(t.rows.map((r) => r.key)).toEqual(['Engineering', 'Sales']);
    expect(insights.calls[0]?.args[0]).toBe('department');
  });

  it('exports with a dated filename and the right content type', async () => {
    const today = new Date('2026-11-14T10:00:00Z');
    const csv = await reports.export('employees', 'csv', {}, today);
    expect(csv).toMatchObject({ filename: 'acme-employees-2026-11-14.csv', contentType: 'text/csv; charset=utf-8' });
    const xlsx = await reports.export('countries', 'xlsx', {}, today);
    expect(xlsx.filename).toBe('acme-countries-2026-11-14.xlsx');
    expect(xlsx.body.subarray(0, 2).toString()).toBe('PK'); // xlsx is a zip
  });
});
