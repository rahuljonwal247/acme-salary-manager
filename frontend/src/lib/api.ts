import { ApiError, createApi, parseResponse, type Requester } from './api-core';

export { ApiError } from './api-core';
export type { EmployeeInput, SalaryChangeInput } from './api-core';

/**
 * Browser transport: calls the same-origin `/bff` proxy, which attaches the httpOnly session cookie as
 * a Bearer token. The token is never readable from JavaScript.
 */
const browserRequest: Requester = async (path, init = {}) => {
  let res: Response;
  try {
    res = await fetch(`/bff${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError('Cannot reach the server', 0);
  }
  if (res.status === 401 && typeof window !== 'undefined') {
    // Session expired or revoked: send the user back to sign in, then here.
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  return parseResponse(res);
};

export const api = createApi(browserRequest);

/** URL for a report download (same-origin, cookie-authenticated). */
export function reportUrl(type: string, query: string): string {
  return `/bff/reports/${type}${query}`;
}
