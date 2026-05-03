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
  emailVerifiedAt: string | null;
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
  user: AdminUser & { country: string | null };
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
  month: string;
  newUsers: number;
  expenses: number;
  payments: number;
  activeUsers: number;
}

export const adminApi = {
  stats: () => adminGet<AdminStats>("/admin/stats"),
  monthly: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return adminGet<{
      range: { from: string; to: string };
      months: MonthlyAnalyticsItem[];
    }>(`/admin/analytics/monthly${suffix}`);
  },
  listUsers: (params?: { q?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return adminGet<{
      users: AdminUser[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/admin/users${suffix}`);
  },
  getUser: (id: string) => adminGet<AdminUserDetail>(`/admin/users/${id}`),
  verifyUserEmail: (id: string) =>
    adminSend<{ id: string; emailVerifiedAt: string | null; alreadyVerified: boolean }>(
      `/admin/users/${id}/verify-email`,
      "POST",
      null,
    ),
  forceLogoutUser: (id: string) =>
    adminSend<{ id: string; tokenVersion: number }>(
      `/admin/users/${id}/force-logout`,
      "POST",
      null,
    ),
  forceLogoutAll: (password: string) =>
    adminSend<{ count: number }>(`/admin/users/force-logout-all`, "POST", { password }),
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
  listReferrals: (q?: string) =>
    adminGet<{ referrals: ReferralRow[]; topReferrers: TopReferrer[] }>(
      `/admin/referrals${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  getSmtp: () => adminGet<SmtpSettings>("/admin/settings/smtp"),
  putSmtp: (input: SmtpSettingsInput) =>
    adminSend<SmtpSettings>("/admin/settings/smtp", "PUT", input),
  testSmtp: (to: string) =>
    adminSend<{ ok: boolean; messageId?: string; error?: string }>(
      "/admin/settings/smtp/test",
      "POST",
      { to },
    ),
};

export interface ReferralRow {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    createdAt: string;
  };
  referrer: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface TopReferrer {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  count: number;
}

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  hasPassword: boolean;
  fromAddress: string;
  fromName: string;
  appPublicUrl: string;
  updatedAt: string | null;
}

export interface SmtpSettingsInput {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  /** Empty string means "leave password unchanged". */
  password: string;
  fromAddress: string;
  fromName: string;
  appPublicUrl: string;
}
