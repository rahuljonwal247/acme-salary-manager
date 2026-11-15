'use client';

import { formatMoney } from '@/lib/format';
import { Field } from './Field';

export interface CompensationValues {
  salary: string;
  allowances: string;
  bonus: string;
  deductions: string;
}

export const EMPTY_COMPENSATION: CompensationValues = { salary: '', allowances: '0', bonus: '0', deductions: '0' };

const toInt = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** Gross/net preview from form strings; null when any amount is not a valid whole number. */
export function computePay(v: CompensationValues): { gross: number; net: number } | null {
  const [s, a, b, d] = [v.salary, v.allowances, v.bonus, v.deductions].map(toInt);
  if ([s, a, b, d].some((n) => !Number.isInteger(n) || (n as number) < 0)) return null;
  const gross = (s as number) + (a as number) + (b as number);
  return { gross, net: gross - (d as number) };
}

export function validateCompensation(v: CompensationValues): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const check = (key: keyof CompensationValues, label: string, positive = false) => {
    const n = toInt(v[key]);
    if (!Number.isInteger(n) || n < (positive ? 1 : 0)) {
      errors[key === 'salary' ? 'salary' : key] = [positive ? `${label} must be a whole number greater than zero` : `${label} must be a whole number (0 or more)`];
    }
  };
  check('salary', 'Base salary', true);
  check('allowances', 'Allowances');
  check('bonus', 'Bonus');
  check('deductions', 'Deductions');
  const pay = computePay(v);
  if (pay && pay.net < 0) errors.deductions = ['Deductions cannot exceed gross pay'];
  return errors;
}

interface Props {
  values: CompensationValues;
  onChange: (key: keyof CompensationValues, value: string) => void;
  currency?: string;
  errors: Record<string, string[] | undefined>;
  /** field id/name for the base salary input (API name differs between create and change) */
  salaryId?: string;
  salaryLabel?: string;
  salaryHint?: string;
}

/** Four annual amounts with a live gross/net preview. */
export function CompensationFields({ values, onChange, currency, errors, salaryId = 'salary', salaryLabel = 'Base salary', salaryHint }: Props) {
  const pay = computePay(values);
  const suffix = currency ? ` (${currency})` : '';
  const input = (key: keyof CompensationValues, id: string) => (
    <input
      id={id}
      name={id}
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      className="input"
      value={values[key]}
      onChange={(e) => onChange(key, e.target.value)}
      aria-invalid={!!errors[key === 'salary' ? salaryId : key]?.length}
    />
  );
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-slate-900">Annual compensation{suffix}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id={salaryId} label={`${salaryLabel}${suffix}`} error={errors[salaryId] ?? errors.salary} hint={salaryHint}>
          {input('salary', salaryId)}
        </Field>
        <Field id="allowances" label="Allowances" error={errors.allowances}>
          {input('allowances', 'allowances')}
        </Field>
        <Field id="bonus" label="Bonus" error={errors.bonus}>
          {input('bonus', 'bonus')}
        </Field>
        <Field id="deductions" label="Deductions" error={errors.deductions}>
          {input('deductions', 'deductions')}
        </Field>
      </div>
      <p className="text-sm text-slate-600" aria-live="polite" data-testid="pay-preview">
        {pay && currency ? (
          <>
            Gross <strong className="text-slate-900">{formatMoney(pay.gross, currency)}</strong> · Net{' '}
            <strong className={pay.net < 0 ? 'text-red-700' : 'text-slate-900'}>{formatMoney(pay.net, currency)}</strong>
          </>
        ) : (
          'Gross = base + allowances + bonus · Net = gross − deductions'
        )}
      </p>
    </fieldset>
  );
}
