import { toQueryString, type Params } from './query';
import type {
  Benchmark,
  BreakdownDimension,
  BreakdownItem,
  DistributionBucket,
  Employee,
  EmployeeListItem,
  Meta,
  Page,
  Summary,
} from './types';

/**
 * Server components may use an internal URL (API_URL, e.g. a private network address);
 * the browser always uses the public one.
 */
const BASE_URL =
  (typeof window === 'undefined' ? process.env.API_URL : undefined) ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError('Cannot reach the API server', 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      body?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      body?.error?.details?.fieldErrors ?? {},
    );
  }
  return body as T;
}

export interface EmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  hireDate: string;
  salary: number;
}

export interface SalaryChangeInput {
  newSalary: number;
  effectiveDate: string;
  reason: string;
}

export const api = {
  meta: () => request<Meta>('/meta'),

  listEmployees: (params: Params) => request<Page<EmployeeListItem>>(`/employees${toQueryString(params)}`),
  getEmployee: (id: number) => request<Employee>(`/employees/${id}`),
  createEmployee: (input: EmployeeInput) =>
    request<Employee>('/employees', { method: 'POST', body: JSON.stringify(input) }),
  updateEmployee: (id: number, patch: Partial<Omit<EmployeeInput, 'salary' | 'countryCode'>>) =>
    request<Employee>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteEmployee: (id: number) => request<void>(`/employees/${id}`, { method: 'DELETE' }),
  recordSalaryChange: (id: number, input: SalaryChangeInput) =>
    request<Employee>(`/employees/${id}/salary-changes`, { method: 'POST', body: JSON.stringify(input) }),

  summary: (filter: Params) => request<Summary>(`/insights/summary${toQueryString(filter)}`),
  breakdown: (by: BreakdownDimension, filter: Params) =>
    request<BreakdownItem[]>(`/insights/breakdown${toQueryString({ ...filter, by })}`),
  distribution: (filter: Params) => request<DistributionBucket[]>(`/insights/distribution${toQueryString(filter)}`),
  benchmark: (country: string, jobTitle: string, salary?: number) =>
    request<Benchmark>(`/insights/benchmark${toQueryString({ country, jobTitle, salary })}`),
};
