import React from "react";
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/admin-api";

export default function AdminUserDetailScreen() {
  const colors = useColors();
  const { user: me, isLoaded } = useAuth();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const isAdmin = me?.role === "superadmin";
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => adminApi.getUser(String(userId)),
    enabled: !!userId && isAdmin,
  });

  if (isLoaded && !isAdmin) {
    // Block direct deep-linking by non-superadmins.
    return <Redirect href="/(tabs)" />;
  }

  if (isLoading || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "User" }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const { user, stats, groups, expenses, payments } = data;

  return (
    <>
      <Stack.Screen options={{ title: user.name }} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.foreground, fontSize: 22, fontFamily: "Inter_700Bold" }}>{user.name}</Text>
          <Text style={{ color: colors.mutedForeground }}>{user.email}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
            {user.role} · {user.defaultCurrency} · joined {new Date(user.createdAt).toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          {[
            { label: "Groups", value: stats.groupCount },
            { label: "Expenses paid", value: stats.paidCount },
            { label: "Total paid", value: stats.paidTotal },
            { label: "Payments sent", value: stats.paymentsSent },
            { label: "Payments received", value: stats.paymentsReceived },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 16 }}>{s.value}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Section title={`Groups (${groups.length})`}>
          {groups.map((g) => (
            <Row key={g.id} left={g.name} right={`${g.currency} · ${new Date(g.joinedAt).toLocaleDateString()}`} />
          ))}
        </Section>

        <Section title={`Expenses (${expenses.length})`}>
          {expenses.map((e) => (
            <Row key={e.id} left={e.description} right={`${e.currency} ${e.totalAmount} · ${e.date}`} />
          ))}
        </Section>

        <Section title={`Payments (${payments.length})`}>
          {payments.map((p) => (
            <Row
              key={p.id}
              left={p.fromUserId === user.id ? `Sent ${p.amount}` : `Received ${p.amount}`}
              right={p.date}
            />
          ))}
        </Section>
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 6 }}>{title}</Text>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.card }}>
        {children}
      </View>
    </View>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  const colors = useColors();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={{ color: colors.foreground, flex: 1 }} numberOfLines={1}>{left}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { flexBasis: "31%", flexGrow: 1, padding: 10, borderWidth: 1, borderRadius: 8 },
  row: { flexDirection: "row", padding: 10, borderBottomWidth: 1, gap: 8 },
});
