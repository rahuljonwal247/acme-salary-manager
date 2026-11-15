import { UserAdmin } from '@/components/admin/UserAdmin';
import { requireAdmin, serverApi as api } from '@/lib/server-api';

export const metadata = { title: 'Users · ACME Salary Manager' };

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await api.listUsers();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Users &amp; access</h1>
        <p className="text-sm text-slate-500">
          Administrators manage accounts and roles. HR Managers work with employees, salaries, reports and the assistant.
        </p>
      </div>
      <UserAdmin users={users} currentUserId={me.id} />
    </div>
  );
}
