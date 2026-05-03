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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { adminApi, type AdminCurrency } from "@/lib/admin-api";

type Tab = "analytics" | "users" | "currencies" | "notifications";

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
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["analytics", "users", "currencies", "notifications"] as Tab[]).map((t) => (
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
      </View>

      {tab === "analytics" && <AnalyticsTab />}
      {tab === "users" && <UsersTab onOpen={(id) => router.push(`/admin-user/${id}` as never)} />}
      {tab === "currencies" && <CurrenciesTab />}
      {tab === "notifications" && <NotificationsTab />}
    </View>
  );
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
}

function AnalyticsTab() {
  const colors = useColors();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "monthly"],
    queryFn: () => adminApi.monthly(),
  });

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

function UsersTab({ onOpen }: { onOpen: (id: string) => void }) {
  const colors = useColors();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", q],
    queryFn: () => adminApi.listUsers(q || undefined),
  });

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
      {data?.users.map((u) => (
        <Pressable
          key={u.id}
          onPress={() => onOpen(u.id)}
          style={[styles.row, { borderBottomColor: colors.border }]}
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
        </Pressable>
      ))}
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
    queryFn: () => adminApi.listUsers(userQ || undefined),
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 8 },
  modeBtn: { flex: 1, padding: 10, borderWidth: 1, borderRadius: 8, alignItems: "center" },
  notifCard: { padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8 },
});
