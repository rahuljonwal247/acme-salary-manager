import Link from 'next/link';
import { EmployeeForm } from '@/components/EmployeeForm';
import { api } from '@/lib/api';

export const metadata = { title: 'Add employee · ACME Salary Manager' };

export default async function NewEmployeePage() {
  const meta = await api.meta();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/employees" className="text-sm text-slate-500 hover:text-slate-900">
        ← All employees
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Add employee</h1>
        <p className="text-sm text-slate-500">The starting salary is recorded as the first entry in their salary history.</p>
      </div>
      <div className="card p-6">
        <EmployeeForm meta={meta} />
      </div>
    </div>
  );
}
