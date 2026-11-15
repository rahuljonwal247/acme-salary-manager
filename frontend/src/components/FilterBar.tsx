'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { withParams } from '@/lib/query';

export interface FilterSelect {
  name: string;
  label: string;
  /** label shown for "no filter" */
  allLabel: string;
  options: { value: string; label: string }[];
  /** other params to reset when this one changes (e.g. department clears jobTitle) */
  clears?: string[];
}

interface Props {
  selects: FilterSelect[];
  /** show a debounced free-text search bound to ?search= */
  search?: { placeholder: string };
}

/**
 * Filters live in the URL so views are shareable and the back button works.
 * Server components re-render with the new searchParams.
 */
export function FilterBar({ selects, search }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(params.get('search') ?? '');

  const update = (changes: Record<string, string>) => {
    startTransition(() => router.replace(`${pathname}${withParams(new URLSearchParams(params), changes)}`));
  };

  // Debounce search so we don't hit the API on every keystroke.
  useEffect(() => {
    if (!search || term === (params.get('search') ?? '')) return;
    const t = setTimeout(() => update({ search: term }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const active = selects.some((s) => params.get(s.name)) || !!params.get('search');

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      {search && (
        <div className="min-w-56 flex-1">
          <label htmlFor="filter-search" className="label">
            Search
          </label>
          <input
            id="filter-search"
            type="search"
            className="input"
            placeholder={search.placeholder}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
      )}
      {selects.map((s) => (
        <div key={s.name} className="min-w-44">
          <label htmlFor={`filter-${s.name}`} className="label">
            {s.label}
          </label>
          <select
            id={`filter-${s.name}`}
            className="input"
            value={params.get(s.name) ?? ''}
            onChange={(e) =>
              update({ [s.name]: e.target.value, ...Object.fromEntries((s.clears ?? []).map((c) => [c, ''])) })
            }
          >
            <option value="">{s.allLabel}</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {active && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setTerm('');
            startTransition(() => router.replace(pathname));
          }}
        >
          Clear filters
        </button>
      )}
      {pending && <span className="pb-2 text-xs text-slate-500">Updating…</span>}
    </div>
  );
}
