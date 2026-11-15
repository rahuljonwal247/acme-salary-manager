export type Params = Record<string, string | number | null | undefined>;

/** Builds "?a=1&b=x" skipping empty values; returns "" when nothing is set. */
export function toQueryString(params: Params): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/**
 * Returns a new query string with `changes` applied on top of `current`.
 * Any filter change resets pagination to page 1 unless the change *is* the page.
 */
export function withParams(current: URLSearchParams | Params, changes: Params): string {
  const base: Params =
    current instanceof URLSearchParams ? Object.fromEntries(current.entries()) : { ...current };
  const next: Params = { ...base, ...changes };
  if (!('page' in changes)) delete next.page;
  return toQueryString(next);
}

/** Reads a single string from Next.js searchParams (which may be string | string[]). */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
