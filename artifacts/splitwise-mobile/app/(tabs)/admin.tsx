import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect } from "react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { adminApi, type AdminCurrency, type SmtpSettingsInput } from "@/lib/admin-api";

type Tab = "analytics" | "users" | "currencies" | "notifications" | "referrals" | "email";

const SMTP_PRESETS: Record<
  string,
  { label: string; host: string; port: number; secure: boolean; hint?: string }
> = {
  gmail: { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 587, secure: false, hint: "Use a 16-char App Password (Google Account → Security → 2-Step → App passwords)." },
  outlook: { label: "Outlook / Microsoft 365", host: "smtp.office365.com", port: 587, secure: false, hint: "SMTP AUTH must be enabled on the mailbox." },
  yahoo: { label: "Yahoo Mail", host: "smtp.mail.yahoo.com", port: 465, secure: true, hint: "Generate an App Password in Yahoo Account Security." },
  icloud: { label: "iCloud Mail", host: "smtp.mail.me.com", port: 587, secure: false, hint: "Use an app-specific password from appleid.apple.com." },
  zoho: { label: "Zoho Mail", host: "smtp.zoho.com", port: 465, secure: true, hint: "For zoho.eu use smtp.zoho.eu." },
  sendgrid: { label: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false, hint: "Username = `apikey`, password = your API key." },
  mailgun: { label: "Mailgun", host: "smtp.mailgun.org", port: 587, secure: false, hint: "Use the SMTP credentials from your Mailgun domain." },
  ses: { label: "Amazon SES (us-east-1)", host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false, hint: "Replace the region in the host. Use SMTP credentials, not AWS keys." },
  postmark: { label: "Postmark", host: "smtp.postmarkapp.com", port: 587, secure: false, hint: "Username = password = Server API token." },
  resend: { label: "Resend", host: "smtp.resend.com", port: 465, secure: true, hint: "Username = `resend`, password = your API key." },
  brevo: { label: "Brevo (Sendinblue)", host: "smtp-relay.brevo.com", port: 587, secure: false, hint: "Use the SMTP key from Brevo → SMTP & API." },
  mailtrap: { label: "Mailtrap (sandbox)", host: "sandbox.smtp.mailtrap.io", port: 2525, secure: false, hint: "Catches every email — perfect for testing." },
};

