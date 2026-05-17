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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

type Bucket = {
  key: string;
  label: string;
  amount: number;
};

type ActivityRow = {
  key: string;
  date: Date;
  createdAt: Date;
  monthKey: string;
  monthLabel: string;
  dayMonth: string;
  dayNum: string;
  icon: "file-text" | "users" | "credit-card";
  iconTint: string;
  /** When present, render this avatar in place of the icon (used for group rows). */
  iconAvatarUrl?: string | null;
  iconFallbackName?: string;
  title: string;
  subtitle: string;
  kind: "expense" | "payment";
  delta: number;
  /** Where tapping the row navigates. null = not tappable. */
  href: string | null;
};

const monthShort = new Intl.DateTimeFormat("en-US", { month: "short" });
const monthLong = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return full;
  if (parts.length === 1) return parts[0];
  const last = parts[1];
  return `${parts[0]} ${last[0]?.toUpperCase() ?? ""}.`;
}

// Parse date strings without TZ shifts. `YYYY-MM-DD` strings are treated as
// local calendar dates so the day/month displayed matches what the user
// picked, regardless of their timezone.
function parseLocalDate(raw: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(raw);
}

function expenseDate(e: ExpenseWithSplits): Date {
  const raw = (e as unknown as { date?: string }).date ?? e.createdAt;
  return parseLocalDate(raw);
}

function paymentDate(p: Payment): Date {
  const raw = (p as unknown as { date?: string }).date ?? p.createdAt;
  return parseLocalDate(raw);
}

