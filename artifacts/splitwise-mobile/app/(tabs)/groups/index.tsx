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
import { Stack, useRouter } from "expo-router";
import { useListGroups } from "@workspace/api-client-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useColors } from "@/hooks/useColors";
import { useViewMode, type ViewMode } from "@/hooks/useViewMode";
import { formatCurrency, formatDate } from "@/lib/format";

export default function GroupsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useViewMode("groups", "list");
  // Polling is configured globally on the QueryClient (5s, runs in background).
  const { data, isLoading, refetch } = useListGroups();

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  if (isLoading && !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Groups" }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const ToggleBtn = ({ value, icon }: { value: ViewMode; icon: "list" | "grid" }) => {
    const active = viewMode === value;
    return (
      <Pressable
        onPress={() => setViewMode(value)}
        style={[
          styles.toggleBtn,
          {
            backgroundColor: active ? colors.primary : colors.muted,
            borderColor: active ? colors.primary : colors.border,
          },
        ]}
        hitSlop={6}
      >
        <Feather
          name={icon}
          size={15}
          color={active ? "#fff" : colors.foreground}
        />
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Groups",
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 6, marginRight: 8 }}>
              <ToggleBtn value="list" icon="list" />
              <ToggleBtn value="card" icon="grid" />
            </View>
          ),
        }}
      />
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
        <Button
          title="New group"
          icon={<Feather name="plus" size={18} color="#fff" />}
          onPress={() => router.push("/groups/new")}
          fullWidth
        />

        <Pressable onPress={() => router.push("/non-group-expenses")}>
          <Card style={styles.row}>
            <View style={[styles.bubble, { backgroundColor: colors.accent }]}>
              <Feather name="dollar-sign" size={20} color={colors.accentForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                Non-group expenses
              </Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                All expenses not tied to a group
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </Card>
        </Pressable>

        {data && data.length > 0 ? (
          viewMode === "list" ? (
            <View style={{ gap: 8 }}>
              {data.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => router.push(`/groups/${g.id}`)}
                >
                  <Card style={styles.row}>
                    {g.avatarUrl ? (
                      <Image source={{ uri: g.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.bubble, { backgroundColor: colors.accent }]}>
                        <Text style={[styles.bubbleText, { color: colors.accentForeground }]}>
                          {g.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                        {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                        {g.createdAt ? ` · Created ${formatDate(g.createdAt)}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={[
                          styles.balance,
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
                          ? `+${formatCurrency(g.myNetBalance)}`
                          : g.myNetBalance < 0
                            ? `-${formatCurrency(Math.abs(g.myNetBalance))}`
                            : formatCurrency(0)}
                      </Text>
                      <Text style={[styles.balanceSub, { color: colors.mutedForeground }]}>
                        {g.myNetBalance > 0
                          ? "you are owed"
                          : g.myNetBalance < 0
                            ? "you owe"
                            : "settled up"}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.cardGrid}>
              {data.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => router.push(`/groups/${g.id}`)}
                  style={styles.cardItem}
                >
                  <Card style={styles.cardInner}>
                    <View style={styles.cardHeader}>
                      {g.avatarUrl ? (
                        <Image source={{ uri: g.avatarUrl }} style={styles.cardAvatar} />
                      ) : (
                        <View style={[styles.cardAvatarFallback, { backgroundColor: colors.accent }]}>
                          <Text style={[styles.cardAvatarText, { color: colors.accentForeground }]}>
                            {g.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text
                        style={[styles.cardName, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {g.name}
                      </Text>
                      <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                      </Text>
                      {g.createdAt ? (
                        <Text style={[styles.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                          Created {formatDate(g.createdAt)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                      <Text style={[styles.cardFooterLabel, { color: colors.mutedForeground }]}>
                        {g.myNetBalance > 0
                          ? "you are owed"
                          : g.myNetBalance < 0
                            ? "you owe"
                            : "settled"}
                      </Text>
                      <Text
                        style={[
                          styles.cardBalance,
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
                          ? `+${formatCurrency(g.myNetBalance)}`
                          : g.myNetBalance < 0
                            ? `-${formatCurrency(Math.abs(g.myNetBalance))}`
                            : formatCurrency(0)}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          )
        ) : (
          <Card>
            <EmptyState
              icon="users"
              title="No groups yet"
              message="Tap 'New group' above to create your first group."
            />
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 10 },
  bubble: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bubbleText: { fontFamily: "Inter_700Bold", fontSize: 18 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  balance: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  balanceSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  toggleBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cardItem: { width: "48.5%" },
  cardInner: { padding: 12, gap: 8 },
  cardHeader: { gap: 4 },
  cardAvatar: { width: 44, height: 44, borderRadius: 10, marginBottom: 4 },
  cardAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  cardAvatarText: { fontFamily: "Inter_700Bold", fontSize: 18 },
  cardName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 11 },
  cardMeta: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2 },
  cardFooter: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  cardFooterLabel: { fontFamily: "Inter_400Regular", fontSize: 10 },
  cardBalance: { fontFamily: "Inter_700Bold", fontSize: 15 },
});
