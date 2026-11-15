import ExcelJS from 'exceljs';
import { grossPay, netPay } from '../domain/compensation';
import type { EmployeeFilter } from '../domain/types';
import type { EmployeeRepository, InsightFilter, InsightsRepository, SalaryHistoryRepository } from '../repositories/types';

export const REPORT_TYPES = ['employees', 'salary-history', 'departments', 'countries'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export interface Column {
  key: string;
  header: string;
  /** numeric columns are right-aligned / typed as numbers in Excel */
  numeric?: boolean;
}

export interface Table {
  title: string;
  columns: Column[];
  rows: Record<string, string | number | null>[];
}

export interface ReportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

/**
 * Spreadsheet apps execute cells starting with = + - @ (and tab/CR) as formulas — "CSV injection".
 * Text cells are prefixed with an apostrophe; real numbers are left untouched.
 */
export function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const safe = neutraliseFormula(value);
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens non-ASCII names correctly. */
export function toCsv(table: Table): Buffer {
  const lines = [
    table.columns.map((c) => csvCell(c.header)).join(','),
    ...table.rows.map((r) => table.columns.map((c) => csvCell(r[c.key] ?? null)).join(',')),
  ];
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}

export async function toXlsx(table: Table): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ACME Salary Manager';
  const ws = wb.addWorksheet(table.title.slice(0, 31));
  ws.columns = table.columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(12, c.header.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of table.rows) {
    const safe: Record<string, string | number | null> = {};
    for (const c of table.columns) {
      const v = row[c.key] ?? null;
      safe[c.key] = typeof v === 'string' ? neutraliseFormula(v) : v;
    }
    ws.addRow(safe);
  }
  table.columns.forEach((c, i) => {
    if (c.numeric) ws.getColumn(i + 1).numFmt = '#,##0';
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const date = (d: Date) => d.toISOString().slice(0, 10);

export class ReportService {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly history: SalaryHistoryRepository,
    private readonly insights: InsightsRepository,
  ) {}

  async build(type: ReportType, filter: EmployeeFilter & { from?: Date; to?: Date }): Promise<Table> {
    const insightFilter: InsightFilter = { country: filter.country, department: filter.department, jobTitle: filter.jobTitle };
    switch (type) {
      case 'employees': {
        const rows = await this.employees.listAll(filter);
        return {
          title: 'Employees',
          columns: [
            { key: 'code', header: 'Employee code' },
            { key: 'firstName', header: 'First name' },
            { key: 'lastName', header: 'Last name' },
            { key: 'email', header: 'Email' },
            { key: 'department', header: 'Department' },
            { key: 'jobTitle', header: 'Designation' },
            { key: 'country', header: 'Country' },
            { key: 'currency', header: 'Currency' },
            { key: 'hireDate', header: 'Hire date' },
            { key: 'status', header: 'Status' },
            { key: 'salary', header: 'Base salary', numeric: true },
            { key: 'allowances', header: 'Allowances', numeric: true },
            { key: 'bonus', header: 'Bonus', numeric: true },
            { key: 'gross', header: 'Gross pay', numeric: true },
            { key: 'deductions', header: 'Deductions', numeric: true },
            { key: 'net', header: 'Net pay', numeric: true },
            { key: 'grossUsd', header: 'Gross pay (USD)', numeric: true },
          ],
          rows: rows.map((e) => ({
            code: e.employeeCode,
            firstName: e.firstName,
            lastName: e.lastName,
            email: e.email,
            department: e.department,
            jobTitle: e.jobTitle,
            country: e.country.name,
            currency: e.country.currency,
            hireDate: date(e.hireDate),
            status: e.status,
            salary: e.salary,
            allowances: e.allowances,
            bonus: e.bonus,
            gross: grossPay(e),
            deductions: e.deductions,
            net: netPay(e),
            grossUsd: Math.round(grossPay(e) * e.country.usdRate),
          })),
        };
      }
      case 'salary-history': {
        const rows = await this.history.listForExport({ ...insightFilter, from: filter.from, to: filter.to });
        return {
          title: 'Salary history',
          columns: [
            { key: 'code', header: 'Employee code' },
            { key: 'name', header: 'Employee' },
            { key: 'country', header: 'Country' },
            { key: 'currency', header: 'Currency' },
            { key: 'effectiveDate', header: 'Effective date' },
            { key: 'reason', header: 'Reason' },
            { key: 'previousSalary', header: 'Previous base', numeric: true },
            { key: 'newSalary', header: 'New base', numeric: true },
            { key: 'allowances', header: 'Allowances', numeric: true },
            { key: 'bonus', header: 'Bonus', numeric: true },
            { key: 'deductions', header: 'Deductions', numeric: true },
            { key: 'gross', header: 'Gross pay', numeric: true },
            { key: 'changedBy', header: 'Changed by' },
          ],
          rows: rows.map((r) => ({
            code: r.employeeCode,
            name: r.employeeName,
            country: r.countryCode,
            currency: r.currency,
            effectiveDate: date(r.effectiveDate),
            reason: r.reason,
            previousSalary: r.previousSalary,
            newSalary: r.newSalary,
            allowances: r.allowances,
            bonus: r.bonus,
            deductions: r.deductions,
            gross: r.newSalary + r.allowances + r.bonus,
            changedBy: r.changedBy ?? 'system (seed)',
          })),
        };
      }
      case 'departments':
      case 'countries': {
        const by = type === 'departments' ? 'department' : 'country';
        const rows = await this.insights.breakdown(by, insightFilter);
        return {
          title: type === 'departments' ? 'Department report' : 'Country report',
          columns: [
            { key: 'key', header: by === 'department' ? 'Department' : 'Country' },
            { key: 'headcount', header: 'Headcount', numeric: true },
            { key: 'totalGrossUsd', header: 'Payroll (gross, USD)', numeric: true },
            { key: 'avgUsd', header: 'Average base (USD)', numeric: true },
            { key: 'medianUsd', header: 'Median base (USD)', numeric: true },
            { key: 'minUsd', header: 'Min base (USD)', numeric: true },
            { key: 'maxUsd', header: 'Max base (USD)', numeric: true },
            { key: 'currency', header: 'Local currency' },
            { key: 'medianLocal', header: 'Median base (local)', numeric: true },
          ],
          rows: rows
            .sort((a, b) => b.totalGrossUsd - a.totalGrossUsd)
            .map((r) => ({
              key: r.key,
              headcount: r.headcount,
              totalGrossUsd: r.totalGrossUsd,
              avgUsd: r.avgUsd,
              medianUsd: r.medianUsd,
              minUsd: r.minUsd,
              maxUsd: r.maxUsd,
              currency: r.currency,
              medianLocal: r.medianLocal,
            })),
        };
      }
    }
  }

  async export(type: ReportType, format: ReportFormat, filter: EmployeeFilter & { from?: Date; to?: Date }, today = new Date()): Promise<ReportFile> {
    const table = await this.build(type, filter);
    const base = `acme-${type}-${date(today)}`;
    return format === 'csv'
      ? { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body: toCsv(table) }
      : {
          filename: `${base}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: await toXlsx(table),
        };
  }
}
