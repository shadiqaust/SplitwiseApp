// Thin fetch helpers for the /api/admin/* endpoints. We keep these out of the
// orval-generated client so admin can ship without a codegen round-trip.
const TOKEN_KEY = "sw_auth_token";

function getToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
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

export interface MonthlyAnalyticsItem {
  month: string; // "YYYY-MM"
  newUsers: number;
  expenses: number;
  payments: number;
  activeUsers: number;
}

export const adminApi = {
  stats: () => adminFetch<AdminStats>("/admin/stats"),
  monthly: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return adminFetch<{
      range: { from: string; to: string };
      months: MonthlyAnalyticsItem[];
    }>(`/admin/analytics/monthly${suffix}`);
  },
  listUsers: (q?: string) =>
    adminFetch<{ users: AdminUser[] }>(
      `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  getUser: (id: string) => adminFetch<AdminUserDetail>(`/admin/users/${id}`),
  listCurrencies: () =>
    adminFetch<{ currencies: AdminCurrency[] }>("/admin/currencies"),
  createCurrency: (input: AdminCurrency) =>
    adminFetch<AdminCurrency>("/admin/currencies", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCurrency: (code: string, patch: Partial<Omit<AdminCurrency, "code">>) =>
    adminFetch<AdminCurrency>(`/admin/currencies/${code}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteCurrency: (code: string) =>
    adminFetch<void>(`/admin/currencies/${code}`, { method: "DELETE" }),
  sendNotification: (input: { target: "all" | string; title: string; body: string }) =>
    adminFetch<{ sent: number }>("/admin/notifications", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  recentNotifications: () =>
    adminFetch<{ items: SentNotification[] }>("/admin/notifications/sent"),
};
