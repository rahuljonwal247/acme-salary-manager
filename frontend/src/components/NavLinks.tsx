'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard', match: (p: string) => p === '/' },
  { href: '/employees', label: 'Employees', match: (p: string) => p.startsWith('/employees') },
  { href: '/assistant', label: 'AI Assistant', match: (p: string) => p.startsWith('/assistant') },
  { href: '/reports', label: 'Reports', match: (p: string) => p.startsWith('/reports') },
];

const ADMIN_LINKS = [
  { href: '/admin/users', label: 'Users', match: (p: string) => p.startsWith('/admin/users') },
  { href: '/admin/audit', label: 'Audit log', match: (p: string) => p.startsWith('/admin/audit') },
];

export function NavLinks({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, ...ADMIN_LINKS] : LINKS;
  return (
    <nav className="-mx-1 flex max-w-full gap-1 overflow-x-auto" aria-label="Main">
      {links.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
              active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
