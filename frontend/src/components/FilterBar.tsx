'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
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
 *
 * The *pending* query is kept locally (state + ref) rather than re-read from useSearchParams() on every
 * change: useSearchParams() only updates when a navigation commits, so quick successive changes
 * (country → department → title) would otherwise each start from a stale URL and drop earlier choices.
 */
export function FilterBar({ selects, search }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const committed = params.toString();
  const [query, setQuery] = useState(committed);
  const latest = useRef(committed);
  const [term, setTerm] = useState(params.get('search') ?? '');

  // Navigation from elsewhere (back button, links, "clear") resets local state to the URL.
  useEffect(() => {
    latest.current = committed;
    setQuery(committed);
    setTerm(new URLSearchParams(committed).get('search') ?? '');
  }, [committed]);

  const update = (changes: Record<string, string>) => {
    const next = withParams(new URLSearchParams(latest.current), changes);
    latest.current = next.replace(/^\?/, '');
    setQuery(latest.current);
    startTransition(() => router.replace(`${pathname}${next}`));
  };

  // Debounce search so we don't hit the API on every keystroke.
  useEffect(() => {
    if (!search || term === (new URLSearchParams(latest.current).get('search') ?? '')) return;
    const t = setTimeout(() => update({ search: term }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const current = new URLSearchParams(query);
  const active = selects.some((s) => current.get(s.name)) || !!current.get('search');

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
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
            value={current.get(s.name) ?? ''}
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
            latest.current = '';
            setQuery('');
            startTransition(() => router.replace(pathname));
          }}
        >
          Clear filters
        </button>
      )}
      {isPending && <span className="pb-2 text-xs text-slate-500">Updating…</span>}
    </div>
  );
}
