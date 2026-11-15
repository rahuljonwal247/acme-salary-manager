'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Role, User } from '@/lib/types';
import { Field } from '../Field';

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrator', HR_MANAGER: 'HR Manager' };

function NewUserForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({ name: '', email: '', role: 'HR_MANAGER' as Role, password: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createUser(v);
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5" aria-label="New user" noValidate>
      <h2 className="font-semibold text-slate-900">New user</h2>
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="u-name" label="Full name">
          <input id="u-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field id="u-email" label="Email">
          <input id="u-email" type="email" className="input" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <Field id="u-role" label="Role">
          <select id="u-role" className="input" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })}>
            <option value="HR_MANAGER">HR Manager</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </Field>
        <Field id="u-password" label="Initial password" hint="At least 10 characters with a letter and a number">
          <input
            id="u-password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={v.password}
            onChange={(e) => setV({ ...v, password: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Creating…' : 'Create user'}
        </button>
      </div>
    </form>
  );
}

function UserRow({ user, isMe }: { user: User; isMe: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  async function patch(p: Parameters<typeof api.updateUser>[1], message: string) {
    setError(null);
    setNotice(null);
    try {
      await api.updateUser(user.id, p);
      setNotice(message);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
      return false;
    }
  }

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">
          {user.name} {isMe && <span className="text-xs font-normal text-slate-500">(you)</span>}
        </div>
        <div className="text-xs text-slate-500">{user.email}</div>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-1 text-xs text-emerald-700">
            {notice}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <label className="sr-only" htmlFor={`role-${user.id}`}>
          Role for {user.name}
        </label>
        <select
          id={`role-${user.id}`}
          className="input py-1"
          value={user.role}
          disabled={isMe}
          onChange={(e) => patch({ role: e.target.value as Role }, `Role changed to ${ROLE_LABEL[e.target.value as Role]}`)}
        >
          <option value="HR_MANAGER">HR Manager</option>
          <option value="ADMIN">Administrator</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <span className={`text-sm ${user.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>{user.isActive ? 'Active' : 'Disabled'}</span>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-500">
        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          {!isMe && (
            <button
              className={user.isActive ? 'btn-danger px-3 py-1.5' : 'btn-secondary px-3 py-1.5'}
              onClick={() => patch({ isActive: !user.isActive }, user.isActive ? 'Account disabled' : 'Account enabled')}
            >
              {user.isActive ? 'Disable' : 'Enable'}
            </button>
          )}
          <button className="btn-secondary px-3 py-1.5" onClick={() => setResetting((r) => !r)} aria-expanded={resetting}>
            Reset password
          </button>
        </div>
        {resetting && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await patch({ password }, 'Password reset')) {
                setResetting(false);
                setPassword('');
              }
            }}
          >
            <label className="sr-only" htmlFor={`pw-${user.id}`}>
              New password for {user.name}
            </label>
            <input
              id={`pw-${user.id}`}
              type="password"
              autoComplete="new-password"
              className="input py-1"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn-primary px-3 py-1.5" type="submit">
              Save
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}

export function UserAdmin({ users, currentUserId }: { users: User[]; currentUserId: number }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      {creating ? (
        <NewUserForm onDone={() => setCreating(false)} />
      ) : (
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + New user
        </button>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium">User</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Role</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Last sign-in</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <UserRow key={u.id} user={u} isMe={u.id === currentUserId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
