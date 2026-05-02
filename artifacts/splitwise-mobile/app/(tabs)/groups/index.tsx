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
import { formatCurrency } from "@/lib/format";

export default function GroupsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  return (
    <>
      <Stack.Screen options={{ title: "Groups" }} />
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

      {data && data.length > 0 ? (
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
});
