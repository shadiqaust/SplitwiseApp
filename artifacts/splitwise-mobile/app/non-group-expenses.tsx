import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  type ExpenseWithSplits,
  useGetMe,
} from "@workspace/api-client-react";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useColors } from "@/hooks/useColors";
import { authFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

interface NonGroupResponse {
  myNetBalance: number;
  count: number;
  expenses: ExpenseWithSplits[];
}

const NON_GROUP_KEY = ["non-group-expenses"] as const;

export default function NonGroupExpensesScreen() {
  const colors = useColors();
  const me = useGetMe();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const query = useQuery<NonGroupResponse>({
    queryKey: NON_GROUP_KEY,
    queryFn: async () => {
      const res = await authFetch("/api/expenses/non-group");
      if (!res.ok) throw new Error("Failed to load non-group expenses");
      return res.json();
    },
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await query.refetch();
    setIsRefreshing(false);
  }, [query]);

  if (query.isLoading && !query.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Non-group expenses" }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const data = query.data;
  const expenses = data?.expenses ?? [];
  const net = data?.myNetBalance ?? 0;
  const myId = me.data?.id;

  return (
    <>
      <Stack.Screen options={{ title: "Non-group expenses" }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Card style={styles.summary}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            Your overall balance
          </Text>
          <Text
            style={[
              styles.summaryAmount,
              {
                color:
                  net > 0
                    ? colors.positive
                    : net < 0
                      ? colors.negative
                      : colors.foreground,
              },
            ]}
          >
            {net > 0
              ? `+${formatCurrency(net)}`
              : net < 0
                ? `-${formatCurrency(Math.abs(net))}`
                : formatCurrency(0)}
          </Text>
          <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
            {net > 0
              ? "you are owed across friends"
              : net < 0
                ? "you owe across friends"
                : "all settled up"}
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.countText, { color: colors.mutedForeground }]}>
            {data?.count ?? 0}{" "}
            {(data?.count ?? 0) === 1 ? "expense" : "expenses"} not in any group
          </Text>
        </Card>

        {expenses.length === 0 ? (
          <Card>
            <EmptyState
              icon="dollar-sign"
              title="No non-group expenses yet"
              message="Add an expense with a friend (without a group) and it will show up here."
            />
          </Card>
        ) : (
          <View style={{ gap: 8 }}>
            {expenses.map((e) => (
              <ExpenseRow key={e.id} expense={e} myId={myId} />
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function ExpenseRow({
  expense,
  myId,
}: {
  expense: ExpenseWithSplits;
  myId: string | undefined;
}) {
  const colors = useColors();
  const total = Number(expense.totalAmount);
  const iPaid = myId && expense.paidByUserId === myId;
  const mySplit = myId
    ? expense.splits.find((s) => s.userId === myId)
    : undefined;
  const myShare = mySplit ? Number(mySplit.amount) : 0;
  const owedToMe = iPaid ? total - myShare : 0;
  const iOwe = !iPaid && mySplit ? myShare : 0;

  const otherNames = expense.splits
    .filter((s) => s.userId !== myId)
    .map((s) => s.user?.name ?? "")
    .filter(Boolean);
  const peopleLine =
    otherNames.length > 0
      ? `with ${otherNames.slice(0, 2).join(", ")}${otherNames.length > 2 ? ` +${otherNames.length - 2}` : ""}`
      : "";

  return (
    <Card style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.desc, { color: colors.foreground }]} numberOfLines={1}>
          {expense.description}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {iPaid
            ? `You paid ${formatCurrency(total)}`
            : `${expense.paidByUser?.name ?? "Someone"} paid ${formatCurrency(total)}`}
          {peopleLine ? ` · ${peopleLine}` : ""}
        </Text>
        <Text style={[styles.date, { color: colors.mutedForeground }]}>
          {expense.date}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {owedToMe > 0 ? (
          <>
            <Text style={[styles.balance, { color: colors.positive }]}>
              +{formatCurrency(owedToMe)}
            </Text>
            <Text style={[styles.balanceSub, { color: colors.mutedForeground }]}>
              you lent
            </Text>
          </>
        ) : iOwe > 0 ? (
          <>
            <Text style={[styles.balance, { color: colors.negative }]}>
              -{formatCurrency(iOwe)}
            </Text>
            <Text style={[styles.balanceSub, { color: colors.mutedForeground }]}>
              you owe
            </Text>
          </>
        ) : (
          <Text style={[styles.balanceSub, { color: colors.mutedForeground }]}>
            not involved
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },
  summary: { gap: 4, alignItems: "flex-start" },
  summaryLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  summaryAmount: { fontFamily: "Inter_700Bold", fontSize: 26, marginTop: 2 },
  summarySub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, alignSelf: "stretch", marginVertical: 12 },
  countText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  desc: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  date: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  balance: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  balanceSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
});
