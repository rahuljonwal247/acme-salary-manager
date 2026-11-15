'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Employee, Meta } from '@/lib/types';
import { EmployeeForm } from './EmployeeForm';
import { SalaryChangeForm } from './SalaryChangeForm';

type Mode = 'idle' | 'salary' | 'edit' | 'delete';

/** Action bar on the employee page; opens one inline panel at a time. */
export function EmployeeActions({ employee, meta }: { employee: Employee; meta: Meta }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setDeleting(true);
    try {
      await api.deleteEmployee(employee.id);
      router.push('/employees');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setMode('salary')} aria-expanded={mode === 'salary'}>
          Record salary change
        </button>
        <button className="btn-secondary" onClick={() => setMode('edit')} aria-expanded={mode === 'edit'}>
          Edit profile
        </button>
        <button className="btn-danger" onClick={() => setMode('delete')} aria-expanded={mode === 'delete'}>
          Delete
        </button>
      </div>

      {mode === 'salary' && (
        <section className="card p-5" aria-label="Record salary change">
          <h2 className="mb-4 font-semibold text-slate-900">Record salary change</h2>
          <SalaryChangeForm employee={employee} reasons={meta.salaryChangeReasons} onDone={() => setMode('idle')} />
        </section>
      )}

      {mode === 'edit' && (
        <section className="card p-5" aria-label="Edit profile">
          <h2 className="mb-1 font-semibold text-slate-900">Edit profile</h2>
          <p className="mb-4 text-xs text-slate-500">
            Salary changes are recorded separately so each has a date and reason. Country determines pay currency and
            can&apos;t be edited here.
          </p>
          <EmployeeForm meta={meta} employee={employee} onDone={() => setMode('idle')} />
        </section>
      )}

      {mode === 'delete' && (
        <section role="alertdialog" aria-label="Confirm delete" className="card border-red-200 bg-red-50 p-5">
          <p className="text-sm text-red-900">
            Permanently delete <strong>{employee.firstName} {employee.lastName}</strong> and their salary history? This
            cannot be undone.
          </p>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button className="btn-secondary" onClick={() => setMode('idle')}>
              Cancel
            </button>
            <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={onDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
