'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Insights', match: (p: string) => p === '/' },
  { href: '/employees', label: 'Employees', match: (p: string) => p.startsWith('/employees') },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
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
