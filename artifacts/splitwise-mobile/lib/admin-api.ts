import { authFetch } from "./api";

async function adminGet<T>(path: string): Promise<T> {
  const res = await authFetch(`/api${path}`);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Failed (${res.status})`);
  return data as T;
}

async function adminSend<T>(path: string, method: string, body: unknown): Promise<T> {
  const res = await authFetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Failed (${res.status})`);
  return data as T;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  defaultCurrency: string;
  role: "user" | "superadmin";
  createdAt: string;
}

export interface AdminCurrency {
  code: string;
  name: string;
  symbol: string;
  sortOrder: number;
}

export interface AdminStats {
  users: number;
  groups: number;
  expenses: number;
  payments: number;
  currencies: number;
}

export interface SentNotification {
  type: "admin_broadcast" | "admin_direct";
  title: string;
  body: string;
  createdAt: string;
  recipients: number;
}

export interface AdminUserDetail {
  user: AdminUser & { country: string | null; location: string | null };
  stats: {
    groupCount: number;
    paidCount: number;
    paidTotal: string;
    paymentsSent: number;
    paymentsReceived: number;
  };
  groups: Array<{ id: string; name: string; currency: string; joinedAt: string }>;
  expenses: Array<{
    id: string;
    description: string;
    totalAmount: string;
    currency: string;
    date: string;
    groupId: string | null;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    fromUserId: string;
    toUserId: string;
    note: string | null;
    date: string;
    createdAt: string;
  }>;
}

export const adminApi = {
  stats: () => adminGet<AdminStats>("/admin/stats"),
  listUsers: (q?: string) =>
    adminGet<{ users: AdminUser[] }>(
      `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  getUser: (id: string) => adminGet<AdminUserDetail>(`/admin/users/${id}`),
  listCurrencies: () => adminGet<{ currencies: AdminCurrency[] }>("/admin/currencies"),
  createCurrency: (input: AdminCurrency) =>
    adminSend<AdminCurrency>("/admin/currencies", "POST", input),
  updateCurrency: (code: string, patch: Partial<Omit<AdminCurrency, "code">>) =>
    adminSend<AdminCurrency>(`/admin/currencies/${code}`, "PATCH", patch),
  deleteCurrency: (code: string) =>
    adminSend<void>(`/admin/currencies/${code}`, "DELETE", null),
  sendNotification: (input: { target: "all" | string; title: string; body: string }) =>
    adminSend<{ sent: number }>("/admin/notifications", "POST", input),
  recentNotifications: () =>
    adminGet<{ items: SentNotification[] }>("/admin/notifications/sent"),
};