export default function FriendDetailScreen() {
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useGetMe();
  const myId = me.data?.id;
  const { data: groupsList } = useListGroups();
  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groupsList ?? []) m.set(g.id, g.name);
    return m;
  }, [groupsList]);
  const groupAvatarById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const g of groupsList ?? []) m.set(g.id, g.avatarUrl ?? null);
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

  const buckets = useMemo<Bucket[]>(() => {
    const data = query.data;
    if (!data || !myId) return [];
    // bucketKey -> signed sum (positive = friend owes me)
    const m = new Map<string, number>();
    const bump = (k: string, d: number) => m.set(k, (m.get(k) ?? 0) + d);
    for (const e of data.expenses) {
      const k = e.groupId ?? "__none__";
      if (e.paidByUserId === myId) {
        const fs = e.splits.find((s) => s.userId === friendId);
        if (fs) bump(k, parseFloat(String(fs.amount)));
      } else if (e.paidByUserId === friendId) {
        const ms = e.splits.find((s) => s.userId === myId);
        if (ms) bump(k, -parseFloat(String(ms.amount)));
      }
    }
    for (const p of data.payments) {
      const k = p.groupId ?? "__none__";
      const amt = parseFloat(String(p.amount));
      if (p.fromUserId === myId) bump(k, amt);
      else bump(k, -amt);
    }
    const out: Bucket[] = [];
    for (const [k, amount] of m) {
      if (Math.abs(amount) < 0.01) continue;
      out.push({
        key: k,
        label: k === "__none__" ? "non-group expenses" : `“${groupNameById.get(k) ?? "Group"}”`,
        amount,
      });
    }
    out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return out;
  }, [query.data, myId, friendId, groupNameById]);

  const activity = useMemo<ActivityRow[]>(() => {
    const data = query.data;
    if (!data || !myId) return [];
    const friend = data.friend;
    const friendShort = shortName(friend.name);
    const rows: ActivityRow[] = [];

    // Aggregate expenses by group: all expenses in the same group collapse
    // to a single row showing the friend's net balance impact across them.
    const groupAgg = new Map<
      string,
      { count: number; delta: number; latest: Date }
    >();

    for (const e of data.expenses) {
      let delta = 0;
      let subtitle = "";
      if (e.paidByUserId === myId) {
        const fs = e.splits.find((s) => s.userId === friendId);
        delta = fs ? parseFloat(String(fs.amount)) : 0;
        subtitle = `You paid ${formatCurrency(parseFloat(String(e.totalAmount)))}`;
      } else if (e.paidByUserId === friendId) {
        const ms = e.splits.find((s) => s.userId === myId);
        delta = ms ? -parseFloat(String(ms.amount)) : 0;
        subtitle = `${friendShort} paid ${formatCurrency(parseFloat(String(e.totalAmount)))}`;
      }
      const d = expenseDate(e);
      if (e.groupId) {
        const cur = groupAgg.get(e.groupId);
        if (cur) {
          cur.count += 1;
          cur.delta += delta;
          if (d.getTime() > cur.latest.getTime()) cur.latest = d;
        } else {
          groupAgg.set(e.groupId, { count: 1, delta, latest: d });
        }
        continue;
      }
      rows.push({
        key: `e:${e.id}`,
        date: d,
        createdAt: new Date(e.createdAt as unknown as string),
        monthKey: `${d.getFullYear()}-${d.getMonth()}`,
        monthLabel: monthLong.format(d),
        dayMonth: monthShort.format(d),
        dayNum: String(d.getDate()),
        icon: "file-text",
        iconTint: colors.mutedForeground,
        title: e.description,
        subtitle,
        kind: "expense",
        delta,
        href: `/expenses/${e.id}`,
      });
    }

    for (const [gid, agg] of groupAgg.entries()) {
      const gname = groupNameById.get(gid) ?? "Group";
      const d = agg.latest;
      rows.push({
        key: `g:${gid}`,
        date: d,
        createdAt: d,
        monthKey: `${d.getFullYear()}-${d.getMonth()}`,
        monthLabel: monthLong.format(d),
        dayMonth: monthShort.format(d),
        dayNum: String(d.getDate()),
        icon: "users",
        iconTint: colors.primary,
        iconAvatarUrl: groupAvatarById.get(gid) ?? null,
        iconFallbackName: gname,
        title: gname,
        subtitle: `${agg.count} shared ${agg.count === 1 ? "expense" : "expenses"} · Shared group`,
        kind: "expense",
        delta: agg.delta,
        href: `/(tabs)/groups/${gid}?from=${encodeURIComponent(`/friends/${friendId}`)}`,
      });
    }

    for (const p of data.payments) {
      const amt = parseFloat(String(p.amount));
      let delta = 0;
      let title = "Payment";
      if (p.fromUserId === myId) {
        delta = amt;
        title = `You paid ${friendShort} ${formatCurrency(amt)}`;
      } else {
        delta = -amt;
        title = `${friendShort} paid you ${formatCurrency(amt)}`;
      }
      const d = paymentDate(p);
      rows.push({
        key: `p:${p.id}`,
        date: d,
        createdAt: new Date(p.createdAt as unknown as string),
        monthKey: `${d.getFullYear()}-${d.getMonth()}`,
        monthLabel: monthLong.format(d),
        dayMonth: monthShort.format(d),
        dayNum: String(d.getDate()),
        icon: "credit-card",
        iconTint: colors.primary,
        title,
        subtitle: p.groupId
          ? `Settle-up · ${groupNameById.get(p.groupId) ?? "group"}`
          : "Settle-up payment",
        kind: "payment",
        delta,
        href: p.groupId
          ? `/(tabs)/groups/${p.groupId}?from=${encodeURIComponent(`/friends/${friendId}`)}`
          : null,
      });
    }
    rows.sort((a, b) => {
      const byDate = b.date.getTime() - a.date.getTime();
      if (byDate !== 0) return byDate;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return rows;
  }, [query.data, myId, friendId, colors.primary, colors.mutedForeground, groupAvatarById, groupNameById]);

  if (query.isLoading && !query.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const friend = query.data?.friend;
  const net = query.data?.netBalance ?? 0;
  const settled = Math.abs(net) < 0.01;
  const owedOverall = net > 0;
  const balanceTone = settled
    ? colors.mutedForeground
    : owedOverall
      ? colors.positive
      : colors.negative;
  const balanceVerb = settled
    ? "you are settled up overall"
    : owedOverall
      ? "You are owed"
      : "You owe";
  const friendShort = friend ? shortName(friend.name) : "";

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Decorative banner */}
        <View
          style={[
            styles.banner,
            {
              backgroundColor: colors.primary,
              paddingTop: insets.top,
              height: 140 + insets.top,
            },
          ]}
        >
          <View style={[styles.bannerTri1, { backgroundColor: "rgba(255,255,255,0.10)" }]} />
          <View style={[styles.bannerTri2, { backgroundColor: "rgba(255,255,255,0.06)" }]} />
          <View style={[styles.bannerTri3, { backgroundColor: "rgba(255,255,255,0.08)" }]} />
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back to friends"
            style={[
              styles.bannerBackBtn,
              {
                top: insets.top + 12,
                backgroundColor: "rgba(255,255,255,0.95)",
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              },
            ]}
          >
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Avatar overlapping the banner */}
        <View style={styles.avatarWrap}>
          <View style={[styles.avatarRing, { backgroundColor: colors.background }]}>
            {friend && <Avatar name={friend.name} url={friend.avatarUrl ?? null} size={84} />}
          </View>
        </View>

        <View style={styles.headerContent}>
          <Text style={[styles.friendName, { color: colors.foreground }]} numberOfLines={1}>
            {friend?.name ?? ""}
          </Text>
          {settled ? (
            <Text style={[styles.balanceLine, { color: colors.mutedForeground }]}>
              you are all settled up
            </Text>
          ) : (
            <Text style={[styles.balanceLine, { color: balanceTone }]}>
              {balanceVerb} <Text style={styles.balanceAmount}>{formatCurrency(Math.abs(net))}</Text> overall
            </Text>
          )}

          {buckets.length > 0 && (
            <View style={{ gap: 4, marginTop: 10 }}>
              {buckets.map((b) => {
                const friendOwes = b.amount > 0;
                const tone = friendOwes ? colors.positive : colors.negative;
                const subj = friendOwes ? `${friendShort} owes you` : `You owe ${friendShort}`;
                return (
                  <Text
                    key={b.key}
                    style={[styles.breakdownLine, { color: colors.mutedForeground }]}
                  >
                    {subj}{" "}
                    <Text style={{ color: tone, fontFamily: "Inter_600SemiBold" }}>
                      {formatCurrency(Math.abs(b.amount))}
                    </Text>{" "}
                    in {b.label}
                  </Text>
                );
              })}
            </View>
          )}
        </View>

        {/* Action chip row */}
        {friend && myId && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              onPress={() => setShowSettle(true)}
              style={[styles.chip, styles.chipPrimary, { backgroundColor: colors.primary }]}
            >
              <Feather name="check-circle" size={14} color={colors.primaryForeground} />
              <Text style={[styles.chipTextPrimary, { color: colors.primaryForeground }]}>
                Settle up
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/expenses/new",
                  params: { friendId: friend.id },
                })
              }
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Feather name="plus" size={14} color={colors.foreground} />
              <Text style={[styles.chipText, { color: colors.foreground }]}>Add expense</Text>
            </Pressable>
          </ScrollView>
        )}

        {/* Activity timeline */}
        <View style={styles.activityWrap}>
          {activity.length === 0 ? (
            <EmptyState
              icon="activity"
              title="No activity yet"
              message={`Add an expense or record a payment with ${friend?.name ?? "this friend"} to get started.`}
            />
          ) : (
            renderTimeline(activity, colors, router)
          )}
        </View>
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

