import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  type Notification,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function targetPath(n: Notification): string | null {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const expenseId = typeof data.expenseId === "string" ? data.expenseId : null;
  const groupId = typeof data.groupId === "string" ? data.groupId : null;
  const paymentId = typeof data.paymentId === "string" ? data.paymentId : null;
  const actorUserId = typeof data.actorUserId === "string" ? data.actorUserId : null;
  if (expenseId) return `/expenses/${expenseId}`;
  if (groupId) return `/groups/${groupId}`;
  if (paymentId && actorUserId) return `/friends/${actorUserId}`;
  return null;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isFetching, refetch } = useListNotifications({ limit: 50 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const list = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  const invalidate = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notifications",
    });

  const onPressItem = async (n: Notification) => {
    if (!n.readAt) {
      try {
        await markRead.mutateAsync({ notificationId: n.id });
        invalidate();
      } catch {
        // best-effort
      }
    }
    const path = targetPath(n);
    if (path) router.push(path as never);
  };

  const onMarkAll = async () => {
    try {
      await markAll.mutateAsync();
      invalidate();
    } catch {
      // best-effort
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: {
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
          },
          headerRight: () =>
            unread > 0 ? (
              <Pressable onPress={onMarkAll} hitSlop={10} style={{ paddingRight: 12 }}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                  Mark all read
                </Text>
              </Pressable>
            ) : null,
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FlatList
          data={list}
          keyExtractor={(n) => n.id}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
          }
          contentContainerStyle={list.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              You're all caught up.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPressItem(item)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: item.readAt
                    ? colors.background
                    : (colors.primaryMuted ?? colors.muted ?? colors.background),
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: item.readAt ? "transparent" : colors.primary },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.title, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text
                  style={[styles.body, { color: colors.mutedForeground }]}
                  numberOfLines={2}
                >
                  {item.body}
                </Text>
                <Text style={[styles.time, { color: colors.mutedForeground }]}>
                  {timeAgo(item.createdAt)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  empty: { fontFamily: "Inter_500Medium", fontSize: 14 },
  row: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  body: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  time: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 4 },
});
