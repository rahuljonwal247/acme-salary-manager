import type { AuditEntry } from './types';

type Pkg = { salary: number; allowances: number; bonus: number; deductions: number };

const fmt = (n: number, currency?: string) =>
  `${currency ? `${currency} ` : ''}${new Intl.NumberFormat('en-US').format(n)}`;

const FIELD_LABELS: Record<string, string> = {
  firstName: 'first name',
  lastName: 'last name',
  email: 'email',
  jobTitle: 'job title',
  department: 'department',
  hireDate: 'hire date',
};

/** Human-readable one-liner for an audit entry. */
export function describeAudit(e: AuditEntry): string {
  const d = (e.details ?? {}) as Record<string, unknown>;
  switch (e.action) {
    case 'LOGIN':
      return 'Signed in';
    case 'EMPLOYEE_CREATED':
      return `Created employee${d.employeeCode ? ` ${d.employeeCode}` : ''}`;
    case 'EMPLOYEE_DEACTIVATED':
      return 'Deactivated employee';
    case 'EMPLOYEE_REACTIVATED':
      return 'Reactivated employee';
    case 'EMPLOYEE_UPDATED': {
      const changes = Object.keys((d.changes as Record<string, unknown>) ?? {});
      return changes.length ? `Updated ${changes.map((c) => FIELD_LABELS[c] ?? c).join(', ')}` : 'Saved profile (no changes)';
    }
    case 'SALARY_CHANGED': {
      const from = d.from as Pkg | undefined;
      const to = d.to as Pkg | undefined;
      const currency = d.currency as string | undefined;
      const reason = String(d.reason ?? '').toLowerCase().replace(/_/g, ' ');
      if (!from || !to) return 'Changed pay';
      const parts = (['salary', 'allowances', 'bonus', 'deductions'] as const)
        .filter((k) => from[k] !== to[k])
        .map((k) => `${k === 'salary' ? 'base' : k} ${fmt(from[k], currency)} → ${fmt(to[k], currency)}`);
      return `Pay change (${reason}, effective ${d.effectiveDate}): ${parts.join('; ')}`;
    }
    case 'USER_CREATED':
      return `Created user ${d.email ?? ''} (${d.role ?? ''})`.trim();
    case 'USER_UPDATED': {
      const bits = Object.entries(d).map(([k, v]) =>
        k === 'passwordReset' ? 'reset password' : k === 'isActive' ? (v ? 'enabled account' : 'disabled account') : `${k} → ${v}`,
      );
      return `Updated user: ${bits.join(', ') || 'no changes'}`;
    }
    default:
      return e.action;
  }
}
