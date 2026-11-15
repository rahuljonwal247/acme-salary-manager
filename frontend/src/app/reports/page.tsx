import { ReportsPanel } from '@/components/ReportsPanel';
import { serverApi as api } from '@/lib/server-api';

export const metadata = { title: 'Reports · ACME Salary Manager' };

export default async function ReportsPage() {
  const meta = await api.meta();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reports &amp; exports</h1>
        <p className="text-sm text-slate-500">Download CSV or Excel files. Filters below apply to every report.</p>
      </div>
      <ReportsPanel meta={meta} />
    </div>
  );
}
