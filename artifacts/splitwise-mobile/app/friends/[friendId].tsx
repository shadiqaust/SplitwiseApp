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
import { useColors } from "@/hooks/useColors";
import { authFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

interface FriendActivityResponse {
  friend: User;
  netBalance: number;
  balances: { currency: string; amount: number }[];
  expenses: ExpenseWithSplits[];
  payments: (Payment & { currency?: string })[];
}

type GroupBalance = {
  key: string;
  groupId: string | null;
  name: string;
  perCurrency: { currency: string; amount: number }[];
};

export default function FriendDetailScreen() {
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const colors = useColors();
  const router = useRouter();
  const me = useGetMe();
  const myId = me.data?.id;
  const { data: groupsList } = useListGroups();
  const groupInfoById = useMemo(() => {
    const m = new Map<string, { name: string; currency: string }>();
    for (const g of groupsList ?? []) {
      m.set(g.id, { name: g.name, currency: g.currency || "USD" });
    }
    return m;
  }, [groupsList]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettle, setShowSettle] = useState(false);

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

  const groupBalances = useMemo<GroupBalance[]>(() => {
    const data = query.data;
    if (!data || !myId) return [];
    const buckets = new Map<string, Map<string, number>>();
    const bump = (bucket: string, cur: string, delta: number) => {
      if (!buckets.has(bucket)) buckets.set(bucket, new Map());
      const m = buckets.get(bucket)!;
      m.set(cur, (m.get(cur) ?? 0) + delta);
    };
    for (const e of data.expenses) {
      const bucket = e.groupId ?? "__none__";
      const cur = e.currency || "USD";
      if (e.paidByUserId === myId) {
        const fs = e.splits.find((s) => s.userId === friendId);
        if (fs) bump(bucket, cur, parseFloat(String(fs.amount)));
      } else if (e.paidByUserId === friendId) {
        const ms = e.splits.find((s) => s.userId === myId);
        if (ms) bump(bucket, cur, -parseFloat(String(ms.amount)));
      }
    }
    for (const p of data.payments) {
      const bucket = p.groupId ?? "__none__";
      const cur =
        p.currency ||
        (p.groupId && groupInfoById.get(p.groupId)?.currency) ||
        "USD";
      const amt = parseFloat(String(p.amount));
      if (p.fromUserId === myId) bump(bucket, cur, amt);
      else bump(bucket, cur, -amt);
    }

    const out: GroupBalance[] = [];
    for (const [bucketKey, perCur] of buckets) {
      const perCurrency: { currency: string; amount: number }[] = [];
      for (const [cur, amt] of perCur) {
        perCurrency.push({ currency: cur, amount: amt });
      }
      perCurrency.sort((a, b) => a.currency.localeCompare(b.currency));
      if (bucketKey === "__none__") {
        out.push({
          key: "__none__",
          groupId: null,
          name: "Non-group expenses",
          perCurrency,
        });
      } else {
        const info = groupInfoById.get(bucketKey);
        out.push({
          key: bucketKey,
          groupId: bucketKey,
          name: info?.name ?? "Group",
          perCurrency,
        });
      }
    }
    const isSettled = (gb: GroupBalance) =>
      gb.perCurrency.every((c) => Math.abs(c.amount) < 0.01);
    out.sort((a, b) => {
      const aS = isSettled(a) ? 1 : 0;
      const bS = isSettled(b) ? 1 : 0;
      if (aS !== bS) return aS - bS;
      if (aS === 1) {
        if (a.groupId === null && b.groupId !== null) return 1;
        if (b.groupId === null && a.groupId !== null) return -1;
      }
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [query.data, myId, friendId, groupInfoById]);

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
  const hasAny =
    (query.data?.expenses.length ?? 0) > 0 ||
    (query.data?.payments.length ?? 0) > 0;

  const onPressGroup = (gb: GroupBalance) => {
    if (gb.groupId) router.push(`/(tabs)/groups/${gb.groupId}`);
    else router.push("/non-group-expenses");
  };

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

        {!hasAny ? (
          <Card>
            <EmptyState
              icon="activity"
              title="No activity yet"
              message={`Add an expense or record a payment with ${friend?.name ?? "this friend"} to get started.`}
            />
          </Card>
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
              By group
            </Text>
            {groupBalances.map((gb) => (
              <GroupBalanceRow key={gb.key} balance={gb} onPress={() => onPressGroup(gb)} />
            ))}
          </View>
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
    </>
  );
}

function GroupBalanceRow({
  balance,
  onPress,
}: {
  balance: GroupBalance;
  onPress: () => void;
}) {
  const colors = useColors();
  const nonZero = balance.perCurrency.filter((c) => Math.abs(c.amount) >= 0.01);
  const settled = nonZero.length === 0;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.accent }}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
    >
      <Card style={[styles.row, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
        <View
          style={[
            styles.iconBubble,
            { backgroundColor: colors.muted },
          ]}
        >
          <Feather name="users" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.itemTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {balance.name}
          </Text>
          <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>
            {settled ? "all settled" : "open balance"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {settled ? (
            <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>
              settled up
            </Text>
          ) : (
            nonZero.map((b) => {
              const owed = b.amount > 0;
              const tone = owed ? colors.positive : colors.negative;
              return (
                <View key={b.currency} style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.itemAmount, { color: tone }]}>
                    {formatCurrency(Math.abs(b.amount), b.currency)}
                  </Text>
                  <Text style={[styles.itemSub, { color: tone }]}>
                    {owed ? "owes you" : "you owe"}
                  </Text>
                </View>
              );
            })
          )}
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
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
  sectionHeader: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 6,
    marginLeft: 2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  itemAmount: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  itemSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
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
});
