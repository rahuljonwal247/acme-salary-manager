'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Employee, Meta } from '@/lib/types';
import { EmployeeForm } from './EmployeeForm';
import { SalaryChangeForm } from './SalaryChangeForm';

type Mode = 'idle' | 'salary' | 'edit' | 'status';

/** Action bar on the employee page; opens one inline panel at a time. */
export function EmployeeActions({ employee, meta }: { employee: Employee; meta: Meta }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = employee.status === 'ACTIVE';

  async function toggleStatus() {
    setBusy(true);
    setError(null);
    try {
      await api.setEmployeeActive(employee.id, !active);
      setMode('idle');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {active && (
          <button className="btn-primary" onClick={() => setMode('salary')} aria-expanded={mode === 'salary'}>
            Record salary change
          </button>
        )}
        <button className="btn-secondary" onClick={() => setMode('edit')} aria-expanded={mode === 'edit'}>
          Edit profile
        </button>
        {active ? (
          <button className="btn-danger" onClick={() => setMode('status')} aria-expanded={mode === 'status'}>
            Deactivate
          </button>
        ) : (
          <button className="btn-primary" onClick={toggleStatus} disabled={busy}>
            {busy ? 'Reactivating…' : 'Reactivate'}
          </button>
        )}
      </div>
      {error && mode !== 'status' && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {mode === 'salary' && (
        <section className="card p-5" aria-label="Record salary change">
          <h2 className="mb-1 font-semibold text-slate-900">Record salary change</h2>
          <p className="mb-4 text-xs text-slate-500">Pre-filled with the current package — change what applies.</p>
          <SalaryChangeForm employee={employee} reasons={meta.salaryChangeReasons} onDone={() => setMode('idle')} />
        </section>
      )}

      {mode === 'edit' && (
        <section className="card p-5" aria-label="Edit profile">
          <h2 className="mb-1 font-semibold text-slate-900">Edit profile</h2>
          <p className="mb-4 text-xs text-slate-500">
            Pay changes are recorded separately so each has a date, a reason and an author. Country determines pay currency
            and can&apos;t be edited here.
          </p>
          <EmployeeForm meta={meta} employee={employee} onDone={() => setMode('idle')} />
        </section>
      )}

      {mode === 'status' && (
        <section role="alertdialog" aria-label="Confirm deactivation" className="card border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-950">
            Deactivate <strong>{employee.firstName} {employee.lastName}</strong>? Their record and salary history are kept, but
            they are removed from the dashboard and analytics. You can reactivate them later.
          </p>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button className="btn-secondary" onClick={() => setMode('idle')}>
              Cancel
            </button>
            <button className="btn bg-amber-600 text-white hover:bg-amber-700" onClick={toggleStatus} disabled={busy}>
              {busy ? 'Deactivating…' : 'Yes, deactivate'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
