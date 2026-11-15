'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, type EmployeeInput } from '@/lib/api';
import { toDateInput } from '@/lib/format';
import type { Employee, Meta } from '@/lib/types';
import { Field } from './Field';

interface Props {
  meta: Meta;
  /** when provided the form edits this employee's profile (salary & country are not editable here) */
  employee?: Employee;
  onDone?: () => void;
}

type Errors = Record<string, string[]>;

/** Client-side checks mirror the API's so users get instant feedback; the API remains the authority. */
export function validateEmployee(values: Record<string, string>, isEdit: boolean): Errors {
  const errors: Errors = {};
  const required = ['firstName', 'lastName', 'email', 'department', 'jobTitle', 'hireDate'];
  if (!isEdit) required.push('countryCode', 'salary');
  for (const f of required) if (!values[f]?.trim()) errors[f] = ['Required'];
  if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) errors.email = ['Invalid email address'];
  if (!isEdit && values.salary) {
    const n = Number(values.salary);
    if (!Number.isInteger(n) || n <= 0) errors.salary = ['Enter a whole number greater than zero'];
  }
  return errors;
}

export function EmployeeForm({ meta, employee, onDone }: Props) {
  const router = useRouter();
  const isEdit = !!employee;
  const [values, setValues] = useState<Record<string, string>>({
    firstName: employee?.firstName ?? '',
    lastName: employee?.lastName ?? '',
    email: employee?.email ?? '',
    department: employee?.department ?? '',
    jobTitle: employee?.jobTitle ?? '',
    countryCode: employee?.countryCode ?? '',
    hireDate: employee ? toDateInput(employee.hireDate) : '',
    salary: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const titles = meta.departments.find((d) => d.name === values.department)?.jobTitles ?? [];
  const currency = meta.countries.find((c) => c.code === values.countryCode)?.currency;

  const set = (name: string, value: string) => {
    setValues((v) => {
      const next = { ...v, [name]: value };
      // Changing department invalidates a title that doesn't belong to it.
      if (name === 'department') {
        const valid = meta.departments.find((d) => d.name === value)?.jobTitles ?? [];
        if (!valid.includes(next.jobTitle ?? '')) next.jobTitle = '';
      }
      return next;
    });
    setErrors((e) => ({ ...e, [name]: [] }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const clientErrors = validateEmployee(values, isEdit);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }
    setSaving(true);
    try {
      const common = {
        firstName: values.firstName!.trim(),
        lastName: values.lastName!.trim(),
        email: values.email!.trim(),
        department: values.department!,
        jobTitle: values.jobTitle!,
        hireDate: values.hireDate!,
      };
      if (employee) {
        await api.updateEmployee(employee.id, common);
        onDone?.();
        router.refresh();
      } else {
        const input: EmployeeInput = { ...common, countryCode: values.countryCode!, salary: Number(values.salary) };
        const created = await api.createEmployee(input);
        router.push(`/employees/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else {
        setFormError('Unexpected error — please try again');
      }
    } finally {
      setSaving(false);
    }
  }

  const input = (name: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      id={name}
      name={name}
      className="input"
      value={values[name]}
      onChange={(e) => set(name, e.target.value)}
      aria-invalid={!!errors[name]?.length}
      aria-describedby={errors[name]?.length ? `${name}-error` : undefined}
      {...props}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {formError}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="First name" error={errors.firstName}>
          {input('firstName', { autoComplete: 'off' })}
        </Field>
        <Field id="lastName" label="Last name" error={errors.lastName}>
          {input('lastName', { autoComplete: 'off' })}
        </Field>
        <Field id="email" label="Work email" error={errors.email}>
          {input('email', { type: 'email', autoComplete: 'off' })}
        </Field>
        <Field id="hireDate" label="Hire date" error={errors.hireDate}>
          {input('hireDate', { type: 'date' })}
        </Field>
        <Field id="department" label="Department" error={errors.department}>
          <select
            id="department"
            className="input"
            value={values.department}
            onChange={(e) => set('department', e.target.value)}
            aria-invalid={!!errors.department?.length}
          >
            <option value="">Select department…</option>
            {meta.departments.map((d) => (
              <option key={d.name}>{d.name}</option>
            ))}
          </select>
        </Field>
        <Field id="jobTitle" label="Job title" error={errors.jobTitle} hint={!values.department ? 'Choose a department first' : undefined}>
          <select
            id="jobTitle"
            className="input"
            value={values.jobTitle}
            onChange={(e) => set('jobTitle', e.target.value)}
            disabled={!values.department}
            aria-invalid={!!errors.jobTitle?.length}
          >
            <option value="">Select job title…</option>
            {titles.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        {!isEdit && (
          <>
            <Field id="countryCode" label="Country" error={errors.countryCode} hint="Determines the pay currency">
              <select
                id="countryCode"
                className="input"
                value={values.countryCode}
                onChange={(e) => set('countryCode', e.target.value)}
                aria-invalid={!!errors.countryCode?.length}
              >
                <option value="">Select country…</option>
                {meta.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.currency})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="salary"
              label={`Annual base salary${currency ? ` (${currency})` : ''}`}
              error={errors.salary}
              hint="Whole units of local currency"
            >
              {input('salary', { type: 'number', inputMode: 'numeric', min: 1, step: 1 })}
            </Field>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2">
        {onDone && (
          <button type="button" className="btn-secondary" onClick={onDone}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create employee'}
        </button>
      </div>
    </form>
  );
}
