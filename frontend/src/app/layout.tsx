import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NavLinks } from '@/components/NavLinks';
import { getCurrentUser } from '@/lib/server-api';
import { logout } from './login/actions';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ACME Salary Manager',
  description: 'Manage and understand salaries across ACME',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
            <span className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-600 text-xs font-bold text-white">A</span>
              <span className="hidden sm:inline">ACME Salary Manager</span>
            </span>
            {user && <NavLinks isAdmin={user.role === 'ADMIN'} />}
            {user && (
              <div className="ml-auto flex items-center gap-3 text-sm">
                <span className="hidden text-right leading-tight md:block">
                  <span className="block font-medium text-slate-900" data-testid="current-user">
                    {user.name}
                  </span>
                  <span className="block text-xs text-slate-500">{user.role === 'ADMIN' ? 'Administrator' : 'HR Manager'}</span>
                </span>
                <form action={logout}>
                  <button type="submit" className="btn-secondary px-3 py-1.5">
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
