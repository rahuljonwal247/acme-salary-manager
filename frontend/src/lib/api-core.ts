import { toQueryString, type Params } from './query';
import type {
  AssistantAnswer,
  AuditPage,
  Benchmark,
  BreakdownDimension,
  BreakdownItem,
  DistributionBucket,
  Employee,
  EmployeeListItem,
  Meta,
  Page,
  Role,
  Summary,
  TopEarner,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

/** Transport: performs a JSON request against `/api${path}` and returns the parsed body. */
export type Requester = <T>(path: string, init?: RequestInit) => Promise<T>;

/** Shared response handling for both the browser and the server transports. */
export async function parseResponse<T>(res: Response): Promise<T> {
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

export interface Compensation {
  salary: number;
  allowances: number;
  bonus: number;
  deductions: number;
}

export interface EmployeeInput extends Compensation {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  hireDate: string;
}

export interface SalaryChangeInput {
  newSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  effectiveDate: string;
  reason: string;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** Typed API surface; the transport decides how auth is attached. */
export function createApi(request: Requester) {
  return {
    me: () => request<User>('/auth/me'),
    meta: () => request<Meta>('/meta'),

    listEmployees: (params: Params) => request<Page<EmployeeListItem>>(`/employees${toQueryString(params)}`),
    getEmployee: (id: number) => request<Employee>(`/employees/${id}`),
    employeeAudit: (id: number) => request<AuditPage>(`/employees/${id}/audit`),
    createEmployee: (input: EmployeeInput) => request<Employee>('/employees', json('POST', input)),
    updateEmployee: (id: number, patch: Partial<Omit<EmployeeInput, keyof Compensation | 'countryCode'>>) =>
      request<Employee>(`/employees/${id}`, json('PATCH', patch)),
    setEmployeeActive: (id: number, active: boolean) =>
      request<Employee>(`/employees/${id}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST' }),
    recordSalaryChange: (id: number, input: SalaryChangeInput) =>
      request<Employee>(`/employees/${id}/salary-changes`, json('POST', input)),

    summary: (filter: Params) => request<Summary>(`/insights/summary${toQueryString(filter)}`),
    breakdown: (by: BreakdownDimension, filter: Params) =>
      request<BreakdownItem[]>(`/insights/breakdown${toQueryString({ ...filter, by })}`),
    distribution: (filter: Params) => request<DistributionBucket[]>(`/insights/distribution${toQueryString(filter)}`),
    topEarners: (filter: Params, limit = 10) =>
      request<TopEarner[]>(`/insights/top-earners${toQueryString({ ...filter, limit })}`),
    benchmark: (country: string, jobTitle: string, salary?: number) =>
      request<Benchmark>(`/insights/benchmark${toQueryString({ country, jobTitle, salary })}`),

    ask: (question: string) => request<AssistantAnswer>('/assistant/ask', json('POST', { question })),

    listUsers: () => request<User[]>('/users'),
    createUser: (input: { email: string; name: string; role: Role; password: string }) =>
      request<User>('/users', json('POST', input)),
    updateUser: (id: number, patch: Partial<{ name: string; role: Role; isActive: boolean; password: string }>) =>
      request<User>(`/users/${id}`, json('PATCH', patch)),
    auditLogs: (params: Params) => request<AuditPage>(`/audit-logs${toQueryString(params)}`),
  };
}

export type Api = ReturnType<typeof createApi>;
