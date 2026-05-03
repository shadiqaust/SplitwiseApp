import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  type ExpenseWithSplits,
  type Payment,
  type User,
  useGetMe,
  useListGroups,
} from "@workspace/api-client-react";

import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SettleUpWithFriendModal } from "@/components/SettleUpWithFriendModal";
import { PaymentDetailModal } from "@/components/PaymentDetailModal";
import { useColors } from "@/hooks/useColors";
import { authFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

interface FriendActivityResponse {
  friend: User;
  netBalance: number;
  balances: { currency: string; amount: number }[];
  expenses: ExpenseWithSplits[];
  payments: Payment[];
}

type Item =
  | { kind: "expense"; date: string; data: ExpenseWithSplits }
  | { kind: "payment"; date: string; data: Payment };

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

export default function FriendDetailScreen() {
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const colors = useColors();
  const me = useGetMe();
  const defaultCurrency = me.data?.defaultCurrency ?? "USD";
  const { data: groupsList } = useListGroups();
  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groupsList ?? []) m.set(g.id, g.name);
    return m;
  }, [groupsList]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showSettle, setShowSettle] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  const query = useQuery<FriendActivityResponse>({
    queryKey: ["friend-activity", friendId],
    queryFn: async () => {
      const res = await authFetch(`/api/friends/${friendId}/activity`);
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    enabled: typeof friendId === "string" && friendId.length > 0,
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await query.refetch();
    setIsRefreshing(false);
  }, [query]);

  const allItems = useMemo<Item[]>(() => {
    const data = query.data;
    if (!data) return [];
    const items: Item[] = [
      ...data.expenses.map((e) => ({ kind: "expense" as const, date: e.date, data: e })),
      ...data.payments.map((p) => ({ kind: "payment" as const, date: p.date, data: p })),
    ];
    items.sort((a, b) => {
      const d = String(b.date).localeCompare(String(a.date));
      if (d !== 0) return d;
      const aCa = String((a.data as { createdAt?: string }).createdAt ?? "");
      const bCa = String((b.data as { createdAt?: string }).createdAt ?? "");
      return bCa.localeCompare(aCa);
    });
    return items;
  }, [query.data]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((it) => {
      const dateStr = it.date.toLowerCase();
      const monthLabel = MONTH_FMT.format(new Date(it.date)).toLowerCase();
      if (dateStr.includes(q) || monthLabel.includes(q)) return true;
      if (it.kind === "expense") {
        const e = it.data;
        return (
          e.description.toLowerCase().includes(q) ||
          (e.paidByUser?.name ?? "").toLowerCase().includes(q)
        );
      }
      const p = it.data;
      return (
        (p.note ?? "").toLowerCase().includes(q) ||
        (p.fromUser?.name ?? "").toLowerCase().includes(q) ||
        (p.toUser?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [allItems, search]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, Item[]>();
    const labels = new Map<string, string>();
    for (const it of filteredItems) {
      const d = new Date(it.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = MONTH_FMT.format(d);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(it);
      labels.set(key, label);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, label: labels.get(key) ?? key, items }));
  }, [filteredItems]);

  if (query.isLoading && !query.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Activity" }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const friend = query.data?.friend;
  const net = query.data?.netBalance ?? 0;
  const myId = me.data?.id;

  return (
    <>
      <Stack.Screen options={{ title: friend?.name ?? "Activity" }} />
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
        {friend && (
          <>
            <Card style={styles.headerCard}>
              <Avatar name={friend.name} url={friend.avatarUrl ?? null} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.friendName, { color: colors.foreground }]} numberOfLines={1}>
                  {friend.name}
                </Text>
                <Text style={[styles.friendEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {friend.email}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                {((query.data?.balances ?? []).filter((b) => Math.abs(b.amount) >= 0.01).length === 0) ? (
                  <Text style={[styles.balanceSub, { color: colors.mutedForeground }]}>settled</Text>
                ) : (
                  (query.data?.balances ?? [])
                    .filter((b) => Math.abs(b.amount) >= 0.01)
                    .map((b) => {
                      const owed = b.amount > 0;
                      const tone = owed ? colors.positive : colors.negative;
                      return (
                        <View key={b.currency} style={{ alignItems: "flex-end" }}>
                          <Text style={[styles.balanceAmount, { color: tone }]}>
                            {formatCurrency(Math.abs(b.amount), b.currency)}
                          </Text>
                          <Text style={[styles.balanceSub, { color: tone }]}>
                            {owed ? "owes you" : "you owe"}
                          </Text>
                        </View>
                      );
                    })
                )}
              </View>
            </Card>
            {myId && (
              <Pressable
                onPress={() => setShowSettle(true)}
                style={[
                  styles.settleBtn,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                <Feather name="check-circle" size={16} color={colors.primary} />
                <Text style={[styles.settleBtnText, { color: colors.primary }]}>
                  Settle up with {friend.name}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {allItems.length > 0 && (
          <View
            style={[
              styles.searchRow,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            <Feather
              name="search"
              size={16}
              color={colors.mutedForeground}
              style={{ marginRight: 8 }}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search by title, note, or date…"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={6}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
        )}

        {allItems.length === 0 ? (
          <Card>
            <EmptyState
              icon="activity"
              title="No activity yet"
              message={`Add an expense or record a payment with ${friend?.name ?? "this friend"} to get started.`}
            />
          </Card>
        ) : grouped.length === 0 ? (
          <Text style={[styles.noMatch, { color: colors.mutedForeground }]}>
            No activity matches "{search}".
          </Text>
        ) : (
          grouped.map((bucket) => (
            <View key={bucket.key} style={{ gap: 8 }}>
              <Text style={[styles.monthHeader, { color: colors.mutedForeground }]}>
                {bucket.label}
              </Text>
              {bucket.items.map((item) =>
                item.kind === "expense" ? (
                  <ExpenseRow
                    key={`e-${item.data.id}`}
                    expense={item.data}
                    myId={myId}
                    friendId={String(friendId)}
                    groupName={item.data.groupId ? groupNameById.get(item.data.groupId) ?? null : null}
                  />
                ) : (
                  <PaymentRow
                    key={`p-${item.data.id}`}
                    payment={item.data}
                    myId={myId}
                    currency={defaultCurrency}
                    onPress={() => setSelectedPayment(item.data)}
                  />
                ),
              )}
            </View>
          ))
        )}
      </ScrollView>
      {showSettle && friend && myId && (
        <SettleUpWithFriendModal
          friend={{ id: friend.id, name: friend.name }}
          currentUserId={myId}
          netBalance={net}
          balances={query.data?.balances}
          onClose={() => setShowSettle(false)}
        />
      )}
      {selectedPayment && (
        <PaymentDetailModal
          payment={selectedPayment}
          currentUserId={myId}
          onClose={() => setSelectedPayment(null)}
        />
      )}
    </>
  );
}

function ExpenseRow({
  expense,
  myId,
  friendId,
  groupName,
}: {
  expense: ExpenseWithSplits;
  myId: string | undefined;
  friendId: string;
  groupName: string | null;
}) {
  const colors = useColors();
  const router = useRouter();
  const total = Number(expense.totalAmount);
  const iPaid = myId && expense.paidByUserId === myId;
  const friendPaid = expense.paidByUserId === friendId;
  const mySplit = myId ? expense.splits.find((s) => s.userId === myId) : undefined;
  const friendSplit = expense.splits.find((s) => s.userId === friendId);

  let impact = 0;
  let label = "";
  if (iPaid && friendSplit) {
    impact = Number(friendSplit.amount);
    label = `you lent`;
  } else if (friendPaid && mySplit) {
    impact = -Number(mySplit.amount);
    label = `you owe`;
  }

  return (
    <Pressable
      onPress={() => router.push(`/expenses/${expense.id}`)}
      android_ripple={{ color: colors.accent }}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
    >
    <Card style={[styles.row, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
      {expense.paidByUser && (
        <Avatar
          name={expense.paidByUser.name}
          url={expense.paidByUser.avatarUrl}
          size={40}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>
          {expense.description}
        </Text>
        <Text style={[styles.itemMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {iPaid ? `You paid ${formatCurrency(total, expense.currency)}` : `${expense.paidByUser?.name ?? "Someone"} paid ${formatCurrency(total, expense.currency)}`}
          {expense.groupId ? ` · ${groupName ?? "group"}` : ""}
        </Text>
        <Text style={[styles.itemDate, { color: colors.mutedForeground }]}>{expense.date}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {impact !== 0 ? (
          <>
            <Text
              style={[
                styles.itemAmount,
                { color: impact > 0 ? colors.positive : colors.negative },
              ]}
            >
              {impact > 0 ? "+" : "-"}
              {formatCurrency(Math.abs(impact), expense.currency)}
            </Text>
            <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{label}</Text>
          </>
        ) : (
          <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>not split</Text>
        )}
      </View>
    </Card>
    </Pressable>
  );
}

function PaymentRow({
  payment,
  myId,
  onPress,
  currency,
}: {
  payment: Payment;
  myId: string | undefined;
  onPress?: () => void;
  currency: string;
}) {
  const colors = useColors();
  const amount = Number(payment.amount);
  const iPaid = myId && payment.fromUserId === myId;
  const impact = iPaid ? amount : -amount;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.accent }}
      style={({ pressed }) => [{ opacity: pressed && onPress ? 0.7 : 1 }]}
    >
    <Card style={[styles.row, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
      {(iPaid ? payment.toUser : payment.fromUser) && (
        <Avatar
          name={(iPaid ? payment.toUser?.name : payment.fromUser?.name) ?? ""}
          url={iPaid ? payment.toUser?.avatarUrl : payment.fromUser?.avatarUrl}
          size={40}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>
          {iPaid
            ? `You paid ${payment.toUser?.name ?? "friend"}`
            : `${payment.fromUser?.name ?? "Friend"} paid you`}
        </Text>
        {payment.note && (
          <Text style={[styles.itemMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {payment.note}
          </Text>
        )}
        <Text style={[styles.itemDate, { color: colors.mutedForeground }]}>{payment.date}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text
          style={[
            styles.itemAmount,
            { color: impact > 0 ? colors.positive : colors.negative },
          ]}
        >
          {impact > 0 ? "+" : "-"}
          {formatCurrency(Math.abs(impact), currency)}
        </Text>
        <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>
          {iPaid ? "you settled" : "they settled"}
        </Text>
      </View>
    </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },
  headerCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  friendName: { fontFamily: "Inter_700Bold", fontSize: 17 },
  friendEmail: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  balanceAmount: { fontFamily: "Inter_700Bold", fontSize: 18 },
  balanceSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  monthHeader: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 6,
    marginLeft: 2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  itemMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  itemDate: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  itemAmount: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  itemSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  settleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  settleBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  noMatch: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
});
