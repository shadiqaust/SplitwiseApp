import { useState } from "react";
import { getErrorMessage } from "@/lib/error";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetGroupBalancesQueryKey,
  getGetGroupQueryKey,
  getListExpensesQueryKey,
  getListGroupsQueryKey,
  useAddGroupMember,
  useGetGroup,
  useGetGroupBalances,
  useGetMe,
  useListExpenses,
  useListPayments,
} from "@workspace/api-client-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";
import { formatCurrency, formatDate } from "@/lib/format";

type Tab = "expenses" | "balances";

export default function GroupDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const groupId = Number(params.id);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("expenses");
  const [memberEmail, setMemberEmail] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const me = useGetMe();
  const POLL = { query: { refetchInterval: 15_000 } } as const;
  const group = useGetGroup(groupId, POLL);
  const expenses = useListExpenses(groupId, POLL);
  const payments = useListPayments(groupId, POLL);
  const balances = useGetGroupBalances(groupId, POLL);
  const addMember = useAddGroupMember();

  const refreshing =
    group.isFetching ||
    expenses.isFetching ||
    payments.isFetching ||
    balances.isFetching;

  const onRefresh = () => {
    group.refetch();
    expenses.refetch();
    payments.refetch();
    balances.refetch();
  };

  const onAddMember = () => {
    if (!memberEmail.trim()) {
      setAddError("Email is required");
      return;
    }
    setAddError(null);
    addMember.mutate(
      { groupId, data: { email: memberEmail.trim() } },
      {
        onSuccess: () => {
          setMemberEmail("");
          setShowAdd(false);
          queryClient.invalidateQueries({
            queryKey: getGetGroupQueryKey(groupId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetGroupBalancesQueryKey(groupId),
          });
          queryClient.invalidateQueries({
            queryKey: getListGroupsQueryKey(),
          });
        },
        onError: (err: unknown) => {
          setAddError(getErrorMessage(err, "Failed to add member"));
        },
      },
    );
  };

  if (group.isLoading || !group.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "" }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const myUserId = me.data?.id;

  // Combine expenses + payments for the activity tab
  const combined = [
    ...(expenses.data ?? []).map((e) => ({
      kind: "expense" as const,
      id: `e-${e.id}`,
      data: e,
      date: e.date,
    })),
    ...(payments.data ?? []).map((p) => ({
      kind: "payment" as const,
      id: `p-${p.id}`,
      data: p,
      date: p.date,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <Stack.Screen
        options={{
          title: group.data.name,
          headerRight: () => (
            <Pressable
              onPress={() => setShowAdd((v) => !v)}
              style={{ paddingHorizontal: 12 }}
            >
              <Feather name="user-plus" size={20} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header card with members + actions */}
        <Card>
          {group.data.description ? (
            <Text
              style={[styles.desc, { color: colors.mutedForeground }]}
              numberOfLines={3}
            >
              {group.data.description}
            </Text>
          ) : null}
          <View style={styles.memberRow}>
            {group.data.members.map((m) => (
              <View key={m.id} style={{ alignItems: "center", width: 56 }}>
                <Avatar name={m.user.name} url={m.user.avatarUrl} size={40} />
                <Text
                  style={[styles.memberName, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {m.user.id === myUserId ? "You" : m.user.name.split(" ")[0]}
                </Text>
              </View>
            ))}
          </View>

          {showAdd ? (
            <View style={{ gap: 8, marginTop: 12 }}>
              <Input
                placeholder="member@email.com"
                value={memberEmail}
                onChangeText={setMemberEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                error={addError ?? undefined}
              />
              <Button
                title="Add member"
                onPress={onAddMember}
                loading={addMember.isPending}
                fullWidth
              />
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Button
              title="Add expense"
              icon={<Feather name="plus" size={16} color="#fff" />}
              onPress={() =>
                router.push({
                  pathname: "/expenses/new",
                  params: { groupId: String(groupId) },
                })
              }
            />
            <Button
              title="Settle up"
              variant="outline"
              icon={
                <Feather name="check" size={16} color={colors.foreground} />
              }
              onPress={() =>
                router.push({
                  pathname: "/payments/new",
                  params: { groupId: String(groupId) },
                })
              }
            />
          </View>
        </Card>

        {/* Tabs */}
        <View style={[styles.tabs, { borderColor: colors.border }]}>
          {(["expenses", "balances"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.tab,
                {
                  borderBottomColor: tab === t ? colors.primary : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      tab === t ? colors.primary : colors.mutedForeground,
                    fontFamily:
                      tab === t ? "Inter_600SemiBold" : "Inter_500Medium",
                  },
                ]}
              >
                {t === "expenses" ? "Activity" : "Balances"}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "expenses" ? (
          combined.length > 0 ? (
            <View style={{ gap: 8 }}>
              {combined.map((item) => {
                if (item.kind === "expense") {
                  const e = item.data;
                  const youPaid = e.paidByUserId === myUserId;
                  const yourSplit = e.splits.find((s) => s.userId === myUserId);
                  const yourShare = yourSplit?.amount ?? 0;
                  const lentOrBorrowed = youPaid
                    ? e.totalAmount - yourShare
                    : -yourShare;
                  return (
                    <Card key={item.id} style={styles.activityRow}>
                      <View
                        style={[
                          styles.bubble,
                          {
                            backgroundColor: colors.muted,
                            borderRadius: 100,
                          },
                        ]}
                      >
                        <Feather
                          name="file-text"
                          size={18}
                          color={colors.mutedForeground}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.activityTitle,
                            { color: colors.foreground },
                          ]}
                          numberOfLines={1}
                        >
                          {e.description}
                        </Text>
                        <Text
                          style={[
                            styles.activitySub,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {youPaid ? "You" : e.paidByUser.name} paid{" "}
                          {formatCurrency(e.totalAmount)} · {formatDate(e.date)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.activityAmount,
                          {
                            color:
                              lentOrBorrowed > 0
                                ? colors.positive
                                : lentOrBorrowed < 0
                                  ? colors.negative
                                  : colors.mutedForeground,
                          },
                        ]}
                      >
                        {lentOrBorrowed > 0
                          ? `+${formatCurrency(lentOrBorrowed)}`
                          : lentOrBorrowed < 0
                            ? `-${formatCurrency(Math.abs(lentOrBorrowed))}`
                            : formatCurrency(0)}
                      </Text>
                    </Card>
                  );
                }
                const p = item.data;
                const fromYou = p.fromUserId === myUserId;
                const toYou = p.toUserId === myUserId;
                return (
                  <Card key={item.id} style={styles.activityRow}>
                    <View
                      style={[
                        styles.bubble,
                        {
                          backgroundColor: colors.accent,
                          borderRadius: 100,
                        },
                      ]}
                    >
                      <Feather
                        name="dollar-sign"
                        size={18}
                        color={colors.accentForeground}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.activityTitle,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {fromYou ? "You" : p.fromUser.name} paid{" "}
                        {toYou ? "you" : p.toUser.name}
                      </Text>
                      <Text
                        style={[
                          styles.activitySub,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {formatDate(p.date)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.activityAmount,
                        { color: colors.foreground },
                      ]}
                    >
                      {formatCurrency(p.amount)}
                    </Text>
                  </Card>
                );
              })}
            </View>
          ) : (
            <Card>
              <EmptyState
                icon="file-text"
                title="No expenses yet"
                message="Add an expense to start splitting."
              />
            </Card>
          )
        ) : balances.data && balances.data.length > 0 ? (
          <View style={{ gap: 8 }}>
            {balances.data.map((b, i) => (
              <Card key={`${b.fromUserId}-${b.toUserId}-${i}`} style={styles.balanceRow}>
                <Avatar name={b.fromUser.name} url={b.fromUser.avatarUrl} size={32} />
                <Text style={[styles.balanceText, { color: colors.foreground }]}>
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    {b.fromUserId === myUserId ? "You" : b.fromUser.name}
                  </Text>{" "}
                  owe{b.fromUserId === myUserId ? "" : "s"}{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    {b.toUserId === myUserId ? "you" : b.toUser.name}
                  </Text>
                </Text>
                <Text
                  style={[
                    styles.balanceAmount,
                    { color: colors.negative },
                  ]}
                >
                  {formatCurrency(b.amount)}
                </Text>
              </Card>
            ))}
          </View>
        ) : (
          <Card>
            <EmptyState
              icon="check-circle"
              title="All settled up"
              message="Everyone in this group is even."
            />
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 80 },
  desc: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 12 },
  memberRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  memberName: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2 },
  tabText: { fontSize: 14 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bubble: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  activityTitle: { fontFamily: "Inter_500Medium", fontSize: 14 },
  activitySub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  activityAmount: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  balanceText: { fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 },
  balanceAmount: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
