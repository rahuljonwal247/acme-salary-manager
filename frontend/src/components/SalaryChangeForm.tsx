'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatPercent, reasonLabel } from '@/lib/format';
import type { Employee, Meta } from '@/lib/types';
import { CompensationFields, computePay, validateCompensation, type CompensationValues } from './CompensationFields';
import { Field } from './Field';

interface Props {
  employee: Employee;
  reasons: Meta['salaryChangeReasons'];
  onDone: () => void;
  /** injectable for deterministic tests */
  today?: string;
}

export function previewChange(current: number, next: number): number | null {
  if (!Number.isFinite(next) || next <= 0 || current <= 0) return null;
  return Math.round(((next - current) / current) * 1000) / 10;
}

/** Record a new pay package. Pre-filled with the current package so HR edits only what changes. */
export function SalaryChangeForm({ employee, reasons, onDone, today = new Date().toISOString().slice(0, 10) }: Props) {
  const router = useRouter();
  const [pay, setPay] = useState<CompensationValues>({
    salary: String(employee.salary),
    allowances: String(employee.allowances),
    bonus: String(employee.bonus),
    deductions: String(employee.deductions),
  });
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [reason, setReason] = useState<string>(reasons[0] ?? 'ANNUAL_REVIEW');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currency = employee.country.currency;
  const next = computePay(pay);
  const pct = next ? previewChange(employee.gross, next.gross) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clientErrors = validateCompensation(pay);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      setError(Object.values(clientErrors)[0]?.[0] ?? 'Check the amounts');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.recordSalaryChange(employee.id, {
        newSalary: Number(pay.salary),
        allowances: Number(pay.allowances),
        bonus: Number(pay.bonus),
        deductions: Number(pay.deductions),
        effectiveDate,
        reason,
      });
      onDone();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.fieldErrors);
      } else setError('Unexpected error — please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <CompensationFields
        values={pay}
        currency={currency}
        errors={errors}
        salaryId="newSalary"
        salaryLabel="New base salary"
        onChange={(k, v) => {
          setPay((p) => ({ ...p, [k]: v }));
          setErrors({});
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="effectiveDate" label="Effective date">
          <input id="effectiveDate" type="date" className="input" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </Field>
        <Field id="reason" label="Reason">
          <select id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {reasonLabel(r)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600" aria-live="polite">
          {pct !== null && pct !== 0 && (
            <>
              Gross pay change:{' '}
              <strong className={pct >= 0 ? 'text-emerald-700' : 'text-red-700'} data-testid="change-preview">
                {formatPercent(pct)}
              </strong>
            </>
          )}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Record change'}
          </button>
        </div>
      </div>
    </form>
  );
}
