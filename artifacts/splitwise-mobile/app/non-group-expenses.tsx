import { useCallback, useMemo, useState } from "react";
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
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  type ExpenseWithSplits,
  useGetMe,
} from "@workspace/api-client-react";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { AddExpenseCTA } from "@/components/AddExpenseCTA";
import {
  SettleUpWithFriendModal,
  type SettleFriend,
} from "@/components/SettleUpWithFriendModal";
import { useColors } from "@/hooks/useColors";
import { authFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

interface NonGroupResponse {
  myNetBalance: number;
  count: number;
  expenses: ExpenseWithSplits[];
  friendNets?: Record<string, number>;
}

const NON_GROUP_KEY = ["non-group-expenses"] as const;

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

interface FriendRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  net: number;
}

type Tab = "expenses" | "friends";

export default function NonGroupExpensesScreen() {
  const colors = useColors();
  const me = useGetMe();
  const [tab, setTab] = useState<Tab>("friends");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settleTarget, setSettleTarget] = useState<{
    friend: SettleFriend;
    impact: number;
  } | null>(null);

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

  const data = query.data;
  const expenses = data?.expenses ?? [];
  const net = data?.myNetBalance ?? 0;
  const myId = me.data?.id;
  const friendNets = data?.friendNets ?? {};

  const grouped = useMemo(() => {
    const buckets = new Map<string, ExpenseWithSplits[]>();
    const labels = new Map<string, string>();
    const sorted = [...expenses].sort((a, b) =>
      String(a.date) < String(b.date) ? 1 : -1,
    );
    for (const e of sorted) {
      const d = new Date(String(e.date));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = MONTH_FMT.format(d);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(e);
      labels.set(key, label);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, label: labels.get(key) ?? key, items }));
  }, [expenses]);

  const friends = useMemo<FriendRow[]>(() => {
    if (!myId) return [];
    const userById = new Map<string, { name: string; avatarUrl: string | null }>();
    for (const e of expenses) {
      if (e.paidByUserId !== myId && e.paidByUser) {
        userById.set(e.paidByUserId, {
          name: e.paidByUser.name,
          avatarUrl: e.paidByUser.avatarUrl ?? null,
        });
      }
      for (const s of e.splits) {
        if (s.userId !== myId && s.user) {
          userById.set(s.userId, {
            name: s.user.name,
            avatarUrl: s.user.avatarUrl ?? null,
          });
        }
      }
    }
    const rows: FriendRow[] = [];
    for (const [id, u] of userById) {
      rows.push({ id, name: u.name, avatarUrl: u.avatarUrl, net: friendNets[id] ?? 0 });
    }
    rows.sort((a, b) => {
      const da = Math.abs(a.net), db = Math.abs(b.net);
      if (da > 0.005 && db < 0.005) return -1;
      if (db > 0.005 && da < 0.005) return 1;
      if (Math.abs(da - db) > 0.005) return db - da;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [expenses, friendNets, myId]);

  if (query.isLoading && !query.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Non-group expenses" }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

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

        <View>
          <AddExpenseCTA />
        </View>

        {expenses.length === 0 ? (
          <Card>
            <EmptyState
              icon="dollar-sign"
              title="No non-group expenses yet"
              message="Add an expense with a friend (without a group) and it will show up here."
            />
          </Card>
        ) : (
          <>
            <View
              style={[
                styles.tabBar,
                { backgroundColor: colors.muted, borderColor: colors.border },
              ]}
            >
              <TabButton
                label={`Friends${friends.length ? ` (${friends.length})` : ""}`}
                active={tab === "friends"}
                onPress={() => setTab("friends")}
              />
              <TabButton
                label="Expenses"
                active={tab === "expenses"}
                onPress={() => setTab("expenses")}
              />
            </View>

            {tab === "expenses" ? (
              <View style={{ gap: 16 }}>
                {grouped.map((bucket) => (
                  <View key={bucket.key} style={{ gap: 8 }}>
                    <Text
                      style={[
                        styles.monthLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {bucket.label.toUpperCase()}
                    </Text>
                    {bucket.items.map((e) => (
                      <ExpenseRow
                        key={e.id}
                        expense={e}
                        myId={myId}
                        friendNets={friendNets}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {friends.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon="users"
                      title="No friends yet"
                      message="Once you add a non-group expense with a friend, they'll appear here."
                    />
                  </Card>
                ) : (
                  friends.map((f) => (
                    <FriendBalanceRow
                      key={f.id}
                      friend={f}
                      onSettle={(impact) =>
                        setSettleTarget({
                          friend: { id: f.id, name: f.name },
                          impact,
                        })
                      }
                    />
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
      {settleTarget && myId && (
        <SettleUpWithFriendModal
          friend={settleTarget.friend}
          currentUserId={myId}
          netBalance={settleTarget.impact}
          onClose={() => setSettleTarget(null)}
        />
      )}
    </>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabButton,
        active && { backgroundColor: colors.background },
      ]}
    >
      <Text
        style={[
          styles.tabText,
          {
            color: active ? colors.foreground : colors.mutedForeground,
            fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FriendBalanceRow({
  friend,
  onSettle,
}: {
  friend: FriendRow;
  onSettle: (impact: number) => void;
}) {
  const colors = useColors();
  const settled = Math.abs(friend.net) < 0.01;
  return (
    <Card style={styles.friendRow}>
      <Avatar name={friend.name} url={friend.avatarUrl} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.friendName, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {friend.name}
        </Text>
        <Text
          style={[
            styles.friendBalance,
            {
              color: settled
                ? colors.mutedForeground
                : friend.net > 0
                  ? colors.positive
                  : colors.negative,
            },
          ]}
          numberOfLines={1}
        >
          {settled
            ? "All settled up"
            : friend.net > 0
              ? `owes you ${formatCurrency(friend.net)}`
              : `you owe ${formatCurrency(Math.abs(friend.net))}`}
        </Text>
      </View>
      {!settled && (
        <Pressable
          onPress={() => onSettle(friend.net)}
          style={[
            styles.settleBtn,
            { borderColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <Feather name="check-circle" size={14} color={colors.primary} />
          <Text style={[styles.settleBtnText, { color: colors.primary }]}>
            Settle up
          </Text>
        </Pressable>
      )}
    </Card>
  );
}

function ExpenseRow({
  expense,
  myId,
  friendNets,
}: {
  expense: ExpenseWithSplits;
  myId: string | undefined;
  friendNets: Record<string, number>;
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

  const otherSplits = expense.splits.filter((s) => s.userId !== myId);
  const otherNames = otherSplits.map((s) => s.user?.name ?? "").filter(Boolean);
  const peopleLine =
    otherNames.length > 0
      ? `with ${otherNames.slice(0, 2).join(", ")}${otherNames.length > 2 ? ` +${otherNames.length - 2}` : ""}`
      : "";

  const onlyCounterparty =
    otherSplits.length === 1 ? otherSplits[0] : null;
  const counterpartyNet = onlyCounterparty
    ? friendNets[onlyCounterparty.userId]
    : undefined;
  const isSettled =
    typeof counterpartyNet === "number" && Math.abs(counterpartyNet) < 0.01;

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
          {expense.category ?? "General"} · {expense.date}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {isSettled ? (
          <>
            <Text style={[styles.balance, { color: colors.mutedForeground }]}>
              {iPaid
                ? `+${formatCurrency(owedToMe)}`
                : `-${formatCurrency(iOwe)}`}
            </Text>
            <Text style={[styles.balanceSub, { color: colors.primary }]}>
              settled up
            </Text>
          </>
        ) : owedToMe > 0 ? (
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
  tabBar: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 7,
  },
  tabText: { fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  desc: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  date: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  monthLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.8 },
  balance: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  balanceSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  friendRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  friendName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  friendBalance: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  settleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  settleBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
