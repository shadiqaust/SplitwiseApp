import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useGetActivity,
  useGetDashboardSummary,
} from "@workspace/api-client-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useColors } from "@/hooks/useColors";
import { formatCurrency, formatDate } from "@/lib/format";
import { AddExpenseCTA } from "@/components/AddExpenseCTA";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { useAuth } from "@/lib/auth";
import { resolvePresetSource } from "@/lib/avatarPresets";

export default function DashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  // Polling cadence + background-polling are configured globally on the
  // QueryClient (5s, runs in background).
  const summary = useGetDashboardSummary();
  const activity = useGetActivity({ limit: 50 });
  const { user } = useAuth();
  const myCurrency = user?.defaultCurrency ?? "USD";

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visibleGroups, setVisibleGroups] = useState(5);
  const [visibleActivity, setVisibleActivity] = useState(10);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([summary.refetch(), activity.refetch()]);
    setIsRefreshing(false);
  }, [summary, activity]);

  if (summary.isLoading && !summary.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const data = summary.data;
  const net = data?.netBalance ?? 0;
  const owed = data?.totalOwed ?? 0;
  const iOwe = data?.totalIOwe ?? 0;
  const totals = data?.totalsByCurrency ?? [];

  return (
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
      <EmailVerificationBanner />
      <View style={styles.ctaRow}>
        <View style={{ flex: 1 }}>
          <Button
            title="Add group"
            variant="indigo"
            icon={<Feather name="users" size={18} color="#fff" />}
            onPress={() => router.push("/groups/new")}
            fullWidth
          />
        </View>
        <View style={{ flex: 1 }}>
          <AddExpenseCTA />
        </View>
      </View>

      <Card style={styles.heroCard}>
        <Text style={[styles.heroLabel, { color: colors.mutedForeground }]}>
          Your overall balance
        </Text>
        {totals.length === 0 ? (
          <Text
            style={[styles.heroAmount, { color: colors.foreground }]}
          >
            {formatCurrency(0, myCurrency)}
          </Text>
        ) : (
          <View style={{ gap: 2 }}>
            {totals.map((t) => (
              <Text
                key={t.currency}
                style={[
                  styles.heroAmount,
                  {
                    color:
                      t.net > 0
                        ? colors.positive
                        : t.net < 0
                          ? colors.negative
                          : colors.foreground,
                  },
                ]}
              >
                {t.net > 0 ? "+" : ""}
                {formatCurrency(t.net, t.currency)}
              </Text>
            ))}
          </View>
        )}
        <Text style={[styles.heroHint, { color: colors.mutedForeground }]}>
          {totals.length === 0
            ? "you are all settled up"
            : totals.length > 1
              ? "across multiple currencies"
              : (totals[0]?.net ?? 0) > 0
                ? "you are owed overall"
                : (totals[0]?.net ?? 0) < 0
                  ? "you owe overall"
                  : "you are all settled up"}
        </Text>

        <View style={styles.heroRow}>
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatLabel, { color: colors.mutedForeground }]}>
              You're owed
            </Text>
            {totals.filter((t) => t.owed > 0).length === 0 ? (
              <Text style={[styles.heroStatValue, { color: colors.positive }]}>
                {formatCurrency(0, myCurrency)}
              </Text>
            ) : (
              totals
                .filter((t) => t.owed > 0)
                .map((t) => (
                  <Text
                    key={t.currency}
                    style={[styles.heroStatValue, { color: colors.positive }]}
                  >
                    {formatCurrency(t.owed, t.currency)}
                  </Text>
                ))
            )}
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatLabel, { color: colors.mutedForeground }]}>
              You owe
            </Text>
            {totals.filter((t) => t.iOwe > 0).length === 0 ? (
              <Text style={[styles.heroStatValue, { color: colors.negative }]}>
                {formatCurrency(0, myCurrency)}
              </Text>
            ) : (
              totals
                .filter((t) => t.iOwe > 0)
                .map((t) => (
                  <Text
                    key={t.currency}
                    style={[styles.heroStatValue, { color: colors.negative }]}
                  >
                    {formatCurrency(t.iOwe, t.currency)}
                  </Text>
                ))
            )}
          </View>
        </View>
      </Card>

      <View>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Groups
        </Text>
        <View style={{ gap: 8 }}>
          {/* Virtual "Non-group expenses" entry — always visible, like Splitwise */}
          <Pressable
            onPress={() => router.push("/non-group-expenses")}
            android_ripple={{ color: colors.accent }}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Card style={styles.groupRow}>
              <View style={[styles.groupAvatarFallback, { backgroundColor: colors.accent }]}>
                <Feather name="dollar-sign" size={18} color={colors.accentForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.groupName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  Non-group expenses
                </Text>
                <Text
                  style={[
                    styles.groupBalance,
                    {
                      color:
                        (data?.nonGroupNetBalance ?? 0) > 0
                          ? colors.positive
                          : (data?.nonGroupNetBalance ?? 0) < 0
                            ? colors.negative
                            : colors.mutedForeground,
                    },
                  ]}
                >
                  {(data?.nonGroupNetBalance ?? 0) > 0
                    ? `you are owed ${formatCurrency(data!.nonGroupNetBalance!, myCurrency)}`
                    : (data?.nonGroupNetBalance ?? 0) < 0
                      ? `you owe ${formatCurrency(Math.abs(data!.nonGroupNetBalance!), myCurrency)}`
                      : "settled up"}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </Card>
          </Pressable>

          {data?.groupSummaries && data.groupSummaries.length > 0 ? (
            <>
              {data.groupSummaries.slice(0, visibleGroups).map((g) => (
                // Use Pressable instead of onTouchEnd so a pull-to-refresh swipe
                // that starts on this row does NOT navigate. Pressable cancels
                // the press when the touch moves beyond a threshold (e.g. when
                // the user is actually scrolling/refreshing).
                <Pressable
                  key={g.groupId}
                  onPress={() => router.push(`/groups/${g.groupId}`)}
                  android_ripple={{ color: colors.accent }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <Card style={styles.groupRow}>
                    {g.avatarUrl ? (
                      <Image source={resolvePresetSource(g.avatarUrl) ?? { uri: g.avatarUrl }} style={styles.groupAvatar} />
                    ) : (
                      <View style={[styles.groupAvatarFallback, { backgroundColor: colors.accent }]}>
                        <Text style={[styles.groupAvatarText, { color: colors.accentForeground }]}>
                          {g.groupName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.groupName, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {g.groupName}
                      </Text>
                      <Text
                        style={[
                          styles.groupBalance,
                          {
                            color:
                              g.myNetBalance > 0
                                ? colors.positive
                                : g.myNetBalance < 0
                                  ? colors.negative
                                  : colors.mutedForeground,
                          },
                        ]}
                      >
                        {g.myNetBalance > 0
                          ? `you are owed ${formatCurrency(g.myNetBalance, g.currency)}`
                          : g.myNetBalance < 0
                            ? `you owe ${formatCurrency(Math.abs(g.myNetBalance), g.currency)}`
                            : "settled up"}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                  </Card>
                </Pressable>
              ))}
              {data.groupSummaries.length > visibleGroups ? (
                <Pressable
                  onPress={() => setVisibleGroups((c) => c + 5)}
                  android_ripple={{ color: colors.accent }}
                  style={({ pressed }) => [
                    styles.showMore,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.showMoreText, { color: colors.primary }]}>
                    Show more ({data.groupSummaries.length - visibleGroups} more)
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      </View>

      <View>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Recent activity
        </Text>
        {activity.data && activity.data.length > 0 ? (
          <View style={{ gap: 8 }}>
            {activity.data.slice(0, visibleActivity).map((item) => (
              <Card key={item.id} style={styles.activityRow}>
                <Avatar
                  name={item.involvedUser.name}
                  url={item.involvedUser.avatarUrl}
                  size={36}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.activityTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {item.type === "payment" ? "Payment" : item.description}
                  </Text>
                  <Text
                    style={[
                      styles.activitySub,
                      { color: colors.mutedForeground },
                    ]}
                    numberOfLines={1}
                  >
                    {item.groupName} · {formatDate(item.date)}
                  </Text>
                </View>
                <Text
                  style={[styles.activityAmount, { color: colors.foreground }]}
                >
                  {formatCurrency(item.amount, item.currency)}
                </Text>
              </Card>
            ))}
            {activity.data.length > visibleActivity ? (
              <Pressable
                onPress={() => setVisibleActivity((c) => c + 10)}
                android_ripple={{ color: colors.accent }}
                style={({ pressed }) => [
                  styles.showMore,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.showMoreText, { color: colors.primary }]}>
                  Show more ({activity.data.length - visibleActivity} more)
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Card>
            <EmptyState
              icon="activity"
              title="No activity yet"
              message="Add an expense and it'll show up here."
            />
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 24, paddingBottom: 80 },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addGroupBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
  },
  addGroupText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  heroCard: { gap: 4 },
  heroLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  heroAmount: { fontFamily: "Inter_700Bold", fontSize: 28 },
  heroHint: { fontFamily: "Inter_400Regular", fontSize: 13 },
  heroRow: { flexDirection: "row", marginTop: 16 },
  heroStat: { flex: 1, gap: 4 },
  heroStatLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  heroStatValue: { fontFamily: "Inter_600SemiBold", fontSize: 18 },
  divider: { width: 1, marginHorizontal: 16 },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    marginBottom: 12,
  },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  groupAvatar: { width: 40, height: 40, borderRadius: 10 },
  groupAvatarFallback: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  groupAvatarText: { fontFamily: "Inter_700Bold", fontSize: 18 },
  groupName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  groupBalance: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  activityTitle: { fontFamily: "Inter_500Medium", fontSize: 14 },
  activitySub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  activityAmount: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  showMore: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  showMoreText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