function renderTimeline(
  rows: ActivityRow[],
  colors: ReturnType<typeof useColors>,
  router: ReturnType<typeof useRouter>,
) {
  const out: React.ReactNode[] = [];
  let lastMonth: string | null = null;
  for (const row of rows) {
    if (row.monthKey !== lastMonth) {
      out.push(
        <Text
          key={`m:${row.monthKey}`}
          style={[styles.monthHeader, { color: colors.foreground }]}
        >
          {row.monthLabel}
        </Text>,
      );
      lastMonth = row.monthKey;
    }
    if (row.kind === "payment") {
      out.push(<PaymentTileView key={row.key} row={row} colors={colors} />);
    } else {
      out.push(
        <ActivityRowView key={row.key} row={row} colors={colors} router={router} />,
      );
    }
  }
  return out;
}

function PaymentTileView({
  row,
  colors,
}: {
  row: ActivityRow;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.paymentTile,
        { backgroundColor: colors.positive + "18", borderColor: colors.positive + "40" },
      ]}
    >
      <Feather name="check-circle" size={15} color={colors.positive} style={{ marginTop: 1 }} />
      <Text
        style={[styles.paymentTileText, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {row.title}
      </Text>
      <Text style={[styles.paymentTileDate, { color: colors.mutedForeground }]}>
        {row.dayMonth} {row.dayNum}
      </Text>
    </View>
  );
}