export default function AdminScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("analytics");

  if (user?.role !== "superadmin") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Admin access required.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabsScroll, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabs}
      >
        {(["analytics", "users", "currencies", "notifications", "referrals", "email"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[
              styles.tabBtn,
              tab === t && { borderBottomColor: colors.primary },
            ]}
          >
            <Text
              style={{
                color: tab === t ? colors.primary : colors.mutedForeground,
                fontFamily: "Inter_600SemiBold",
                textTransform: "capitalize",
              }}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {tab === "analytics" && <AnalyticsTab />}
      {tab === "users" && <UsersTab onOpen={(id) => router.push(`/admin-user/${id}` as never)} />}
      {tab === "currencies" && <CurrenciesTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "referrals" && <ReferralsTab onOpen={(id) => router.push(`/admin-user/${id}` as never)} />}
      {tab === "email" && <EmailSettingsTab />}
    </View>
  );
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isoMonthsAgo(n: number): string {
  const now = new Date();
  return toLocalISODate(new Date(now.getFullYear(), now.getMonth() - n, 1));
}
function todayIso(): string {
  return toLocalISODate(new Date());
}

function AnalyticsTab() {
  const colors = useColors();
  const [from, setFrom] = useState<string>(isoMonthsAgo(11));
  const [to, setTo] = useState<string>(todayIso());

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "monthly", from, to],
    queryFn: () => adminApi.monthly({ from, to }),
  });

  const presets: { label: string; months: number }[] = [
    { label: "3mo", months: 2 },
    { label: "6mo", months: 5 },
    { label: "12mo", months: 11 },
    { label: "24mo", months: 23 },
  ];

  const months = data?.months ?? [];
  const totals = months.reduce(
    (a, m) => ({
      users: a.users + m.newUsers,
      expenses: a.expenses + m.expenses,
      payments: a.payments + m.payments,
    }),
    { users: 0, expenses: 0, payments: 0 },
  );
  const maxNewUsers = Math.max(1, ...months.map((m) => m.newUsers));
  const maxActivity = Math.max(
    1,
    ...months.map((m) => m.expenses + m.payments),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Filter row */}
      <View
        style={{
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          backgroundColor: colors.card,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 4 }}>From</Text>
            <TextInput
              value={from}
              onChangeText={setFrom}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.background,
                },
              ]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 4 }}>To</Text>
            <TextInput
              value={to}
              onChangeText={setTo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.background,
                },
              ]}
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {presets.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => {
                setFrom(isoMonthsAgo(p.months));
                setTo(todayIso());
              }}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 6,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 12 }}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading && <ActivityIndicator color={colors.primary} />}

      {/* Summary cards */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          { label: "New users (12mo)", value: totals.users },
          { label: "Expenses", value: totals.expenses },
          { label: "Payments", value: totals.payments },
        ].map((c) => (
          <View
            key={c.label}
            style={{
              flex: 1,
              padding: 12,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              backgroundColor: colors.card,
            }}
          >
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 20 }}>
              {c.value}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>

      {/* New users bar chart */}
      <View
        style={{
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          backgroundColor: colors.card,
        }}
      >
        <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 12 }}>
          New registrations
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 120, gap: 4 }}>
          {months.map((m) => (
            <View key={m.month} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <View
                style={{
                  width: "100%",
                  height: Math.round((m.newUsers / maxNewUsers) * 100) || 2,
                  backgroundColor: colors.primary,
                  borderRadius: 3,
                }}
              />
              <Text style={{ color: colors.mutedForeground, fontSize: 9 }} numberOfLines={1}>
                {formatMonthLabel(m.month).split(" ")[0]}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Activity bars (expenses + payments stacked visually as totals) */}
      <View
        style={{
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          backgroundColor: colors.card,
        }}
      >
        <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 12 }}>
          Activity (expenses + payments)
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 120, gap: 4 }}>
          {months.map((m) => {
            const total = m.expenses + m.payments;
            const expH = Math.round((m.expenses / maxActivity) * 100);
            const payH = Math.round((m.payments / maxActivity) * 100);
            return (
              <View key={m.month} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <View style={{ width: "100%", justifyContent: "flex-end", height: 100 }}>
                  <View
                    style={{
                      height: payH || (total === 0 ? 2 : 0),
                      backgroundColor: "#2563eb",
                    }}
                  />
                  <View
                    style={{
                      height: expH,
                      backgroundColor: "#16a34a",
                    }}
                  />
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 9 }} numberOfLines={1}>
                  {formatMonthLabel(m.month).split(" ")[0]}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <LegendDot color="#16a34a" label="Expenses" />
          <LegendDot color="#2563eb" label="Payments" />
        </View>
      </View>

      {/* Detailed table */}
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          backgroundColor: colors.card,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            paddingVertical: 8,
            paddingHorizontal: 10,
            backgroundColor: colors.muted,
          }}
        >
          <Text style={[tableHeader(colors), { flex: 1.2 }]}>Month</Text>
          <Text style={[tableHeader(colors), { flex: 1, textAlign: "right" }]}>Users</Text>
          <Text style={[tableHeader(colors), { flex: 1, textAlign: "right" }]}>Exp.</Text>
          <Text style={[tableHeader(colors), { flex: 1, textAlign: "right" }]}>Pay.</Text>
          <Text style={[tableHeader(colors), { flex: 1, textAlign: "right" }]}>Active</Text>
        </View>
        {months
          .slice()
          .reverse()
          .map((m) => (
            <View
              key={m.month}
              style={{
                flexDirection: "row",
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={[tableCell(colors), { flex: 1.2 }]}>{formatMonthLabel(m.month)}</Text>
              <Text style={[tableCell(colors), { flex: 1, textAlign: "right" }]}>{m.newUsers}</Text>
              <Text style={[tableCell(colors), { flex: 1, textAlign: "right" }]}>{m.expenses}</Text>
              <Text style={[tableCell(colors), { flex: 1, textAlign: "right" }]}>{m.payments}</Text>
              <Text style={[tableCell(colors), { flex: 1, textAlign: "right" }]}>{m.activeUsers}</Text>
            </View>
          ))}
      </View>
    </ScrollView>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function tableHeader(colors: ReturnType<typeof useColors>) {
  return {
    color: colors.mutedForeground,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase" as const,
  };
}
function tableCell(colors: ReturnType<typeof useColors>) {
  return { color: colors.foreground, fontSize: 12 };
}

const USERS_PAGE_SIZE = 25;

function UsersTab({ onOpen }: { onOpen: (id: string) => void }) {
  const colors = useColors();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pendingLogoutId, setPendingLogoutId] = useState<string | null>(null);

  const forceLogout = useMutation({
    mutationFn: (id: string) => adminApi.forceLogoutUser(id),
    onMutate: (id: string) => setPendingLogoutId(id),
    onSettled: () => setPendingLogoutId(null),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
      Alert.alert("Signed out", "User has been signed out of all devices.");
    },
    onError: (err: Error) => Alert.alert("Couldn't force logout", err.message),
  });

  const confirmForceLogout = (id: string, name: string) => {
    Alert.alert(
      "Force logout?",
      `${name} will be signed out of every device immediately and will need to sign in again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Force logout",
          style: "destructive",
          onPress: () => forceLogout.mutate(id),
        },
      ],
    );
  };

  // Reset to page 1 whenever the query changes — otherwise a search that
  // returns fewer pages would leave the user stuck on an empty page.
  useEffect(() => {
    setPage(1);
  }, [q]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "users", q, page],
    queryFn: () => adminApi.listUsers({ q: q || undefined, page, pageSize: USERS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  // Clamp displayed page in case totals shrink while we're sitting on a high
  // page (e.g. another admin deletes users).
  const displayPage = Math.min(page, totalPages);
  const rangeFrom = total === 0 ? 0 : (displayPage - 1) * USERS_PAGE_SIZE + 1;
  const rangeTo = Math.min(displayPage * USERS_PAGE_SIZE, total);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search by name or email"
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card },
        ]}
      />
      {isLoading && <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />}
      {!isLoading && data?.users.length === 0 && (
        <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 24 }}>
          No users found.
        </Text>
      )}
      {data?.users.map((u) => (
        <Pressable
          key={u.id}
          onPress={() => onOpen(u.id)}
          style={[
            styles.row,
            {
              borderBottomColor: colors.border,
              backgroundColor: u.emailVerifiedAt ? "#10b9810f" : "#f59e0b14",
            },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
              {u.name?.[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
              {u.name}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>
              {u.email}
            </Text>
          </View>
          {u.role === "superadmin" && (
            <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
              <Text style={{ color: colors.primary, fontSize: 10 }}>admin</Text>
            </View>
          )}
          {u.emailVerifiedAt ? (
            <View style={[styles.badge, { backgroundColor: "#10b98122" }]}>
              <Text style={{ color: "#059669", fontSize: 10 }}>verified</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: "#f59e0b22" }]}>
              <Text style={{ color: "#d97706", fontSize: 10 }}>unverified</Text>
            </View>
          )}
          {u.id !== me?.id && (
            <Pressable
              onPress={(e) => {
                // Stop the row Pressable from also firing — we don't want to
                // navigate into the user detail when the admin is just
                // tapping the inline force-logout action.
                e.stopPropagation();
                confirmForceLogout(u.id, u.name);
              }}
              disabled={pendingLogoutId === u.id}
              hitSlop={6}
              style={{
                marginLeft: 6,
                padding: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                opacity: pendingLogoutId === u.id ? 0.5 : 1,
              }}
              accessibilityLabel={`Force logout ${u.name}`}
            >
              {pendingLogoutId === u.id ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <Feather name="log-out" size={14} color={colors.foreground} />
              )}
            </Pressable>
          )}
        </Pressable>
      ))}

      {/* Pagination footer */}
      {total > 0 && (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center" }}>
            Showing {rangeFrom}–{rangeTo} of {total}
            {isFetching && !isLoading ? "  ·  updating…" : ""}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Pressable
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              style={[
                styles.pagerBtn,
                {
                  borderColor: colors.border,
                  opacity: page <= 1 || isLoading ? 0.4 : 1,
                },
              ]}
            >
              <Feather name="chevron-left" size={16} color={colors.foreground} />
              <Text style={{ color: colors.foreground, marginLeft: 4 }}>Prev</Text>
            </Pressable>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
              Page {displayPage} / {totalPages}
            </Text>
            <Pressable
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              style={[
                styles.pagerBtn,
                {
                  borderColor: colors.border,
                  opacity: page >= totalPages || isLoading ? 0.4 : 1,
                },
              ]}
            >
              <Text style={{ color: colors.foreground, marginRight: 4 }}>Next</Text>
              <Feather name="chevron-right" size={16} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function CurrenciesTab() {
  const colors = useColors();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "currencies"],
    queryFn: () => adminApi.listCurrencies(),
  });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<AdminCurrency>({ code: "", name: "", symbol: "", sortOrder: 9999 });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "currencies"] });

  const create = useMutation({
    mutationFn: () => adminApi.createCurrency(draft),
    onSuccess: () => { setAdding(false); setDraft({ code: "", name: "", symbol: "", sortOrder: 9999 }); refresh(); },
    onError: (e: Error) => Alert.alert("Failed", e.message),
  });

  const remove = useMutation({
    mutationFn: (code: string) => adminApi.deleteCurrency(code),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert("Cannot delete", e.message),
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity
        onPress={() => setAdding((v) => !v)}
        style={[styles.btn, { backgroundColor: colors.primary }]}
      >
        <Feather name={adding ? "x" : "plus"} size={16} color={colors.primaryForeground} />
        <Text style={{ color: colors.primaryForeground, marginLeft: 6, fontFamily: "Inter_600SemiBold" }}>
          {adding ? "Cancel" : "Add currency"}
        </Text>
      </TouchableOpacity>

      {adding && (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Field label="Code" value={draft.code} onChange={(v) => setDraft({ ...draft, code: v.toUpperCase() })} />
          <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <Field label="Symbol" value={draft.symbol} onChange={(v) => setDraft({ ...draft, symbol: v })} />
          <Field
            label="Sort order"
            value={String(draft.sortOrder)}
            onChange={(v) => setDraft({ ...draft, sortOrder: Number(v) || 0 })}
            keyboardType="numeric"
          />
          <TouchableOpacity
            onPress={() => create.mutate()}
            disabled={create.isPending}
            style={[styles.btn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>
              {create.isPending ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading && <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />}
      <View style={{ marginTop: 16 }}>
        {data?.currencies.map((c) => (
          <View key={c.code} style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                {c.code} · {c.symbol}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{c.name}</Text>
            </View>
            <Pressable
              onPress={() =>
                Alert.alert("Delete?", `Remove ${c.code}?`, [
                  { text: "Cancel" },
                  { text: "Delete", style: "destructive", onPress: () => remove.mutate(c.code) },
                ])
              }
            >
              <Feather name="trash-2" size={18} color={colors.destructive} />
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function NotificationsTab() {
  const colors = useColors();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"all" | "user">("all");
  const [userQ, setUserQ] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const usersQ = useQuery({
    queryKey: ["admin", "users", "for-notif", userQ],
    queryFn: () => adminApi.listUsers({ q: userQ || undefined, pageSize: 30 }),
    enabled: mode === "user",
  });
  const sentQ = useQuery({
    queryKey: ["admin", "notifications", "sent"],
    queryFn: () => adminApi.recentNotifications(),
  });

  const send = useMutation({
    mutationFn: () =>
      adminApi.sendNotification({
        target: mode === "all" ? "all" : selectedUserId,
        title: title.trim(),
        body: body.trim(),
      }),
    onSuccess: (r) => {
      Alert.alert("Sent", `Delivered to ${r.sent} user${r.sent === 1 ? "" : "s"}`);
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin", "notifications", "sent"] });
    },
    onError: (e: Error) => Alert.alert("Failed", e.message),
  });

  const canSend =
    title.trim() && body.trim() && (mode === "all" || selectedUserId) && !send.isPending;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {(["all", "user"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[
              styles.modeBtn,
              {
                borderColor: colors.border,
                backgroundColor: mode === m ? colors.primary : "transparent",
              },
            ]}
          >
            <Text style={{ color: mode === m ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_600SemiBold" }}>
              {m === "all" ? "Everyone" : "Specific user"}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === "user" && (
        <View style={{ marginBottom: 12 }}>
          <TextInput
            placeholder="Search user"
            placeholderTextColor={colors.mutedForeground}
            value={userQ}
            onChangeText={setUserQ}
            style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
          />
          <View style={{ maxHeight: 180, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
            <ScrollView>
              {usersQ.data?.users.slice(0, 30).map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() => setSelectedUserId(u.id)}
                  style={{
                    padding: 10,
                    backgroundColor: selectedUserId === u.id ? colors.primary + "20" : "transparent",
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{u.name}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{u.email}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      <Field label="Title" value={title} onChange={setTitle} />
      <View style={{ height: 8 }} />
      <Field label="Message" value={body} onChange={setBody} multiline />

      <TouchableOpacity
        onPress={() => send.mutate()}
        disabled={!canSend}
        style={[
          styles.btn,
          { backgroundColor: canSend ? colors.primary : colors.muted, marginTop: 12 },
        ]}
      >
        <Feather name="send" size={16} color={colors.primaryForeground} />
        <Text style={{ color: colors.primaryForeground, marginLeft: 6, fontFamily: "Inter_600SemiBold" }}>
          {send.isPending ? "Sending…" : mode === "all" ? "Send to everyone" : "Send"}
        </Text>
      </TouchableOpacity>

      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 24, marginBottom: 8 }}>
        Recently sent
      </Text>
      {sentQ.data?.items.map((n, i) => (
        <View key={i} style={[styles.notifCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{n.title}</Text>
          <Text style={{ color: colors.mutedForeground, marginTop: 2 }}>{n.body}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
            {n.type === "admin_broadcast" ? "Broadcast" : "Direct"} · {n.recipients} recipient{n.recipients === 1 ? "" : "s"} ·{" "}
            {new Date(n.createdAt).toLocaleString()}
          </Text>
        </View>
      ))}
      {sentQ.data && sentQ.data.items.length === 0 && (
        <Text style={{ color: colors.mutedForeground }}>No notifications sent yet.</Text>
      )}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  const colors = useColors();
  return (
    <View>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[
          styles.input,
          {
            borderColor: colors.border,
            color: colors.foreground,
            backgroundColor: colors.card,
            minHeight: multiline ? 90 : undefined,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
      />
    </View>
  );
}

function ReferralsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const colors = useColors();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "referrals", debounced],
    queryFn: () => adminApi.listReferrals(debounced || undefined),
  });

  const referrals = data?.referrals ?? [];
  const top = data?.topReferrers ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Feather name="gift" size={18} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>
          Referrals
        </Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 12 }}>
        Users who signed up via someone else's invite link (?ref=&lt;userId&gt;).
      </Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search by user or referrer name/email…"
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card },
        ]}
      />

      {top.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Top referrers
          </Text>
          {top.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => onOpen(r.id)}
              style={[
                styles.row,
                { borderBottomColor: colors.border, paddingHorizontal: 4 },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                  {r.name?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>
                  {r.email}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={{ color: colors.primary, fontSize: 11 }}>
                  {r.count} {r.count === 1 ? "invite" : "invites"}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <Text
        style={{
          color: colors.mutedForeground,
          fontSize: 11,
          fontFamily: "Inter_600SemiBold",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginTop: 16,
          marginBottom: 6,
        }}
      >
        Signups
      </Text>

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
      {!isLoading && referrals.length === 0 && (
        <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 16 }}>
          {debounced
            ? `No referrals match "${debounced}".`
            : "No referral signups yet."}
        </Text>
      )}
      {referrals.map((r) => (
        <Pressable
          key={r.user.id}
          onPress={() => onOpen(r.user.id)}
          style={[styles.row, { borderBottomColor: colors.border, paddingHorizontal: 4 }]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
              {r.user.name}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>
              {r.user.email}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: "45%" }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>referred by</Text>
            <Text style={{ color: colors.foreground, fontSize: 12 }} numberOfLines={1}>
              {r.referrer.name}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const EMPTY_SMTP: SmtpSettingsInput = {
  enabled: false,
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  fromAddress: "",
  fromName: "Splitix",
  appPublicUrl: "",
};

function EmailSettingsTab() {
  const colors = useColors();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "smtp"],
    queryFn: () => adminApi.getSmtp(),
  });

  const [form, setForm] = useState<SmtpSettingsInput>(EMPTY_SMTP);
  const [presetKey, setPresetKey] = useState<string>("custom");
  const [showPresets, setShowPresets] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        enabled: data.enabled,
        host: data.host,
        port: data.port,
        secure: data.secure,
        username: data.username,
        password: "",
        fromAddress: data.fromAddress,
        fromName: data.fromName,
        appPublicUrl: data.appPublicUrl,
      });
    }
  }, [data]);

  function set<K extends keyof SmtpSettingsInput>(key: K, value: SmtpSettingsInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function applyPreset(key: string) {
    setPresetKey(key);
    setShowPresets(false);
    const p = SMTP_PRESETS[key];
    if (!p) return;
    setForm((f) => ({ ...f, host: p.host, port: p.port, secure: p.secure }));
  }

  const saveMutation = useMutation({
    mutationFn: (input: SmtpSettingsInput) => adminApi.putSmtp(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "smtp"] });
      setForm((f) => ({ ...f, password: "" }));
      Alert.alert("Saved", "SMTP settings updated.");
    },
    onError: (err: Error) => Alert.alert("Save failed", err.message),
  });

  const testMutation = useMutation({
    mutationFn: (to: string) => adminApi.testSmtp(to),
    onSuccess: (res) => {
      setTestResult(
        res.ok
          ? { ok: true, message: `Sent (id: ${res.messageId ?? "?"})` }
          : { ok: false, message: res.error ?? "Unknown error" },
      );
    },
    onError: (err: Error) => setTestResult({ ok: false, message: err.message }),
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { padding: 24 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View>
        <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>
          Email (SMTP)
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
          Configure the server used to send verification emails. Password is stored in
          the database in plain text — use a dedicated app password.
        </Text>
      </View>

      {/* Enable toggle */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          borderWidth: 1,
          borderRadius: 8,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
            SMTP enabled
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
            When off, registrations succeed but no email is sent.
          </Text>
        </View>
        <Pressable
          onPress={() => set("enabled", !form.enabled)}
          style={{
            width: 48,
            height: 28,
            borderRadius: 999,
            backgroundColor: form.enabled ? colors.primary : colors.border,
            justifyContent: "center",
            paddingHorizontal: 3,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#fff",
              alignSelf: form.enabled ? "flex-end" : "flex-start",
            }}
          />
        </Pressable>
      </View>

      {/* Preset picker */}
      <View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 4 }}>
          Preset
        </Text>
        <Pressable
          onPress={() => setShowPresets((s) => !s)}
          style={[
            styles.input,
            {
              borderColor: colors.border,
              backgroundColor: colors.card,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            },
          ]}
        >
          <Text style={{ color: colors.foreground }}>
            {presetKey === "custom" ? "Custom (fill manually)" : SMTP_PRESETS[presetKey]?.label}
          </Text>
          <Feather name={showPresets ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
        </Pressable>
        {showPresets && (
          <View
            style={{
              marginTop: 4,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              backgroundColor: colors.card,
              maxHeight: 280,
            }}
          >
            <ScrollView nestedScrollEnabled>
              <Pressable
                onPress={() => applyPreset("custom")}
                style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <Text style={{ color: colors.foreground }}>Custom (fill manually)</Text>
              </Pressable>
              {Object.entries(SMTP_PRESETS).map(([key, p]) => (
                <Pressable
                  key={key}
                  onPress={() => applyPreset(key)}
                  style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <Text style={{ color: colors.foreground }}>{p.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        {presetKey !== "custom" && SMTP_PRESETS[presetKey]?.hint && (
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
            {SMTP_PRESETS[presetKey].hint}
          </Text>
        )}
      </View>

      <Field label="Host" value={form.host} onChange={(v) => set("host", v)} />
      <Field
        label="Port"
        value={String(form.port)}
        onChange={(v) => set("port", Number(v) || 0)}
        keyboardType="numeric"
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          borderWidth: 1,
          borderRadius: 8,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <Text style={{ color: colors.foreground, flex: 1, paddingRight: 12 }}>
          Use TLS on connect (port 465). Off = STARTTLS (587).
        </Text>
        <Pressable
          onPress={() => set("secure", !form.secure)}
          style={{
            width: 48,
            height: 28,
            borderRadius: 999,
            backgroundColor: form.secure ? colors.primary : colors.border,
            justifyContent: "center",
            paddingHorizontal: 3,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#fff",
              alignSelf: form.secure ? "flex-end" : "flex-start",
            }}
          />
        </Pressable>
      </View>

      <Field label="Username" value={form.username} onChange={(v) => set("username", v)} />
      <View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 4 }}>
          Password{data?.hasPassword ? "  (leave blank to keep current)" : ""}
        </Text>
        <TextInput
          value={form.password}
          onChangeText={(v) => set("password", v)}
          secureTextEntry
          placeholder={data?.hasPassword ? "••••••••" : ""}
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card },
          ]}
        />
      </View>

      <Field label="From address" value={form.fromAddress} onChange={(v) => set("fromAddress", v)} />
      <Field label="From name" value={form.fromName} onChange={(v) => set("fromName", v)} />
      <Field label="App public URL" value={form.appPublicUrl} onChange={(v) => set("appPublicUrl", v)} />
      <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: -8 }}>
        Used to build verification links. Should be the HTTPS origin where the web app
        is reachable (no trailing slash).
      </Text>

      <Pressable
        onPress={() => saveMutation.mutate(form)}
        disabled={saveMutation.isPending}
        style={[
          styles.btn,
          { backgroundColor: colors.primary, opacity: saveMutation.isPending ? 0.6 : 1 },
        ]}
      >
        {saveMutation.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Feather name="save" size={16} color="#fff" />
        )}
        <Text style={{ color: "#fff", marginLeft: 8, fontFamily: "Inter_600SemiBold" }}>
          Save settings
        </Text>
      </Pressable>

      {/* Test sender */}
      <View
        style={{
          padding: 12,
          borderWidth: 1,
          borderRadius: 8,
          borderColor: colors.border,
          backgroundColor: colors.card,
          gap: 8,
          marginTop: 8,
        }}
      >
        <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
          Send a test email
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
          Uses the saved settings above to deliver a one-off test message.
        </Text>
        <TextInput
          value={testTo}
          onChangeText={setTestTo}
          placeholder="recipient@example.com"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
          ]}
        />
        <Pressable
          onPress={() => {
            setTestResult(null);
            testMutation.mutate(testTo);
          }}
          disabled={!testTo || testMutation.isPending}
          style={[
            styles.btn,
            {
              backgroundColor: colors.primary,
              opacity: !testTo || testMutation.isPending ? 0.5 : 1,
            },
          ]}
        >
          {testMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="send" size={16} color="#fff" />
          )}
          <Text style={{ color: "#fff", marginLeft: 8, fontFamily: "Inter_600SemiBold" }}>
            Send test
          </Text>
        </Pressable>
        {testResult && (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <Feather
              name={testResult.ok ? "check-circle" : "x-circle"}
              size={14}
              color={testResult.ok ? "#059669" : "#dc2626"}
              style={{ marginTop: 2 }}
            />
            <Text style={{ color: testResult.ok ? "#059669" : "#dc2626", flex: 1 }}>
              {testResult.message}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabsScroll: { flexGrow: 0, borderBottomWidth: 1 },
  tabs: { flexDirection: "row" },
  tabBtn: { paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 8 },
  modeBtn: { flex: 1, padding: 10, borderWidth: 1, borderRadius: 8, alignItems: "center" },
  notifCard: { padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8 },
  pagerBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 6,
  },
});
