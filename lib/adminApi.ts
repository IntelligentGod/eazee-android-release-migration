import { SERVER_URL } from '@/config/backend';
import { auth } from '@/firebaseConfig';
import { getFirebaseAppCheckHeaders } from '@/lib/firebaseAppCheck';
import type { PurchaseRecord, ProductDisplaySettings, ServerSubscription } from '@/lib/subscriptionApi';
import type { SubscriptionLimits } from '@/lib/subscriptionLimits';
import type { UserRole } from '@/lib/userRole';

/** The server refused: this account does not have the admin role. */
export class AdminAccessError extends Error {}

/** The server refused a role change, e.g. changing your own role; `message` says why. */
export class RoleChangeRefusedError extends Error {}

/** Every admin call goes through the server, which checks the `admin` claim on the ID token. */
async function adminRequest<T>(path: string, init: { method?: 'GET' | 'PUT' | 'POST'; body?: unknown } = {}): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) throw new AdminAccessError('Sign in to use the admin panel');
  const response = await fetch(`${SERVER_URL}/admin${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...await getFirebaseAppCheckHeaders(),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await response.json().catch(() => null);
  if (response.status === 400 && body?.code) {
    throw new RoleChangeRefusedError(typeof body?.error === 'string' ? body.error : 'The change was refused');
  }
  if (response.status === 401 || response.status === 403) {
    throw new AdminAccessError(typeof body?.error === 'string' ? body.error : 'Admin access required');
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'The admin request failed');
  }
  return body as T;
}

const toQuery = (params: Record<string, string | number | null | undefined>) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return entries.length
    ? `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')}`
    : '';
};

export type AdminUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  providers: string[];
  createdAt: number | null;
  subscription: ServerSubscription;
};

export type AdminPurchase = PurchaseRecord & { uid: string; email: string | null };

export type AdminUserDetail = {
  auth: {
    uid: string;
    email: string | null;
    displayName: string | null;
    providers: string[];
    createdAt: number | null;
    lastSignInAt: number | null;
    disabled: boolean;
    role: UserRole;
  } | null;
  user: AdminUser | null;
  transactions: AdminPurchase[];
  usage: {
    day: string;
    aiActions: number;
    voiceSeconds: number;
    guidanceGoal: number;
    guidanceTask: number;
    guidanceRecipeSkill: number;
    guidanceQuestions: number;
  }[];
};

export type Money = Record<string, number>;

export type IncomeBucket = {
  period: string;
  count: number;
  refundCount: number;
  gross: Money;
  refunds: Money;
  net: Money;
  byProduct: Record<string, { count: number; gross: Money }>;
};

export type IncomeReport = {
  from: string;
  to: string;
  estimated: true;
  note: string;
  environment: string;
  granularity: 'day' | 'month';
  buckets: IncomeBucket[];
  totals: IncomeBucket;
  subscribers: {
    active: number;
    cancelled: number;
    billingRetry: number;
    trial: number;
    byPlan: { monthly: number; yearly: number };
    mrr: Money;
  };
};

export type AdminConfig = {
  limits: SubscriptionLimits;
  products: ProductDisplaySettings;
  updatedAt: number | null;
  updatedBy: string | null;
};

export type RoleChange = {
  id: string;
  targetUid: string;
  targetEmail: string | null;
  from: UserRole;
  to: UserRole;
  changedBy: string;
  changedByEmail: string | null;
  at: number;
};

export type AdminEnvironment = 'Production' | 'Sandbox' | 'Xcode';

export const ADMIN_ENVIRONMENT_OPTIONS: { value: AdminEnvironment; label: string }[] = [
  { value: 'Production', label: 'Production' },
  { value: 'Sandbox', label: 'Sandbox' },
  { value: 'Xcode', label: 'Xcode (local)' },
];

export const adminApi = {
  me: () => adminRequest<{ uid: string; email: string | null; role: UserRole }>('/me'),
  users: (params: { search?: string; role?: 'admin' | 'customer'; cursor?: string | null }) =>
    adminRequest<{ users: AdminUser[]; nextCursor: string | null }>(`/users${toQuery(params)}`),
  user: (uid: string) => adminRequest<AdminUserDetail>(`/users/${encodeURIComponent(uid)}`),
  purchases: (params: {
    productId?: string;
    status?: PurchaseRecord['status'];
    environment?: AdminEnvironment;
    from?: string;
    to?: string;
    cursor?: string | null;
  }) => adminRequest<{ purchases: AdminPurchase[]; nextCursor: string | null }>(`/purchases${toQuery(params)}`),
  income: (params: { granularity: 'day' | 'month'; environment: AdminEnvironment; from?: string; to?: string }) =>
    adminRequest<IncomeReport>(`/income${toQuery(params)}`),
  /** Super admin only: customer <-> admin. The server refuses your own role and the super admin's. */
  setRole: (uid: string, role: 'customer' | 'admin') =>
    adminRequest<{ changed: boolean; from: UserRole; to: UserRole }>(`/users/${encodeURIComponent(uid)}/role`, { method: 'POST', body: { role } }),
  roleChanges: (cursor?: string | null) =>
    adminRequest<{ changes: RoleChange[]; nextCursor: string | null }>(`/role-changes${toQuery({ cursor })}`),
  config: () => adminRequest<AdminConfig>('/config'),
  saveLimits: (limits: SubscriptionLimits) => adminRequest<AdminConfig>('/config/limits', { method: 'PUT', body: { limits } }),
  saveProducts: (products: ProductDisplaySettings) =>
    adminRequest<AdminConfig>('/config/products', { method: 'PUT', body: { products } }),
};