function ActivityRowView({
  row,
  colors,
  router,
}: {
  row: ActivityRow;
  colors: ReturnType<typeof useColors>;
  router: ReturnType<typeof useRouter>;
}) {
  const settled = Math.abs(row.delta) < 0.01;
  const positive = row.delta > 0;
  // Payments are settle-up activity even though they shift the balance;
  // we show "settled up" rather than lent/borrowed.
  const isPayment = row.kind === "payment";
  const tone = settled || isPayment
    ? colors.mutedForeground
    : positive
      ? colors.positive
      : colors.negative;
  const label = isPayment
    ? "settled up"
    : settled
      ? "settled up"
      : positive
        ? "you lent"
        : "you borrowed";
  const onPress = row.href
    ? () => router.push(row.href as never)
    : undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={onPress ? { color: colors.accent } : undefined}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        styles.activityRow,
        pressed && onPress ? { opacity: 0.7 } : null,
      ]}
    >
      <View style={styles.dateCol}>
        <Text style={[styles.dateMonth, { color: colors.mutedForeground }]}>{row.dayMonth}</Text>
        <Text style={[styles.dateDay, { color: colors.foreground }]}>{row.dayNum}</Text>
      </View>
      {row.iconAvatarUrl ? (
        <View style={styles.activityAvatarWrap}>
          <Avatar
            name={row.iconFallbackName ?? row.title}
            url={row.iconAvatarUrl}
            size={40}
          />
        </View>
      ) : (
        <View
          style={[
            styles.activityIcon,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Feather name={row.icon} size={18} color={row.iconTint} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.activityTitle, { color: colors.foreground }]} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={[styles.activitySub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {row.subtitle}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.activityHint, { color: tone }]}>{label}</Text>
        {!settled && !isPayment && (
          <Text style={[styles.activityAmount, { color: tone }]}>
            {formatCurrency(Math.abs(row.delta))}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: {
    height: 140,
    overflow: "hidden",
    position: "relative",
  },
  bannerTri1: {
    position: "absolute",
    width: 220,
    height: 220,
    transform: [{ rotate: "45deg" }],
    top: -120,
    right: -60,
  },
  bannerTri2: {
    position: "absolute",
    width: 180,
    height: 180,
    transform: [{ rotate: "30deg" }],
    bottom: -80,
    left: -40,
  },
  bannerTri3: {
    position: "absolute",
    width: 140,
    height: 140,
    transform: [{ rotate: "20deg" }],
    bottom: -60,
    right: 40,
  },
  bannerBackBtn: {
    position: "absolute",
    left: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  avatarWrap: {
    marginTop: -52,
    paddingLeft: 20,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: { paddingHorizontal: 20, paddingTop: 12 },
  friendName: { fontFamily: "Inter_700Bold", fontSize: 24 },
  balanceLine: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    marginTop: 6,
  },
  balanceAmount: { fontFamily: "Inter_700Bold", fontSize: 16 },
  breakdownLine: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  chipRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipPrimary: { borderColor: "transparent" },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  chipTextPrimary: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  activityWrap: { paddingHorizontal: 20, gap: 4 },
  monthHeader: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginTop: 16,
    marginBottom: 6,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  dateCol: {
    width: 36,
    alignItems: "center",
  },
  dateMonth: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
  },
  dateDay: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    lineHeight: 18,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  activityAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
  },
  activityTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  activitySub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  activityHint: { fontFamily: "Inter_500Medium", fontSize: 11 },
  activityAmount: { fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 1 },
  paymentTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 3,
  },
  paymentTileText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  paymentTileDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    flexShrink: 0,
  },
});
