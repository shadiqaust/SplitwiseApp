import React from "react";
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, Pressable, Alert } from "react-native";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/admin-api";

export default function AdminUserDetailScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user: me, isLoaded } = useAuth();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const isAdmin = me?.role === "superadmin";
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => adminApi.getUser(String(userId)),
    enabled: !!userId && isAdmin,
  });

  const forceLogout = useMutation({
    mutationFn: () => adminApi.forceLogoutUser(String(userId)),
    onSuccess: () => {
      Alert.alert(
        "Signed out",
        `${data?.user.name ?? "User"} has been signed out of all devices.`,
      );
    },
    onError: (err: Error) => {
      Alert.alert("Couldn't force logout", err.message);
    },
  });

  const onForceLogout = () => {
    if (!data) return;
    Alert.alert(
      "Force logout?",
      `${data.user.name} will be signed out of every device immediately and will need to sign in again.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Force logout", style: "destructive", onPress: () => forceLogout.mutate() },
      ],
    );
  };

  const verifyEmail = useMutation({
    mutationFn: () => adminApi.verifyUserEmail(String(userId)),
    onSuccess: (res) => {
      Alert.alert(
        "Done",
        res.alreadyVerified
          ? "Email was already verified."
          : "Email marked as verified.",
      );
      queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: Error) => {
      Alert.alert("Couldn't verify", err.message);
    },
  });

  const onVerifyEmail = () => {
    if (!data) return;
    Alert.alert(
      "Mark email verified?",
      `${data.user.name} will be able to use all app features without clicking the verification link.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark verified", onPress: () => verifyEmail.mutate() },
      ],
    );
  };

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
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {user.emailVerifiedAt ? (
              <View style={[styles.statusPill, { backgroundColor: "#10b98122" }]}>
                <Feather name="check-circle" size={12} color="#059669" />
                <Text style={{ color: "#059669", fontSize: 11, marginLeft: 4 }}>email verified</Text>
              </View>
            ) : (
              <View style={[styles.statusPill, { backgroundColor: "#f59e0b22" }]}>
                <Feather name="alert-triangle" size={12} color="#d97706" />
                <Text style={{ color: "#d97706", fontSize: 11, marginLeft: 4 }}>email unverified</Text>
              </View>
            )}
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 6 }}>
            {user.role} · {user.defaultCurrency} · joined {new Date(user.createdAt).toLocaleDateString()}
          </Text>
          {!user.emailVerifiedAt && (
            <Pressable
              onPress={onVerifyEmail}
              disabled={verifyEmail.isPending}
              style={[
                styles.verifyBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  opacity: verifyEmail.isPending ? 0.6 : 1,
                },
              ]}
            >
              {verifyEmail.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="mail" size={14} color={colors.foreground} />
              )}
              <Text style={{ color: colors.foreground, marginLeft: 6, fontFamily: "Inter_600SemiBold" }}>
                Mark email verified
              </Text>
            </Pressable>
          )}
          {user.id !== me?.id && (
            <Pressable
              onPress={onForceLogout}
              disabled={forceLogout.isPending}
              style={[
                styles.verifyBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  opacity: forceLogout.isPending ? 0.6 : 1,
                },
              ]}
            >
              {forceLogout.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="log-out" size={14} color={colors.foreground} />
              )}
              <Text style={{ color: colors.foreground, marginLeft: 6, fontFamily: "Inter_600SemiBold" }}>
                Force logout
              </Text>
            </Pressable>
          )}
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
  statusPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  verifyBtn: { marginTop: 12, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
